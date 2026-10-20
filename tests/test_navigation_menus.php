<?php

declare(strict_types=1);

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Apps.php';
require __DIR__ . '/../src/Request.php';

use QuantumBuilder\Apps;
use QuantumBuilder\Database;
use QuantumBuilder\Request;

function check(bool $value, string $message): void
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}

function menu(string $id = 'shop', array $items = []): array
{
    return ['id' => $id, 'label' => 'Menu ' . $id, 'items' => $items];
}

function menuLink(string $url = '/'): array
{
    return ['label' => 'Destination', 'url' => $url];
}

function group(string $id = 'section'): array
{
    return ['type' => 'group', 'id' => $id, 'label' => 'Section', 'children' => [menuLink()]];
}

function rule(): array
{
    return ['match' => 'prefix', 'path' => '/shop', 'sidebar_menu' => 'shop'];
}

set_error_handler(static function (int $severity, string $message, string $file, int $line): never {
    throw new ErrorException($message, 0, $severity, $file, $line);
});
$dir = sys_get_temp_dir() . '/qb-navigation-menus-' . bin2hex(random_bytes(6));
mkdir($dir, 0700, true);
register_shutdown_function(static function () use ($dir): void {
    restore_error_handler();
    foreach (glob($dir . '/*') ?: [] as $file) @unlink($file);
    @rmdir($dir);
});
$db = new Database($dir . '/test.sqlite');
$db->migrate();
$apps = new Apps($db->pdo());
$input = [
    'name' => 'Navigation Menus', 'package_id' => 'de.starlightunit.navigationmenus',
    'start_url' => 'https://example.test/app/index.html', 'version_name' => '1.0.0', 'version_code' => 42,
    'config' => ['navigation' => ['items' => [menuLink()]]],
];
$app = $apps->create($input);
$id = (int) $app['id'];
$nav = $app['config']['navigation'];
check($nav['menus'] === [] && $nav['rules'] === [] && $nav['sidebar_menu'] === 'default'
    && $nav['bottom_tabs_menu'] === 'default', 'Legacy profiles must get compatible menu defaults.');

