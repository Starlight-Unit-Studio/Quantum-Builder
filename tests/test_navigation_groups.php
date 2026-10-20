<?php

declare(strict_types=1);

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Apps.php';
require __DIR__ . '/../src/Builds.php';
require __DIR__ . '/../src/Request.php';

use QuantumBuilder\Apps;
use QuantumBuilder\Builds;
use QuantumBuilder\Database;
use QuantumBuilder\Request;

function check(bool $value, string $message): void
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}

function group(string $id, array $children = []): array
{
    return ['type' => 'group', 'id' => $id, 'label' => 'Group ' . $id, 'children' => $children];
}

function navigationLink(string $url = '/'): array
{
    return ['label' => 'Destination', 'url' => $url];
}

function pngChunk(string $type, string $data): string
{
    return pack('N', strlen($data)) . $type . $data . hash('crc32b', $type . $data, true);
}

function paddedPng(int $bytes): string
{
    $start = "\x89PNG\r\n\x1a\n" . pngChunk('IHDR', pack('NNCCCCC', 1, 1, 8, 6, 0, 0, 0));
    $end = pngChunk('IDAT', gzcompress(str_repeat("\0", 5))) . pngChunk('IEND', '');
    $padding = $bytes - strlen($start . $end) - 14;
    check($padding >= 0, 'PNG fixture needs room for a padding chunk.');
    return $start . pngChunk('tEXt', "x\0" . str_repeat('x', $padding)) . $end;
}

function imageUrl(string $payload): string
{
    return 'data:image/png;base64,' . base64_encode($payload);
}

