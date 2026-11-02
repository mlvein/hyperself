// Hyperself service worker: offline-first app shell.
// Bump CACHE_VERSION on every release that must evict old shells.
const CACHE_VERSION = 'hyperself-v6';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/assets/hyperself/artwork/hyperself-wordmark.svg',
  '/assets/hyperself/icons/shield-check.svg',
  '/assets/hyperself/icons/link.svg',
  '/assets/hyperself/icons/file-text.svg',
  '/assets/hyperself/icons/audio-lines.svg',
  '/assets/hyperself/icons/folder-sync.svg',
  '/assets/hyperself/icons/image-up.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // model CDNs etc: network, never cached here

  // Navigations: cache-first so airplane mode boots the exact installed shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((hit) => hit ?? fetch(request)),
    );
    return;
  }
  // Same-origin assets: stale-while-revalidate (hashed build assets are immutable in practice).
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res.ok) void cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? network;
    }),
  );
});
