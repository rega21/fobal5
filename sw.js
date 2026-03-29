const CACHE_NAME = 'fobal5-2026-03-29f';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/config.public.js',
  '/src/api/client.js',
  '/src/api/authClient.js',
  '/src/views/playersView.js',
  '/src/views/matchView.js',
  '/src/views/historyView.js',
  '/src/controllers/historyController.js',
  '/src/controllers/matchController.js',
  '/src/controllers/adminPlayersController.js',
  '/src/services/whatsappShareService.js',
  '/src/services/playerRatingsService.js',
  '/src/services/feedbackService.js',
  '/manifest.json',
  '/icons/futbolFoca.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
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

// Network-first para requests de API; cache-first para assets estáticos
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests de otras origins (Supabase, CDN, etc.)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || network;
    })
  );
});
