/* Agora Digital App · service worker (edición con servidor 11.0.0)
   · La página y la API van siempre a la red: tienen tu sesión y cambian en cada visita (no se guardan).
   · Sin conexión, la página muestra un aviso; tus cambios pendientes quedan en el navegador hasta que vuelva.
   · Los scripts, estilos e imágenes con huella en el nombre se guardan para abrir más rápido. */
const CACHE = 'agora-srv-3206edfec6';
const PRE = ["/assets/js/tema.0244a34c5d.js","/assets/js/servidor.e257986ffd.js","/assets/js/app.d780902c71.js","/assets/js/ecosistema.82cd9adc33.js","/assets/js/athena.233acb1bb1.js","/assets/css/app.23e6e1ebf9.css","/assets/css/ecosistema.a603ab5a17.css","/assets/css/servidor.8f0b9b5480.css","/assets/css/informes.c4f6a32541.css","/assets/img/athena-busto.webp","/assets/img/athena-cabeza.webp","/icons/icon-192.png"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRE.map(u => c.add(u).catch(() => null))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('agora-') && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== self.location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/fx/')) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="font-family:-apple-system,system-ui,sans-serif;padding:48px 24px;color:#1D1D1F;background:#F5F5F7"><h1 style="font-size:24px">Sin conexión</h1><p>Agora Digital App necesita internet para traer tus datos del servidor. Revisa tu conexión y vuelve a intentar.</p></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  if (/\.[0-9a-f]{10}\.(js|css)$/.test(u.pathname) || u.pathname.startsWith('/assets/img/') || u.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; })));
  }
});
