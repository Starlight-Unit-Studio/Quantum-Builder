'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateItems, resolveTarget, MAX_ITEMS, MAX_TABS } = require('../public/assets/navigation-model.js');
const context = { startUrl: 'https://example.test/app/index.html?old=1#before', trustedDomain: 'example.test' };

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
