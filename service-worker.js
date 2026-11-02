const CACHE = 'nexus-v3';
const FILES = ['./','index.html','manifest.json','mascot.jpg','icon-192.png','icon-512.png',
 'neon-puzzle.html','water-sort.html','sudoku.html','sapper.html','wordle.html','tictactoe.html',
 'archers.html','knife-hit.html','neon-smash.html','car-ride.html','sandbox.html','cheatsheet.html',
 'crazy-fishing.html','agent-bullet.html'];

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'precache') {
    e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))));
  }
});
// сначала сеть (всегда свежая версия), при отсутствии интернета — кэш
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, {ignoreSearch: true}))
  );
});
