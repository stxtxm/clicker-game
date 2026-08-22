/**
 * Bud Clicker — GitHub Gist cloud save.
 *
 * Thin async wrapper around the Gist REST API. Pure logic: every function
 * takes a `fetch` implementation as its last argument (defaults to the
 * global one), which keeps it fully testable in Node.js without network.
 *
 * Browser: `window.BudCloud`   Node: `module.exports`
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BudCloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const API = 'https://api.github.com/gists';
  const FILE = 'bud-clicker-save.json';

  function headers(token) {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  /**
   * Create the secret save gist. Returns { ok, id?, reason? }.
   * @param {string} token GitHub personal access token (gist scope)
   * @param {string} content serialized game state
   */
  function createGist(token, content, fetchImpl) {
    const f = fetchImpl || fetch;
    return f(API, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        description: 'Bud Clicker cloud save',
        public: false,
        files: { [FILE]: { content } }
      })
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status, data }) => {
        if (!ok) {
          return { ok: false, status, reason: status === 401 ? 'token' : (status === 403 ? 'rate' : 'http') };
        }
        return { ok: true, id: data.id };
      });
  }

  /** Push new content to an existing gist. Returns { ok, reason? }. */
  function updateGist(token, gistId, content, fetchImpl) {
    const f = fetchImpl || fetch;
    return f(API + '/' + encodeURIComponent(gistId), {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify({ files: { [FILE]: { content } } })
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status }) =>
        ok ? { ok: true } : { ok: false, status, reason: status === 404 ? 'gist' : (status === 401 ? 'token' : (status === 403 ? 'rate' : 'http')) });
  }

  /**
   * Pull the saved payload from a gist.
   * @returns {{ok:true, savedAt?:number, state?:object}|{ok:false,reason:string}}
   */
  function fetchGist(token, gistId, fetchImpl) {
    const f = fetchImpl || fetch;
    return f(API + '/' + encodeURIComponent(gistId), { headers: headers(token) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status, data }) => {
        if (!ok) {
          return { ok: false, reason: status === 404 ? 'gist' : (status === 401 ? 'token' : (status === 403 ? 'rate' : 'http')) };
        }
        const file = data.files && data.files[FILE];
        if (!file) return { ok: false, reason: 'empty' };
        try {
          const payload = JSON.parse(file.content);
          // Payload is either { savedAt, state } or a bare legacy state object.
          if (payload && typeof payload === 'object' && payload.state) {
            return { ok: true, savedAt: payload.savedAt || 0, state: payload.state };
          }
          return { ok: true, savedAt: 0, state: payload };
        } catch (e) {
          return { ok: false, reason: 'corrupt' };
        }
      });
  }

  /** Wrap state with a timestamp for conflict-free "last write wins". */
  function pack(state, now) {
    return JSON.stringify({ savedAt: now || Date.now(), state });
  }

  /** @returns {{savedAt:number, state:object}} unpacked payload. */
  function unpack(raw) {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && p.state) return { savedAt: p.savedAt || 0, state: p.state };
    return { savedAt: 0, state: p };
  }

  return { API, FILE, createGist, updateGist, fetchGist, pack, unpack };
});
