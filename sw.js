const CACHE_NAME = 'fobal5-2026-05-29c';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Limpiar todos los caches viejos
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
