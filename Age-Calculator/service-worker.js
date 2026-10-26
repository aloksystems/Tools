'use strict';

const CACHE_NAME = 'age-calculator-v2';
const APP_ROOT = '/Age-Calculator/';
const ASSETS = [
  APP_ROOT,
  `${APP_ROOT}index.html`,
  `${APP_ROOT}style.css`,
  `${APP_ROOT}script.js`,
  `${APP_ROOT}manifest.json`,
  `${APP_ROOT}favicon.svg`,
  `${APP_ROOT}icons/icon-48x48.png`,
  `${APP_ROOT}icons/icon-72x72.png`,
  `${APP_ROOT}icons/icon-96x96.png`,
  `${APP_ROOT}icons/icon-128x128.png`,
  `${APP_ROOT}icons/icon-144x144.png`,
  `${APP_ROOT}icons/icon-152x152.png`,
  `${APP_ROOT}icons/icon-192x192.png`,
  `${APP_ROOT}icons/icon-384x384.png`,
  `${APP_ROOT}icons/icon-512x512.png`,
  `${APP_ROOT}icons/icon-maskable-192x192.png`,
  `${APP_ROOT}icons/icon-maskable-512x512.png`,
  `${APP_ROOT}icons/apple-touch-icon.png`
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
    caches.keys()
      .then(names => Promise.all(names
        .filter(name => name.startsWith('age-calculator-') && name !== CACHE_NAME)
        .map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        if (request.mode === 'navigate') return caches.match(`${APP_ROOT}index.html`);
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
