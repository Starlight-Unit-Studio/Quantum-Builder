'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateNavigation, selectNavigation, flattenItems, MAX_MENUS, MAX_RULES, MAX_TOTAL_NODES } = require('../public/assets/navigation-model.js');
const context = { startUrl: 'https://app.example.test/app/index.html', trustedDomain: 'example.test' };
const link = (name) => ({ label: name, url: '/' + name });
const group = (id, children = []) => ({ type: 'group', id, label: id, collapsed: true, children });
const menu = (id, items = []) => ({ id, label: id, items });
const rule = (overrides = {}) => ({ match: 'prefix', path: '/shop', bottom_tabs_menu: 'shop', ...overrides });
const profile = (overrides = {}) => ({
  top_bar: true, sidebar: true, bottom_tabs: false, contextual_toolbar: true,
  items: [link('home'), group('account', [link('account')])],
  menus: [menu('shop', [group('account', [link('basket'), link('checkout')])]), menu('help', [link('support')])],
  sidebar_menu: 'default', bottom_tabs_menu: 'shop', rules: [], ...overrides,
});
const select = (source, url) => selectNavigation(validateNavigation(source, context), url, context);

test('legacy profiles default to Standard for both surfaces; normalization does not mutate drafts', () => {
  assert.equal(MAX_MENUS, 4);
  assert.equal(MAX_RULES, 16);
  assert.equal(MAX_TOTAL_NODES, 24);
  const source = { title: 'Keep title', items: [link('home')], sidebar: true };
  const before = JSON.stringify(source);
  const normalized = validateNavigation(source, context);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(normalized.menus, []);
  assert.deepEqual(normalized.rules, []);
  assert.equal(normalized.sidebar_menu, 'default');
  assert.equal(normalized.bottom_tabs_menu, 'default');
  assert.equal(normalized.top_bar, false);
  assert.equal(normalized.title, 'Keep title');
  const chosen = selectNavigation(normalized, context.startUrl, context);
  assert.deepEqual(chosen.items, source.items);
  assert.deepEqual(chosen.tabItems, source.items);
  assert.equal(chosen.matchedRuleIndex, -1);
});

test('Sidebar and Tabs choose separate trees, permit repeated group IDs across menus, and retain empty choices', () => {
  const chosen = select(profile(), context.startUrl);
  assert.deepEqual(flattenItems(chosen.items).map((item) => item.label), ['home', 'account']);
  assert.deepEqual(flattenItems(chosen.tabItems).map((item) => item.label), ['basket', 'checkout']);
  const empty = select(profile({ menus: [menu('shop')], sidebar_menu: 'shop' }), context.startUrl);
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.tabItems, []);
  const full = Array.from({ length: 12 }, (_, index) => link('page-' + index));
  assert.equal(flattenItems(select(profile({ items: full, menus: [menu('shop', full)] }), context.startUrl).tabItems).length, 12);
});

test('menu definitions enforce catalog identity, exact containers, per-menu and combined icon/node budgets', () => {
  for (const menus of [null, {}, false, [null], [[]], [menu('default')], [menu('same'), menu('same')],
    [menu('one'), menu('two'), menu('three'), menu('four')],
    [menu('a\n')], [menu('A')], [menu('a'.repeat(41))], [{ id: 'shop', label: 'Shop' }],
    [menu('shop', {})], [{ ...menu('shop'), unknown: true }], [{ ...menu('shop'), label: 'ä'.repeat(41) }]]) {
    assert.throws(() => validateNavigation(profile({ menus }), context), undefined, JSON.stringify(menus));
  }
  const links = Array.from({ length: 12 }, (_, index) => link(String(index)));
  assert.doesNotThrow(() => validateNavigation(profile({ items: links, menus: [menu('shop', links)] }), context));
  assert.throws(() => validateNavigation(profile({ items: links, menus: [menu('shop', links), menu('help', [link('too-many')])] }), context), /24/);
  assert.throws(() => validateNavigation(profile({ items: [], menus: [menu('shop', [...links, link('extra')])] }), context), /12/);
});

