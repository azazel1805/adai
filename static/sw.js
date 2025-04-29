// static/sw.js

const CACHE_NAME = 'adai-cache-v1'; // Change version number to update cache later
const urlsToCache = [
  '/', // Cache the main HTML shell
  '/signin', // Cache the signin HTML shell
  '/static/css/style.css', // Cache main CSS
  '/static/js/script.js', // Cache main JS
  '/static/js/firebase-config.js', // Cache Firebase config
  // Add paths to your icons referenced in the manifest
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  // Add other essential static assets (maybe fonts, logo if separate file)
  // Note: Firebase SDKs loaded from gstatic.com won't be cached by this.
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css', // Example external asset (might fail if offline initially)
  // Be cautious caching external resources without CORS headers
];

// --- Install Service Worker & Cache Assets ---
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install');
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache).catch(error => {
            console.error('[ServiceWorker] Failed to cache one or more resources during install:', error);
            // Decide if the install should fail completely or proceed partially
            // throw error; // Uncomment to make install fail if any asset fails
        });
      })
      .then(() => self.skipWaiting()) // Activate immediately after install
  );
});

// --- Activate Service Worker & Clean Up Old Caches ---
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');
  const cacheWhitelist = [CACHE_NAME]; // Only keep the current cache
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of uncontrolled clients
  );
});

// --- Fetch Interceptor ---
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // --- Strategy: Network first for API calls ---
  if (requestUrl.pathname.startsWith('/api/')) {
    // console.log('[ServiceWorker] Fetching API (Network first):', event.request.url);
    event.respondWith(
      fetch(event.request).catch(error => {
        console.error('[ServiceWorker] Network fetch failed for API:', event.request.url, error);
        // Optional: Return a generic JSON error for offline API calls
        return new Response(JSON.stringify({ error: 'Offline: Cannot reach API' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503, // Service Unavailable
          statusText: 'Service Unavailable (Offline)'
        });
      })
    );
    return; // Don't process further
  }

   // --- Strategy: Network first for main HTML pages ---
   // This ensures users get the latest HTML, but might fail offline
   // If offline capability is critical, cache these in 'install' and use cache-first.
   if (event.request.mode === 'navigate' || requestUrl.pathname === '/' || requestUrl.pathname === '/signin' || requestUrl.pathname === '/privacy') {
      // console.log('[ServiceWorker] Fetching Navigation/HTML (Network first):', event.request.url);
      event.respondWith(
          fetch(event.request).catch(error => {
               console.log('[ServiceWorker] Network fetch failed for HTML, trying cache:', event.request.url);
               return caches.match(event.request).then(response => {
                    return response || caches.match('/'); // Fallback to cached root '/' if specific page not cached
               });
          })
      );
      return;
   }

  // --- Strategy: Cache first for other static assets (CSS, JS, Images) ---
  // console.log('[ServiceWorker] Fetching Static Asset (Cache first):', event.request.url);
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          // console.log('[ServiceWorker] Cache hit:', event.request.url);
          return response;
        }

        // Not in cache - fetch from network
        // console.log('[ServiceWorker] Cache miss, fetching from network:', event.request.url);
        return fetch(event.request).then(
          networkResponse => {
            // Check if we received a valid response
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                 // Don't cache errors or non-basic responses (like external resources without CORS)
                 // console.log('[ServiceWorker] Not caching invalid response:', event.request.url, networkResponse.status);
                 return networkResponse;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // console.log('[ServiceWorker] Caching new resource:', event.request.url);
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
            console.error('[ServiceWorker] Network fetch failed for static asset:', event.request.url, error);
            // Optional: You could return an offline placeholder image/resource here
        });
      })
  );
});
