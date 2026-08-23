// Bud Clicker service worker.
//
// Strategy:
//   - App code (HTML/JS/manifest): NETWORK FIRST with cache fallback — after a
//     deploy players always get the fresh game on their next load; the cache
//     only serves offline.
//   - Icons/images: CACHE FIRST + background refresh — static, never changes
//     between versions without a filename change.
//
// Bump CACHE_VERSION on every asset-shape change to drop stale precaches.
const CACHE_VERSION = 'v2';
const CACHE_NAME = 'bud-clicker-' + CACHE_VERSION;

const PRECACHE = [
  './',
  './index.html',
  './js/game.js',
  './js/bud.js',
  './js/ui.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** @returns {boolean} true for same-origin app-code requests (freshness critical) */
function isAppCode(url) {
  return url.origin === self.location.origin &&
    (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') ||
     url.pathname.endsWith('.json') || url.pathname.endsWith('/'));
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isAppCode(url)) {
    // Network first: serve fresh code, fall back to cache when offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) =>
            cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined)
          )
        )
    );
    return;
  }

  // Static assets: cache first + background refresh.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const refresh = fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
