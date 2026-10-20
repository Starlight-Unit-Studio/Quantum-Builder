'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const zlib = require('node:zlib');
const icons = require('../public/assets/navigation-icons.js');
const model = require('../public/assets/navigation-model.js');
const context = { startUrl: 'https://example.test/app/', trustedDomain: 'example.test' };

const chunk = (type, data) => {
  const contents = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, contents, tail]);
};

const png = (width = 2, height = 2, extra = Buffer.alloc(0)) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)), extra, chunk('IEND', Buffer.alloc(0)),
  ]);
};
const dataUrl = (bytes) => 'data:image/png;base64,' + bytes.toString('base64');

test('every built-in survives persisted normalization with its selected state', () => {
  assert.equal(icons.CATALOG.length, 20);
  assert.equal(new Set(icons.CATALOG.map(icon => icon.id)).size, 20);
  for (const icon of icons.CATALOG) {
    assert.match(icon.path, /^[MmLlHhVvCcSsQqTtAaZz0-9., -]+$/);
    const source = { label: 'Menu', url: '/', icon: icon.id, active_icon: 'star' };
    assert.deepEqual(model.validateItems([source], context), [source]);
  }
});

test('normal and active PNGs round-trip unchanged and do not mutate the draft', () => {
  const value = dataUrl(png());
  const source = [{ label: ' Custom ', url: ' /news ', icon: value, active_icon: 'heart' }];
  const snapshot = JSON.stringify(source);
  assert.deepEqual(model.validateItems(source, context), [{ label: 'Custom', url: '/news', icon: value, active_icon: 'heart' }]);
  assert.equal(JSON.stringify(source), snapshot);
  assert.deepEqual(model.validateItems([{ label: 'Plain', url: '/', icon: '', active_icon: ' ' }], context), [{ label: 'Plain', url: '/' }]);
  assert.deepEqual(model.validateItems([{ label: 'Active only', url: '/', active_icon: value }], context), [{ label: 'Active only', url: '/', active_icon: value }]);
});

test('reject untrusted icon sources and malformed raw JSON values with the row index', () => {
  for (const value of [null, false, 1, {}, [], 'unknown', 'HOME', 'asset:quantum_nav_icons/abc.png',
    'https://example.test/icon.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>',
    'data:image/png;base64,!', 'data:image/png;base64,a===']) {
    assert.throws(() => model.validateItems([
      { label: 'Valid', url: '/' }, { label: 'Invalid', url: '/news', active_icon: value },
    ], context), error => error.itemIndex === 1, String(value));
  }
});

test('PNG size and dimensions are bounded, including both exact accepted limits', () => {
  const maximumDimensions = dataUrl(png(256, 256));
  assert.equal(icons.validate(maximumDimensions), maximumDimensions);
  assert.throws(() => icons.validate(dataUrl(png(257, 1))));
  assert.throws(() => icons.validate(dataUrl(png(1, 257))));
  assert.throws(() => icons.validate(dataUrl(png(0, 1))));
  const minimum = png();
  const padded = png(2, 2, chunk('quAN', Buffer.alloc(65536 - minimum.length - 12)));
  assert.equal(padded.length, 65536);
  assert.equal(icons.validate(dataUrl(padded)), dataUrl(padded));
  assert.throws(() => icons.validate(dataUrl(Buffer.concat([padded, Buffer.from([0])]))));
});

test('CRC corruption, truncation, trailing data, absent image data and noncanonical base64 are rejected', () => {
  const original = png();
  const corrupt = Buffer.from(original);
  corrupt[20] ^= 1;
  for (const invalid of [corrupt, original.subarray(0, -1), original.subarray(0, 33),
    Buffer.concat([original, Buffer.from([0])]),
    Buffer.concat([original.subarray(0, 33), chunk('IEND', Buffer.alloc(0))])]) {
    assert.throws(() => icons.validate(dataUrl(invalid)));
  }
  assert.throws(() => icons.validate(dataUrl(original).replace(/=$/, '')));
  assert.throws(() => icons.validate(dataUrl(original).replace('base64,', 'base64,\n')));
  assert.throws(() => icons.validate(dataUrl(png(2, 2, chunk('acTL', Buffer.alloc(8))))));
  assert.throws(() => icons.validate(dataUrl(png(2, 2, chunk('BADX', Buffer.alloc(1))))));
});
