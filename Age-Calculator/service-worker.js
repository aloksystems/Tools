const CACHE_NAME = 'age-calculator-v1';
const ASSETS = [
  '/Age-Calculator/',
  '/Age-Calculator/index.html',
  '/Age-Calculator/style.css',
  '/Age-Calculator/script.js',
  '/Age-Calculator/manifest.json',
  '/Age-Calculator/favicon.svg',
  '/Age-Calculator/icons/icon-48x48.png',
  '/Age-Calculator/icons/icon-72x72.png',
  '/Age-Calculator/icons/icon-96x96.png',
  '/Age-Calculator/icons/icon-128x128.png',
  '/Age-Calculator/icons/icon-144x144.png',
  '/Age-Calculator/icons/icon-152x152.png',
  '/Age-Calculator/icons/icon-192x192.png',
  '/Age-Calculator/icons/icon-384x384.png',
  '/Age-Calculator/icons/icon-512x512.png',
  '/Age-Calculator/icons/icon-maskable-192x192.png',
  '/Age-Calculator/icons/icon-maskable-512x512.png',
  '/Age-Calculator/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, responseToCache));
            return response;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('/Age-Calculator/');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});
