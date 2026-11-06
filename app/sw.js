// Service worker: guarda la app para que funcione sin conexión.
// Estrategia: responde al instante desde la caché y actualiza en segundo plano,
// así los cambios publicados aparecen la siguiente vez que se abre la app.
// Sube VERSION cuando cambies la lista de archivos.
const VERSION = 'v21';
const CACHE = `habitos-${VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './balance/index.html',
  './balance/embed.css',
  './balance/embed.js',
  './viajes/index.html',
  './viajes/embed.css',
  './viajes/embed.js',
  './viajes/sovereign.js',
  './viajes/css/styles.css',
  './viajes/js/app.js',
  './viajes/js/map.js',
  './viajes/js/store.js',
  './viajes/data/world.json',
  './viajes/data/cities.json',
  './js/app.js',
  './js/appearance.js',
  './js/balance-bridge.js',
  './js/covers.js',
  './js/dates.js',
  './js/game.js',
  './js/goals.js',
  './js/gym.js',
  './js/habit-logic.js',
  './js/icons.js',
  './js/library.js',
  './js/store.js',
  './js/travel-bridge.js',
  './js/ui.js',
  './js/week-summary.js',
  './js/work.js',
  './js/views/balance.js',
  './js/views/body.js',
  './js/views/body-map.js',
  './js/views/book-form.js',
  './js/views/book-parts.js',
  './js/views/crop-sheet.js',
  './js/views/goal-detail.js',
  './js/views/goal-form.js',
  './js/views/goals.js',
  './js/views/gym-progress.js',
  './js/views/gym-routine.js',
  './js/views/gym-session-edit.js',
  './js/views/gym-train.js',
  './js/views/gym.js',
  './js/views/habit-detail.js',
  './js/views/habit-form.js',
  './js/views/habits.js',
  './js/views/home-settings.js',
  './js/views/home.js',
  './js/views/library-stats.js',
  './js/views/library.js',
  './js/views/profile.js',
  './js/views/settings.js',
  './js/views/stats.js',
  './js/views/today.js',
  './js/views/todo-form.js',
  './js/views/todos.js',
  './js/views/travel.js',
  './js/views/week.js',
  './js/views/work.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => cached);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return network;
  }));
});
