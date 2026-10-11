/* Agora Digital App · Landing 3.0 — service worker (app instalable / APK)
   - HTML: red primero (siempre lo más nuevo) y copia local si no hay conexión.
   - CSS, JS, fuentes e imágenes propias: caché con actualización en segundo plano.
   - Nunca guarda la API, formularios ni recursos de terceros. */
'use strict';
var VERSION = 'agora-3.1.0';
var CORE = [
  './',
  'index.html',
  'en.html',
  'privacidad.html',
  'css/styles.css?v=3.1.0',
  'js/boot.js?v=3.1.0',
  'js/config.js?v=3.1.0',
  'js/app.js?v=3.1.0',
  'assets/fonts/Author-Variable.woff2',
  'assets/logos/agora-logo-vino.svg',
  'assets/logos/agora-logo-blanco.svg',
  'assets/logos/agora-simbolo-vino.svg',
  'assets/logos/agora-simbolo-blanco.svg',
  'assets/img/athena-avatar.webp',
  'assets/img/athena-body.webp',
  'assets/img/athena-head.webp',
  'assets/icons/icon-192.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') > -1) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      if (res.ok) caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
    }));
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
