// Service Worker for Teton County GIS
const CACHE_NAME = 'teton-county-gis-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - try network first, fall back to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip service worker caching for localhost tile servers (development)
  // Pass through directly without caching to avoid CORS/service worker issues
  if (url.hostname === 'localhost' && (url.port === '8003' || url.port === '8004')) {
    event.respondWith(
      fetch(event.request, {
        mode: 'cors',
        credentials: 'omit'
      }).catch(err => {
        // If CORS fails, try without CORS (some servers don't need it for same-origin-like requests)
        return fetch(event.request, { mode: 'no-cors' });
      })
    );
    return;
  }
  
  // Skip service worker for other localhost development servers
  if (url.hostname === 'localhost' && (url.port === '8080' || url.port === '9000')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (response.status === 200) {
          // Clone the response because browser consumes it once
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});



