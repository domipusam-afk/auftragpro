// AuftragsPro Service Worker v4 — network-first für alles
const CACHE_NAME = 'auftragspro-v4';

// Install: sofort aktivieren
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: alle alten Caches löschen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: ALLES network-first — kein aggressives Caching
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nur GET-Requests behandeln
  if (event.request.method !== 'GET') return;

  // API + Einstellungen: immer live
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Alles andere: Network first, Cache als Fallback (Offline)
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        // Nur 200 OK cachen, und nur same-origin
        if (response.ok && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, toCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline-Fallback
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
