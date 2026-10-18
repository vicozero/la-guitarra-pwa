/* La Guitarra · Service Worker.
   Estrategia: primero la red y, si no hay conexión, la copia guardada.
   Así la app se actualiza sola cuando hay internet y sigue funcionando
   sin conexión después de la primera carga.
   Sube CACHE al publicar cambios importantes. */
'use strict';

var CACHE = 'laguitarra-v1.1.2-sierra-madre-logo';

var FILES = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/util.js',
  './js/bytes.js',
  './js/csv.js',
  './js/kpi.js',
  './js/diesel.js',
  './js/pin.js',
  './js/zip.js',
  './js/pdf.js',
  './js/xlsx.js',
  './js/store.js',
  './js/sync.js',
  './js/catalog.js',
  './js/media.js',
  './js/report-doc.js',
  './js/reports.js',
  './js/ui.js',
  './data/equipos.json',
  './assets/referencia.jpg',
  './assets/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(FILES.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k !== CACHE ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fromCache(request) {
  return caches.match(request).then(function (hit) {
    if (hit) return hit;
    // Navegación sin coincidencia exacta: devolver la portada guardada.
    if (request.mode === 'navigate') return caches.match('./index.html');
    return null;
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  var fresh = request.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname);

  event.respondWith(
    fetch(request, fresh ? { cache: 'no-store' } : undefined).then(function (response) {
      if (response && response.status === 200 && response.type === 'basic') {
        var copy = response.clone();
        caches.open(CACHE).then(function (c) { c.put(request, copy); });
      }
      return response;
    }).catch(function () {
      return fromCache(request).then(function (hit) {
        if (hit) return hit;
        throw new Error('Sin conexión');
      });
    })
  );
});
