// Service worker — exists for ONE reason: let the app BOOT with no signal.
//
// Round data is already safe without this (localStorage is written synchronously
// on every change), but data safety and bootability are different problems. If
// iOS evicts the backgrounded tab while you're in a dead spot, reopening the app
// fetches HTML/JS off the network and fails — the shots are on the device but
// the app can't start to show them. This fixes that case only.
//
// Strategy, chosen to be as boring as possible because this file affects EVERY
// route (pool and tournament users included, not just solo):
//   - Navigations: network-first, falling back to the cached shell offline.
//     Never cache-first — that would serve stale HTML after a deploy.
//   - Static build assets (/_next/static/*, content-hashed): cache-first. Safe
//     because a new build produces new URLs.
//   - Everything else (API routes, GHIN, Supabase): NOT touched at all. Golf
//     scores and handicaps must never be served from a stale cache.

const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

// Minimal shell: the solo routes plus the entry point. Precaching is best-effort
// — a failure here must not abort the install.
const SHELL_URLS = ['/', '/solo', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

// Drop caches from older versions so a deploy can't leave stale assets behind.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isBuildAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (GHIN, Supabase, fonts) — leave entirely alone.
  if (url.origin !== self.location.origin) return;

  // API routes must always hit the network; never cache a handicap or a score.
  if (url.pathname.startsWith('/api/')) return;

  // Content-hashed build output: cache-first, then populate.
  if (isBuildAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: network-first so a deploy is picked up immediately, with
  // the cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = (await caches.match(request)) ?? (await caches.match('/solo')) ?? (await caches.match('/'));
          return (
            cached ??
            new Response('<h1>Offline</h1><p>Reopen when you have signal.</p>', {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
          );
        }),
    );
  }
});
