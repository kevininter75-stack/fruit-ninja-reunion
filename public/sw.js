/**
 * Service worker de Fruit Ninja Réunion.
 *
 * Stratégie choisie pour ne JAMAIS figer les joueurs sur une vieille version :
 * - Navigations (HTML) : NETWORK-FIRST. On récupère toujours la dernière
 *   index.html en ligne (qui pointe vers le bundle haché courant), avec repli
 *   sur le cache uniquement hors-ligne. Un cache-first sur index.html
 *   emprisonnait les joueurs sur la toute première version publiée — c'est
 *   précisément le bug que cette stratégie corrige.
 * - Assets hachés (/assets/…) et icônes : CACHE-FIRST. Leur URL change à
 *   chaque build (empreinte), donc les mettre en cache est sûr et rapide.
 *
 * skipWaiting + clients.claim : la nouvelle version prend le contrôle
 * immédiatement ; le client se recharge alors une fois (voir main.ts,
 * écouteur 'controllerchange'). Incrémenter CACHE_NAME purge l'ancien cache.
 */
const CACHE_NAME = 'fnr-v2';
const PRECACHE = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return; // on ne gère que les GET de la même origine
  }

  // Navigations : réseau d'abord (dernière version), cache en secours hors-ligne
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('index.html', copy));
          return response;
        })
        .catch(() => caches.match('index.html').then((cached) => cached || caches.match('.')))
    );
    return;
  }

  // Autres GET (assets hachés, icônes) : cache d'abord, réseau en secours
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
