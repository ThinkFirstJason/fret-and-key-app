/* Fret & Key — service worker for the phone/web app: the whole app works offline once it has been opened.
   tools/build_web.py writes precache.js (version + file list) next to this file for each release.
   A new release downloads in the background and takes over the next time the app is opened. */
let PRECACHE = { version: 'dev', files: [] };
try { importScripts('precache.js'); PRECACHE = self.FK_PRECACHE || PRECACHE; } catch (e) { /* unbuilt copy: cache as we go */ }

const CACHE = 'fk-app-' + PRECACHE.version;
const RUNTIME = 'fk-runtime';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.files)));
});

self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fk-app-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // app files: from this release's cache; the page itself ignores ?code=… (Spotify login) and #hashes
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const key = req.mode === 'navigate' ? new URL('./', location.href).href : req;
      const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      } catch (err) {
        const fallback = req.mode === 'navigate' && (await cache.match('index.html'));
        if (fallback) return fallback;
        throw err;
      }
    })());
    return;
  }
  // web fonts: serve the saved copy, refresh it in the background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
  // everything else (Spotify) goes straight to the network
});
