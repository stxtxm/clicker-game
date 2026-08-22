/**
 * Bud Clicker — jsonblob.com cloud save.
 *
 * Zero-friction persistence: no account, no token. A JSON blob is created on
 * the first save and identified by its URL (stored in localStorage). The blob
 * stays alive as long as the player uses the game (30-day inactivity expiry).
 *
 * API:
 *   POST /api/jsonBlob       → create (returns Location header with URL)
 *   GET  /api/jsonBlob/:id   → read
 *   PUT  /api/jsonBlob/:id   → update
 *
 * Browser: `window.BudCloud`   Node: `module.exports`
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BudCloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BASE = 'https://jsonblob.com/api/jsonBlob';
  const STORAGE_KEY = 'budCloudBlobUrl';

  /** Extract the blob id from the full URL returned by jsonblob.com. */
  function blobId(url) {
    return url ? url.replace(/^.*\/jsonBlob\//, '') : '';
  }

  /** Persist / read the blob URL in localStorage. */
  function getBlobUrl() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  }
  function setBlobUrl(url) {
    try { localStorage.setItem(STORAGE_KEY, url); } catch {}
  }

  /**
   * Create a brand-new blob. Resolves { ok, url?, reason? }.
   */
  function create(state, fetchImpl) {
    const f = fetchImpl || fetch;
    return f(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrap(state))
    }).then((r) => {
      const url = r.headers.get('Location');
      if (r.ok && url) {
        setBlobUrl(url);
        return { ok: true, url };
      }
      return { ok: false, reason: 'http' };
    });
  }

  /**
   * Update an existing blob. Resolves { ok, reason? }.
   */
  function update(state, fetchImpl) {
    const url = getBlobUrl();
    if (!url) return Promise.resolve({ ok: false, reason: 'none' });
    const f = fetchImpl || fetch;
    return f(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrap(state))
    }).then((r) => r.ok ? { ok: true } : { ok: false, status: r.status, reason: r.status === 404 ? 'gone' : 'http' });
  }

  /**
   * Pull the saved payload. Resolves { ok, state?, savedAt?, reason? }.
   */
  function pull(fetchImpl) {
    const url = getBlobUrl();
    if (!url) return Promise.resolve({ ok: false, reason: 'none' });
    const f = fetchImpl || fetch;
    return f(url)
      .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status, data }) => {
        if (!ok) return { ok: false, reason: status === 404 ? 'gone' : 'http' };
        if (data && typeof data === 'object' && data.state) {
          return { ok: true, savedAt: data.savedAt || 0, state: data.state };
        }
        return { ok: true, savedAt: 0, state: data };
      });
  }

  /** Wrap state with a timestamp. */
  function wrap(state) {
    return { savedAt: Date.now(), state };
  }

  /** @returns {boolean} whether a blob has been created previously. */
  function hasBlob() {
    return !!getBlobUrl();
  }

  /** @returns {string} the blob id for display / copy. */
  function id() {
    return blobId(getBlobUrl());
  }

  return { BASE, STORAGE_KEY, create, update, pull, wrap, hasBlob, id, blobId, getBlobUrl };
});
