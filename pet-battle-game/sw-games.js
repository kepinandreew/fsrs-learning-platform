/**
 * @file sw-games.js
 * @description Service Worker ringan berstrategi Network-First untuk mendukung instalasi
 * Progressive Web App (PWA) layar penuh dan ketahanan offline shell pada klien gim edukasi
 * (Pet Battle Stadium & Baking Chef Rush) tanpa mengintervensi endpoint REST API FSRS-5.
 */

const CACHE_NAME = 'fsrs-games-shell-v1';
const PRECACHE_ASSETS = [
  './icon-pet-battle.svg',
  './icon-baking-chef.svg',
  './manifest-pet-battle.json',
  './manifest-baking-chef.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        PRECACHE_ASSETS.map((assetUrl) =>
          fetch(assetUrl)
            .then((res) => (res.ok ? cache.put(assetUrl, res) : null))
            .catch(() => null),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Abaikan seluruh request lintas-origin dan endpoint REST API agar sinkronisasi FSRS selalu real-time
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return networkRes;
      })
      .catch(() => caches.match(req)),
  );
});
