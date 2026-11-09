/* Service worker: rede primeiro (sempre pega a versão nova quando online) e cópia local quando offline. */
const V = 'gc-v3';
const SHELL = ['./', 'index.html', 'style.css', 'auth.css', 'auth.js', 'app.js', 'js/dados.js', 'js/orcamento.js', 'js/contas.js', 'js/backup.js', 'js/pwa.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'data/categorias.json', 'data/config.json', 'data/lancamentos.json'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;   // API sempre direto na rede
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});