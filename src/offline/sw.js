// Offline cache for the built game (registered in main.ts, production builds only).
// The build fills in the cache version and the file list below (see scripts/offline-cache.mjs).
//  - Installing keeps a copy of every file the game needs, so after one visit it plays offline.
//  - The page itself is fetched fresh when online (so updates arrive), from the copy when not.
//  - Everything else comes from the copy straight away, refreshed in the background.
//  - The Google Fonts are kept too, once they have been loaded.
const CACHE = 'mochi-pon-__VERSION__';
const FILES = __FILES__;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mochi-pon-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  if (!own && !FONT_HOSTS.includes(url.hostname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((cache) => cache.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true })),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // ignoreVary: servers often send "Vary: Origin", and the page's own script and style
      // requests carry an Origin header the stored copies were fetched without.
      const cached = await cache.match(req, { ignoreSearch: own, ignoreVary: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') void cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      return fresh;
    }),
  );
});
