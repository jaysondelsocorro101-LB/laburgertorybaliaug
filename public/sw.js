/* LaBurgertory Service Worker — PWA offline support */
const CACHE_NAME = 'lb-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/kitchen.html',
  '/inventory.html',
  '/users.html',
  '/css/app.css',
  '/js/utils.js',
  '/js/idb-queue.js',
  '/js/app.js',
  '/js/kitchen.js',
  '/js/inventory.js',
  '/js/users.js',
  '/manifest.json',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls: network-first, fall through to offline error
// - Static assets: cache-first
// - /api/menu: cache with background refresh (stale-while-revalidate)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // Menu API — stale while revalidate
  if (url.pathname === '/api/menu') {
    event.respondWith(staleWhileRevalidate(event.request, 'lb-menu-v1'));
    return;
  }

  // GCash settings — cache
  if (url.pathname === '/api/settings/gcash') {
    event.respondWith(staleWhileRevalidate(event.request, 'lb-settings-v1'));
    return;
  }

  // Other API calls — network only (don't cache order submissions etc.)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(JSON.stringify({ error: 'Offline — request queued' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503,
      })
    ));
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || networkFetch;
}

// Background sync (fires when back online, if browser supports it)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({ type: 'SYNC_QUEUE' }));
    }));
  }
});
