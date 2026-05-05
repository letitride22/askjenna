// AskJenna Service Worker v4
const CACHE_NAME = 'askjenna-v4';

// Only cache static assets, never HTML pages
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Never cache these
const NEVER_CACHE = [
  '/trip.html',
  '/dashboard.html',
  '/auth.html',
  '/join.html',
  '/index.html',
  '/'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  
  // Never cache HTML pages — always fetch fresh
  if (NEVER_CACHE.some(path => url.pathname === path || url.pathname.startsWith(path + '?'))) {
    e.respondWith(fetch(e.request));
    return;
  }
  
  // Network first for everything else
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
