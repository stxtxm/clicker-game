/**
 * Bud Clicker — npoint.io cloud save.
 *
 * Online persistence: no account, no token, permanent. A JSON document is
 * created on the first save (POST) and identified by its id stored in
 * localStorage. Subsequent saves overwrite it (POST to same id).
 *
 * API (CORS enabled):
 *   POST https://api.npoint.io/api              → create  {id, url}
 *   GET  https://api.npoint.io/api/:id           → read    {state, savedAt}
 *   POST https://api.npoint.io/api/:id           → update
 *
 * Browser: `window.BudCloud`   Node: `module.exports`
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BudCloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BASE = 'https://api.npoint.io/api';
  const STORAGE_KEY = 'budCloudNpointId';

  function getId() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  }
  function setId(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  function wrap(state) {
    return { savedAt: Date.now(), state };
  }

  /** Extract id from npoint url or raw id. */
  function extractId(v) {
    if (!v) return '';
    const m = String(v).match(/\/api\/([a-z0-9-]+)/i);
    return m ? m[1] : String(v);
  }

  function hasBlob() {
    return !!getId();
  }

  function id() {
    return getId();
  }

  function create(state, fetchImpl) {
    const f = fetchImpl || fetch;
    return f(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrap(state))
    }).then((r) => {
      const p = typeof r.text === 'function'
        ? r.text().then((t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } })
        : r.json().catch(() => null);
      return p.then((data) => ({ ok: r.ok, status: r.status, data }));
    }).then(({ ok, status, data }) => {
        if (!ok) return { ok: false, status, reason: 'http' };
        const nid = extractId((data && (data.id || data.url)) || '');
        if (!nid) return { ok: false, reason: 'http' };
        setId(nid);
        return { ok: true, id: nid };
      }).catch(() => ({ ok: false, reason: 'http' }));
  }

  function update(state, fetchImpl) {
    const nid = getId();
    if (!nid) return Promise.resolve({ ok: false, reason: 'none' });
    const f = fetchImpl || fetch;
    return f(BASE + '/' + encodeURIComponent(nid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrap(state))
    }).then((r) => r.ok ? { ok: true } : { ok: false, status: r.status, reason: r.status === 404 ? 'gone' : 'http' });
  }

  function pull(fetchImpl) {
    const nid = getId();
    if (!nid) return Promise.resolve({ ok: false, reason: 'none' });
    const f = fetchImpl || fetch;
    return f(BASE + '/' + encodeURIComponent(nid))
      .then((r) => {
        // Support both real fetch (text/json) and test mocks (json only)
        const p = typeof r.text === 'function'
          ? r.text().then((t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } })
          : r.json().catch(() => null);
        return p.then((data) => ({ ok: r.ok, status: r.status, data }));
      })
      .then(({ ok, status, data }) => {
        if (!ok) return { ok: false, reason: status === 404 ? 'gone' : 'http' };
        if (!data) return { ok: false, reason: 'empty' };
        if (typeof data === 'object' && data.state) {
          return { ok: true, savedAt: data.savedAt || 0, state: data.state };
        }
        // Legacy bare payload
        return { ok: true, savedAt: 0, state: data };
      }).catch(() => ({ ok: false, reason: 'http' }));
  }

  // Compatibility shims (ui.js legacy names)
  function getBlobUrl() { return getId(); }
  function blobId(v) { return extractId(v); }

  return { BASE, STORAGE_KEY, create, update, pull, wrap, hasBlob, id, getId, extractId, getBlobUrl, blobId };
});
