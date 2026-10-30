// mealsplit service worker. This is a template: build/pwa.ts fills in the three values below
// when the site is built (they have harmless defaults so the file also parses on its own).
//
// What it does:
//  - install: downloads the whole app shell (index.html, hashed JS/CSS, manifest, icons) into a
//    cache named after this build, so the app opens offline after a single visit. If any file
//    fails to download, the install fails and the previous version keeps running.
//  - fetch: the shell is served cache-first. The OCR files (about 7 MB, only one wasm core per
//    device) are not downloaded up front; they are cached the first time a scan fetches them,
//    then served from the cache, so scanning works offline once it has run once.
//  - update: a changed build is a new worker. It installs in the background but waits, so the
//    page can offer "Update available" instead of swapping code under someone mid-bill. The page
//    sends SKIP_WAITING when the user taps Reload.
//  - activate: deletes the caches of older builds.
//
// Only complete, same-origin 200 responses are ever cached: never errors, redirects, opaque
// (cross-origin no-cors) responses, or 206 partial content.

const VERSION = '__SW_VERSION__';
const OCR_VERSION = '__OCR_VERSION__';
const PRECACHE = /*__PRECACHE__*/ [];

const PREFIX = 'mealsplit-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const OCR_CACHE = `${PREFIX}ocr-${OCR_VERSION}`;

// The worker sits at the root of the app, so its scope is the app (any base path works).
const scope = self.registration.scope;
const absolute = (path) => new URL(path, scope).href;
const INDEX = absolute('index.html');
const PRECACHED = new Set(PRECACHE.map(absolute));
const OCR_ROOT = absolute('ocr/');

const cacheable = (res) =>
  res.status === 200 && res.type === 'basic' && !res.headers.has('content-range');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        PRECACHE.map(async (path) => {
          // 'reload' skips the HTTP cache, so a new build never precaches stale files.
          const res = await fetch(new Request(absolute(path), { cache: 'reload' }));
          if (!cacheable(res)) throw new Error(`Could not cache ${path} (${res.status})`);
          await cache.put(absolute(path), res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, OCR_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith(PREFIX) && !keep.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Ignore the query string: the cache key is the file itself.
  const key = url.origin + url.pathname;

  if (req.mode === 'navigate') {
    // One page: any navigation inside the app gets index.html.
    if (key.startsWith(scope)) event.respondWith(fromShell(INDEX, req));
  } else if (PRECACHED.has(key)) {
    event.respondWith(fromShell(key, req));
  } else if (key.startsWith(OCR_ROOT)) {
    event.respondWith(ocr(event, key));
  }
});

async function fromShell(key, req) {
  const hit = await caches.match(key, { cacheName: SHELL_CACHE });
  return hit || fetch(req);
}

async function ocr(event, key) {
  const cache = await caches.open(OCR_CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (cacheable(res)) event.waitUntil(cache.put(key, res.clone()));
  return res;
}
