<?php

declare(strict_types=1);

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Apps.php';
require __DIR__ . '/../src/Builds.php';

use QuantumBuilder\Apps;
use QuantumBuilder\Builds;
use QuantumBuilder\Database;

function check(bool $value, string $message): void
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}

function pngChunk(string $type, string $data): string
{
    return pack('N', strlen($data)) . $type . $data . hash('crc32b', $type . $data, true);
}

function navigationPng(int $width = 1, int $height = 1, ?string $raw = null, int $padding = 0): string
{
    $header = pack('NNCCCCC', $width, $height, 8, 6, 0, 0, 0);
    $pixels = $raw ?? str_repeat("\0", (1 + $width * 4) * $height);
    $extra = $padding > 0 ? pngChunk('tEXt', "x\0" . str_repeat('x', $padding)) : '';
    return "\x89PNG\r\n\x1a\n" . pngChunk('IHDR', $header) . $extra
        . pngChunk('IDAT', gzcompress($pixels)) . pngChunk('IEND', '');
}

function imageUrl(string $payload): string
{
    return 'data:image/png;base64,' . base64_encode($payload);
}

$dir = sys_get_temp_dir() . '/qb-navigation-icons-' . bin2hex(random_bytes(6));
mkdir($dir, 0700, true);
register_shutdown_function(static function () use ($dir): void {
    foreach (glob($dir . '/*') ?: [] as $item) {
        @unlink($item);
    }
    @rmdir($dir);
});
$db = new Database($dir . '/test.sqlite');
$db->migrate();
$apps = new Apps($db->pdo());
$builds = new Builds($db->pdo());
$input = [
    'name' => 'Navigation Icons',
    'package_id' => 'de.starlightunit.navigationicons',
    'start_url' => 'https://example.test/',
    'version_name' => '1.0.0',
    'version_code' => 0,
    'config' => ['navigation' => ['items' => [['label' => 'Home', 'url' => '/', 'icon' => ' ', 'active_icon' => '']]]],
];
$app = $apps->create($input);
$id = (int) $app['id'];
check($app['config']['navigation']['items'] === [['label' => 'Home', 'url' => '/']], 'Empty icons must preserve legacy profiles.');

$iconIds = ['home', 'search', 'grid', 'star', 'heart', 'user', 'settings', 'info', 'mail', 'cart',
    'calendar', 'camera', 'map', 'phone', 'download', 'help', 'play', 'folder', 'globe', 'link'];
foreach ($iconIds as $icon) {
    $input['config']['navigation']['items'] = [['label' => 'Home', 'url' => '/', 'icon' => ' ' . $icon . ' ', 'active_icon' => 'star']];
    $saved = $apps->update($id, $input);
    check($saved['config']['navigation']['items'][0]['icon'] === $icon, 'Builtin icon must survive update and hydration.');
    check($saved['config']['navigation']['items'][0]['active_icon'] === 'star', 'Active icon must survive update and hydration.');
    check($saved['version_code'] === 0, 'Editing an icon must not increment the Android version code.');
}

$png = navigationPng(24, 18);
$dataUrl = imageUrl($png);
$input['config']['navigation']['items'] = [['label' => 'Home', 'url' => '/', 'icon' => $dataUrl, 'active_icon' => 'home']];
$apps->update($id, $input);
$stored = $apps->find($id);
check($stored['config']['navigation']['items'][0]['icon'] === $dataUrl, 'PNG content must survive database round trip.');
$sql = $db->pdo()->prepare('SELECT config_json FROM apps WHERE id=:id');
$sql->execute(['id' => $id]);
$storedJson = (string) $sql->fetchColumn();
check(json_decode($storedJson, true)['navigation']['items'][0]['icon'] === $dataUrl, 'Database JSON must retain the exact canonical image.');

$valid = navigationPng();
$corruptCrc = $valid;
$corruptCrc[29] = chr(ord($corruptCrc[29]) ^ 1);
$badZlib = substr($valid, 0, 33) . pngChunk('IDAT', 'not-zlib') . pngChunk('IEND', '');
$zlibTrailing = substr($valid, 0, 33) . pngChunk('IDAT', gzcompress(str_repeat("\0", 5)) . 'trailing') . pngChunk('IEND', '');
$noncontiguous = substr($valid, 0, 33) . pngChunk('IDAT', '') . pngChunk('tEXt', "x\0y")
    . pngChunk('IDAT', gzcompress(str_repeat("\0", 5))) . pngChunk('IEND', '');
