// sw.js — Cache-first service worker for offline support

const CACHE_NAME = 'ember-v44'; // bumped: one line per verse reference in the 1611 summaries (reference.js, style.css, USER_MANUAL.md)

// Files that must be cached on install for the app to work offline.
// Every ES module app.js reaches, directly or transitively, must be here:
// cache.addAll() is all-or-nothing, and a module missing from this list is
// simply not available offline until some online visit happened to fetch
// it. When a file is added to js/, add it here and bump CACHE_NAME. Bump it
// too when USER_MANUAL.md changes: the help guide reads the cached copy
// (tests/verify.py sw checks the list against js/ on disk).
//
// core.db is NOT included here — it is large (23 MB) and already persisted
// in OPFS/IndexedDB by db.js on first load. The translation .db files,
// data/language.db (~64 MB) and data/lexicon-hebrew.db (~4 MB) are the same
// story — seeded into OPFS by db.js (during first boot / in the background just
// after it) and served from there.
// The bundled template JSON is fetched on every online boot, and a bundled
// plan's JSON whenever that plan isn't on the bundled_installs list yet (or the
// Plans tab restores it), so a newly bundled one reaches existing installs; but
// anything it holds is already in core.db after that, so offline boots skip it.
const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './USER_MANUAL.md',
    './css/style.css',
    './js/app.js',
    './js/backup.js',
    './js/bookmarks.js',
    './js/db.js',
    './js/dialogs.js',
    './js/global-settings.js',
    './js/grammar-decode.js',
    './js/greek-lexicon.js',
    './js/hebrew-lexicon.js',
    './js/hebrew-versification.js',
    './js/readable-export.js',
    './js/help.js',
    './js/help-guide.js',
    './js/help-map.js',
    './js/language.js',
    './js/manuscript-variants.js',
    './js/markups.js',
    './js/notes.js',
    './js/notes-settings.js',
    './js/panels.js',
    './js/plans.js',
    './js/popover-registry.js',
    './js/reader.js',
    './js/reader-settings.js',
    './js/reference.js',
    './js/reference-settings.js',
    './js/search.js',
    './js/selection.js',
    './js/storage-worker.js',
    './js/study-templates.js',
    './js/tags.js',
    './js/template-bar.js',
    './js/translation-shelf.js',
    './js/usfm.js',
    './js/vendor/sql-wasm.js',
    './js/vendor/sql-wasm.wasm',
    './fonts/SILEOT.woff'
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
// Fetch — cache-first for static assets; data/ is pass-through
// ============================================================
//
// Everything under data/ (core.db, the translation .db files, language.db,
// lexicon-hebrew.db, the bundled plan/template JSON) is either fetched by db.js at most once per
// install and then persisted in OPFS/IndexedDB, or only read while seeding
// core.db. Copying those responses into Cache Storage as well would store
// a second ~64 MB language.db (and any translation fetched after the worker
// took control) that nothing ever reads back — db.js goes to OPFS first and
// only re-fetches when OPFS is empty. So data/ requests go straight to the
// network and are never cached here.

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Let non-GET requests and cross-origin requests pass through
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    // data/ — network only, never cached (OPFS-managed by db.js, see above)
    if (url.pathname.includes('/data/')) {
        return;
    }

    // Everything else — cache-first, caching valid responses for offline use
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
