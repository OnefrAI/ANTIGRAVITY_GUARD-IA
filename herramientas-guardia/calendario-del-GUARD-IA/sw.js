// ========================================
// Service Worker - Calendario GUARD-IA
// AUTO-UPDATE SYSTEM v2.0
// ========================================

// ⚡ CAMBIA ESTE NÚMERO PARA FORZAR UNA ACTUALIZACIÓN EN TODOS LOS USUARIOS
const APP_VERSION = '2.0.0';
const CACHE_NAME = `calendario-guardia-v${APP_VERSION}`;

const CACHE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    // CDN resources (will be cached on first load)
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install event - cache assets and activate immediately
self.addEventListener('install', event => {
    console.log(`[SW Calendario] 🚀 Installing v${APP_VERSION}...`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW Calendario] Caching app shell');
                return cache.addAll(CACHE_ASSETS);
            })
            .then(() => {
                console.log('[SW Calendario] ⚡ Skipping waiting - activating immediately');
                return self.skipWaiting(); // Activate immediately, don't wait
            })
            .catch(err => console.error('[SW Calendario] Cache failed:', err))
    );
});

// Activate event - clean old caches and take control of all clients
self.addEventListener('activate', event => {
    console.log(`[SW Calendario] ✅ Activating v${APP_VERSION}...`);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name.startsWith('calendario-guardia-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW Calendario] 🗑️ Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('[SW Calendario] 📢 Taking control of all clients');
            return self.clients.claim(); // Take control immediately
        }).then(() => {
            // Notify all clients that an update was applied
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SW_UPDATED',
                        version: APP_VERSION
                    });
                });
            });
        })
    );
});

// Fetch event - Network First for app files, Cache First for CDN
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Skip Firebase/external API requests (let them go through normally)
    if (url.hostname.includes('firebase') ||
        url.hostname.includes('gstatic')) {
        return;
    }

    // For local app files: ALWAYS try network first
    if (url.origin === location.origin) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Clone and cache successful responses
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails (offline)
                    return caches.match(event.request).then(cachedResponse => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                        return new Response('Offline', { status: 503 });
                    });
                })
        );
        return;
    }

    // For CDN resources: Cache first, then network
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                // Return cache but also update in background
                fetch(event.request).then(response => {
                    if (response.status === 200) {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, response);
                        });
                    }
                }).catch(() => { });
                return cachedResponse;
            }
            // Not in cache, fetch from network
            return fetch(event.request).then(response => {
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            });
        })
    );
});

// Listen for skip waiting message from the app
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW Calendario] 📨 Received SKIP_WAITING message');
        self.skipWaiting();
    }

    // Respond with current version if asked
    if (event.data && event.data.type === 'GET_VERSION') {
        event.source.postMessage({
            type: 'VERSION_INFO',
            version: APP_VERSION
        });
    }
});
