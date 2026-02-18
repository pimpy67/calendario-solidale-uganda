const CACHE_NAME = 'calendario-solidale-v17';
const OFFLINE_URL = '/offline.html';

const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html',
  '/css/style.css',
  '/js/calendar.js',
  '/js/payment.js',
  '/js/app.js',
  '/images/logo.png',
  '/images/logo-192.png',
  '/images/logo-512.png',
  '/manifest.json'
];

// Install event - cache resources including offline page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches and take control
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
  self.clients.claim();
});

// Fetch event - with offline fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // API calls - network first, fallback to cache
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  } else if (event.request.mode === 'navigate') {
    // Navigation requests - network first, offline page fallback
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then((cached) => cached || caches.match(OFFLINE_URL));
        })
    );
  } else {
    // Static assets - cache first, fallback to network
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        }).catch(() => {
          // Return offline page for HTML requests
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match(OFFLINE_URL);
          }
        });
      })
    );
  }
});

// Background sync - retry failed requests when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-donations') {
    event.waitUntil(syncDonations());
  }
});

async function syncDonations() {
  // Placeholder for future background sync of failed donation requests
  return Promise.resolve();
}

// Periodic background sync - keep data fresh
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-calendar') {
    event.waitUntil(updateCalendarData());
  }
});

async function updateCalendarData() {
  try {
    const response = await fetch('/api/donations');
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/api/donations', response);
    }
  } catch (e) {
    // Silently fail - will retry next time
  }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
