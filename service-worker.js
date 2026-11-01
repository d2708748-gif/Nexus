/* NEXUS — service worker (офлайн-режим)
   ВАЖНО: если вы изменили любой файл игры или лаунчера и залили сайт заново —
   поменяйте VERSION ('v1' → 'v2' → 'v3'...), иначе телефон будет показывать старую версию. */
const VERSION = 'v1';
const CACHE = 'nexus-' + VERSION;

/* Ядро: должно скачаться, чтобы сервис-воркер установился */
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './mascot.jpg'
];

/* Игры (список пуст — см. ниже) */
const GAMES = []; /* игры хранятся в базе самого лаунчера (IndexedDB), отдельный кэш им не нужен */

/* Внешние шрифты (CSS + файлы шрифтов подтягиваются автоматически) */
const FONT_CSS = [
  'https://fonts.googleapis.com/css2?family=Russo+One&display=swap',
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@600&family=Manrope:wght@700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Unbounded:wght@600&display=swap',
  'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Nunito:wght@800;900&display=swap'
];

/* Внешние скрипты: three.js для FATAL CAR RIDE и CodeMirror для Песочницы */
const CM = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
const LIBS = [
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js',
  CM + 'codemirror.min.css',
  CM + 'codemirror.min.js',
  CM + 'mode/xml/xml.min.js',
  CM + 'mode/css/css.min.js',
  CM + 'mode/javascript/javascript.min.js',
  CM + 'mode/htmlmixed/htmlmixed.min.js',
  CM + 'addon/edit/closebrackets.min.js',
  CM + 'addon/edit/closetag.min.js',
  CM + 'addon/edit/matchbrackets.min.js',
  CM + 'addon/selection/active-line.min.js'
];

/* ---------- установка ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

/* ---------- активация: чистим старые версии ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('nexus-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- сообщения от лаунчера ---------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'precache') {
    event.waitUntil(precacheAll());
  }
});

function notify(msg) {
  return self.clients.matchAll().then((list) => list.forEach((c) => c.postMessage(msg)));
}

async function putIfMissing(cache, url, opts) {
  if (await cache.match(url, { ignoreVary: true })) return;
  const res = await fetch(url, opts || {});
  if (res && res.ok) await cache.put(url, res);
}

async function cacheFonts(cache, cssUrl) {
  let res = await cache.match(cssUrl, { ignoreVary: true });
  if (!res) {
    const fresh = await fetch(cssUrl, { mode: 'cors' });
    if (!fresh.ok) return;
    await cache.put(cssUrl, fresh.clone());
    res = fresh;
  }
  const css = await res.clone().text();
  const files = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
  for (const f of files) {
    try { await putIfMissing(cache, f, { mode: 'cors' }); } catch (e) { /* дозагрузится позже */ }
  }
}

let busy = false;
async function precacheAll() {
  if (busy) return;
  busy = true;
  try {
    const cache = await caches.open(CACHE);
    for (const css of FONT_CSS) { try { await cacheFonts(cache, css); } catch (e) {} }
    for (const lib of LIBS) { try { await putIfMissing(cache, lib, { mode: 'cors' }); } catch (e) {} }
    for (const g of GAMES) {
      try { await putIfMissing(cache, g, { cache: 'reload' }); } catch (e) {}
      await notify({ type: 'progress', url: g });
    }
    await notify({ type: 'precache-done' });
  } finally {
    busy = false;
  }
}

/* ---------- перехват запросов ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* FATAL CAR RIDE просит /sdk.js от Яндекс Игр — за пределами Яндекса он не нужен */
  if (url.origin === self.location.origin && url.pathname.endsWith('/sdk.js')) {
    event.respondWith(new Response('/* stub */', { headers: { 'Content-Type': 'application/javascript' } }));
    return;
  }

  event.respondWith(cacheFirst(req, url));
});

async function cacheFirst(req, url) {
  if (req.headers.has('x-seed')) return fetch(req); /* загрузка встроенных игр — мимо кэша */
  const cache = await caches.open(CACHE);
  const same = url.origin === self.location.origin;
  const hit = await cache.match(req, { ignoreSearch: same, ignoreVary: true });
  if (hit) return hit;

  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (req.mode === 'navigate' && req.destination === 'document') {
      const home = await cache.match('./index.html');
      if (home) return home;
    }
    return new Response('Нет сети, и этого файла ещё нет в кэше.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