set_error_handler(static function (int $severity, string $message, string $file, int $line): never {
    throw new ErrorException($message, 0, $severity, $file, $line);
});
$dir = sys_get_temp_dir() . '/qb-navigation-groups-' . bin2hex(random_bytes(6));
mkdir($dir, 0700, true);
register_shutdown_function(static function () use ($dir): void {
    restore_error_handler();
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
    'name' => 'Navigation Groups',
    'package_id' => 'de.starlightunit.navigationgroups',
    'start_url' => 'https://example.test/',
    'version_name' => '1.0.0',
    'version_code' => 0,
    'config' => ['navigation' => ['items' => [navigationLink()]]],
];
$app = $apps->create($input);
$id = (int) $app['id'];
check($app['config']['navigation']['items'] === [navigationLink()], 'Legacy flat profiles must retain their label/url shape.');

$icon = imageUrl(paddedPng(512));
$tree = [
    ['type' => 'link', 'label' => ' Home ', 'url' => ' / ', 'icon' => '', 'active_icon' => ' '],
    [
        'type' => 'group', 'id' => 'account', 'label' => ' Account ', 'collapsed' => true,
        'icon' => ' folder ', 'active_icon' => $icon,
        'children' => [
            ['label' => 'Profile', 'url' => '/profile', 'icon' => $icon, 'active_icon' => 'user'],
            [
                'type' => 'group', 'id' => 'preferences', 'label' => 'Preferences', 'icon' => 'settings',
                'children' => [[
                    'type' => 'group', 'id' => 'advanced', 'label' => 'Advanced', 'collapsed' => false,
                    'children' => [['type' => 'link', 'label' => 'Security', 'url' => 'https://shop.example.test/security']],
                ]],
            ],
        ],
    ],
    group('empty'),
];
$input['config']['navigation']['items'] = $tree;
$saved = $apps->update($id, $input);
$expected = [
    ['label' => 'Home', 'url' => '/'],
    [
        'type' => 'group', 'id' => 'account', 'label' => 'Account', 'collapsed' => true,
        'children' => [
            ['label' => 'Profile', 'url' => '/profile', 'icon' => $icon, 'active_icon' => 'user'],
            [
                'type' => 'group', 'id' => 'preferences', 'label' => 'Preferences', 'collapsed' => false,
                'children' => [[
                    'type' => 'group', 'id' => 'advanced', 'label' => 'Advanced', 'collapsed' => false,
                    'children' => [['label' => 'Security', 'url' => 'https://shop.example.test/security']],
                ]],
                'icon' => 'settings',
            ],
        ],
        'icon' => 'folder', 'active_icon' => $icon,
    ],
    ['type' => 'group', 'id' => 'empty', 'label' => 'Group empty', 'collapsed' => false, 'children' => []],
];
check($saved['config']['navigation']['items'] === $expected, 'Normalization must preserve tree order, IDs, collapse state and group/leaf icons.');
check($apps->find($id)['config']['navigation']['items'] === $expected, 'The complete three-level tree must survive a database round trip.');
check($saved['version_code'] === 0, 'Editing a group must not assign a new Android version code.');
$readJson = static function () use ($db, $id): string {
    $sql = $db->pdo()->prepare('SELECT config_json FROM apps WHERE id=:id');
    $sql->execute(['id' => $id]);
    return (string) $sql->fetchColumn();
};
$beforeInvalid = $readJson();
check(json_decode($beforeInvalid, true)['navigation']['items'] === $expected, 'Stored JSON must contain the canonical tree, not a flattened link list.');

$invalid = [
    'null items' => null,
    'object items' => ['section' => group('section')],
    'scalar node' => ['node'],
    'null node' => [null],
    'array node' => [[]],
    'missing group id' => [['type' => 'group', 'label' => 'Section', 'children' => []]],
    'missing children' => [['type' => 'group', 'id' => 'section', 'label' => 'Section']],
    'duplicate siblings' => [group('duplicate'), group('duplicate')],
    'duplicate across branches' => [group('left', [group('duplicate')]), group('right', [group('duplicate')])],
    'duplicate ancestor' => [group('duplicate', [group('duplicate')])],
    'four group levels' => [group('first', [group('second', [group('third', [group('fourth', [navigationLink()])])])])],
    'link missing URL' => [['label' => 'Missing URL']],
    'link numeric URL' => [['label' => 'Numeric URL', 'url' => 1]],
    'link empty URL' => [navigationLink(' ')],
    'link URL too long' => [navigationLink('/' . str_repeat('x', 2048))],
    'deep invalid icon' => [group('first', [group('second', [navigationLink() + ['active_icon' => 'unknown']])])],
    'group remote icon' => [group('first') + ['icon' => 'https://example.test/icon.png']],
    'group null icon' => [group('first') + ['active_icon' => null]],
];
foreach (['', '_bad', '-bad', '9bad', 'UPPER', 'bad/id', 'bad id', 'ä', ' id', "id\n", str_repeat('a', 41)] as $index => $badId) {
    $invalid['bad group id ' . $index] = [array_replace(group('valid'), ['id' => $badId])];
}
foreach ([null, false, 1, [], 'separator', 'Group'] as $index => $type) {
    $invalid['unknown node type ' . $index] = [navigationLink() + ['type' => $type]];
}
foreach ([null, '', '/', 'https://example.test/'] as $index => $url) {
    $invalid['group URL property ' . $index] = [group('section') + ['url' => $url]];
}
foreach ([null, 0, 1, '', 'false', []] as $index => $collapsed) {
    $invalid['non-boolean collapsed ' . $index] = [group('section') + ['collapsed' => $collapsed]];
}
foreach ([null, 'children', new stdClass(), ['child' => navigationLink()]] as $index => $children) {
    $invalid['non-array children ' . $index] = [array_replace(group('section'), ['children' => $children])];
}
foreach (['children', 'id', 'collapsed'] as $field) {
    $invalid['group field on legacy link: ' . $field] = [navigationLink() + [$field => null]];
    $invalid['group field on explicit link: ' . $field] = [navigationLink() + ['type' => 'link', $field => null]];
}
foreach ([null, '', ' ', 7, [], str_repeat('a', 81), str_repeat('ä', 41)] as $index => $label) {
    $invalid['invalid group label ' . $index] = [array_replace(group('section'), ['label' => $label])];
    $invalid['invalid leaf label ' . $index] = [group('section', [array_replace(navigationLink(), ['label' => $label])])];
}
$thirteenLinks = array_fill(0, 13, navigationLink());
$invalid['thirteen flat links'] = $thirteenLinks;
$invalid['thirteen links across branches'] = [group('left', array_slice($thirteenLinks, 0, 6)), group('right', array_slice($thirteenLinks, 6))];
$thirteenGroups = [];
for ($i = 0; $i < 13; $i++) {
    $thirteenGroups[] = group('section_' . $i);
}
$invalid['thirteen groups across branches'] = [group('outer', array_slice($thirteenGroups, 0, 12))];
$invalid['twenty-five total nodes'] = [];
for ($i = 0; $i < 12; $i++) {
    $invalid['twenty-five total nodes'][] = group('section_' . $i, [navigationLink()]);
}
$invalid['twenty-five total nodes'][] = navigationLink('/extra');

// Even an initially collapsed third-level descendant is subject to the trust policy.
foreach ([
    'https://evil.test/', 'https://notexample.test/', 'https://example.test.evil.test/',
    '//example.test/profile', 'http://example.test/', 'https://user@example.test/',
    'https://user:pass@example.test/', 'javascript:alert(1)', 'data:text/html,hello',
    '/bad path', '/bad%escape', '/bad%2', '/bad\\path', "/bad\tpath", '/bad<path>',
    'https://example.test:99999/', 'https://%65xample.test/', 'https://example.test:/',
] as $index => $url) {
    $deep = group('third', [navigationLink($url)]) + ['collapsed' => true];
    $invalid['untrusted or malformed descendant URL ' . $index] = [group('first', [group('second', [$deep])])];
}
$invalidCount = 0;
foreach ($invalid as $case => $items) {
    $candidate = $input;
    $candidate['name'] = 'Must not be saved';
    $candidate['config']['navigation']['items'] = $items;
    $rejected = false;
    try {
        $apps->update($id, $candidate);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }
    check($rejected, 'Invalid group case must be rejected: ' . $case);
    check($readJson() === $beforeInvalid, 'Failed update must preserve the entire stored JSON: ' . $case);
    check($apps->find($id)['name'] === 'Navigation Groups', 'Failed validation must not partially save metadata.');
    $invalidCount++;
}
$candidate = $input;
$candidate['package_id'] = 'de.starlightunit.invalidgroups';
$candidate['config']['navigation']['items'] = $invalid['duplicate across branches'];
$rejected = false;
try {
    $apps->create($candidate);
} catch (InvalidArgumentException) {
    $rejected = true;
}
check($rejected && (int) $db->pdo()->query('SELECT count(*) FROM apps')->fetchColumn() === 1, 'A failed create must not insert a partial profile.');

// Exercise the API's actual request decoder: associative json_decode alone
// silently turns both {} and {"0": {...}} into PHP arrays. List containers must
// remain distinguishable from objects until Apps has validated the full tree.
$decoded = Request::decodeJson(json_encode($input, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
check(is_array($decoded), 'A valid app request must decode.');
$saved = $apps->update($id, $decoded);
check($saved['config']['navigation']['items'] === $expected, 'Valid request decoding must retain menu objects, children arrays and empty groups.');
check($readJson() === $beforeInvalid, 'Request decoding must not change a valid canonical profile.');
$requestEnvelope = $input;
$requestEnvelope['config']['navigation']['items'] = '__raw_menu_json__';
$requestJson = json_encode($requestEnvelope, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
$invalidRequestMenus = [
    '{}',
    '{"0":{"label":"Home","url":"/"}}',
    '{"0":{"label":"Home","url":"/"},"1":{"label":"News","url":"/news"}}',
    '[{"type":"group","id":"section","label":"Section","children":{}}]',
    '[{"type":"group","id":"section","label":"Section","children":{"0":{"label":"Home","url":"/"}}}]',
    '[{"type":"group","id":"section","label":"Section","children":{"0":{"label":"Home","url":"/"},"1":{"label":"News","url":"/news"}}}]',
    '[{"type":"group","id":"outer","label":"Outer","children":[{"type":"group","id":"inner","label":"Inner","children":{"0":{"label":"Home","url":"/"}}}]}]',
    '[{"type":"group","id":"outer","label":"Outer","children":[{"type":"group","id":"inner","label":"Inner","children":{}}]}]',
];
foreach ($invalidRequestMenus as $index => $menuJson) {
    $decoded = Request::decodeJson(str_replace('"__raw_menu_json__"', $menuJson, $requestJson));
    check(is_array($decoded), 'Syntactically valid JSON must reach structural validation.');
    $rejected = false;
    try {
        $apps->update($id, $decoded);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }
    check($rejected, 'Object-shaped menu containers must fail after actual request decoding: ' . $index);
    check($readJson() === $beforeInvalid, 'Invalid decoded requests must preserve the saved profile: ' . $index);
}
foreach (['{', 'null', '"text"', 'false'] as $badJson) {
    check(Request::decodeJson($badJson) === null, 'Malformed or scalar requests must retain the invalid_json response contract.');
}
check(Request::decodeJson('{"email":"user@example.test","password":"example"}') === [
    'email' => 'user@example.test', 'password' => 'example',
], 'Other API payloads must retain their existing associative representation.');

foreach (['/', '/a?value=%20', 'settings', './settings', '../profile', '?lang=de', '#profile',
    'https://example.test/', 'https://shop.example.test/path', 'https://example.test:8443/path'] as $url) {
    $input['config']['navigation']['items'] = [group('first', [group('second', [group('third', [navigationLink($url)])])])];
    $saved = $apps->update($id, $input);
    $deepLink = $saved['config']['navigation']['items'][0]['children'][0]['children'][0]['children'][0];
    check($deepLink['url'] === $url, 'Valid relative and trusted HTTPS descendant URLs must round trip.');
}

// A profile with every allowed group, destination and icon slot also carries the
// maximum custom splash and the editor's 600 KiB launcher icon. This exceeds
// PHP's default 8 MiB request body, while fitting the configured 12 MiB limit.
$limitIcon = imageUrl(paddedPng(65_536));
$limitSplash = imageUrl(paddedPng(3 * 1024 * 1024));
$limitLauncher = imageUrl(paddedPng(600 * 1024));
$limitLabel = str_repeat('ä', 40);
$prefix = 'https://shop.example.test/';
$limitUrl = $prefix . str_repeat('x', 2048 - strlen($prefix));
$input['config']['theme']['custom_splash_data_url'] = $limitSplash;
$input['config']['theme']['app_icon_data_url'] = $limitLauncher;
$input['config']['navigation']['items'] = [];
for ($i = 0; $i < 12; $i++) {
    $input['config']['navigation']['items'][] = [
        'type' => 'group', 'id' => $i === 0 ? 'g' . str_repeat('a', 39) : 'section_' . $i,
        'label' => $limitLabel, 'icon' => $limitIcon, 'active_icon' => $limitIcon,
        'children' => [['label' => $limitLabel, 'url' => $limitUrl, 'icon' => $limitIcon, 'active_icon' => $limitIcon]],
    ];
}
$maxRequest = json_encode($input, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
$requestBytes = strlen($maxRequest);
check($requestBytes > 8 * 1024 * 1024 && $requestBytes < 12 * 1024 * 1024, 'Combined maximum profile must fit the PHP/nginx 12 MiB body limit.');
$decoded = Request::decodeJson($maxRequest);
check(is_array($decoded), 'The complete maximum-size request must decode.');
$saved = $apps->update($id, $decoded);
$stored = $apps->find($id);
check(count($stored['config']['navigation']['items']) === 12, 'All 12 groups and their 12 links must be retained.');
check($stored['config']['navigation']['items'][11]['children'][0]['active_icon'] === $limitIcon, 'The last of 48 maximum-size icon slots must round trip.');
check($stored['config']['navigation']['items'][0]['label'] === $limitLabel, 'An 80-byte UTF-8 label must round trip.');
check($stored['config']['theme']['custom_splash_data_url'] === $limitSplash, 'The maximum splash must round trip with all navigation icons.');
check($stored['config']['theme']['app_icon_data_url'] === $limitLauncher, 'The launcher icon must round trip with all navigation icons.');
check($saved['version_code'] === 0, 'Editing a maximum-size profile must preserve the Android version code.');
$build = $builds->queue($id, 'compat/android-6-api23');
check($build['status'] === 'queued' && $apps->find($id)['version_code'] === 1, 'Queueing retains the existing version-code contract.');

// Removing groups and images restores the original small flat representation.
$input['config']['theme']['custom_splash_data_url'] = '';
$input['config']['theme']['app_icon_data_url'] = '';
$input['config']['navigation']['items'] = [navigationLink() + ['type' => 'link', 'icon' => '', 'active_icon' => '']];
$saved = $apps->update($id, $input);
check($saved['config']['navigation']['items'] === [navigationLink()], 'Removing groups must restore a legacy-compatible flat profile.');
check($saved['version_code'] === 1, 'Group changes after queueing must preserve the assigned version code.');

fwrite(STDOUT, 'navigation groups: three-level database round trip, ' . $invalidCount
    . ' atomic validation cases, ' . count($invalidRequestMenus) . ' raw request shape cases, global limits, 48 icon slots, combined '
    . $requestBytes . '-byte decoded profile and versioning: ok' . PHP_EOL);
