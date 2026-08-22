/**
 * Tests for the GitHub Gist cloud save module (js/cloud.js).
 * Run with: `npm test`  (or `node --test test/`)
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const Cloud = require('../js/cloud.js');

/** Build a minimal fetch mock that records calls and returns preset responses. */
function mockFetch(results) {
  const calls = [];
  const fn = (url, opts) => {
    calls.push({ url, opts });
    const r = results.shift();
    return Promise.resolve({
      ok: r.ok,
      status: r.status || 200,
      json: () => Promise.resolve(r.body || {})
    });
  };
  return { fn, calls };
}

test('createGist: POST to /gists with secret false, returns id', async () => {
  const m = mockFetch([{ ok: true, body: { id: 'abc123' } }]);
  const res = await Cloud.createGist('tok_xxx', '{"xp":0}', m.fn);
  assert.deepStrictEqual(res, { ok: true, id: 'abc123' });
  assert.strictEqual(m.calls.length, 1);
  const { url, opts } = m.calls[0];
  assert.strictEqual(url, 'https://api.github.com/gists');
  assert.strictEqual(opts.method, 'POST');
  const body = JSON.parse(opts.body);
  assert.strictEqual(body.public, false);
  assert.strictEqual(body.files['bud-clicker-save.json'].content, '{"xp":0}');
  assert.ok(opts.headers['Authorization'].includes('tok_xxx'));
});

test('createGist: 401 returns reason token', async () => {
  const m = mockFetch([{ ok: false, status: 401, body: {} }]);
  const res = await Cloud.createGist('bad', '{}', m.fn);
  assert.deepStrictEqual(res, { ok: false, status: 401, reason: 'token' });
});

test('createGist: 403 returns reason rate', async () => {
  const m = mockFetch([{ ok: false, status: 403, body: {} }]);
  const res = await Cloud.createGist('tok', '{}', m.fn);
  assert.deepStrictEqual(res, { ok: false, status: 403, reason: 'rate' });
});

test('updateGist: PATCH to /gists/:id', async () => {
  const m = mockFetch([{ ok: true, body: {} }]);
  const res = await Cloud.updateGist('tok_xxx', 'g123', '{"x":1}', m.fn);
  assert.deepStrictEqual(res, { ok: true });
  const { url, opts } = m.calls[0];
  assert.strictEqual(url, 'https://api.github.com/gists/g123');
  assert.strictEqual(opts.method, 'PATCH');
  assert.ok(JSON.parse(opts.body).files['bud-clicker-save.json'].content.includes('"x":1'));
});

test('updateGist: 404 returns reason gist', async () => {
  const m = mockFetch([{ ok: false, status: 404, body: {} }]);
  const res = await Cloud.updateGist('tok', 'gone', '{}', m.fn);
  assert.deepStrictEqual(res, { ok: false, status: 404, reason: 'gist' });
});

test('fetchGist: returns parsed state from bud-clicker-save.json', async () => {
  const payload = Cloud.pack({ xp: 42, money: 100 }, 1700000000000);
  const m = mockFetch([{ ok: true, body: { files: { 'bud-clicker-save.json': { content: payload } } } }]);
  const res = await Cloud.fetchGist('tok', 'g99', m.fn);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.savedAt, 1700000000000);
  assert.deepStrictEqual(res.state, { xp: 42, money: 100 });
});

test('fetchGist: legacy bare state (no savedAt wrapper) is unpacked', async () => {
  const raw = JSON.stringify({ xp: 7 });
  const m = mockFetch([{ ok: true, body: { files: { 'bud-clicker-save.json': { content: raw } } } }]);
  const res = await Cloud.fetchGist('tok', 'g1', m.fn);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.savedAt, 0);
  assert.deepStrictEqual(res.state, { xp: 7 });
});

test('fetchGist: missing file returns reason empty', async () => {
  const m = mockFetch([{ ok: true, body: { files: {} } }]);
  const res = await Cloud.fetchGist('tok', 'g1', m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'empty' });
});

test('fetchGist: 401 returns reason token', async () => {
  const m = mockFetch([{ ok: false, status: 401, body: {} }]);
  const res = await Cloud.fetchGist('bad', 'g1', m.fn);
  assert.deepStrictEqual(res, { ok: false, reason: 'token' });
});

test('pack/unpack round-trips state and savedAt', () => {
  const state = { xp: 999, money: 42, genomes: 2 };
  const packed = Cloud.pack(state, 12345);
  const { savedAt, state: unpacked } = Cloud.unpack(packed);
  assert.strictEqual(savedAt, 12345);
  assert.deepStrictEqual(unpacked, state);
});
