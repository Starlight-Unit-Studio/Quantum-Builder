<?php

declare(strict_types=1);

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Apps.php';
require __DIR__ . '/../src/Builds.php';

use QuantumBuilder\Apps;
use QuantumBuilder\Builds;
use QuantumBuilder\Database;

$dir = sys_get_temp_dir() . '/qb-versioning-' . bin2hex(random_bytes(6));
if (!mkdir($dir, 0700, true) && !is_dir($dir)) {
    throw new RuntimeException('Unable to create test directory.');
}
$path = $dir . '/test.sqlite';

$cleanup = static function () use ($dir): void {
    foreach (glob($dir . '/*') ?: [] as $item) {
        @unlink($item);
    }
    @rmdir($dir);
};
register_shutdown_function($cleanup);

$db = new Database($path);
$db->migrate();
$apps = new Apps($db->pdo());
$builds = new Builds($db->pdo());

$input = [
    'name' => 'Version Test',
    'package_id' => 'de.starlightunit.versiontest',
    'start_url' => 'https://example.test/',
    'description' => '',
    'version_name' => '1.0.0',
    'version_code' => 0,
    'min_sdk' => 23,
    'target_sdk' => 36,
    'config' => [],
];

$app = $apps->create($input);
assert($app['version_code'] === 0);
assert(isset($app['config']['web']['custom_headers']));
assert(is_object($app['config']['web']['custom_headers']));
assert(get_object_vars($app['config']['web']['custom_headers']) === []);
assert($app['config']['web']['cookie_persistence'] === 'persistent');
assert($app['config']['navigation']['items'] === []);
assert($app['config']['navigation']['title'] === 'Version Test');

$unsafeInput = $input;
$unsafeInput['package_id'] = 'de.starlightunit.unsafenav';
$unsafeInput['config'] = [
    'navigation' => [
        'items' => [['label' => 'Outside', 'url' => 'https://evil.example/']],
    ],
];
$unsafeRejected = false;
try {
    $apps->create($unsafeInput);
} catch (InvalidArgumentException) {
    $unsafeRejected = true;
}
assert($unsafeRejected === true);

$linkInput = $input;
$linkInput['package_id'] = 'de.starlightunit.linkrules';
$linkInput['config'] = [
    'links' => [
        'new_windows' => 'internal',
        'deep_link_scheme' => 'quantum',
        'rules' => [
            ['host' => 'example.test', 'path_prefix' => '/docs/', 'action' => 'internal'],
            ['scheme' => 'mailto', 'action' => 'external'],
        ],
    ],
];
$linkApp = $apps->create($linkInput);
assert($linkApp['config']['links']['new_windows'] === 'internal');
assert($linkApp['config']['links']['deep_link_scheme'] === 'quantum');
assert(count($linkApp['config']['links']['rules']) === 2);

$badLinks = $input;
$badLinks['package_id'] = 'de.starlightunit.badlinks';
$badLinks['config'] = [
    'links' => [
        'deep_link_scheme' => 'https',
        'rules' => [['host' => 'evil.example', 'action' => 'internal']],
    ],
];
$badLinksRejected = false;
try {
    $apps->create($badLinks);
} catch (InvalidArgumentException) {
    $badLinksRejected = true;
}
assert($badLinksRejected === true);

$splashInput = $input;
$splashInput['package_id'] = 'de.starlightunit.customsplash';
$splashPayload = "\x89PNG\r\n\x1a\n" . 'profile-splash';
$splashInput['config'] = [
    'theme' => [
        'custom_splash_data_url' => 'data:image/png;base64,' . base64_encode($splashPayload),
        'attribution_banner_duration_ms' => 4000,
    ],
];
$splashApp = $apps->create($splashInput);
assert($splashApp['config']['theme']['custom_splash_data_url'] !== '');
assert($splashApp['config']['theme']['attribution_banner_duration_ms'] === 4000);

$badSplash = $input;
$badSplash['package_id'] = 'de.starlightunit.badsplash';
$badSplash['config'] = [
    'theme' => [
        'custom_splash_data_url' => 'data:image/png;base64,' . base64_encode('not-a-png'),
        'attribution_banner_duration_ms' => 5000,
    ],
];
$badSplashRejected = false;
try {
    $apps->create($badSplash);
} catch (InvalidArgumentException) {
    $badSplashRejected = true;
}
assert($badSplashRejected === true);

$storedJson = (string) $db->pdo()->query('SELECT config_json FROM apps WHERE id=' . (int) $app['id'])->fetchColumn();
$storedConfig = json_decode($storedJson);
assert(is_object($storedConfig));
assert(is_object($storedConfig->web->custom_headers));

$legacyConfig = json_decode($storedJson, true, flags: JSON_THROW_ON_ERROR);
$legacyConfig['web']['custom_headers'] = [];
$legacyConfig['web']['cookie_persistence'] = 'default';
$stmt = $db->pdo()->prepare('UPDATE apps SET config_json=:config WHERE id=:id');
$stmt->execute([
    'config' => json_encode($legacyConfig, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
    'id' => $app['id'],
]);
$app = $apps->find((int) $app['id']);
assert($app !== null);
assert(is_object($app['config']['web']['custom_headers']));
assert(get_object_vars($app['config']['web']['custom_headers']) === []);
assert($app['config']['web']['cookie_persistence'] === 'persistent');

$input['version_code'] = 999;
$app = $apps->update((int) $app['id'], $input);
assert($app['version_code'] === 0);
assert(is_object($app['config']['web']['custom_headers']));

$build = $builds->queue((int) $app['id'], 'compat/android-6-api23');
assert($build['status'] === 'queued');
$app = $apps->find((int) $app['id']);
assert($app !== null && $app['version_code'] === 1);

$db->pdo()->prepare("UPDATE builds SET status='complete' WHERE id=:id")->execute(['id' => $build['id']]);
$builds->queue((int) $app['id'], 'compat/android-6-api23');
$app = $apps->find((int) $app['id']);
assert($app !== null && $app['version_code'] === 2);

fwrite(STDOUT, "profile versioning, navigation/link trust, splash branding, custom header and cookie migration contracts: ok\n");
