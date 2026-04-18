// MagiLib Service Worker — Shell caching + offline read
// Version bumped each session alongside ?v=sN script tags.
const CACHE_NAME = 'magilib-sw-s37';

// App shell: pre-cache these on install (no query string — matched ignoring search).
const SHELL_ASSETS = [
  '/index.html',
  '/assets/css/magilib.css',
  '/logo.png',
  '/logo@3x.png',
  '/manifest.json',
  '/fuse.min.js',
  '/supabase.min.js',
  '/globals.js',
  '/auth.js',
  '/catalog.js',
  '/books.js',
  '/pricing.js',
  '/conjuring.js',
  '/ui.js',
  '/publishers.js',
];

// ── INSTALL: pre-cache shell ───────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  // Activate immediately — don't wait for old SW to die.
  self.skipWaiting();
});

// ── ACTIVATE: delete stale caches, claim clients ──────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // mutations go straight to network

  const url = new URL(req.url);

  // Supabase REST/Auth API — always network-only (auth tokens, live data).
  if (url.hostname.includes('supabase.co')) return;

  // Claude API proxy — always network-only.
  if (url.pathname.startsWith('/api/')) return;

  // External origins (CDN, fonts, cover images) — let the browser handle directly.
  if (url.origin !== self.location.origin) return;

  // App shell — network-first, cache as fallback.
  event.respondWith(_networkFirst(req));
});

// ── HELPERS ────────────────────────────────────────────────────────────────

// Cache-first: serve from cache, fetch + store on miss.
async function _cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('', { status: 503 });
  }
}

// Network-first: fetch and update cache; fall back to cache on failure.
// JS/CSS files are matched and stored ignoring the ?v= query string so that
// bumping the version in HTML still loads fresh code while the old version
// stays available as an offline fallback.
async function _networkFirst(request) {
  const url = new URL(request.url);
  const isVersionedAsset = (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) && url.search;

  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      // Store JS/CSS under the bare pathname so any ?v= variant is a cache hit offline.
      const storeKey = isVersionedAsset ? url.pathname : request;
      cache.put(storeKey, response.clone());
    }
    return response;
  } catch (e) {
    // Network failed — try cache.
    // For versioned assets, try both the exact URL and the bare pathname.
    const candidates = isVersionedAsset
      ? [request, url.pathname]
      : [request];

    for (const key of candidates) {
      const cached = await caches.match(key);
      if (cached) return cached;
    }

    // Navigation fallback: serve cached index.html so the app shell loads.
    if (request.mode === 'navigate') {
      const shell = await caches.match('/index.html');
      if (shell) return shell;
    }

    return new Response('', { status: 503, statusText: 'Offline' });
  }
}
