'use strict';
/* Registra o service worker (instalação como app + funcionamento offline). Só em https ou localhost. */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}