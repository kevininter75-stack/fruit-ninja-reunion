/**
 * Service worker de Fruit Ninja Réunion.
 *
 * Stratégie volontairement simple pour un jeu 100 % client-side :
 * - pré-cache de la coquille (index, manifest, icônes) à l'installation ;
 * - cache-first à l'exécution : les assets buildés (noms hachés par Vite)
 *   sont mis en cache à la première visite puis servis hors-ligne.
 * Incrémenter CACHE_NAME invalide tout l'ancien cache au déploiement suivant.
 */
const CACHE_NAME = 'fnr-v1';
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
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Hors-ligne sur une navigation : on ressert la coquille du jeu
          if (request.mode === 'navigate') {
            return caches.match('index.html');
          }
          return Response.error();
        });
    })
  );
});