test('dangling references are rejected even when a surface is hidden', () => {
  for (const field of ['sidebar_menu', 'bottom_tabs_menu']) {
    for (const value of [null, false, '', 'missing', ' shop ', 1, {}]) {
      assert.throws(() => validateNavigation(profile({ [field]: value }), context));
      assert.throws(() => validateNavigation(profile({ rules: [rule({ [field]: value })] }), context));
    }
  }
  assert.throws(() => validateNavigation(profile({ sidebar: false, sidebar_menu: 'missing' }), context));
  for (const field of ['top_bar', 'sidebar', 'bottom_tabs', 'contextual_toolbar']) {
    for (const value of [null, 0, 'false', []]) assert.throws(() => validateNavigation(profile({ [field]: value }), context));
  }
});

test('first matching rule wins as a whole and visibility can override defaults both ways', () => {
  const source = profile({ rules: [
    rule({ path: '/shop/checkout', match: 'exact', visibility: { top_bar: false, bottom_tabs: true }, sidebar_menu: 'help' }),
    rule({ visibility: { sidebar: false, contextual_toolbar: false }, sidebar_menu: 'shop' }),
  ] });
  const checkout = select(source, 'https://app.example.test/shop/checkout?step=1#pay');
  assert.equal(checkout.matchedRuleIndex, 0);
  assert.equal(checkout.sidebar_menu, 'help');
  assert.equal(checkout.bottom_tabs_menu, 'shop');
  assert.equal(checkout.top_bar, false);
  assert.equal(checkout.bottom_tabs, true);
  assert.equal(checkout.sidebar, true);
  assert.equal(checkout.contextual_toolbar, true);
  const product = select(source, 'https://app.example.test/shop/product');
  assert.equal(product.matchedRuleIndex, 1);
  assert.equal(product.sidebar, false);
  assert.equal(product.bottom_tabs, false);
  assert.equal(select(source, 'https://app.example.test/elsewhere').matchedRuleIndex, -1);
});

test('prefix paths honor segment boundaries and significant trailing slashes', () => {
  for (const [path, matched, missed] of [
    ['/shop', ['/shop', '/shop/', '/shop/item'], ['/shopping', '/SHOP', '/shopper/item']],
    ['/shop/', ['/shop/', '/shop/item'], ['/shop', '/shopping/']],
    ['/', ['/', '/anything', '/shop/item'], []],
  ]) {
    for (const suffix of matched) assert.equal(select(profile({ rules: [rule({ path })] }), 'https://app.example.test' + suffix).matchedRuleIndex, 0, path + ' ' + suffix);
    for (const suffix of missed) assert.equal(select(profile({ rules: [rule({ path })] }), 'https://app.example.test' + suffix).matchedRuleIndex, -1, path + ' ' + suffix);
  }
  const exact = profile({ rules: [rule({ match: 'exact', path: '/' })] });
  assert.equal(select(exact, 'https://app.example.test?x=1').matchedRuleIndex, 0);
  assert.equal(select(exact, 'https://app.example.test/#fragment').matchedRuleIndex, 0);
});

test('matching preserves raw percent encodings, dot segments and path case, ignoring query and fragment', () => {
  for (const path of ['/a/../shop', '/%2e/shop', '/a%2Fb', '/caf%C3%A9', "/a!$&'()*+,;=:@~_"]) {
    const source = profile({ rules: [rule({ match: 'exact', path })] });
    assert.equal(select(source, 'https://app.example.test' + path + '?q=/elsewhere#x').matchedRuleIndex, 0, path);
  }
  for (const [path, incoming] of [['/a%2Fb', '/a/b'], ['/a%2Fb', '/a%2fb'], ['/a/../shop', '/shop'], ['/Shop', '/shop']]) {
    assert.equal(select(profile({ rules: [rule({ match: 'exact', path })] }), 'https://app.example.test' + incoming).matchedRuleIndex, -1);
  }
});

