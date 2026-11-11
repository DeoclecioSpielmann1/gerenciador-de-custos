/* Service worker (fica em publico/ para abrir mesmo sem login).
   Regras de segurança: nunca guarda páginas, /api/ nem /data/ (são do usuário logado);
   só arquivos estáticos (css, js, ícones), e nunca uma resposta que veio de redirecionamento
   (senão a tela de login poderia ficar salva no lugar do app.js). */
const V = 'gc-v4';
const ESTATICOS = ['/style.css', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Sem conexão</title><body style="font:16px system-ui,sans-serif;padding:32px;max-width:32rem;margin:auto">' +
  '<h1 style="font-weight:400">Sem conexão</h1><p>O Gerenciador de Custos precisa do servidor para abrir. ' +
  'Confira o Wi-Fi e tente de novo.</p>';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.allSettled(ESTATICOS.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/data/')) return;
  if (r.mode === 'navigate') {            // páginas: sempre da rede; sem rede, aviso simples
    e.respondWith(fetch(r).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  e.respondWith(fetch(r).then(res => {    // arquivos: rede primeiro, cópia local se estiver offline
    if (res.ok && !res.redirected && res.type === 'basic') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || Response.error())));
});