$animated = substr($valid, 0, 33) . pngChunk('acTL', pack('NN', 1, 0)) . substr($valid, 33);
$invalidIcons = [null, false, 1, [], ['name' => 'home'], 'unknown', 'HOME', 'https://evil.test/icon.png',
    '//evil.test/icon.png', '../icon.png', 'asset:quantum_nav_icons/' . str_repeat('a', 64) . '.png',
    'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,***', imageUrl($valid) . '=',
    imageUrl(''), imageUrl("\x89PNG\r\n\x1a\n"), imageUrl(substr($valid, 0, -1)), imageUrl($valid . 'x'),
    imageUrl($corruptCrc), imageUrl(navigationPng(257, 1)), imageUrl(navigationPng(0, 1)),
    imageUrl(navigationPng(1, 257)), imageUrl($badZlib), imageUrl($zlibTrailing), imageUrl($noncontiguous), imageUrl($animated),
    imageUrl(navigationPng(raw: "\5\0\0\0\0")), imageUrl(navigationPng(raw: str_repeat("\0", 1_000_000))),
    imageUrl(navigationPng(padding: 65536)),
];
foreach ($invalidIcons as $index => $value) {
    $candidate = $input;
    $candidate['config']['navigation']['items'][0]['active_icon'] = $value;
    $rejected = false;
    try {
        $apps->update($id, $candidate);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }
    check($rejected, 'Invalid navigation icon case ' . $index . ' must be rejected.');
    check($apps->find($id)['config']['navigation']['items'][0]['active_icon'] === 'home', 'An invalid update must not overwrite the saved profile.');
}

// Common indexed PNGs and Adam7 PNGs work without requiring a graphics extension.
$indexed = "\x89PNG\r\n\x1a\n" . pngChunk('IHDR', pack('NNCCCCC', 2, 1, 1, 3, 0, 0, 0))
    . pngChunk('PLTE', "\xff\0\0\0\xff\0") . pngChunk('IDAT', gzcompress("\0\x40")) . pngChunk('IEND', '');
$interlaced = "\x89PNG\r\n\x1a\n" . pngChunk('IHDR', pack('NNCCCCC', 2, 2, 8, 6, 0, 0, 1))
    . pngChunk('IDAT', gzcompress(str_repeat("\0", 19))) . pngChunk('IEND', '');
foreach ([$indexed, $interlaced] as $supportedPng) {
    $input['config']['navigation']['items'][0]['icon'] = imageUrl($supportedPng);
    $saved = $apps->update($id, $input);
    check($saved['config']['navigation']['items'][0]['icon'] === imageUrl($supportedPng), 'Indexed and Adam7 PNGs must save successfully.');
}

// A profile can use all 24 slots at the documented per-image byte limit.
$limitPng = navigationPng(padding: 65536 - strlen($valid) - 14);
check(strlen($limitPng) === 65536, 'Boundary fixture must be exactly 64 KiB.');
$limitUrl = imageUrl($limitPng);
$input['config']['navigation']['items'] = [];
for ($i = 0; $i < 12; $i++) {
    $input['config']['navigation']['items'][] = ['label' => 'Item ' . $i, 'url' => '/' . $i, 'icon' => $limitUrl, 'active_icon' => $limitUrl];
}
$saved = $apps->update($id, $input);
check(count($saved['config']['navigation']['items']) === 12, 'All 12 menu items must be retained.');
check($saved['config']['navigation']['items'][11]['active_icon'] === $limitUrl, 'The last active icon must survive a full-size profile.');
$build = $builds->queue($id, 'compat/android-6-api23');
check($build['status'] === 'queued' && $apps->find($id)['version_code'] === 1, 'Queueing must keep the existing version-code contract.');

// Removing icons returns to the original small label/url representation.
$input['config']['navigation']['items'] = [['label' => 'Home', 'url' => '/', 'icon' => '', 'active_icon' => '']];
$saved = $apps->update($id, $input);
check($saved['config']['navigation']['items'] === [['label' => 'Home', 'url' => '/']], 'Removing an icon must remove its stored fields.');
check($saved['version_code'] === 1, 'Editing after queueing must preserve the assigned version code.');

fwrite(STDOUT, 'navigation icons: database round trip, 20 builtins, active states, PNG validation, 24 maximum-size slots and versioning: ok' . PHP_EOL);
