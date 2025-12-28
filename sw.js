// sw.js - Service Worker (scope raíz) ✅
// ============================================
// 🚀 SISTEMA DE ACTUALIZACIÓN AUTOMÁTICA v5
// ============================================

// 🆙 VERSIÓN - Incrementa este número cada vez que hagas cambios
const CACHE_VERSION = 'v6';
const CACHE_NAME = `guardia-cache-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `guardia-dynamic-${CACHE_VERSION}`;

// 🎯 Patrones de archivos que SIEMPRE deben buscar actualizaciones (Network-First)
const NETWORK_FIRST_PATTERNS = [
  /\.html$/,
  /\.css$/,
  /\.js$/,
  /manifest\.json$/,
  /\/$/  // Rutas raíz como "/" o "/herramientas-guardia/"
];

// 📦 Archivos a precachear (RUTAS EN RAÍZ)
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/landing.html',

  // --- Herramientas ---
  '/herramientas-guardia/bloc-de-notas/index.html',
  '/herramientas-guardia/bloc-de-notas/styles.css',
  '/herramientas-guardia/bloc-de-notas/script.js',

  // --- Crypto E2E ---
  '/herramientas-guardia/shared/crypto-utils.js',
  '/herramientas-guardia/shared/webauthn-utils.js',

  '/herramientas-guardia/calculadora-de-drogas/index.html',

  '/herramientas-guardia/calendario-del-GUARD-IA/index.html',
  '/herramientas-guardia/calendario-del-GUARD-IA/style.css',
  '/herramientas-guardia/calendario-del-GUARD-IA/script.js',

  '/herramientas-guardia/verificador-email-IA/index.html',

  '/herramientas-guardia/marca-de-agua/index.html',
  '/herramientas-guardia/marca-de-agua/styles.css',
  '/herramientas-guardia/marca-de-agua/script.js',

  // --- Imágenes de la Calculadora ---
  '/herramientas-guardia/calculadora-de-drogas/images/clonazepam.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/cocaina.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/cristal_mdma.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/dimetiltriptamina.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/fentanilo.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/ghb.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/hachis.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/heroina.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/hoja%20de%20coca.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/ketamina.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/lsd.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/marihuana.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/mdma.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/mefedrona.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/metadona.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/metanfetamina.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/morfina.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/oxido_nitroso.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/poppers.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/speed.jpg',
  '/herramientas-guardia/calculadora-de-drogas/images/tuci.jpg',

  // --- Dependencias externas ---
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn.quilljs.com/1.3.6/quill.snow.css',
  'https://cdn.quilljs.com/1.3.6/quill.js',
  'https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'
];

// ============================================
// 💾 INSTALL: Precachear y activar inmediatamente
// ============================================
self.addEventListener('install', (event) => {
  console.log(`[SW] 🚀 Instalando ${CACHE_VERSION}…`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => {
        console.log(`[SW] ✅ Caché ${CACHE_VERSION} creada`);
        // ⚡ skipWaiting fuerza la activación inmediata del nuevo SW
        return self.skipWaiting();
      })
      .catch((err) => console.error('[SW] ❌ Error en instalación:', err))
  );
});

// ============================================
// 🧹 ACTIVATE: Limpiar cachés antiguas y tomar control
// ============================================
self.addEventListener('activate', (event) => {
  console.log(`[SW] ⚡ Activando ${CACHE_VERSION}…`);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== DYNAMIC_CACHE_NAME)
          .map((k) => {
            console.log('[SW] 🗑️ Borrando caché antigua:', k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      console.log(`[SW] ✅ ${CACHE_VERSION} activo y controlando`);
      // ⚡ clients.claim() toma control de todas las páginas inmediatamente
      self.clients.claim();
      // Notificar a las páginas que hay una nueva versión activa
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      });
      checkPendingNotifications();
    })
  );
});

// ============================================
// 🚦 FETCH: Estrategia híbrida Network-First / Cache-First
// ============================================
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 🔥 Excluir Firebase - siempre va directo a red
  const firebaseHosts = ['firestore.googleapis.com', 'firebaseapp.com', 'gstatic.com/firebasejs'];
  if (firebaseHosts.some((h) => req.url.includes(h))) {
    return;
  }

  // Solo procesar GET requests
  if (req.method !== 'GET') return;

  // 🎯 Determinar estrategia según el tipo de archivo
  const isNetworkFirst = NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname));

  if (isNetworkFirst) {
    // 🌐 NETWORK-FIRST: Intentar red primero, caché como fallback
    event.respondWith(networkFirstStrategy(req));
  } else {
    // 💾 CACHE-FIRST: Caché primero, red como fallback (para imágenes, fuentes, etc.)
    event.respondWith(cacheFirstStrategy(req));
  }
});

// ============================================
// 🌐 ESTRATEGIA NETWORK-FIRST
// ============================================
async function networkFirstStrategy(request) {
  try {
    // Intentar obtener de la red con timeout
    const networkResponse = await fetchWithTimeout(request, 5000);

    // Si la respuesta es válida, guardar en caché y devolver
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }

    // Si la red falla, intentar caché
    throw new Error('Network response not ok');
  } catch (error) {
    console.log('[SW] 📴 Red no disponible, usando caché para:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Si tampoco hay caché, devolver error o página offline
    return new Response('Offline - No hay versión en caché disponible', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// ============================================
// 💾 ESTRATEGIA CACHE-FIRST
// ============================================
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] ❌ Error fetching:', request.url);
    return new Response('', { status: 404 });
  }
}

// ============================================
// ⏱️ FETCH CON TIMEOUT
// ============================================
function fetchWithTimeout(request, timeout = 5000) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

// ============================================
// 📩 MENSAJES DESDE LA APP
// ============================================
self.addEventListener('message', (event) => {
  if (event.data) {
    switch (event.data.type) {
      case 'CHECK_NOTIFICATIONS':
        checkPendingNotifications();
        break;
      case 'SKIP_WAITING':
        // Permite que la app fuerce la activación del nuevo SW
        self.skipWaiting();
        break;
      case 'GET_VERSION':
        // Devolver la versión actual del SW
        event.source.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
        break;
    }
  }
});

// ============================================
// 🔔 SISTEMA DE NOTIFICACIONES PROGRAMADAS
// ============================================

// Revisar notificaciones pendientes cada minuto
setInterval(() => {
  checkPendingNotifications();
}, 60000); // 60 segundos

function checkPendingNotifications() {
  // Obtener notificaciones programadas desde IndexedDB
  getScheduledNotifications().then((notifications) => {
    const now = Date.now();

    notifications.forEach((notif) => {
      // Si llegó el momento de la notificación
      if (notif.triggerTime <= now && !notif.sent) {
        // Mostrar notificación
        self.registration.showNotification('📅 GUARD-IA Recordatorio', {
          body: notif.title + (notif.description ? '\n' + notif.description : ''),
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: notif.id,
          requireInteraction: true,
          vibrate: [200, 100, 200],
          data: {
            dateStr: notif.dateStr,
            url: notif.url || '/herramientas-guardia/calendario-del-GUARD-IA/'
          }
        });

        // Marcar como enviada
        markNotificationAsSent(notif.id);
      }
    });
  });
}

// Manejar click en la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si hay una ventana abierta, enfocarla
      for (let client of clientList) {
        if (client.url.includes('calendario-del-GUARD-IA') && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrir nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});

// ============================================
// FUNCIONES DE INDEXEDDB PARA NOTIFICACIONES
// ============================================

function getScheduledNotifications() {
  return new Promise((resolve) => {
    const request = indexedDB.open('GuardiaNotifications', 1);

    request.onerror = () => resolve([]);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('notifications')) {
        db.createObjectStore('notifications', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('notifications')) {
        resolve([]);
        return;
      }

      const transaction = db.transaction(['notifications'], 'readonly');
      const store = transaction.objectStore('notifications');
      const getAll = store.getAll();

      getAll.onsuccess = () => resolve(getAll.result || []);
      getAll.onerror = () => resolve([]);
    };
  });
}

function markNotificationAsSent(id) {
  const request = indexedDB.open('GuardiaNotifications', 1);

  request.onsuccess = (event) => {
    const db = event.target.result;

    if (!db.objectStoreNames.contains('notifications')) return;

    const transaction = db.transaction(['notifications'], 'readwrite');
    const store = transaction.objectStore('notifications');
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const notif = getRequest.result;
      if (notif) {
        notif.sent = true;
        store.put(notif);
      }
    };
  };
}

// Escuchar mensajes desde la app principal
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_NOTIFICATIONS') {
    checkPendingNotifications();
  }
});