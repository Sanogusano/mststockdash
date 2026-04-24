// Service Worker básico para Monastery PWA
// Network-first con fallback a caché para evitar contenido obsoleto.

const CACHE_NAME = 'monastery-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo manejar GET http(s); ignorar el resto (POST a Supabase, etc.)
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cachear copias de respuestas exitosas same-origin
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
