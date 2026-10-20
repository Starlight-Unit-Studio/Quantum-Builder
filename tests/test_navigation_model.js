'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  validateItems, resolveTarget, walkItems, flattenItems, isGroup,
  MAX_ITEMS, MAX_TABS, MAX_GROUPS, MAX_NODES, MAX_GROUP_DEPTH,
} = require('../public/assets/navigation-model.js');
const context = { startUrl: 'https://example.test/app/index.html?old=1#before', trustedDomain: 'example.test' };
const group = (id, children = [], options = {}) => ({ type: 'group', id, label: id, children, ...options });
const link = (id) => ({ label: `Page ${id}`, url: `/page-${id}` });

test('existing shared menu schema survives visual-editor normalization without mutation', () => {
  const input = [{ label: ' Home ', url: '/' }, { label: 'News', url: 'news' }];
  const snapshot = JSON.stringify(input);
  assert.deepEqual(validateItems(input, context), [{ label: 'Home', url: '/' }, { label: 'News', url: 'news' }]);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(validateItems([], context), []);
  assert.equal(MAX_ITEMS, 12);
  assert.equal(MAX_TABS, 5);
});

test('runtime URL contract: resolve against start URL, including Java query-only references', () => {
  const cases = [
    ['/', 'https://example.test/'],
    ['news', 'https://example.test/app/news'],
    ['../settings', 'https://example.test/settings'],
    ['?page=2', 'https://example.test/app/?page=2'],
    ['#help', 'https://example.test/app/index.html?old=1#help'],
    ['https://example.test', 'https://example.test'],
    ['https://docs.example.test/news?tab=2#read', 'https://docs.example.test/news?tab=2#read'],
  ];
  for (const [input, expected] of cases) assert.equal(resolveTarget(input, context), expected, input);
});

test('reject unsafe or runtime-invalid destinations before autosave and preview navigation', () => {
  for (const input of [
    '', '//evil.test/path', 'http://example.test', 'javascript:alert(1)', 'data:text/html,test',
    'https://evil.test', 'https://example.test.evil.test', 'https://fakeexample.test',
    'https://example.test@evil.test', 'https://person:password@example.test',
    '\\evil.test/path', 'https://example.test\\@evil.test/', 'news item', '/bad\npath',
    '/bad%escape', '/bad[uri]', 'https://%65xample.test/',
    'https:///example.test/path', 'https:////example.test/path', 'https://exämple.test/',
  ]) assert.throws(() => resolveTarget(input, context), undefined, input);
});

test('narrowing the trusted domain immediately invalidates previous destinations', () => {
  assert.throws(() => resolveTarget('https://docs.example.test/news', { ...context, trustedDomain: 'app.example.test' }));
  assert.equal(resolveTarget('/news', { ...context, trustedDomain: '' }), 'https://example.test/news');
  assert.throws(() => resolveTarget('/news', { ...context, startUrl: 'javascript:alert(1)' }));
});

test('errors identify their row and retain invalid drafts outside the saved model', () => {
  const draft = [{ label: 'Home', url: '/' }, { label: '', url: '/news' }];
  assert.throws(() => validateItems(draft, context), error => error.itemIndex === 1);
  assert.equal(draft[1].label, '');
  for (const input of [null, {}, [{ label: 123, url: '/' }], [null], [[]], [{ label: 'Home', url: 123 }]]) {
    assert.throws(() => validateItems(input, context));
  }
});

test('menu and UTF-8 limits match the persisted profile contract', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ label: `Page ${i}`, url: `/page-${i}` }));
  assert.equal(validateItems(items, context).length, 12);
  assert.throws(() => validateItems([...items, { label: 'Extra', url: '/extra' }], context));
  assert.equal(validateItems([{ label: 'ä'.repeat(40), url: '/' }], context)[0].label.length, 40);
  assert.throws(() => validateItems([{ label: 'ä'.repeat(41), url: '/' }], context));
  assert.throws(() => validateItems([{ label: 'Home', url: '/' + 'x'.repeat(2048) }], context));
});

test('nested groups preserve their identity, order, icons and collapsed defaults without changing the draft', () => {
  const input = [
    { ...link('home'), type: 'link' },
    group('account', [group('settings', [link('privacy')], { collapsed: true, icon: 'settings' })], {
      label: ' Account ', icon: 'user', active_icon: 'star',
    }),
    group('empty'),
  ];
  const before = JSON.stringify(input);
  const output = validateItems(input, context);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(output, [
    link('home'),
    group('account', [group('settings', [link('privacy')], { collapsed: true, icon: 'settings' })], {
      label: 'Account', collapsed: false, icon: 'user', active_icon: 'star',
    }),
    group('empty', [], { collapsed: false }),
  ]);
  assert.notEqual(output[1].children, input[1].children);
  assert.equal(isGroup(output[1]), true);
  assert.equal(isGroup(output[0]), false);
  assert.equal(isGroup(null), false);
});

