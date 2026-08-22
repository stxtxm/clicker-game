/**
 * Tests for the jsonblob.com cloud save module (js/cloud.js).
 */
'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const Cloud = require('../js/cloud.js');

function makeLocalStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store: store
  };
}

let origLS;
beforeEach(() => { origLS = global.localStorage; global.localStorage = makeLocalStorage(); });
afterEach(() => { global.localStorage = origLS; });

function mockFetch(results) {
  const calls = [];
  const fn = (url, opts) => {
    calls.push({ url, opts });
    const r = results.shift();
    return Promise.resolve({
      ok: r.ok,
      status: r.status || 200,
      headers: { get: (k) => (r.headers && r.headers[k]) || (r.headers && r.headers[k.toLowerCase()]) || null },
      json: () => Promise.resolve(r.body !== undefined ? r.body : {})
    });
  };
  return { fn, calls };
}

test('blobId extracts id from url', () => {
  assert.strictEqual(Cloud.blobId('https://jsonblob.com/api/jsonBlob/abc-123'), 'abc-123');
  assert.strictEqual(Cloud.blobId(''), '');
  assert.strictEqual(Cloud.blobId(null), '');
});

test('wrap creates timestamped payload', () => {
  const w = Cloud.wrap({ xp: 99 }, 123);
  // wrap uses Date.now() when no explicit time; we can't test exact, just shape
  // So test with explicit via internal: we call create with state and mock, intercept body
  assert.ok(typeof w === 'object');
  assert.ok('savedAt' in w);
  assert.deepStrictEqual(w.state, { xp: 99 });
});

test('create: POST to BASE, stores Location and returns url', async () => {
  const blobUrl = 'https://jsonblob.com/api/jsonBlob/new-id-1';
  const m = mockFetch([{ ok: true, headers: { Location: blobUrl }, body: {} }]);
  const res = await Cloud.create({ xp: 0 }, m.fn);
  assert.deepStrictEqual(res, { ok: true, url: blobUrl });
  assert.strictEqual(m.calls.length, 1);
  assert.strictEqual(m.calls[0].url, Cloud.BASE);
  assert.strictEqual(m.calls[0].opts.method, 'POST');
  assert.strictEqual(global.localStorage.getItem(Cloud.STORAGE_KEY), blobUrl);
  assert.strictEqual(Cloud.hasBlob(), true);
  assert.strictEqual(Cloud.id(), 'new-id-1');
});

test('create: http error returns reason http', async () => {
  const m = mockFetch([{ ok: false, status: 500, headers: {}, body: {} }]);
  const res = await Cloud.create({ xp: 0 }, m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'http' });
  assert.strictEqual(Cloud.hasBlob(), false);
});

test('update: PUT to stored url with wrapped state', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'https://jsonblob.com/api/jsonBlob/exist-1');
  const m = mockFetch([{ ok: true, headers: {}, body: {} }]);
  const res = await Cloud.update({ xp: 5 }, m.fn);
  assert.deepStrictEqual(res, { ok: true });
  assert.strictEqual(m.calls[0].url, 'https://jsonblob.com/api/jsonBlob/exist-1');
  assert.strictEqual(m.calls[0].opts.method, 'PUT');
  const body = JSON.parse(m.calls[0].opts.body);
  assert.deepStrictEqual(body.state, { xp: 5 });
});

test('update: no blob returns reason none', async () => {
  const m = mockFetch([]);
  const res = await Cloud.update({ xp: 1 }, m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'none' });
  assert.strictEqual(m.calls.length, 0);
});

test('update: 404 returns reason gone', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'https://jsonblob.com/api/jsonBlob/gone');
  const m = mockFetch([{ ok: false, status: 404, headers: {}, body: {} }]);
  const res = await Cloud.update({ xp: 1 }, m.fn);
  assert.deepStrictEqual(res, { ok: false, status: 404, reason: 'gone' });
});

test('pull: returns parsed wrapped state', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'https://jsonblob.com/api/jsonBlob/p1');
  const payload = { savedAt: 1700000000000, state: { xp: 42, money: 100 } };
  const m = mockFetch([{ ok: true, body: payload }]);
  const res = await Cloud.pull(m.fn);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.savedAt, 1700000000000);
  assert.deepStrictEqual(res.state, { xp: 42, money: 100 });
});

test('pull: legacy bare state is unpacked', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'https://jsonblob.com/api/jsonBlob/p2');
  const m = mockFetch([{ ok: true, body: { xp: 7 } }]);
  const res = await Cloud.pull(m.fn);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.savedAt, 0);
  assert.deepStrictEqual(res.state, { xp: 7 });
});

test('pull: no blob returns reason none', async () => {
  const m = mockFetch([]);
  const res = await Cloud.pull(m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'none' });
});

test('pull: 404 returns reason gone', async () => {
  global.localStorage.setItem(Cloud.STORAGE_KEY, 'https://jsonblob.com/api/jsonBlob/missing');
  const m = mockFetch([{ ok: false, status: 404, body: {} }]);
  const res = await Cloud.pull(m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'gone' });
});
