/**
 * Tests for the npoint.io cloud save module (js/cloud.js).
 */
'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const Cloud = require('../js/cloud.js');

function makeLS() {
  const s = {};
  return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; }, _s: s };
}
let orig;
beforeEach(() => { orig = global.localStorage; global.localStorage = makeLS(); });
afterEach(() => { global.localStorage = orig; });

function mockFetch(results) {
  const calls = [];
  const fn = (url, opts) => {
    calls.push({ url, opts });
    const r = results.shift();
    return Promise.resolve({ ok: r.ok, status: r.status || 200, json: () => Promise.resolve(r.body !== undefined ? r.body : {}) });
  };
  return { fn, calls };
}

test('extractId pulls id from url', () => {
  assert.strictEqual(Cloud.extractId('https://api.npoint.io/api/abcd-1234'), 'abcd-1234');
  assert.strictEqual(Cloud.extractId('abcd-1234'), 'abcd-1234');
  assert.strictEqual(Cloud.extractId(''), '');
});

test('create: POST to BASE stores id', async () => {
  const m = mockFetch([{ ok: true, body: { id: 'new-1' } }]);
  const res = await Cloud.create({ xp: 0 }, m.fn);
  assert.deepStrictEqual(res, { ok: true, id: 'new-1' });
  assert.strictEqual(m.calls[0].url, Cloud.BASE);
  assert.strictEqual(m.calls[0].opts.method, 'POST');
  assert.strictEqual(global.localStorage.getItem(Cloud.STORAGE_KEY), 'new-1');
  assert.strictEqual(Cloud.hasBlob(), true);
});

test('create: http error', async () => {
  const m = mockFetch([{ ok: false, status: 500, body: {} }]);
  const res = await Cloud.create({ xp: 0 }, m.fn);
  assert.deepStrictEqual(res, { ok: false, status: 500, reason: 'http' });
});

test('update: POST to BASE/:id with wrapped state', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'exist-1');
  const m = mockFetch([{ ok: true, body: {} }]);
  const res = await Cloud.update({ xp: 5 }, m.fn);
  assert.deepStrictEqual(res, { ok: true });
  assert.strictEqual(m.calls[0].url, Cloud.BASE + '/exist-1');
  assert.strictEqual(m.calls[0].opts.method, 'POST');
  assert.deepStrictEqual(JSON.parse(m.calls[0].opts.body).state, { xp: 5 });
});

test('update: no id returns none', async () => {
  const m = mockFetch([]);
  const res = await Cloud.update({ xp: 1 }, m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'none' });
});

test('update: 404 gone', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'gone');
  const m = mockFetch([{ ok: false, status: 404, body: {} }]);
  const res = await Cloud.update({ xp: 1 }, m.fn);
  assert.deepStrictEqual(res, { ok: false, status: 404, reason: 'gone' });
});

test('pull: returns wrapped state', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'p1');
  const payload = { savedAt: 1700000000000, state: { xp: 42 } };
  const m = mockFetch([{ ok: true, body: payload }]);
  const res = await Cloud.pull(m.fn);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.savedAt, 1700000000000);
  assert.deepStrictEqual(res.state, { xp: 42 });
});

test('pull: legacy bare', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'p2');
  const m = mockFetch([{ ok: true, body: { xp: 7 } }]);
  const res = await Cloud.pull(m.fn);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.savedAt, 0);
  assert.deepStrictEqual(res.state, { xp: 7 });
});

test('pull: no id none', async () => {
  const m = mockFetch([]);
  const res = await Cloud.pull(m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'none' });
});

test('pull: 404 gone', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'missing');
  const m = mockFetch([{ ok: false, status: 404, body: {} }]);
  const res = await Cloud.pull(m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'gone' });
});