test('host filters are exact and normalized; rules never match outside trusted HTTPS routes', () => {
  const normalized = validateNavigation(profile({ rules: [rule({ host: 'APP.Example.Test' })] }), context);
  assert.equal(normalized.rules[0].host, 'app.example.test');
  assert.equal(selectNavigation(normalized, 'https://APP.example.test:8443/shop', context).matchedRuleIndex, 0);
  for (const url of ['https://sub.app.example.test/shop', 'https://example.test/shop', 'http://app.example.test/shop',
    'https://evil.test/shop', 'https://app.example.test.evil.test/shop', 'https://person@app.example.test/shop',
    'javascript:alert(1)', '//app.example.test/shop', '/shop', 'https://app.example.test/bad%zz']) {
    assert.equal(selectNavigation(normalized, url, context).matchedRuleIndex, -1, url);
  }
  assert.equal(select(profile({ rules: [rule()] }), 'https://other.example.test/shop').matchedRuleIndex, 0);
  for (const host of ['', null, false, ' app.example.test', 'app.example.test ', 'app.example.test\n', '*.example.test',
    'https://app.example.test', 'app.example.test:443', 'evil.test', 'example.test.evil.test', '-app.example.test',
    'app-.example.test', 'app..example.test', 'app.example.test.', 'ä.example.test', 'K.example.test', 'a'.repeat(64) + '.example.test']) {
    assert.throws(() => validateNavigation(profile({ rules: [rule({ host })] }), context), undefined, String(host));
  }
});

test('malformed or inert rules cannot silently enter a saved profile', () => {
  for (const rules of [null, {}, false, [null], [[]], Array(17).fill(rule()), [{ path: '/', visibility: { sidebar: false } }],
    [rule({ match: 'contains' })], [rule({ unknown: true })], [{ match: 'prefix', path: '/' }],
    [rule({ visibility: {} })], [rule({ visibility: [] })], [rule({ visibility: null })],
    [rule({ visibility: { unknown: false } })], [rule({ visibility: { sidebar: 'false' } })]]) {
    assert.throws(() => validateNavigation(profile({ rules }), context), undefined, JSON.stringify(rules));
  }
  for (const path of ['', null, false, 'shop', '//shop', '/shop?x=1', '/shop#x', '/shop\\x', '/space here', '/ä', '/bad%0', '/bad%zz', '/shop\n', '/' + 'a'.repeat(2048)]) {
    assert.throws(() => validateNavigation(profile({ rules: [rule({ path })] }), context), undefined, String(path));
  }
  assert.doesNotThrow(() => validateNavigation(profile({ rules: Array(16).fill(rule()) }), context));
  assert.doesNotThrow(() => validateNavigation(profile({ rules: [rule({ path: '/' + 'a'.repeat(2047) })] }), context));
});

test('current URL character acceptance agrees with the native matcher even in ignored queries', () => {
  const source = profile({ rules: [rule({ path: '/' })] });
  for (const value of ['[x]', '`', '\u0000', '\u001f', '\u007f', '\u0085', '\u009f', '\u00a0', '\u1680', '\u2001', '\u2028', '\u202f', '\u205f', '\u3000', '\ufeff']) {
    assert.equal(select(source, 'https://app.example.test/shop?q=' + value).matchedRuleIndex, -1, JSON.stringify(value));
  }
  for (const value of ['%5Bx%5D', '%60', '%C2%85', '%C2%A0', 'caf%C3%A9', 'café']) {
    assert.equal(select(source, 'https://app.example.test/shop?q=' + value).matchedRuleIndex, 0, value);
  }
  assert.equal(select(source, 'https://app.example.test/shop#one#two').matchedRuleIndex, -1);
  assert.equal(select(source, 'https://app.example.test/shop#one%23two').matchedRuleIndex, 0);
});

test('normalization and selection leave the complete editable source unchanged', () => {
  const source = profile({ rules: [rule({ host: 'APP.EXAMPLE.TEST', visibility: { sidebar: false } })] });
  source.menus[0].label = ' Shop ';
  const before = JSON.stringify(source);
  const normalized = validateNavigation(source, context);
  selectNavigation(normalized, 'https://app.example.test/shop', context);
  assert.equal(JSON.stringify(source), before);
  assert.equal(normalized.menus[0].label, 'Shop');
  assert.equal(normalized.sidebar, true);
});
