const CACHE_NAME = 'fobal5-2026-05-29b';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/styles/auth.css',
  '/app.js',
  '/config.public.js',
  '/src/api/client.js',
  '/src/api/authClient.js',
  '/src/auth/userAuth.js',
  '/src/auth/loginScreen.js',
  '/src/views/playersView.js',
  '/src/views/matchView.js',
  '/src/views/historyView.js',
  '/src/views/calendarView.js',
  '/src/controllers/historyController.js',
  '/src/controllers/matchController.js',
  '/src/controllers/adminPlayersController.js',
  '/src/services/whatsappShareService.js',
  '/src/services/playerRatingsService.js',
  '/src/services/feedbackService.js',
  '/manifest.json',
  '/icons/FaltaUnoVerde.png',
  '/icons/FaltaUnoLogoIntro.png',
  '/icons/futbolFoca.png',
  '/icons/imgPortada.png',
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

// Cache-first para assets estáticos; ignora otras origins (Supabase, CDN)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    }).catch(() => fetch(request))
  );
});