$input['config']['navigation'] = [
    'items' => [group()],
    'menus' => [menu('shop', [group()]), menu('account', [menuLink('/account')]), menu('empty')],
    'sidebar_menu' => 'shop', 'bottom_tabs_menu' => 'account',
    'top_bar' => false, 'sidebar' => true, 'bottom_tabs' => false, 'contextual_toolbar' => true,
    'rules' => [
        rule() + ['host' => 'APP.EXAMPLE.TEST', 'bottom_tabs_menu' => 'empty',
            'visibility' => ['top_bar' => true, 'sidebar' => false, 'bottom_tabs' => true, 'contextual_toolbar' => false]],
        ['match' => 'exact', 'path' => '/account', 'bottom_tabs_menu' => 'default'],
    ],
];
$input['config']['navigation']['menus'][0]['label'] = ' Store "A" \\ Übersicht 🙂 ';
$decoded = Request::decodeJson(json_encode($input, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
$saved = $apps->update($id, $decoded);
$expected = $saved['config']['navigation'];
check($expected['menus'][0]['label'] === 'Store "A" \\ Übersicht 🙂', 'Menu labels normalize without damaging quotes, Unicode or backslashes.');
check($expected['items'][0]['id'] === $expected['menus'][0]['items'][0]['id'], 'Group IDs can be reused in separate menu namespaces.');
check($expected['rules'][0]['host'] === 'app.example.test', 'Rule hosts normalize to lowercase.');
check($expected['menus'][2]['items'] === [], 'Empty menus survive the API and database round trip.');
check($expected['rules'][0]['visibility']['top_bar'] === true && $expected['top_bar'] === false,
    'A rule can show a surface whose default visibility is false.');
check($apps->find($id)['config']['navigation'] === $expected && $saved['version_code'] === 42,
    'Complete menus, references and ordered rules must round trip without incrementing the version code.');

$readJson = static function () use ($db, $id): string {
    $stmt = $db->pdo()->prepare('SELECT config_json FROM apps WHERE id=:id');
    $stmt->execute(['id' => $id]);
    return (string) $stmt->fetchColumn();
};
$stableJson = $readJson();
$invalid = [];
foreach ([null, false, '', new stdClass(), ['id' => menu()]] as $i => $value) {
    $invalid['menus container ' . $i] = ['menus' => $value];
    $invalid['rules container ' . $i] = ['rules' => $value];
}
$invalid['too many menus'] = ['menus' => [menu('a'), menu('b'), menu('c'), menu('d')]];
$invalid['duplicate menus'] = ['menus' => [menu(), menu()]];
foreach (['default', '', ' bad', 'bad ', "bad\n", 'UPPER', '-bad', '_bad', '9bad', 'bad/id', 'ä', str_repeat('a', 41)] as $i => $value) {
    $invalid['menu identifier ' . $i] = ['menus' => [menu($value)]];
}
foreach ([null, 7, '', ' ', str_repeat('ä', 41)] as $i => $value) {
    $invalid['menu label ' . $i] = ['menus' => [array_replace(menu(), ['label' => $value])]];
}
foreach ([null, 7, '', new stdClass(), ['0' => menuLink(), 'extra' => menuLink()]] as $i => $value) {
    $invalid['menu items ' . $i] = ['menus' => [array_replace(menu(), ['items' => $value])]];
}
$invalid['menu items absent'] = ['menus' => [['id' => 'shop', 'label' => 'Shop']]];
$invalid['menu unsupported field'] = ['menus' => [menu() + ['url' => '/']]];
$invalid['rule unsupported field'] = ['rules' => [rule() + ['enabled' => true]]];
$invalid['no rule override'] = ['rules' => [['match' => 'prefix', 'path' => '/']]];
$invalid['too many rules'] = ['rules' => array_fill(0, 17, rule())];
foreach ([null, 7, '', [], 'missing', ' shop ', 'Default'] as $i => $value) {
    foreach (['sidebar_menu', 'bottom_tabs_menu'] as $field) {
        $invalid['default reference ' . $field . $i] = [$field => $value];
        $invalid['rule reference ' . $field . $i] = ['rules' => [array_replace(rule(), [$field => $value])]];
    }
}
foreach ([null, 7, '', 'EXACT', 'regex', false, []] as $i => $value) {
    $invalid['rule match ' . $i] = ['rules' => [array_replace(rule(), ['match' => $value])]];
}
foreach ([null, 7, '', 'shop', '//shop', '/shop?x=1', '/shop#x', '/bad path', '/bad\\path', '/%zz', '/%2',
    '/ä', "/end\n", '/[' , '/<', '/' . str_repeat('x', 2048)] as $i => $value) {
    $invalid['rule path ' . $i] = ['rules' => [array_replace(rule(), ['path' => $value])]];
}
foreach ([null, 7, '', ' example.test', 'example.test ', 'example.test.', '-bad.example.test', 'bad-.example.test',
    'a..example.test', '_bad.example.test', '*.example.test', 'example.test:443', 'https://example.test',
    'example.test.evil.test', 'notexample.test', 'evil.test', 'K.example.test', str_repeat('a', 64) . '.example.test'] as $i => $value) {
    $invalid['rule host ' . $i] = ['rules' => [rule() + ['host' => $value]]];
}
foreach ([null, '', [], new stdClass(), ['invalid_surface' => true], ['sidebar' => 1], ['top_bar' => 'false'], ['bottom_tabs' => null]] as $i => $value) {
    $invalid['rule visibility ' . $i] = ['rules' => [rule() + ['visibility' => $value]]];
}
$invalid['thirteen links in one menu'] = ['items' => [], 'menus' => [menu('shop', array_fill(0, 13, menuLink()))]];
$invalid['aggregate25 nodes'] = ['items' => array_fill(0, 12, menuLink()),
    'menus' => [menu('shop', array_fill(0, 12, menuLink())), menu('account', [menuLink()]), menu('empty')]];
$invalid['untrusted unselected menu'] = ['menus' => [menu('shop'), menu('account'), menu('empty', [menuLink('https://evil.test/')])]];
$invalid['malformed icon in unselected menu'] = ['menus' => [menu('shop'), menu('account'), menu('empty', [menuLink() + ['icon' => 'unknown']])]];
$invalidCount = 0;
foreach ($invalid as $case => $overrides) {
    $candidate = $input;
    $candidate['name'] = 'Must not be saved';
    $candidate['config']['navigation'] = array_replace($input['config']['navigation'], $overrides);
    $rejected = false;
    try { $apps->update($id, $candidate); } catch (InvalidArgumentException) { $rejected = true; }
    check($rejected, 'Invalid navigation must be rejected: ' . $case);
    check($readJson() === $stableJson && $apps->find($id)['name'] === 'Navigation Menus'
        && $apps->find($id)['version_code'] === 42, 'A rejected navigation save must be atomic: ' . $case);
    $invalidCount++;
}

$rawCases = [
    '"menus":{}', '"menus":{"0":{"id":"shop","label":"Shop","items":[]}}', '"menus":[[]]',
    '"menus":[{"id":"shop","label":"Shop","items":{}}]',
    '"menus":[{"id":"shop","label":"Shop","items":{"0":{"label":"Home","url":"/"}}}]',
    '"menus":[{"id":"shop","label":"Shop","items":[{"type":"group","id":"g","label":"G","children":{}}]}]',
    '"menus":[{"id":"shop","label":"Shop","items":[{"type":"group","id":"g","label":"G","children":{"0":{"label":"Home","url":"/"}}}]}]',
    '"rules":{}', '"rules":{"0":{"match":"prefix","path":"/","sidebar_menu":"default"}}',
    '"rules":[[]]', '"rules":[{"match":"exact","path":"/","visibility":[]}]',
    '"rules":[{"match":"exact","path":"/","visibility":{}}]',
    '"rules":[{"match":"exact","path":"/","visibility":{"0":true}}]',
];
$envelope = $input;
$envelope['config']['navigation'] = '__navigation__';
$envelope = json_encode($envelope, JSON_THROW_ON_ERROR);
foreach ($rawCases as $case) {
    $candidate = Request::decodeJson(str_replace('"__navigation__"', '{' . $case . '}', $envelope));
    $rejected = false;
    try { $apps->update($id, $candidate); } catch (InvalidArgumentException) { $rejected = true; }
    check($rejected && $readJson() === $stableJson, 'API JSON array/object distinction must be enforced: ' . $case);
}

// The aggregate limit still permits 24 independent destinations across menus.
$maximum = $input;
$maximum['config']['navigation'] = ['items' => array_fill(0, 12, menuLink()),
    'menus' => [menu('shop', array_fill(0, 12, menuLink()))], 'sidebar_menu' => 'default', 'bottom_tabs_menu' => 'shop'];
$maxHost = str_repeat('a', 63) . '.' . str_repeat('b', 63) . '.' . str_repeat('c', 63) . '.' . str_repeat('d', 48) . '.example.test';
check(strlen($maxHost) === 253, 'Maximum host fixture has 253 ASCII bytes.');
foreach (['/', '/shop', '/shop/', "/a~b!$&'()*+,;=:@/%2F", '/%2f', '/' . str_repeat('x', 2047)] as $path) {
    $maximum['config']['navigation']['rules'] = array_fill(0, 16, [
        'match' => 'exact', 'path' => $path, 'host' => $maxHost, 'visibility' => ['sidebar' => false],
    ]);
    $saved = $apps->update($id, Request::decodeJson(json_encode($maximum, JSON_THROW_ON_ERROR)));
    check(count($saved['config']['navigation']['menus'][0]['items']) === 12 && count($saved['config']['navigation']['rules']) === 16,
        'Maximum aggregate nodes and supported raw rule paths must round trip: ' . substr($path, 0, 40));
    check($saved['config']['navigation']['rules'][0]['path'] === $path, 'Raw paths must retain percent case and punctuation.');
}
echo 'navigation menus: independent menu/rule database round trip, ' . $invalidCount
    . ' atomic validation cases, ' . count($rawCases) . ' raw request shape cases, global24-node and16-rule limits: ok' . PHP_EOL;