test('global budgets allow twelve links plus twelve groups, including twenty-four top-level nodes', () => {
  assert.equal(MAX_GROUPS, 12);
  assert.equal(MAX_NODES, 24);
  assert.equal(MAX_GROUP_DEPTH, 3);
  const links = Array.from({ length: 12 }, (_, i) => link(i));
  const groups = Array.from({ length: 12 }, (_, i) => group(`group-${i}`));
  assert.equal(validateItems([...groups, ...links], context).length, 24);
  assert.equal(flattenItems(validateItems([group('root', [...groups.slice(1), ...links])], context)).length, 12);
  assert.throws(() => validateItems([group('first', links.slice(0, 7)), group('second', [...links.slice(7), link('extra')])], context), /12 Menüziele/);
  assert.throws(() => validateItems([group('root', groups)], context), /12 Gruppen/);
  assert.throws(() => validateItems([...groups, ...links, group('extra')], context), /24 Menüelemente/);
});

test('three group ancestors are allowed, while a fourth is rejected even when empty', () => {
  const input = [group('one', [group('two', [group('three', [link('deep')])])])];
  const output = validateItems(input, context);
  assert.deepEqual(flattenItems(output), [link('deep')]);
  const fourth = [group('one', [group('two', [group('three', [group('four')])])])];
  assert.throws(() => validateItems(fourth, context), /3 Gruppenebenen/);
});

test('group IDs must be valid and unique across every branch', () => {
  const accepted = ['a', 'a0_-', 'a'.repeat(40)];
  for (const id of accepted) assert.equal(validateItems([group(id)], context)[0].id, id);
  for (const id of [undefined, null, 123, '', ' a', 'a ', 'a\n', 'a\r', 'a\r\n', 'a\u2028', 'a\u2029', 'A', '0a', '-a', 'a.b', 'ä', 'a'.repeat(41)]) {
    assert.throws(() => validateItems([group(id, [], { label: 'Group' })], context), /Gruppen-ID/);
  }
  assert.throws(() => validateItems([group('left', [group('same')]), group('right', [group('same')])], context), /eindeutige ID/);
});

test('typed nodes reject malformed group fields instead of silently converting them to links', () => {
  for (const type of [null, '', 'separator', 'GROUP', false, 1]) {
    assert.throws(() => validateItems([{ ...link('bad'), type }], context), /Menütyp/);
  }
  for (const field of ['children', 'id', 'collapsed']) {
    for (const value of [null, false, '', []]) {
      assert.throws(() => validateItems([{ ...link('bad'), [field]: value }], context), /Gruppenfelder/);
    }
  }
  for (const url of ['', null, '/page', false]) {
    assert.throws(() => validateItems([group('bad', [], { url })], context), /Ziel-URL/);
  }
  for (const collapsed of [null, 0, 1, 'false', [], {}]) {
    assert.throws(() => validateItems([group('bad', [], { collapsed })], context), /Einklappzustand/);
  }
  for (const children of [undefined, null, {}, '[]', false]) {
    assert.throws(() => validateItems([group('bad', [], { children })], context));
  }
});

test('nested destination, label and icon failures retain the precise path and do not normalize the original draft', () => {
  for (const invalid of [
    { label: 'Untrusted', url: 'https://evil.test/' },
    { label: 'ä'.repeat(41), url: '/' },
    { label: 'Icon', url: '/', icon: 'unknown-symbol' },
    group('invalid', [], { active_icon: 'https://example.test/icon.png' }),
  ]) {
    const draft = [link('home'), group('outer', [link('valid'), group('inner', [invalid])])];
    const before = JSON.stringify(draft);
    assert.throws(() => validateItems(draft, context), (error) => {
      assert.deepEqual(error.itemPath, [1, 1, 0]);
      assert.equal(error.itemIndex, 1);
      assert.match(error.message, /^Menüeintrag 2\.2\.1: /);
      return true;
    });
    assert.equal(JSON.stringify(draft), before);
  }
});

test('sidebar traversal retains empty groups and ancestry while tabs receive only depth-first links', () => {
  const input = [
    group('first', [link('a'), group('nested', [link('b')])]),
    group('empty'), link('c'), group('last', [link('d'), link('e'), link('f')]),
  ];
  const rows = walkItems(input);
  assert.deepEqual(rows.map(({ item }) => item), [
    input[0], input[0].children[0], input[0].children[1], input[0].children[1].children[0],
    input[1], input[2], input[3], ...input[3].children,
  ]);
  assert.deepEqual(rows[3].path, [0, 1, 0]);
  assert.equal(rows[3].depth, 2);
  assert.equal(rows[3].parentId, 'nested');
  assert.deepEqual(rows[3].ancestors, [input[0], input[0].children[1]]);
  assert.deepEqual(flattenItems(input).slice(0, MAX_TABS).map(({ url }) => url),
    ['/page-a', '/page-b', '/page-c', '/page-d', '/page-e']);
  assert.deepEqual(flattenItems([group('empty')]), []);
});

test('structural traversal supports incomplete editor rows and safely rejects cycles or unbounded input', () => {
  const draft = [group('draft', [{ label: '', url: '' }])];
  assert.equal(walkItems(draft).length, 2);
  assert.throws(() => validateItems(draft, context));
  const cyclic = group('cycle');
  cyclic.children.push(cyclic);
  assert.throws(() => walkItems([cyclic]), /zu tief/);
  assert.throws(() => validateItems([cyclic], context), /eindeutige ID/);
  for (const invalid of [null, {}, [null], [[]], [group('bad', null)], Array(25).fill(link('too-many'))]) {
    assert.throws(() => walkItems(invalid));
  }
});
