// sw.js — Cache-first service worker for offline support

const CACHE_NAME = 'ember-v2';

// Files that must be cached on install for the app to work offline.
// core.db is NOT included here — it is large (18 MB) and already persisted
// in OPFS/IndexedDB by db.js on first load.
const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/app.js',
    './js/db.js',
    './js/reader.js',
    './js/selection.js',
    './js/notes.js',
    './js/tags.js',
    './js/search.js',
    './js/panels.js',
    './js/state.js',
    './js/storage-worker.js',
    './js/vendor/sql-wasm.js',
    './js/vendor/sql-wasm.wasm'
];

// ============================================================
// Install — precache all static assets
// ============================================================

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
    );
    // Activate immediately without waiting for old tabs to close
    self.skipWaiting();
});

// ============================================================
// Activate — delete stale caches from prior versions
// ============================================================

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    // Take control of all clients immediately
    self.clients.claim();
});

// ============================================================
// Fetch — cache-first for precached assets, network-first for
// data/core.db (large binary, served only on first run before
// OPFS takes over; subsequent loads hit OPFS directly from db.js)
// ============================================================

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Let non-GET requests and cross-origin requests pass through
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    // core.db — network-first (only fetched once; OPFS takes over after that)
    if (url.pathname.endsWith('/data/core.db')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Everything else — cache-first
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                // Cache valid responses for future offline use
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
