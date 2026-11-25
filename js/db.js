// db.js — Database initialization, queries, and persistence

import { resolveUsfmRef } from './usfm.js';

const CROSSREF_VOTE_FLOOR_DEFAULT = 5;
const CROSSREF_TOP_N_DEFAULT      = 25;

const NOTES_FTS_REPAIRED_KEY = 'notes_fts_repaired';

// Anchors spanning more than this many verse-id units (about five chapters) are
// the rare "long" ones, kept in their own partial index — see anchorsOverlapping().
const LONG_ANCHOR_SPAN = 5000;
const IS_LONG_ANCHOR   = `COALESCE(verse_end, verse_start) - verse_start > ${LONG_ANCHOR_SPAN}`;

// Each bundled plan's file and the plan_id inside it, so the app can tell
// which bundled plans are missing without fetching the files.
const BUNDLED_PLANS = [
    { id: 'mcheyne-1year',                 file: 'mcheyne-1year.json' },
    { id: 'bible-in-a-year-canonical',     file: 'bible-in-a-year-canonical.json' },
    { id: 'bible-in-a-year-chronological', file: 'bible-in-a-year-chronological.json' },
];

const BUNDLED_TEMPLATE_FILES = [
    'inductive-study.json',
    'word-study.json',
    'passage-overview.json'
];

let db             = null;
let _booksCache    = null;
let _storageWorker = null;
let _restoring     = false; // set by restoreCoreDb(): ordinary saves are held off
let _savedDuringRestore = false;
let _SQL           = null; // cached sql.js module — reused by restore's validation step

// Translation handles — keyed by integer translation ID (1 = KJV, 2 = ASV, …).
// Populated during initDatabase(), then changed only by addTranslation() and
// removeTranslation(). Never handed out: every query against a translation
// goes through a function in this file.
const _translationDbs = new Map();

// KJV is always installed and can't be removed: it's the fallback for any pane
// whose translation goes away. The catalog's tier for ID 1 must agree.
export const LOCKED_TRANSLATION_ID = 1;
const LOCKED_TRANSLATION_ROW = [1, 'kjv.db', 'King James Version', 'KJV', '1611', 'Public Domain'];

const TRANSLATION_CATALOG_URL = './data/translations/catalog.json';

// Fired on document after a translation is added or removed (reader.js redraws).
export const TRANSLATIONS_CHANGED_EVENT = 'translations-changed';

function getStorageWorker() {
    if (!_storageWorker) {
        _storageWorker = new Worker('./js/storage-worker.js');
    }
    return _storageWorker;
}

// ============================================================
// Query helpers — the sql.js prepare/bind/step/free dance, once
// ============================================================
//
// `database` is whichever handle the query targets: the core `db`, a
// translation handle from _translationDbs, or a lazily-opened reference DB.
// Rows come back as objects keyed by column name (SQL aliases apply), so a
// query's SELECT list is also its result shape.

function queryAll(database, sql, params = []) {
    const stmt = database.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

// First row as an object, or null when the query matches nothing.
function queryOne(database, sql, params = []) {
    const stmt = database.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
}

// First column of the first row (for COUNT(*), a single id, a single
// value), or `fallback` when the query matches nothing.
function queryValue(database, sql, params = [], fallback = null) {
    const row = queryOne(database, sql, params);
    return row ? Object.values(row)[0] : fallback;
}

function lastInsertRowId() {
    return queryValue(db, 'SELECT last_insert_rowid()');
}

// ============================================================
// Initialization
// ============================================================

export async function initDatabase() {
    // sql-wasm.js is loaded as a plain <script> tag; initSqlJs is a global.
    const SQL = await window.initSqlJs({
        locateFile: file => `./js/vendor/${file}`
    });
    _SQL = SQL;

    const stored = await loadFromStorage();
    if (stored) {
        db = new SQL.Database(new Uint8Array(stored));
    } else {
        const response = await fetch('./data/core.db');
        const buffer = await response.arrayBuffer();
        db = new SQL.Database(new Uint8Array(buffer));
        await saveToStorage(db.export());
    }

    createUserTables();

    // Seed any bundled reading plan this install has never installed (see
    // bundled_installs). Runs every online boot, so a newly bundled plan
    // reaches existing installs, and a deleted one stays deleted.
    await seedBundledPlans();

    // Same for built-in study templates, by name.
    await seedBundledTemplates();

    // The translations manifest means "installed on this device"
    // (Translation_Addons_Spec Items 2 and 5). KJV is always in it; any row whose
    // file is missing or not whole downloads when online; a file with no row is
    // left over from an interrupted Remove and is deleted.
    ensureLockedTranslation();
    await seedTranslations();
    await removeOrphanTranslationFiles();
    await openTranslationHandles(SQL);

    return db;
}

// ============================================================
// Translation seeding + handle management
// ============================================================

// Guards against a restored or damaged core.db without KJV's row.
function ensureLockedTranslation() {
    db.run(
        `INSERT OR IGNORE INTO translations
             (id, filename, name, abbreviation, year, license, installed_at, is_bundled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [...LOCKED_TRANSLATION_ROW, Math.floor(Date.now() / 1000)]
    );
    if (db.getRowsModified() > 0) saveToStorage(db.export());
}

function getManifestRows() {
    return queryAll(db, 'SELECT id, filename FROM translations ORDER BY id');
}

// For every manifest row: download the file from ./data/translations/ into the
// translation store if it isn't there and whole. On a first install that's the
// default set; afterwards it's a fast no-op, except for a row a restored backup
// brought that this machine lacks, which arrives here on the next online boot.
// With no store at all, openTranslationHandles fetches each file per session.
async function seedTranslations() {
    const store = await getTranslationStore();
    if (!store) return;

    const missing = [];
    for (const { filename } of getManifestRows()) {
        if (!await store.has(filename).catch(() => false)) missing.push(filename);
    }

    const loadingEl = document.getElementById('loading');
    let installed = 0;
    for (const [index, filename] of missing.entries()) {
        // Offline, it waits for an online boot; until then the translation is
        // hidden (see getTranslations()).
        if (navigator.onLine === false) {
            console.warn(`seedTranslations: offline, ${filename} will download on the next online boot`);
            continue;
        }
        if (loadingEl) {
            loadingEl.textContent = `Installing translations… ${index + 1} of ${missing.length}`;
        }

        let bytes;
        try {
            bytes = await fetchCheckedBytes(`./data/translations/${filename}`);
        } catch (e) {
            // A failed fetch (TypeError) is no connection, an expected state:
            // navigator.onLine can still say true then. It downloads next boot.
            if (e instanceof TypeError) {
                console.warn(`seedTranslations: ${filename} could not be fetched, will try on the next boot:`, e.message);
            } else {
                console.error(`seedTranslations: failed to download ${filename}:`, e);
            }
            continue;
        }
        try {
            await store.write(filename, bytes);
            installed++;
        } catch (e) {
            // Quota, most likely. openTranslationHandles fetches it for this session.
            console.warn(`seedTranslations: ${filename} could not be stored (${store.name}), will try on the next boot:`, e);
        }
    }

    if (installed > 0) {
        console.log(`Installed ${installed} translation file(s) (${store.name}).`);
    }
}

// Any .db file in the translation store with no manifest row is deleted: the
// leftover of a Remove interrupted between its manifest and file steps. Other
// names (a browser's .crswap, say) are left alone.
async function removeOrphanTranslationFiles() {
    const store = await getTranslationStore();
    if (!store) return;
    const installed = new Set(getManifestRows().map(row => row.filename));
    try {
        for (const name of await store.list()) {
            if (!name.endsWith('.db') || installed.has(name)) continue;
            await store.remove(name);
            console.log(`Removed ${name}: no longer installed.`);
        }
    } catch (e) {
        console.warn('removeOrphanTranslationFiles:', e);
    }
}

// The OPFS translations/ directory, or null without OPFS.
async function getTranslationsDir({ create = false } = {}) {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) return null;
    try {
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle('translations', { create });
    } catch (_) {
        return null;
    }
}

// ---- Where translation files are kept ----------------------------------------
//
// In OPFS translations/ when this browser can write OPFS files. Otherwise in an
// IndexedDB database of their own, so the reader still works offline without
// OPFS, without createWritable (older Safari), or with OPFS refused (some
// private modes). Not in ScriptureStudy, core.db's database: the storage worker
// and loadFromStorage() open that at version 1, and a new object store there
// would need version 2. With neither, getTranslationStore() is null and each
// session fetches the files over the network.
//
// Both stores answer the same calls, by filename: has (there and whole), read
// (an ArrayBuffer, or null), write (`sha256` when known), remove, list, and
// sha256 (the installed file's, for checkForDataUpdates; null if it isn't there).

let _translationStore = null;

function getTranslationStore() {
    if (!_translationStore) {
        _translationStore = (async () => {
            if (await canWriteOpfs()) return OPFS_TRANSLATION_STORE;
            if (await canUseTranslationsIdb()) return INDEXEDDB_TRANSLATION_STORE;
            return null;
        })();
    }
    return _translationStore;
}

const OPFS_TRANSLATION_STORE = {
    name: 'OPFS',
    async has(filename) {
        const file = await getOpfsFileAt(`translations/${filename}`);
        return Boolean(file) && await isCompleteSqliteFile(file);
    },
    async read(filename) {
        const file = await getOpfsFileAt(`translations/${filename}`);
        return file && await isCompleteSqliteFile(file) ? await file.arrayBuffer() : null;
    },
    async write(filename, bytes, sha256 = null) {
        await writeOpfsFile(await getTranslationsDir({ create: true }), filename, bytes);
        if (sha256) await recordInstalledFile(`translations/${filename}`, sha256);
        else forgetInstalledFile(`translations/${filename}`);
    },
    async remove(filename) {
        try {
            await (await getTranslationsDir())?.removeEntry(filename);
        } catch (e) {
            if (e.name !== 'NotFoundError') throw e;
        }
        forgetInstalledFile(`translations/${filename}`);
    },
    async list() {
        const transDir = await getTranslationsDir();
        const names = [];
        if (transDir) {
            for await (const [name, handle] of transDir.entries()) {
                if (handle.kind === 'file') names.push(name);
            }
        }
        return names;
    },
    sha256(filename) {
        return installedSha256(`translations/${filename}`);
    },
};

// Two object stores keyed by filename: `files` holds each file's bytes as an
// ArrayBuffer, `sha256` its hash, so an update check never reads the files. A
// write is one transaction, so a file that is there is whole.
const TRANSLATIONS_IDB_NAME = 'EmberTranslations';

function openTranslationsIdb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(TRANSLATIONS_IDB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('files');
            request.result.createObjectStore('sha256');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Runs `operate(transaction)` in one transaction over both stores and resolves
// with what its last request returned, once the transaction has committed.
async function translationsIdbTransaction(mode, operate) {
    const connection = await openTranslationsIdb();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = connection.transaction(['files', 'sha256'], mode);
            let result;
            const request = operate(transaction);
            if (request) request.onsuccess = () => { result = request.result; };
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
        });
    } finally {
        connection.close();
    }
}

async function canUseTranslationsIdb() {
    if (typeof indexedDB === 'undefined') return false;
    try {
        (await openTranslationsIdb()).close();
        return true;
    } catch (_) {
        return false;
    }
}

const INDEXEDDB_TRANSLATION_STORE = {
    name: 'IndexedDB',
    async has(filename) {
        const count = await translationsIdbTransaction('readonly',
            transaction => transaction.objectStore('files').count(filename));
        return count > 0;
    },
    read(filename) {
        return translationsIdbTransaction('readonly',
            transaction => transaction.objectStore('files').get(filename)).then(buffer => buffer ?? null);
    },
    async write(filename, bytes, sha256 = null) {
        const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
        const buffer = view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
            ? view.buffer : view.slice().buffer;
        const hash = sha256 ?? await sha256Hex(view);
        await translationsIdbTransaction('readwrite', transaction => {
            transaction.objectStore('sha256').put(hash, filename);
            return transaction.objectStore('files').put(buffer, filename);
        });
    },
    remove(filename) {
        return translationsIdbTransaction('readwrite', transaction => {
            transaction.objectStore('sha256').delete(filename);
            return transaction.objectStore('files').delete(filename);
        });
    },
    list() {
        return translationsIdbTransaction('readonly',
            transaction => transaction.objectStore('files').getAllKeys());
    },
    sha256(filename) {
        return translationsIdbTransaction('readonly',
            transaction => transaction.objectStore('sha256').get(filename)).then(hash => hash ?? null);
    },
};

// Open a sql.js Database handle for every installed translation.
// A row whose file can't be loaded (offline, right after a restore) gets no
// handle, which keeps it out of the reader until its download succeeds.
async function openTranslationHandles(SQL) {
    const rows = getManifestRows();

    for (const { id, filename } of rows) {
        try {
            const buffer = await loadTranslationBuffer(filename);
            if (buffer) {
                _translationDbs.set(id, new SQL.Database(new Uint8Array(buffer)));
            } else {
                console.warn(`openTranslationHandles: no data for ${filename}`);
            }
        } catch (e) {
            if (navigator.onLine === false || e instanceof TypeError) {
                console.warn(`openTranslationHandles: ${filename} is not downloaded yet and can't be fetched now`);
            } else {
                console.error(`openTranslationHandles: failed to open ${filename}:`, e);
            }
        }
    }

    console.log(`Translation handles open: ${_translationDbs.size}/${rows.length}`);
}

// Load a translation file as an ArrayBuffer. The translation store first;
// the network when the file isn't stored (no store, or storing it failed).
async function loadTranslationBuffer(filename) {
    const store = await getTranslationStore();
    try {
        const buffer = await store?.read(filename);
        if (buffer) return buffer;
    } catch (e) {
        console.warn(`loadTranslationBuffer: could not read ${filename} (${store.name}):`, e);
    }

    // Network fallback: fetch fresh each time (read-only, so safe).
    if (navigator.onLine === false) throw new Error('the browser is offline');
    const response = await fetch(`./data/translations/${filename}`);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${filename}`);
    return await response.arrayBuffer();
}

// ============================================================
// Adding and removing translations (Translation_Addons_Spec Items 3 and 4)
// ============================================================

// The list of every translation Ember offers, installed or not. Online only:
// nothing offline depends on it, since an installed translation's details are
// in the manifest. Not cached by the browser, so a rebuilt file's new sha256
// is what Add checks against.
export async function fetchTranslationCatalog() {
    if (navigator.onLine === false) throw new Error('the browser is offline');
    const response = await fetch(TRANSLATION_CATALOG_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching the translation catalog`);
    const catalog = await response.json();
    return catalog.translations;
}

// Downloads a catalog translation, checks it, and installs it. Rejects with a
// message fit to show if it can't; nothing is left behind when it does.
// `onProgress(received, total)` follows the download; total is the catalog's
// size_bytes, or null if the entry has none.
export async function addTranslation(entry, { onProgress } = {}) {
    if (navigator.onLine === false) {
        throw new Error('You’re offline. Connect to the internet to add a translation.');
    }
    let bytes;
    try {
        const response = await fetch(`./data/translations/${entry.filename}`, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bytes = await readResponseWithProgress(response, entry.size_bytes, onProgress);
    } catch (e) {
        console.warn(`addTranslation: download of ${entry.filename} failed:`, e);
        // A failed fetch (TypeError) means no connection, whatever navigator.onLine says.
        throw new Error(e instanceof TypeError
            ? `${entry.abbreviation} could not be downloaded: you seem to be offline. Connect to the internet and try again.`
            : `${entry.abbreviation} could not be downloaded. Try again later.`);
    }
    await installTranslationBytes(entry, bytes);
}

// The total is the catalog's size, not Content-Length: a host that compresses
// the response sends the compressed size there, which would read "7.5 of 2.9 MB".
async function readResponseWithProgress(response, total, onProgress) {
    total = total || null;
    if (!response.body || !onProgress) return new Uint8Array(await response.arrayBuffer());
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    onProgress(0, total);
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress(received, total);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
}

// Checks `bytes` against the catalog entry, writes the file to the translation
// store, then registers it. Takes bytes rather than a URL so a future "import your own
// translation file" path can call it with a local file. The checks run on the
// bytes in memory, before anything is written, so a bad file never reaches disk.
export async function installTranslationBytes(entry, bytes) {
    const database = await openCheckedTranslation(entry, bytes);
    try {
        const store = await getTranslationStore();
        if (store) {
            try {
                await store.write(entry.filename, bytes, entry.sha256);
            } catch (e) {
                await store.remove(entry.filename).catch(() => {});
                throw e;
            }
        }
        // With no store the handle lives in memory, and later boots fetch the
        // file over the network (loadTranslationBuffer), as for the default set.
    } catch (e) {
        database.close();
        console.error(`installTranslationBytes: could not store ${entry.filename}:`, e);
        throw new Error(`${entry.abbreviation} could not be saved on this device. Nothing was changed.`);
    }

    // The row comes from the catalog entry, not the file: the entry is what the
    // file was just checked against, and its ID is permanent.
    db.run(
        `INSERT OR REPLACE INTO translations
             (id, filename, name, abbreviation, year, license, installed_at, is_bundled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [entry.id, entry.filename, entry.name, entry.abbreviation, entry.year ?? null,
         entry.license ?? null, Math.floor(Date.now() / 1000)]
    );
    _translationDbs.get(entry.id)?.close();
    _translationDbs.set(entry.id, database);
    saveToStorage(db.export());
    document.dispatchEvent(new CustomEvent(TRANSLATIONS_CHANGED_EVENT));
}

// Opens `bytes` as a sql.js database and confirms it is the translation the
// catalog describes: its meta abbreviation, its SHA-256, and its verse count
// (verse > 0 only: KJV, ASV and Darby carry Psalm title rows as verse 0, and
// WEB has fewer verses than the rest, so the count is never a constant).
// Returns the open database, or closes it and throws.
async function openCheckedTranslation(entry, bytes) {
    const failed = (reason) => {
        console.warn(`addTranslation: ${entry.filename} failed its check: ${reason}`);
        return new Error(`The downloaded ${entry.abbreviation} file didn’t check out, so it wasn’t installed. Try again later.`);
    };

    const sha256 = await sha256Hex(bytes);
    if (sha256 !== entry.sha256) throw failed(`sha256 ${sha256} is not the catalog's ${entry.sha256}`);

    let database;
    try {
        database = new _SQL.Database(bytes);
        const abbreviation = queryValue(database, "SELECT value FROM meta WHERE key = 'abbreviation'");
        if (abbreviation !== entry.abbreviation) {
            throw failed(`meta abbreviation ${abbreviation} is not ${entry.abbreviation}`);
        }
        const verseCount = queryValue(database, 'SELECT COUNT(*) FROM verses WHERE verse > 0', [], 0);
        if (verseCount !== entry.verse_count) {
            throw failed(`${verseCount} verses, not the catalog's ${entry.verse_count}`);
        }
        return database;
    } catch (e) {
        database?.close();
        throw e.message.startsWith('The downloaded') ? e : failed(e.message);
    }
}

// Removes an installed translation. Works offline. The reader moves any pane
// showing it to KJV when TRANSLATIONS_CHANGED_EVENT fires, before anything can
// read from the closed handle.
//
// The manifest row goes before the file, and the save that drops it must be on
// disk before the file is deleted: a tab closed in between then leaves a file
// with no row, which the next boot deletes. The other way round would leave a
// row with no file, and the next online boot would download it again.
export async function removeTranslation(id) {
    if (id === LOCKED_TRANSLATION_ID) throw new Error('KJV is always installed and can’t be removed.');
    const row = queryOne(db, 'SELECT filename FROM translations WHERE id = ?', [id]);
    if (!row) return;

    db.run('DELETE FROM translations WHERE id = ?', [id]);
    _translationDbs.get(id)?.close();
    _translationDbs.delete(id);
    saveToStorage(db.export());
    document.dispatchEvent(new CustomEvent(TRANSLATIONS_CHANGED_EVENT));

    await waitForStorageWorker();
    try {
        await (await getTranslationStore())?.remove(row.filename);
    } catch (e) {
        console.warn(`removeTranslation: ${row.filename} stays until the next boot:`, e);
    }
}

// A restore brings study data across, never removes a translation from this
// machine (Translation_Addons_Spec Item 5a). Before the restore's write, every
// row in the live manifest is added to the backup's: same ID means same
// translation, so a row already there is skipped, and the UNIQUE filename makes
// an inconsistent one skip too. Translations only the backup lists download on
// the next online boot. Returns the merged bytes; throws if they can't be made,
// and the restore must then stop rather than go ahead unmerged.
export function mergeInstalledTranslations(bytes) {
    const live = queryAll(db,
        'SELECT id, filename, name, abbreviation, year, license, installed_at, is_bundled FROM translations ORDER BY id');
    const restored = new _SQL.Database(bytes);
    try {
        for (const row of live) {
            restored.run(
                `INSERT OR IGNORE INTO translations
                     (id, filename, name, abbreviation, year, license, installed_at, is_bundled)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [row.id, row.filename, row.name, row.abbreviation, row.year, row.license, row.installed_at, row.is_bundled]
            );
            const kept = queryValue(restored, 'SELECT filename FROM translations WHERE id = ?', [row.id]);
            if (kept !== row.filename) {
                console.warn(`mergeInstalledTranslations: kept the backup's row for ${kept ?? row.filename}; skipped this machine's ${row.abbreviation} (ID ${row.id})`);
            }
        }
        return restored.export();
    } finally {
        restored.close();
    }
}

// ============================================================
// Updating installed data files (version-aware reseeding)
// ============================================================
//
// Seeding only ever checks that a file is there and whole, so a fixed or rebuilt
// file on the server would never reach an install that already has one. After
// launch, online, checkForDataUpdates() compares each installed file's SHA-256
// with its catalog entry (data/translations/catalog.json for translations,
// data/reference-catalog.json for language.db, lexicon-hebrew.db and context.db) and
// downloads, checks and writes the new one when they differ. It never runs
// during boot, and sql.js holds each database in memory, so a replaced file is
// used from the next launch. One file at a time: checking a 64 MB file means
// holding all of it in memory.
//
// Translations kept in IndexedDB (see getTranslationStore()) carry their SHA-256
// beside them. For files in OPFS, which version each is gets recorded per
// machine, in localStorage, never in core.db: a backup carries core.db to other machines,
// whose files may differ. Each record is { sha256, size, lastModified } by OPFS
// path. Every write of a file sets or forgets its record; a record whose size or
// lastModified no longer matches the file is ignored too. A file with no usable
// record is hashed once, in the background: that is every file on an install
// from before this, and every file after "Clear site data" in Firefox, which
// clears localStorage but leaves OPFS.

const INSTALLED_FILES_KEY = 'ember.installedFiles';
const REFERENCE_CATALOG_URL = './data/reference-catalog.json';
const DATA_UPDATE_DELAY_MS = 5000; // after the reference downloads have started

let _dataUpdateCheck = null;
const _dataUpdateWarned = new Set();

async function sha256Hex(bytes) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function readInstalledFiles() {
    try {
        return JSON.parse(localStorage.getItem(INSTALLED_FILES_KEY)) ?? {};
    } catch (_) {
        return {};
    }
}

function writeInstalledFiles(records) {
    try { localStorage.setItem(INSTALLED_FILES_KEY, JSON.stringify(records)); } catch (_) {}
}

function forgetInstalledFile(path) {
    const records = readInstalledFiles();
    if (!(path in records)) return;
    delete records[path];
    writeInstalledFiles(records);
}

async function recordInstalledFile(path, sha256) {
    const file = await getOpfsFileAt(path);
    if (!file) return forgetInstalledFile(path);
    const records = readInstalledFiles();
    records[path] = { sha256, size: file.size, lastModified: file.lastModified };
    writeInstalledFiles(records);
}

// `path` is 'language.db' or 'translations/kjv.db'. The File, or null.
async function getOpfsFileAt(path) {
    try {
        let directory = await navigator.storage.getDirectory();
        const parts = path.split('/');
        for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
        return await (await directory.getFileHandle(parts.at(-1))).getFile();
    } catch (_) {
        return null;
    }
}

// The installed file's SHA-256, from its record if that still matches the file,
// otherwise by hashing it (and recording the result). Null when the file is
// missing or not whole: seeding and the reference downloads deal with those.
async function installedSha256(path) {
    const file = await getOpfsFileAt(path);
    if (!file || !await isCompleteSqliteFile(file)) return null;
    const record = readInstalledFiles()[path];
    if (record && record.size === file.size && record.lastModified === file.lastModified) return record.sha256;
    const sha256 = await sha256Hex(await file.arrayBuffer());
    const records = readInstalledFiles();
    records[path] = { sha256, size: file.size, lastModified: file.lastModified };
    writeInstalledFiles(records);
    return sha256;
}

async function writeOpfsFile(directory, filename, bytes) {
    const handle   = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
}

async function fetchCheckedBytes(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    return new Uint8Array(await response.arrayBuffer());
}

// Starts the check once, a while after launch. Returns the same promise to
// every caller (tests wait on it): it resolves to the list of paths replaced,
// and never rejects.
export function checkForDataUpdates({ delayMs = DATA_UPDATE_DELAY_MS } = {}) {
    if (!_dataUpdateCheck) {
        _dataUpdateCheck = new Promise(resolve => setTimeout(resolve, delayMs))
            .then(runDataUpdates)
            .catch(e => {
                console.warn('Data update check stopped:', e);
                return [];
            });
    }
    return _dataUpdateCheck;
}

async function runDataUpdates() {
    const store = await getTranslationStore();
    const referencesInOpfs = await canWriteOpfs();
    if (navigator.onLine === false || (!store && !referencesInOpfs)) return [];
    let translations, references;
    try {
        translations = await fetchTranslationCatalog();
        const response = await fetch(REFERENCE_CATALOG_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching the reference catalog`);
        references = (await response.json()).files;
    } catch (e) {
        // No connection, most likely: the next online launch tries again.
        console.warn('Data update check skipped:', e.message);
        return [];
    }

    const updated = [];
    for (const entry of store ? translations : []) {
        if (!isTranslationInstalled(entry.id)) continue;
        const path = `translations/${entry.filename}`;
        await updateIfChanged(path, () => store.sha256(entry.filename), entry.sha256,
            () => updateTranslationFile(store, entry), updated);
    }
    for (const source of referencesInOpfs ? [LANGUAGE_DB, HEBREW_LEXICON_DB, CONTEXT_DB] : []) {
        const entry = references.find(file => file.filename === source.file);
        if (!entry || _opfsDownloads.has(source.file)) continue;
        await updateIfChanged(source.file, () => installedSha256(source.file), entry.sha256,
            () => updateReferenceFile(source, entry), updated);
    }
    if (updated.length) console.log(`Updated ${updated.join(', ')}; in use from the next launch.`);
    return updated;
}

async function updateIfChanged(path, getInstalledSha256, catalogSha256, update, updated) {
    try {
        const installed = await getInstalledSha256();
        if (!installed || installed === catalogSha256) return;
        if (await update()) updated.push(path);
    } catch (e) {
        // The old file stays. One warning per file per session.
        if (_dataUpdateWarned.has(path)) return;
        _dataUpdateWarned.add(path);
        console.warn(`Could not update ${path}; keeping the installed copy:`, e.message);
    }
}

function isTranslationInstalled(id) {
    return queryOne(db, 'SELECT 1 FROM translations WHERE id = ?', [id]) !== null;
}

// Checked like Add (sha256, meta, verse count) before it's written. Returns
// false if the translation was removed meanwhile, so nothing is written.
async function updateTranslationFile(store, entry) {
    const bytes = await fetchCheckedBytes(`./data/translations/${entry.filename}`);
    const database = await openCheckedTranslation(entry, bytes);
    database.close();
    if (!isTranslationInstalled(entry.id)) return false;
    await store.write(entry.filename, bytes, entry.sha256);
    return true;
}

// Checked by sha256 and the SQLite header before it's written. Only a file
// already whole gets here, so the downloader (which only fetches a missing or
// partial one) never runs on it meanwhile; one in flight was skipped above.
// Not registered as a download, which would show the Language tab's
// "downloading" message while the old file is still perfectly usable.
async function updateReferenceFile(source, entry) {
    const bytes = await fetchCheckedBytes(source.url);
    const sha256 = await sha256Hex(bytes);
    if (sha256 !== entry.sha256) throw new Error(`downloaded sha256 ${sha256} is not the catalog's ${entry.sha256}`);
    if (!await isCompleteSqliteFile(new Blob([bytes]))) throw new Error('downloaded file is not a whole SQLite file');
    if (_opfsDownloads.has(source.file)) return false;
    await writeOpfsFile(await navigator.storage.getDirectory(), source.file, bytes);
    await recordInstalledFile(source.file, entry.sha256);
    return true;
}

// ============================================================
// Reference DBs, lazy-loaded: language.db (TAHOT/TAGNT/TBESG, Build 6),
// lexicon-hebrew.db (Hebrew_Lexicon_Spec) and context.db (Info_Tab_Spec)
// ============================================================
//
// Unlike translations (every installed one opened eagerly at init — small files,
// always needed), these are read-only reference data most sessions may never open
// (~64 MB and ~4 MB). Getting one onto the device and opening it are separate
// steps: startReferenceDbDownloads() streams each file into OPFS shortly after
// launch, so it is there before the user next goes offline, but nothing loads
// it into memory until something first needs it: the Language tab or a titled
// Psalm for language.db, a Lexicon tap on a Hebrew word for lexicon-hebrew.db,
// the Info tab's Chapter section for context.db (under 1 MB, so it's usually
// opened at launch).
// Once opened, the handle is cached for the rest of the session. Neither is
// ever part of the db.export()/saveToStorage() write cycle.

const REFERENCE_DOWNLOAD_DELAY_MS = 2000; // keeps it clear of first render
const SQLITE_MAGIC = 'SQLite format 3\0';

const LANGUAGE_DB = {
    file: 'language.db',
    url: './data/language.db',
    downloadStartedEvent: 'language-download-started',
    unavailableWarning: 'Original-language data is not available yet:',
    database: null, opening: null, warned: false,
};

const HEBREW_LEXICON_DB = {
    file: 'lexicon-hebrew.db',
    url: './data/lexicon-hebrew.db',
    downloadStartedEvent: null,
    unavailableWarning: 'The Hebrew lexicon is not available yet:',
    database: null, opening: null, warned: false,
};

const CONTEXT_DB = {
    file: 'context.db',
    url: './data/context.db',
    downloadStartedEvent: null,
    unavailableWarning: 'People and places are not available yet:',
    database: null, opening: null, warned: false,
};

function getLanguageDb() {
    return openReferenceDb(LANGUAGE_DB);
}

function openReferenceDb(source) {
    if (source.database) return Promise.resolve(source.database);
    if (source.opening) return source.opening;

    source.opening = (async () => {
        const buffer = await loadReferenceBuffer(source);
        source.database = new _SQL.Database(new Uint8Array(buffer));
        return source.database;
    })().catch(e => {
        // Not cached: the next use tries again, so it recovers without a
        // reload once the network is back.
        source.opening = null;
        throw e;
    });
    return source.opening;
}

// Being offline with a file not downloaded yet is an expected state with its
// own message in the Language tab, not an error — one warning per file per
// session is enough, however many selections, Psalm titles and Lexicon taps
// run into it.
function warnReferenceDbUnavailable(source, e) {
    if (source.warned) return;
    source.warned = true;
    console.warn(source.unavailableWarning, e.message);
}

export function warnLanguageUnavailable(e) {
    warnReferenceDbUnavailable(LANGUAGE_DB, e);
}

export function warnHebrewLexiconUnavailable(e) {
    warnReferenceDbUnavailable(HEBREW_LEXICON_DB, e);
}

export function isLanguageDownloading() {
    return _opfsDownloads.has(LANGUAGE_DB.file);
}

// OPFS is the primary store; a download into OPFS is how it gets there, shared
// with the background step so there is only ever one. A plain fetch into memory
// remains for browsers that can't write OPFS, and for a write that fails (quota).
async function loadReferenceBuffer(source) {
    const file = await getCompleteOpfsFile(source.file);
    if (file) return await file.arrayBuffer();

    // `false` is reliable; `true` only means "maybe", so that case just tries.
    if (navigator.onLine === false) throw new Error('the browser is offline');

    if (await canWriteOpfs()) {
        try {
            await downloadReferenceDb(source);
            const downloaded = await getCompleteOpfsFile(source.file);
            if (downloaded) return await downloaded.arrayBuffer();
        } catch (e) {
            // File system calls reject with a DOMException; anything else is
            // the network or the response itself, which a second fetch won't fix.
            if (!(e instanceof DOMException)) throw e;
            console.warn(`loadReferenceBuffer: could not store ${source.file}, keeping it in memory for this session:`, e);
        }
    }

    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${source.file}`);
    return await response.arrayBuffer();
}

// Called once the app is live. Only ever puts the files on disk — it must not
// create a Database, which would cost every session the memory the lazy open
// exists to save. If one can't finish now it tries again the next time the
// browser reports coming online; openReferenceDb() also retries on its next use.
export function startReferenceDbDownloads() {
    setTimeout(() => {
        downloadReferenceDbInBackground(CONTEXT_DB);
        downloadReferenceDbInBackground(LANGUAGE_DB);
        downloadReferenceDbInBackground(HEBREW_LEXICON_DB);
    }, REFERENCE_DOWNLOAD_DELAY_MS);
}

async function downloadReferenceDbInBackground(source) {
    if (source.database || !await canWriteOpfs()) return;
    if (await getCompleteOpfsFile(source.file)) return;

    try {
        if (navigator.onLine === false) throw new Error('the browser is offline');
        await downloadReferenceDb(source);
    } catch (e) {
        warnReferenceDbUnavailable(source, e);
        window.addEventListener('online', () => downloadReferenceDbInBackground(source), { once: true });
    }
}

function downloadReferenceDb(source) {
    const alreadyDownloading = _opfsDownloads.has(source.file);
    const download = downloadToOpfs(source.file, source.url);
    if (!alreadyDownloading && source.downloadStartedEvent) {
        document.dispatchEvent(new CustomEvent(source.downloadStartedEvent));
    }
    return download;
}

// ---- Downloading a read-only .db file into OPFS ----------------------------

const _opfsDownloads = new Map(); // filename -> in-flight download promise

// Whether this browser can write OPFS files: the API is there, including
// createWritable (missing in older Safari), and getDirectory isn't refused (as
// in some private modes). Asked once per session.
let _opfsWritable = null;

function canWriteOpfs() {
    if (!_opfsWritable) {
        _opfsWritable = (async () => {
            if (!('storage' in navigator && 'getDirectory' in navigator.storage
                && 'FileSystemFileHandle' in window && 'createWritable' in FileSystemFileHandle.prototype)) return false;
            try {
                await navigator.storage.getDirectory();
                return true;
            } catch (_) {
                return false;
            }
        })();
    }
    return _opfsWritable;
}

// Streams `url` into OPFS as `filename`, joining a download of that file already
// in flight. Rejects if the file isn't whole afterwards. The response is piped
// rather than buffered, so a large file never sits in memory on its way to disk.
function downloadToOpfs(filename, url) {
    if (_opfsDownloads.has(filename)) return _opfsDownloads.get(filename);

    const download = (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${filename}`);
        const root     = await navigator.storage.getDirectory();
        const handle   = await root.getFileHandle(filename, { create: true });
        const writable = await handle.createWritable();
        await response.body.pipeTo(writable);
        forgetInstalledFile(filename);
        if (!await getCompleteOpfsFile(filename)) throw new Error(`${filename} arrived incomplete`);
    })().finally(() => _opfsDownloads.delete(filename));

    _opfsDownloads.set(filename, download);
    return download;
}

// The OPFS file if it is there and whole, otherwise null. "There" isn't enough:
// getFileHandle(create) leaves an empty file in place as soon as a download
// starts, and createWritable only swaps the data in when it closes, so a tab
// closed mid-download leaves a 0-byte file behind. The next download overwrites
// whatever fails this check, so nothing needs deleting.
async function getCompleteOpfsFile(filename) {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) return null;
    try {
        const root   = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(filename);
        const file   = await handle.getFile();
        return await isCompleteSqliteFile(file) ? file : null;
    } catch (_) {
        return null;
    }
}

// Reads only the 100-byte SQLite header, so it costs nothing at startup: the
// magic string, then page size x page count against the real file size. The
// page count is only meaningful while the file's version-valid-for number
// (offset 92) matches its change counter (offset 24); a file where they differ
// can't be judged, and counts as whole rather than being re-downloaded on every
// boot. Every .db this app ships passes the real check (tests/verify.py offline).
async function isCompleteSqliteFile(file) {
    if (file.size < 100) return false;
    const bytes  = await file.slice(0, 100).arrayBuffer();
    const header = new DataView(bytes);
    const magic  = String.fromCharCode(...new Uint8Array(bytes, 0, SQLITE_MAGIC.length));
    if (magic !== SQLITE_MAGIC) return false;
    if (header.getUint32(24) !== header.getUint32(92)) return true;
    const pageSize = header.getUint16(16) === 1 ? 65536 : header.getUint16(16);
    return pageSize * header.getUint32(28) === file.size;
}

// Ensure all user-writable tables exist (idempotent — safe to run on every init).
// The shipped core.db already contains these, but this guards against schema drift.
function createUserTables() {
    db.run(`
        CREATE TABLE IF NOT EXISTS studies (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL DEFAULT 'Untitled Study',
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            modified_at TEXT NOT NULL DEFAULT (datetime('now')),
            status      TEXT NOT NULL DEFAULT 'active'
        );
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_studies_status   ON studies(status);
        CREATE INDEX IF NOT EXISTS idx_studies_modified ON studies(modified_at);
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS notes (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            body                TEXT NOT NULL DEFAULT '',
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            modified_at         TEXT NOT NULL DEFAULT (datetime('now')),
            visibility          TEXT NOT NULL DEFAULT 'private',
            parent_note_id      INTEGER,
            template_session_id INTEGER,
            study_id            INTEGER,
            FOREIGN KEY (parent_note_id)      REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (template_session_id) REFERENCES session_records(id),
            FOREIGN KEY (study_id)            REFERENCES studies(id)
        );
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_note_id);
        CREATE INDEX IF NOT EXISTS idx_notes_study  ON notes(study_id);
    `);

    // Ensure notes_fts exists as fts4. If a previous version stored it as fts5
    // (which sql.js WASM does not support), migrate it.
    // Strategy: read the current schema, then create/recreate as needed.
    const noteFtsSql = (queryValue(db,
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes_fts'"
    ) || '').toLowerCase();

    if (noteFtsSql.includes('fts5')) {
        // DROP TABLE requires the fts5 module (xDestroy), which isn't available.
        // Remove schema entries directly instead.
        db.run('PRAGMA writable_schema=ON');
        db.run("DELETE FROM sqlite_master WHERE name='notes_fts' OR name LIKE 'notes_fts_%'");
        db.run('PRAGMA writable_schema=OFF');
        // After writing sqlite_master directly the in-memory schema cache still
        // reflects the old state — CREATE without IF NOT EXISTS forces it to run.
        db.run(`CREATE VIRTUAL TABLE notes_fts USING fts4(content="notes", body)`);
    } else if (!noteFtsSql) {
        // First run — table doesn't exist yet.
        db.run(`CREATE VIRTUAL TABLE notes_fts USING fts4(content="notes", body)`);
    }
    // else: already fts4 — nothing to do.

    // Repopulate fts index if it is empty but notes exist (post-migration).
    try {
        const ftsCount  = queryValue(db, 'SELECT COUNT(*) FROM notes_fts');
        const noteCount = queryValue(db, 'SELECT COUNT(*) FROM notes');
        if (ftsCount === 0 && noteCount > 0) {
            db.run('INSERT INTO notes_fts(rowid, body) SELECT id, body FROM notes');
        }
    } catch (_) {}

    db.run(`
        CREATE TABLE IF NOT EXISTS note_anchors (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id        INTEGER NOT NULL,
            verse_start    INTEGER NOT NULL,
            verse_end      INTEGER,
            word_position  INTEGER,
            strongs_number TEXT,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_anchors_note  ON note_anchors(note_id);
        CREATE INDEX IF NOT EXISTS idx_anchors_verse ON note_anchors(verse_start);
        CREATE INDEX IF NOT EXISTS idx_anchors_long  ON note_anchors(verse_start) WHERE ${IS_LONG_ANCHOR};
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tags (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL DEFAULT 'tag'
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tag_assignments (
            tag_id  INTEGER NOT NULL,
            note_id INTEGER NOT NULL,
            PRIMARY KEY (tag_id, note_id),
            FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_tagassign_note ON tag_assignments(note_id);
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS bookmarks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            verse_id   INTEGER NOT NULL,
            label      TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bookmarks_verse ON bookmarks(verse_id);
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS markups (
            id          INTEGER PRIMARY KEY,
            verse_start INTEGER NOT NULL,
            verse_end   INTEGER,
            type        TEXT NOT NULL,
            color       TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        );
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_markups_verse ON markups(verse_start);
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS app_state (
            key   TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS study_templates (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            description TEXT
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS template_steps (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            step_index  INTEGER NOT NULL,
            prompt_text TEXT NOT NULL,
            FOREIGN KEY (template_id) REFERENCES study_templates(id) ON DELETE CASCADE
        );
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_template_steps_template ON template_steps(template_id);
    `);

    // Build 5: study/note linkage to templates (idempotent).
    // NULL = freeform study/note (the vast majority of both).
    try { db.run('ALTER TABLE studies ADD COLUMN template_id INTEGER REFERENCES study_templates(id)'); } catch (_) {}
    try { db.run('ALTER TABLE notes ADD COLUMN template_step_id INTEGER REFERENCES template_steps(id)'); } catch (_) {}

    // WEB is shown verse-only (no headings, footnotes or speaker labels), so it
    // is named that way, at eBible.org's request for changed editions. Renames
    // the row in core.db files made before, including restored backups.
    db.run(`UPDATE translations SET name = 'Verse-only World English Bible'
            WHERE filename = 'web.db' AND name = 'World English Bible'`);

    // Future drag-to-reorder: position column on notes (idempotent).
    // NULL = use created_at order. Will be populated when ordering is implemented.
    try { db.run('ALTER TABLE notes ADD COLUMN position REAL'); } catch (_) {}

    // Which bundled plans (by plan_id) and templates (by name) this install has
    // ever installed. The seeders skip anything listed here, so a bundled plan
    // the user deleted stays deleted.
    db.run(`
        CREATE TABLE IF NOT EXISTS bundled_installs (
            kind TEXT NOT NULL CHECK(kind IN ('plan','template')),
            key  TEXT NOT NULL,
            PRIMARY KEY (kind, key)
        );
    `);

    migratePlanTables();
    recordBundledAlreadyPresent();
    ensureMetaTable();
    repairNotesSearchIndexOnce();
}

// updateNote() used to update `notes` before deleting from `notes_fts`, which
// left every edited note's old words in the index and made PRAGMA
// integrity_check report it as malformed (see updateNote). Rebuilding from
// `notes` repairs that. The marker lives in core.db itself, so restoring a
// backup made before the fix repairs that file too.
function repairNotesSearchIndexOnce() {
    if (getState(NOTES_FTS_REPAIRED_KEY)) return;
    if (queryValue(db, 'SELECT COUNT(*) FROM notes') > 0) {
        db.run("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')");
    }
    setState(NOTES_FTS_REPAIRED_KEY, '1');
}

// Build 4: single-row descriptive table. Created idempotently; the row is
// inserted once, on first creation, and never updated after that — created_at
// marks when this core.db was first initialized, not when it was last backed up.
function ensureMetaTable() {
    db.run(`
        CREATE TABLE IF NOT EXISTS meta (
            schema_version INTEGER NOT NULL,
            created_at     INTEGER NOT NULL,
            app_name       TEXT NOT NULL DEFAULT 'Ember Bible Study'
        );
    `);

    const rowCount = queryValue(db, 'SELECT COUNT(*) FROM meta');
    if (rowCount === 0) {
        db.run(
            'INSERT INTO meta (schema_version, created_at, app_name) VALUES (?, ?, ?)',
            [1, Math.floor(Date.now() / 1000), 'Ember Bible Study']
        );
        // migratePlanTables()'s DDL relies on some later write in the boot to
        // persist it; meta's one-time row can't rely on that (an upgrade boot
        // where plans/translations are already seeded may write nothing else),
        // so it saves explicitly to guarantee created_at is never regenerated.
        saveToStorage(db.export());
    }
}

// Build 3: replace the Build 1 placeholder plan tables with the reading-plans
// schema. Detected by checking whether plans.plan_id is missing — if the
// table exists but lacks that column, it's the old placeholder shape.
function migratePlanTables() {
    const planCols = queryAll(db, 'PRAGMA table_info(plans)');
    const isLegacyPlansTable = planCols.length > 0 && !planCols.some(col => col.name === 'plan_id');

    if (isLegacyPlansTable) {
        db.run('DROP TABLE IF EXISTS plan_progress');
        db.run('DROP TABLE IF EXISTS plan_days');
        db.run('DROP TABLE IF EXISTS plans');
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS plans (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id           TEXT UNIQUE NOT NULL,
            title             TEXT NOT NULL,
            description       TEXT,
            author            TEXT,
            language          TEXT DEFAULT 'en',
            duration_days     INTEGER NOT NULL,
            tags              TEXT,
            schema_version    INTEGER DEFAULT 1,
            source            TEXT NOT NULL,
            imported_at       INTEGER NOT NULL,
            current_step      INTEGER NOT NULL DEFAULT 0,
            status            TEXT NOT NULL DEFAULT 'not_started'
                              CHECK(status IN ('not_started','active','completed'))
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS plan_days (
            plan_id                   INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
            day_number                INTEGER NOT NULL,
            title                     TEXT,
            devotional_title          TEXT,
            devotional_body           TEXT,
            reflection_questions_json TEXT,
            PRIMARY KEY (plan_id, day_number)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS plan_day_scripture (
            plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
            day_number  INTEGER NOT NULL,
            sequence    INTEGER NOT NULL,
            ref         TEXT NOT NULL,
            display     TEXT NOT NULL,
            book        INTEGER NOT NULL,
            chapter     INTEGER NOT NULL,
            verse_start INTEGER NOT NULL,
            verse_end   INTEGER,
            PRIMARY KEY (plan_id, day_number, sequence)
        );
    `);
}

// Insert a full plan (plans + plan_days + plan_day_scripture rows) and persist.
// `meta` fields: id, title, description, author, language, duration_days, tags,
// schema_version, current_step (all but id/title/duration_days optional).
// `days`: [{ day_number, title?, devotional_title?, devotional_body?,
//            reflection_questions_json?, scripture: [{ ref, display }] }].
// Throws an Error with `.code === 'DUPLICATE_PLAN_ID'` if meta.id is already
// installed. Returns { planRowId, approximateCount, unresolvedCount }.
export function insertPlan(meta, days, source) {
    if (queryOne(db, 'SELECT id FROM plans WHERE plan_id = ?', [meta.id])) {
        const err = new Error(`Plan already installed: ${meta.id}`);
        err.code = 'DUPLICATE_PLAN_ID';
        throw err;
    }

    const durationDays = meta.duration_days;
    let currentStep = meta.current_step ?? 0;
    let status = 'not_started';
    if (currentStep >= durationDays) {
        currentStep = durationDays;
        status = 'completed';
    } else if (currentStep > 0) {
        status = 'active';
    }

    db.run(
        `INSERT INTO plans (plan_id, title, description, author, language, duration_days, tags, schema_version, source, imported_at, current_step, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            meta.id,
            meta.title,
            meta.description ?? null,
            meta.author ?? null,
            meta.language ?? 'en',
            durationDays,
            JSON.stringify(meta.tags ?? []),
            meta.schema_version ?? 1,
            source,
            Math.floor(Date.now() / 1000),
            currentStep,
            status
        ]
    );

    const planRowId = lastInsertRowId();
    let approximateCount = 0;
    let unresolvedCount = 0;

    for (const day of days) {
        db.run(
            `INSERT INTO plan_days (plan_id, day_number, title, devotional_title, devotional_body, reflection_questions_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                planRowId,
                day.day_number,
                day.title ?? null,
                day.devotional_title ?? null,
                day.devotional_body ?? null,
                day.reflection_questions_json ?? null
            ]
        );

        let sequence = 0;
        for (const passage of day.scripture) {
            sequence++;
            const resolved = resolveUsfmRef(passage.ref);
            if (!resolved) {
                unresolvedCount++;
                console.error(`insertPlan: could not resolve ref "${passage.ref}" for plan "${meta.id}" day ${day.day_number} — skipping passage.`);
                continue;
            }
            if (resolved.approximate) approximateCount++;
            db.run(
                `INSERT INTO plan_day_scripture (plan_id, day_number, sequence, ref, display, book, chapter, verse_start, verse_end)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [planRowId, day.day_number, sequence, passage.ref, passage.display,
                 resolved.book, resolved.chapter, resolved.verseStart, resolved.verseEnd]
            );
        }
    }

    saveToStorage(db.export());
    return { planRowId, approximateCount, unresolvedCount };
}

// The seeders below run on every boot, so a network failure (fetch rejects with
// a TypeError) is routine for an offline user. A bad response or unparseable
// file is a packaging bug and stays an error.
function logSeedLoadFailure(message, e) {
    (e instanceof TypeError ? console.warn : console.error)(message, e);
}

function isBundledInstalled(kind, key) {
    return !!queryOne(db, 'SELECT 1 FROM bundled_installs WHERE kind = ? AND key = ?', [kind, key]);
}

// Not saved here: the seeders record before inserting, so insertPlan() and
// insertTemplate() save the row along with what they install.
function recordBundledInstalled(kind, key) {
    db.run('INSERT OR IGNORE INTO bundled_installs (kind, key) VALUES (?, ?)', [kind, key]);
}

// Installs from before bundled_installs existed (and backups restored from
// them) have no list yet. Every bundled plan or template they still hold has
// been installed, so it goes on the list; one deleted before the upgrade isn't
// known to the list, and comes back once. Runs every boot, offline too, so the
// list is complete before the user can delete anything. Templates have no
// source column, but every template is bundled until users can create them.
function recordBundledAlreadyPresent() {
    db.run(`INSERT OR IGNORE INTO bundled_installs (kind, key)
            SELECT 'plan', plan_id FROM plans WHERE source = 'bundled'`);
    db.run(`INSERT OR IGNORE INTO bundled_installs (kind, key)
            SELECT 'template', name FROM study_templates`);
}

// Seed the bundled reading plans from data/plans/ on every online boot, so a
// newly bundled plan reaches existing installs. A plan on the bundled_installs
// list is skipped before its file is fetched, even if the user has since
// deleted it; the Plans tab's "Restore bundled plans" is the way back.
async function seedBundledPlans() {
    if (navigator.onLine === false) return;
    for (const { id, file: filename } of BUNDLED_PLANS) {
        if (isBundledInstalled('plan', id)) continue;
        let plan;
        try {
            plan = await fetchBundledPlan(id, filename);
        } catch (e) {
            logSeedLoadFailure(`seedBundledPlans: failed to load ${filename}:`, e);
            continue;
        }

        const meta = plan.plan_metadata;
        let result;
        try {
            recordBundledInstalled('plan', meta.id);
            result = insertPlan(meta, plan.days, 'bundled');
        } catch (e) {
            // Already present (the user imported this file): it stays listed.
            if (e.code === 'DUPLICATE_PLAN_ID') continue;
            console.error(`seedBundledPlans: failed to seed ${filename}:`, e);
            db.run("DELETE FROM bundled_installs WHERE kind = 'plan' AND key = ?", [meta.id]);
            continue;
        }

        console.log(
            `seedBundledPlans: seeded "${meta.title}" (${plan.days.length} days, ` +
            `${result.approximateCount} approximate ranges, ${result.unresolvedCount} unresolved refs)`
        );
    }
}

async function fetchBundledPlan(id, filename) {
    const response = await fetch(`./data/plans/${filename}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const plan = await response.json();
    if (plan.plan_metadata?.id !== id) throw new Error(`${filename} holds plan "${plan.plan_metadata?.id}", not "${id}"`);
    return plan;
}

// Bundled plans not installed now: deleted by the user (they stay on the
// bundled_installs list, so seeding skips them), or never seeded. A plan the
// user imported with the same plan_id counts as installed.
export function getMissingBundledPlanCount() {
    const installed = new Set(queryAll(db, 'SELECT plan_id FROM plans').map(row => row.plan_id));
    return BUNDLED_PLANS.filter(plan => !installed.has(plan.id)).length;
}

// Installs every missing bundled plan again, fresh (Day 1, not started).
// Needs a connection, since the plans come from data/plans/. Returns how many
// were restored; throws with a message fit to show if none could be.
export async function restoreBundledPlans() {
    if (navigator.onLine === false) {
        throw new Error('You’re offline. Connect to the internet to restore the bundled plans.');
    }
    const installed = new Set(queryAll(db, 'SELECT plan_id FROM plans').map(row => row.plan_id));
    const missing = BUNDLED_PLANS.filter(plan => !installed.has(plan.id));
    let restored = 0;
    for (const { id, file } of missing) {
        try {
            const plan = await fetchBundledPlan(id, file);
            insertPlan(plan.plan_metadata, plan.days, 'bundled');
            recordBundledInstalled('plan', id);
            restored++;
        } catch (e) {
            console.warn(`restoreBundledPlans: ${file} not restored:`, e);
        }
    }
    if (restored) saveToStorage(db.export());
    if (restored < missing.length) {
        throw new Error(restored
            ? `Restored ${restored} of ${missing.length} plans. Check your connection and try again for the rest.`
            : 'The bundled plans could not be downloaded. Check your connection and try again.');
    }
    return restored;
}

// Insert a study template (study_templates + template_steps rows) and persist.
// `meta`: { name, description }. `steps`: [{ step_index, prompt_text }, ...].
// Throws an Error with `.code === 'DUPLICATE_TEMPLATE_NAME'` if a template
// with this name is already installed — study_templates has no separate
// stable key column (see Build_5_Spec.md Item 1), so name is the dedupe key.
function insertTemplate(meta, steps) {
    if (queryOne(db, 'SELECT id FROM study_templates WHERE name = ?', [meta.name])) {
        const err = new Error(`Template already installed: ${meta.name}`);
        err.code = 'DUPLICATE_TEMPLATE_NAME';
        throw err;
    }

    db.run(
        'INSERT INTO study_templates (name, description) VALUES (?, ?)',
        [meta.name, meta.description ?? null]
    );
    const templateRowId = lastInsertRowId();

    for (const step of steps) {
        db.run(
            'INSERT INTO template_steps (template_id, step_index, prompt_text) VALUES (?, ?, ?)',
            [templateRowId, step.step_index, step.prompt_text]
        );
    }

    saveToStorage(db.export());
    return { templateRowId };
}

// Seed the built-in study templates from data/templates/ on every online boot.
// Like the plans, a template on the bundled_installs list (by name) is skipped.
async function seedBundledTemplates() {
    if (navigator.onLine === false) return;
    for (const filename of BUNDLED_TEMPLATE_FILES) {
        let template;
        try {
            const response = await fetch(`./data/templates/${filename}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            template = await response.json();
        } catch (e) {
            logSeedLoadFailure(`seedBundledTemplates: failed to load ${filename}:`, e);
            continue;
        }

        const meta = template.template_metadata;
        if (isBundledInstalled('template', meta.name)) continue;
        try {
            recordBundledInstalled('template', meta.name);
            insertTemplate(meta, template.steps);
        } catch (e) {
            if (e.code === 'DUPLICATE_TEMPLATE_NAME') continue; // already present
            console.error(`seedBundledTemplates: failed to seed ${filename}:`, e);
            db.run("DELETE FROM bundled_installs WHERE kind = 'template' AND key = ?", [meta.name]);
            continue;
        }

        console.log(`seedBundledTemplates: seeded "${meta.name}" (${template.steps.length} steps)`);
    }
}

// Returns all built-in study templates, ordered by id (seed order — see
// BUNDLED_TEMPLATE_FILES). Only three exist today, so no filter/sort needed.
export function getStudyTemplates() {
    return queryAll(db, 'SELECT id, name, description FROM study_templates ORDER BY id');
}

// Returns all installed plans, sorted active (in progress) first, then
// not_started, then completed; alphabetically by title within each group.
export function getPlans() {
    return queryAll(db, `
        SELECT id, plan_id, title, description, author, duration_days, source, current_step, status
        FROM plans
        ORDER BY
            CASE status WHEN 'active' THEN 0 WHEN 'not_started' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
            title COLLATE NOCASE
    `);
}

// Deletes a plan and its days/scripture rows. ON DELETE CASCADE is declared
// on those tables but sql.js does not enforce foreign keys by default, so
// the child rows are removed explicitly here rather than relied on.
export function deletePlan(planRowId) {
    db.run('DELETE FROM plan_day_scripture WHERE plan_id = ?', [planRowId]);
    db.run('DELETE FROM plan_days WHERE plan_id = ?', [planRowId]);
    db.run('DELETE FROM plans WHERE id = ?', [planRowId]);
    saveToStorage(db.export());
}

// Full detail for the plan popover: plan fields plus every day with its
// optional title and the display string of its first (sequence=1) passage.
export function getPlanDetail(planRowId) {
    const plan = queryOne(db,
        `SELECT id, plan_id, title, description, author, duration_days, current_step, status
         FROM plans WHERE id = ?`,
        [planRowId]
    );
    if (!plan) return null;

    const dayRows = queryAll(db,
        'SELECT day_number, title FROM plan_days WHERE plan_id = ? ORDER BY day_number',
        [planRowId]
    );

    const firstPassageRows = queryAll(db,
        'SELECT day_number, display FROM plan_day_scripture WHERE plan_id = ? AND sequence = 1',
        [planRowId]
    );
    const firstPassageByDay = new Map(firstPassageRows.map(r => [r.day_number, r.display]));

    const days = dayRows.map(({ day_number, title }) => ({
        day_number,
        title,
        first_passage_display: firstPassageByDay.get(day_number) ?? null
    }));

    return { ...plan, days };
}

// Sets current_step to dayNumber and recomputes status (active, or
// completed if dayNumber reaches duration_days). Used by both Continue and
// clicking a specific day row in the plan detail popover.
export function setPlanProgress(planRowId, dayNumber) {
    const durationDays = queryValue(db, 'SELECT duration_days FROM plans WHERE id = ?', [planRowId]);
    if (durationDays === null) return;
    const status = dayNumber >= durationDays ? 'completed' : 'active';
    db.run('UPDATE plans SET current_step = ?, status = ? WHERE id = ?', [dayNumber, status, planRowId]);
    saveToStorage(db.export());
}

// Resets a plan to its pre-start state. Days and scripture rows are untouched.
export function restartPlan(planRowId) {
    db.run(`UPDATE plans SET current_step = 0, status = 'not_started' WHERE id = ?`, [planRowId]);
    saveToStorage(db.export());
}

// Minimal plan fields needed by the template bar (no days/scripture).
export function getPlan(planRowId) {
    return queryOne(db,
        'SELECT id, plan_id, title, duration_days, current_step, status FROM plans WHERE id = ?',
        [planRowId]
    );
}

// Every passage for one day, in sequence order, with pre-resolved
// book/chapter/verse for navigation.
export function getPlanDayScripture(planRowId, dayNumber) {
    return queryAll(db,
        `SELECT sequence, ref, display, book, chapter, verse_start, verse_end
         FROM plan_day_scripture WHERE plan_id = ? AND day_number = ? ORDER BY sequence`,
        [planRowId, dayNumber]
    );
}

// Closes the template bar's hold on a plan without losing progress:
// current_step is preserved, only status reverts. The plan resumes from
// the Plans tab via Continue, same as any other not_started plan.
export function deactivatePlan(planRowId) {
    db.run(`UPDATE plans SET status = 'not_started' WHERE id = ?`, [planRowId]);
    saveToStorage(db.export());
}

// ============================================================
// Backup — manual export and restore of the full core.db
// ============================================================

// Exports the entire current core.db (reference + user data, including the
// meta table) as a downloadable file. Reuses the same db.export() primitive
// every write already calls before handing bytes to storage-worker.js — the
// only difference here is the bytes go to a Blob download instead of OPFS.
export function exportBackup() {
    const bytes = db.export();
    const blob = new Blob([bytes], { type: 'application/octet-stream' });

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const filename = `ember-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.db`;
    downloadFile(blob, filename);
}

// Saves a Blob through the browser's download flow. The URL is revoked a moment
// later rather than at once, which some browsers need to start the download.
export function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Minimal structural check for a candidate restore file: opens `bytes` as a
// throwaway sql.js Database (never touching the live `db`) and confirms a
// `books` table exists. Catches an obviously wrong file (bad extension, an
// unrelated SQLite file) without validating full schema correctness. Never
// throws — any parse failure (not even a SQLite file, corrupt, etc.) is
// treated as "not a valid backup."
export function looksLikeCoreDb(bytes) {
    let testDb = null;
    try {
        testDb = new _SQL.Database(bytes);
        return queryOne(testDb,
            "SELECT name FROM sqlite_master WHERE type='table' AND name='books'"
        ) !== null;
    } catch (e) {
        return false;
    } finally {
        testDb?.close();
    }
}

// Destructively replaces the stored core.db with `bytes`. Unlike
// saveToStorage() (fire-and-forget, off-thread, used for every ordinary
// write), this runs on the main thread and returns a Promise that rejects
// on failure: a destructive restore must not report success — or trigger
// the reload that follows it — on a silent write failure.
//
// Deliberately does NOT fall back from OPFS to IndexedDB the way
// storage-worker.js's ordinary writes do. loadFromStorage() always checks
// OPFS first on the next boot; if OPFS is available but write()/close()
// fails partway (quota, transient error), createWritable() has already
// truncated the target — falling back to IndexedDB here would "succeed"
// while leaving a truncated core.db in OPFS that the next boot reads
// instead of the good IndexedDB copy, i.e. exactly the half-restored state
// this function must not produce. If OPFS is the platform's storage,
// commit to it and let failure reject outright. Where OPFS can't be written
// (canWriteOpfs()), the worker's saves all go to IndexedDB, and so does this.
//
// Ordinary saves go through the storage worker's queue, which this write does not.
// So it first stops new saves and waits for the worker to finish the ones it has:
// otherwise a save already being written could land after the restore, before the
// reload, and the restore would seem not to have taken. On success, saves stay
// stopped until the reload, so nothing can overwrite the restored file. On failure,
// the live database is saved again if anything was held off meanwhile.
export async function restoreCoreDb(bytes) {
    _restoring = true;
    _savedDuringRestore = false;
    try {
        await waitForStorageWorker();
        await writeRestoredCoreDb(bytes);
    } catch (error) {
        _restoring = false;
        if (_savedDuringRestore) saveToStorage(db.export());
        throw error;
    }
}

// Resolves once the storage worker has written every save sent to it so far.
function waitForStorageWorker() {
    if (!_storageWorker) return Promise.resolve();
    return new Promise((resolve) => {
        const onMessage = (event) => {
            if (event.data?.type !== 'idle') return;
            _storageWorker.removeEventListener('message', onMessage);
            resolve();
        };
        _storageWorker.addEventListener('message', onMessage);
        _storageWorker.postMessage({ type: 'idle' });
    });
}

async function writeRestoredCoreDb(bytes) {
    if (await canWriteOpfs()) {
        const root     = await navigator.storage.getDirectory();
        const handle   = await root.getFileHandle('core.db', { create: true });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return;
    }

    // loadFromStorage() reads a non-empty OPFS core.db before IndexedDB. One
    // could only be left from when this browser could write OPFS; the restored
    // copy would never be read over it, so the restore stops instead.
    const opfsCoreDb = await getOpfsFileAt('core.db');
    if (opfsCoreDb?.size > 0) {
        throw new Error('an older core.db in OPFS would be read instead of the restored copy');
    }

    await new Promise((resolve, reject) => {
        const request = indexedDB.open('ScriptureStudy', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('db');
        };
        request.onsuccess = () => {
            const connection = request.result;
            let tx;
            try {
                tx = connection.transaction('db', 'readwrite');
                tx.objectStore('db').put(bytes, 'core');
            } catch (error) {
                connection.close();
                reject(error);
                return;
            }
            tx.oncomplete = () => { connection.close(); resolve(); };
            tx.onerror    = () => { connection.close(); reject(tx.error); };
            tx.onabort    = () => { connection.close(); reject(tx.error); };
        };
        request.onerror = () => reject(request.error);
    });
}

// ============================================================
// Persistence — OPFS with IndexedDB fallback
// ============================================================

// Offload the I/O-bound write to a storage worker so the main thread never
// blocks on OPFS/IndexedDB. db.export() (WASM serialization) still runs
// synchronously here, but the actual disk write is off-thread.
function saveToStorage(data) {
    if (_restoring) {
        // restoreCoreDb() is replacing core.db; see there.
        _savedDuringRestore = true;
        return;
    }
    // Transfer the underlying ArrayBuffer — zero-copy, no clone needed. The worker
    // transfers it back when the write is done (see storage-worker.js); nothing
    // here needs to listen, since all that's left to do is let it be collected.
    getStorageWorker().postMessage(data, [data.buffer]);
}

// Browsers can clear a site's data under storage pressure unless it has been
// granted persistence, and core.db is the only copy of someone's notes. Asked
// once there is something to protect: Chromium decides silently, but Firefox
// shows a prompt, so the first ask waits for a first note and repeats are spaced
// out. Chromium's answer can change later (installing the app, for one).
const PERSIST_REQUESTED_AT_KEY = 'ember.persist_requested_at';
const PERSIST_RETRY_MS = 30 * 24 * 60 * 60 * 1000;

export async function isStoragePersisted() {
    return await navigator.storage?.persisted?.() ?? false;
}

export async function requestPersistentStorageIfDue() {
    if (!navigator.storage?.persist) return;
    if (queryValue(db, 'SELECT COUNT(*) FROM notes') === 0) return;
    if (Date.now() - Number(localStorage.getItem(PERSIST_REQUESTED_AT_KEY)) < PERSIST_RETRY_MS) return;
    try {
        if (await navigator.storage.persisted()) return;
        localStorage.setItem(PERSIST_REQUESTED_AT_KEY, String(Date.now()));
        await navigator.storage.persist();
    } catch (e) {
        console.warn('requestPersistentStorageIfDue: could not request persistent storage:', e);
    }
}

async function loadFromStorage() {
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        try {
            const root = await navigator.storage.getDirectory();
            const handle = await root.getFileHandle('core.db');
            const file = await handle.getFile();
            // Empty means a tab closed during the very first save (see
            // getCompleteOpfsFile), so nothing was ever stored: carry on as a first
            // run. Deliberately no stricter than that. initDatabase() replaces
            // whatever isn't returned here, and this file is someone's notes, so
            // anything else, even if damaged, is left in place to fail visibly.
            if (file.size > 0) return await file.arrayBuffer();
        } catch (e) {
            // Fall through to IndexedDB
        }
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ScriptureStudy', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('db');
        };
        request.onsuccess = () => {
            const tx = request.result.transaction('db', 'readonly');
            const get = tx.objectStore('db').get('core');
            get.onsuccess = () => resolve(get.result || null);
            get.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

// ============================================================
// Verse ID Helpers
// ============================================================

export function makeVerseId(book, chapter, verse) {
    return book * 1000000 + chapter * 1000 + verse;
}

export function parseVerseId(id) {
    const book    = Math.floor(id / 1000000);
    const chapter = Math.floor((id % 1000000) / 1000);
    const verse   = id % 1000;
    return { book, chapter, verse };
}

// Human-readable reference for a verse id or a range of two ids:
//   "Genesis 1:1"   "Genesis 1:1–3"   "Genesis 1:30–2:5"   "Genesis 50:26–Exodus 1:1"
// A null endId, or one equal to startId, formats as a single verse. An
// unknown book id renders as "Book N" rather than throwing. This is the one
// place reference labels are formatted — every chip, heading, result row,
// and tooltip goes through it.
export function formatReference(startId, endId = null) {
    const s    = parseVerseId(startId);
    const name = bookName(s.book);
    if (!endId || endId === startId) return `${name} ${s.chapter}:${s.verse}`;

    const e = parseVerseId(endId);
    if (s.book === e.book && s.chapter === e.chapter) return `${name} ${s.chapter}:${s.verse}–${e.verse}`;
    if (s.book === e.book) return `${name} ${s.chapter}:${s.verse}–${e.chapter}:${e.verse}`;
    return `${name} ${s.chapter}:${s.verse}–${bookName(e.book)} ${e.chapter}:${e.verse}`;
}

// STEPBible's glosses mark prefix/root/suffix boundaries with '/' ("and/ he
// created"): meaningful beside the word's pieces, noise anywhere else.
export function plainGloss(gloss) {
    return (gloss || '').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
}

function bookName(bookId) {
    return getBooks().find(b => b.id === bookId)?.name ?? `Book ${bookId}`;
}

// ============================================================
// Scripture Queries
// ============================================================

export function getChapter(translationId, bookId, chapter) {
    const tdb = _translationDbs.get(translationId) ?? _translationDbs.get(1);
    if (!tdb) return [];
    return queryAll(tdb,
        `SELECT book * 1000000 + chapter * 1000 + verse AS id,
                verse, text
         FROM verses
         WHERE book = ? AND chapter = ?
         ORDER BY verse`,
        [bookId, chapter]
    );
}

// Headings a translation keeps out of its verse text, for the Info tab. Only
// WEB has them (Psalm 119's letters, the Song of Songs speaker labels, the
// Psalms' book divisions); other files have no headings table, so they and
// WEB files built before it give []. Each row is before its verse (offset 0;
// verse 0 is a Psalm title) or inside it, before `following`.
export function getHeadingsForChapter(translationId, bookId, chapter) {
    const tdb = _translationDbs.get(translationId);
    if (!tdb) return [];
    const hasTable = queryValue(tdb,
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'headings'");
    if (!hasTable) return [];
    return queryAll(tdb,
        `SELECT h.book * 1000000 + h.chapter * 1000 + h.verse AS verse_id,
                h.verse, h.offset, h.text,
                CASE WHEN h.offset > 0 THEN substr(v.text, h.offset + 1) END AS following
         FROM headings h
         LEFT JOIN verses v ON v.book = h.book AND v.chapter = h.chapter AND v.verse = h.verse
         WHERE h.book = ? AND h.chapter = ?
         ORDER BY h.verse, h.offset`,
        [bookId, chapter]
    );
}

// How many verses one translation has from startId to endId, across chapters
// and books (the readable export names a long anchor's size rather than quote it).
export function countVersesInRange(translationId, startId, endId) {
    const tdb = _translationDbs.get(translationId) ?? _translationDbs.get(1);
    if (!tdb) return 0;
    const s = parseVerseId(startId);
    const e = parseVerseId(endId);
    return queryValue(tdb,
        'SELECT COUNT(*) FROM verses WHERE (book, chapter, verse) BETWEEN (?, ?, ?) AND (?, ?, ?)',
        [s.book, s.chapter, s.verse, e.book, e.chapter, e.verse], 0);
}

// True if the translation has any verse for (bookId, chapter). Used by the
// reader when switching a pane's translation to keep the passage in view.
export function chapterExistsInTranslation(translationId, bookId, chapter) {
    const tdb = _translationDbs.get(translationId);
    if (!tdb) return true; // unknown handle — let the caller keep its reference
    return queryOne(tdb,
        'SELECT 1 FROM verses WHERE book = ? AND chapter = ? LIMIT 1',
        [bookId, chapter]
    ) !== null;
}

// Translations the reader can show: installed and open. A manifest row whose
// file couldn't be loaded (offline, right after a restore) is left out until
// its download succeeds.
export function getTranslations() {
    return getInstalledTranslations().filter(t => _translationDbs.has(t.id));
}

// Every row in the manifest: what this device has installed, open or not.
// The Translations shelf lists these when the catalog can't be fetched.
export function getInstalledTranslations() {
    return queryAll(db, 'SELECT id, filename, name, abbreviation, year, license FROM translations ORDER BY id');
}

export function getBooks() {
    if (!_booksCache) {
        _booksCache = queryAll(db, 'SELECT id, name, abbrev, testament, genre, chapters FROM books ORDER BY id');
    }
    return _booksCache;
}

export function getBook(bookId) {
    return queryOne(db, 'SELECT * FROM books WHERE id = ?', [bookId]);
}

export function getChapterVerseCount(bookId, chapter) {
    const tdb = _translationDbs.get(1); // always use KJV for canonical count
    if (!tdb) return 0;
    // verse=0 rows are Psalm title placeholders (Psalm_Title_Fix_Spec.md), not
    // real verses — excluded so "N verses" display stays accurate.
    return queryValue(tdb,
        'SELECT COUNT(*) FROM verses WHERE book = ? AND chapter = ? AND verse > 0',
        [bookId, chapter], 0
    );
}

export function getTopicsForVerse(verseId) {
    return queryAll(db,
        `SELECT t.id, t.name FROM topics t
         JOIN topic_verses tv ON tv.topic_id = t.id
         WHERE tv.verse_id = ? AND t.display = 1
         ORDER BY t.name`,
        [verseId]
    );
}

export function getVersesForTopic(topicName, translationId = 1, limit = 100, offset = 0) {
    // Step 1: get verse IDs from core.db (topic_verses + topics are in core.db)
    const verseIds = queryAll(db,
        `SELECT tv.verse_id FROM topic_verses tv
         JOIN topics t ON t.id = tv.topic_id
         WHERE t.name = ? AND t.display = 1
         ORDER BY tv.verse_id LIMIT ? OFFSET ?`,
        [topicName, limit, offset]
    ).map(r => r.verse_id);

    if (verseIds.length === 0) return [];

    // Step 2: fetch verse text from translation db in a single query
    const tdb = _translationDbs.get(translationId) ?? _translationDbs.get(1);
    if (!tdb) return [];

    const placeholders = verseIds.map(() => '?').join(', ');
    const rows = queryAll(tdb,
        `SELECT book, chapter, verse, text
         FROM verses
         WHERE book * 1000000 + chapter * 1000 + verse IN (${placeholders})
         ORDER BY book * 1000000 + chapter * 1000 + verse`,
        verseIds
    );

    return rows.map(({ book, chapter, verse, text }) => ({
        id:       book * 1000000 + chapter * 1000 + verse,
        book_id:  book,
        chapter,
        verse,
        text,
        book_name: getBook(book)?.name || `Book ${book}`
    }));
}

export function getTopicVerseCount(topicName) {
    return queryValue(db,
        `SELECT COUNT(*) FROM topic_verses tv
         JOIN topics t ON t.id = tv.topic_id
         WHERE t.name = ? AND t.display = 1`,
        [topicName], 0
    );
}

// SQL and params for "anchor row `a` overlaps [rangeStart, rangeEnd]", the one
// form every note_anchors lookup should use (docs/ANCHOR_QUERIES.md). The plain
// test, verse_start <= end AND COALESCE(verse_end, verse_start) >= start, can only
// narrow by one side, so it walks most of the table. Instead: an anchor no longer
// than LONG_ANCHOR_SPAN that overlaps must start within that distance of the
// range, and the few longer ones (a whole book, a whole Testament) are searched
// separately. Callers put note_anchors first with a CROSS JOIN, since left to
// itself the planner starts from `n.parent_note_id IS NULL`, which every note matches.
function anchorsOverlapping(rangeStart, rangeEnd) {
    return {
        sql: `a.id IN (
                  SELECT id FROM note_anchors WHERE verse_start BETWEEN ? AND ?
                  UNION ALL
                  SELECT id FROM note_anchors WHERE ${IS_LONG_ANCHOR} AND verse_start <= ?
              ) AND COALESCE(a.verse_end, a.verse_start) >= ?`,
        params: [rangeStart - LONG_ANCHOR_SPAN, rangeEnd, rangeEnd, rangeStart],
    };
}

export function getUserTagsForVerse(verseId) {
    const overlap = anchorsOverlapping(verseId, verseId);
    return queryAll(db,
        `SELECT DISTINCT tg.name
         FROM note_anchors a
         CROSS JOIN tag_assignments ta ON ta.note_id = a.note_id
         CROSS JOIN tags tg ON tg.id = ta.tag_id
         WHERE ${overlap.sql}
         ORDER BY tg.name`,
        overlap.params
    ).map(r => r.name);
}

// ============================================================
// Note Queries
// ============================================================

export function saveNote(body, anchors, tagNames, studyId = null) {
    db.run(
        'INSERT INTO notes (body, study_id) VALUES (?, ?)',
        [body, studyId]
    );
    const noteId = lastInsertRowId();

    for (const anchor of anchors) {
        db.run(
            `INSERT INTO note_anchors (note_id, verse_start, verse_end)
             VALUES (?, ?, ?)`,
            [noteId, anchor.verseStart, anchor.verseEnd || null]
        );
    }

    for (const name of tagNames) {
        const tagId = ensureTag(name);
        if (tagId === null) continue;
        db.run(
            'INSERT OR IGNORE INTO tag_assignments (tag_id, note_id) VALUES (?, ?)',
            [tagId, noteId]
        );
    }

    db.run('INSERT INTO notes_fts(rowid, body) VALUES (?, ?)', [noteId, body]);

    if (studyId) {
        db.run(
            "UPDATE studies SET modified_at = datetime('now') WHERE id = ?",
            [studyId]
        );
    }

    saveToStorage(db.export());
    requestPersistentStorageIfDue();
    return noteId;
}

export function updateNote(noteId, body) {
    // notes_fts is an external-content table: its DELETE finds the words to remove
    // by reading the row's current text from `notes`, so it has to run while that
    // is still the old text.
    db.run('DELETE FROM notes_fts WHERE rowid = ?', [noteId]);
    db.run(
        "UPDATE notes SET body = ?, modified_at = datetime('now') WHERE id = ?",
        [body, noteId]
    );
    db.run('INSERT INTO notes_fts(rowid, body) VALUES (?, ?)', [noteId, body]);

    // Propagate modified_at to the parent study if one exists
    const studyId = queryValue(db, 'SELECT study_id FROM notes WHERE id = ?', [noteId]);
    if (studyId) {
        db.run(
            "UPDATE studies SET modified_at = datetime('now') WHERE id = ?",
            [studyId]
        );
    }

    saveToStorage(db.export());
}

// Deletes a note and every row that references it (anchors, tag
// assignments, the FTS index). sql.js does not enforce ON DELETE CASCADE by
// default, so these are removed explicitly rather than relied on — see
// deletePlan() for the same pattern.
function deleteNoteRows(noteId) {
    db.run('DELETE FROM note_anchors WHERE note_id = ?', [noteId]);
    db.run('DELETE FROM tag_assignments WHERE note_id = ?', [noteId]);
    db.run('DELETE FROM notes_fts WHERE rowid = ?', [noteId]);
    db.run('DELETE FROM notes WHERE id = ?', [noteId]);
}

export function deleteNote(noteId) {
    deleteNoteRows(noteId);
    saveToStorage(db.export());
}

export function getNotesForVerse(verseId) {
    const overlap = anchorsOverlapping(verseId, verseId);
    const results = queryAll(db,
        `SELECT DISTINCT n.id, n.body, n.created_at, n.modified_at,
                n.study_id, s.name AS study_name
         FROM note_anchors a
         CROSS JOIN notes n ON n.id = a.note_id
         LEFT JOIN studies s ON s.id = n.study_id
         WHERE ${overlap.sql}
         AND n.parent_note_id IS NULL
         ORDER BY n.created_at DESC, n.id DESC`,
        overlap.params
    );
    return attachTagsAndAnchors(results);
}

// Distinct note count per verse for one chapter, from a single query. The
// reader's indicator dots need only counts, and a chapter can be 176 verses
// (Psalm 119), so a per-verse getNotesForVerse() round-trip is the wrong
// shape for rendering — this mirrors getBookmarksForChapter() and
// getMarkupsForChapter(). Range-aware per docs/ANCHOR_QUERIES.md: each
// anchor overlapping the chapter is expanded here to every verse it covers
// (clamped to the chapter), and a note with several anchors on one verse
// counts once, matching getNotesForVerse()'s DISTINCT. The chapter range
// starts at verse 0 so a note on a Psalm-title row counts.
export function getNoteCountsForChapter(bookId, chapter) {
    const chapterStart = makeVerseId(bookId, chapter, 0);
    const chapterEnd   = makeVerseId(bookId, chapter, 999);
    const overlap = anchorsOverlapping(chapterStart, chapterEnd);
    const anchors = queryAll(db,
        `SELECT a.note_id, a.verse_start, COALESCE(a.verse_end, a.verse_start) AS verse_end
         FROM note_anchors a
         CROSS JOIN notes n ON n.id = a.note_id
         WHERE ${overlap.sql}
           AND n.parent_note_id IS NULL`,
        overlap.params
    );

    const noteIdsByVerse = new Map();
    for (const { note_id, verse_start, verse_end } of anchors) {
        const from = Math.max(verse_start, chapterStart);
        const to   = Math.min(verse_end, chapterEnd);
        for (let verseId = from; verseId <= to; verseId++) {
            if (!noteIdsByVerse.has(verseId)) noteIdsByVerse.set(verseId, new Set());
            noteIdsByVerse.get(verseId).add(note_id);
        }
    }

    const counts = new Map();
    for (const [verseId, noteIds] of noteIdsByVerse) counts.set(verseId, noteIds.size);
    return counts;
}

// Fills in `tags` and `anchors` on each note row — every note-list query
// wants both, so they're attached in one place.
// One tags query and one anchors query for the whole list, not two per note:
// a statement costs about 0.25 ms from an event handler, which is most of the
// time a long study took to open (docs/STRESS_TEST_RESULTS.md). The ids are
// inlined because a list can pass SQLite's bound-parameter limit, and they are
// integers read back from the database. Rows keep their insertion order within
// a note, the order chips and anchors have always shown in.
function attachTagsAndAnchors(notes) {
    if (notes.length === 0) return notes;
    const noteIds = [...new Set(notes.map(note => note.id))].join(',');

    const tagsByNote = new Map();
    const tagRows = queryAll(db,
        `SELECT ta.note_id, t.id, t.name, t.type FROM tag_assignments ta
         JOIN tags t ON t.id = ta.tag_id
         WHERE ta.note_id IN (${noteIds})
         ORDER BY ta.rowid`
    );
    for (const { note_id, ...tag } of tagRows) {
        if (!tagsByNote.has(note_id)) tagsByNote.set(note_id, []);
        tagsByNote.get(note_id).push(tag);
    }

    const anchorsByNote = new Map();
    const anchorRows = queryAll(db,
        `SELECT * FROM note_anchors WHERE note_id IN (${noteIds}) ORDER BY rowid`
    );
    for (const anchor of anchorRows) {
        if (!anchorsByNote.has(anchor.note_id)) anchorsByNote.set(anchor.note_id, []);
        anchorsByNote.get(anchor.note_id).push(anchor);
    }

    for (const note of notes) {
        note.tags    = tagsByNote.get(note.id) ?? [];
        note.anchors = anchorsByNote.get(note.id) ?? [];
    }
    return notes;
}

export function getAnchorsForNote(noteId) {
    return queryAll(db, 'SELECT * FROM note_anchors WHERE note_id = ?', [noteId]);
}

export function addAnchorToNote(noteId, verseStart, verseEnd = null) {
    db.run(
        'INSERT INTO note_anchors (note_id, verse_start, verse_end) VALUES (?, ?, ?)',
        [noteId, verseStart, verseEnd]
    );
    saveToStorage(db.export());
}

// Removes every anchor row on `noteId` that lies entirely within
// [verseStart, verseEnd]. The notes panel shows anchors coalesced into
// contiguous display ranges (notes.js coalesceAnchors), so one chip can
// stand for several stored rows; deleting by containment removes exactly
// the rows that chip was built from and nothing that reaches outside it.
export function removeAnchorsFromNote(noteId, verseStart, verseEnd = null) {
    db.run(
        `DELETE FROM note_anchors
         WHERE note_id = ? AND verse_start >= ? AND COALESCE(verse_end, verse_start) <= ?`,
        [noteId, verseStart, verseEnd ?? verseStart]
    );
    saveToStorage(db.export());
}

// ============================================================
// Tag Queries
// ============================================================

export function getAllTags() {
    return queryAll(db, 'SELECT id, name, type FROM tags ORDER BY name');
}

// Normalizes a tag name (trimmed, lowercase), creates the tag row if it
// doesn't exist, and returns its id — or null for a blank name. Shared by
// saveNote() and addNoteTag() so the normalization rule lives once.
function ensureTag(name) {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [normalized]);
    return queryValue(db, 'SELECT id FROM tags WHERE name = ?', [normalized]);
}

export function addNoteTag(noteId, tagName) {
    const tagId = ensureTag(tagName);
    if (tagId === null) return;
    db.run('INSERT OR IGNORE INTO tag_assignments (tag_id, note_id) VALUES (?, ?)', [tagId, noteId]);
    saveToStorage(db.export());
}

export function removeNoteTag(noteId, tagName) {
    const normalized = tagName.trim().toLowerCase();
    const tagId = queryValue(db, 'SELECT id FROM tags WHERE name = ?', [normalized]);
    if (!tagId) return;
    db.run('DELETE FROM tag_assignments WHERE tag_id = ? AND note_id = ?', [tagId, noteId]);
    saveToStorage(db.export());
}

export function getNotesForTag(tagName) {
    const results = queryAll(db,
        `SELECT n.id, n.body, n.study_id, s.name AS study_name
         FROM notes n
         JOIN tag_assignments ta ON ta.note_id = n.id
         JOIN tags t ON t.id = ta.tag_id
         LEFT JOIN studies s ON s.id = n.study_id
         WHERE t.name = ?
         ORDER BY n.created_at`,
        [tagName]
    );
    return attachTagsAndAnchors(results);
}

// ============================================================
// Search
// ============================================================

// ============================================================
// Bookmark Queries
// ============================================================

export function getAllBookmarks() {
    return queryAll(db, `
        SELECT b.id, b.verse_id, b.label, b.created_at, bk.name AS book_name
        FROM bookmarks b
        JOIN books bk ON bk.id = (b.verse_id / 1000000)
        ORDER BY b.created_at DESC
    `).map(row => ({
        ...row,
        chapter: Math.floor((row.verse_id % 1000000) / 1000),
        verse:   row.verse_id % 1000,
    }));
}

export function getBookmarksForChapter(bookId, chapter) {
    // Chapter start includes verse=0 (Psalm title row) — a bookmark placed on
    // a title is the user's own data, and should count as "in this chapter"
    // the same as any other bookmark. Deliberately asymmetric with
    // cross-references/Nave's split_range(), which leave verse=0 out — see
    // Psalm_Title_Fix_Spec.md.
    const chapterStart = bookId * 1000000 + chapter * 1000 + 0;
    const chapterEnd   = bookId * 1000000 + chapter * 1000 + 999;
    const rows = queryAll(db,
        'SELECT verse_id, id, label FROM bookmarks WHERE verse_id >= ? AND verse_id <= ?',
        [chapterStart, chapterEnd]
    );
    const map = new Map();
    for (const { verse_id, id, label } of rows) {
        map.set(verse_id, { id, label });
    }
    return map;
}

export function getBookmarkForVerse(verseId) {
    return queryOne(db,
        'SELECT id, verse_id, label, created_at FROM bookmarks WHERE verse_id = ? LIMIT 1',
        [verseId]
    );
}

export function addBookmark(verseId, label) {
    const trimmed = (label || '').trim() || null;
    db.run('INSERT INTO bookmarks (verse_id, label) VALUES (?, ?)', [verseId, trimmed]);
    saveToStorage(db.export());
    return lastInsertRowId();
}

export function removeBookmark(bookmarkId) {
    db.run('DELETE FROM bookmarks WHERE id = ?', [bookmarkId]);
    saveToStorage(db.export());
}

// ============================================================

// Scripture search uses each translation's FTS4 verses_fts (unicode61, whole
// words, no stemming). Translation files built before it carry an FTS5 table
// that sql.js cannot read ("no such module: fts5"), so an install still holding
// those falls back to LIKE. That is a property of the file, not of the query,
// so it is remembered after the first attempt instead of failing on every
// keystroke. Any other error falls back for that one search only.
let _verseFtsUnavailable = false;

// What the person typed, as an FTS4 MATCH expression that can't be malformed.
// Scripture and notes search both use it, so one search box follows one set of rules:
// every word is quoted, so OR, NOT, hyphens and stray punctuation are just
// text. All the words must appear, in any order. "A quoted phrase" must
// appear as written, and a trailing * makes a prefix (love* finds loved,
// loving). Returns null when nothing searchable is left.
export function searchMatchExpression(query) {
    const terms = [];
    for (const [, phrase, word] of query.matchAll(/"([^"]*)"?|([^\s"]+)/g)) {
        const text = (phrase ?? word).replace(/\*+(?=.)/g, ' ').trim();
        if (!/[\p{L}\p{N}]/u.test(text)) continue;
        const prefix = text.endsWith('*');
        const body = text.replace(/\*+$/, '').trim();
        if (body) terms.push(`"${body}${prefix ? '*' : ''}"`);
    }
    return terms.length ? terms.join(' ') : null;
}

export function search(query, translationId = 1) {
    const verseResults = [];
    const noteResults  = [];

    // Scripture full-text search — routes to the active translation db
    const tdb = _translationDbs.get(translationId) ?? _translationDbs.get(1);
    const VERSE_COLUMNS = `book * 1000000 + chapter * 1000 + verse AS id,
                           book AS book_id, chapter, verse, text`;
    const toVerseResult = row => ({
        type: 'verse',
        ...row,
        book_name: getBook(row.book_id)?.name || `Book ${row.book_id}`
    });
    const matchExpression = searchMatchExpression(query);
    if (tdb && matchExpression) {
        let rows = null;
        if (!_verseFtsUnavailable) {
            try {
                rows = queryAll(tdb,
                    `SELECT ${VERSE_COLUMNS}
                     FROM verses
                     WHERE rowid IN (SELECT rowid FROM verses_fts WHERE verses_fts MATCH ?)
                     ORDER BY rowid
                     LIMIT 50`,
                    [matchExpression]
                );
            } catch (e) {
                if (/no such module/i.test(e.message)) {
                    _verseFtsUnavailable = true;
                    console.warn('This translation file predates FTS4 search; using LIKE for the rest of the session:', e.message);
                } else {
                    console.warn('FTS verse search failed; using LIKE for this search:', e.message);
                }
            }
        }
        if (rows === null) {
            try {
                rows = queryAll(tdb,
                    `SELECT ${VERSE_COLUMNS} FROM verses WHERE text LIKE ? LIMIT 50`,
                    [`%${query}%`]
                );
            } catch (e) {
                console.error('LIKE verse search failed:', e);
                rows = [];
            }
        }
        verseResults.push(...rows.map(toVerseResult));
    }

    // Notes full-text search
    if (matchExpression) {
        try {
            const rows = queryAll(db,
                `SELECT n.id, n.body, n.created_at, n.study_id, s.name AS study_name
                 FROM notes_fts fts
                 JOIN notes n ON n.id = fts.rowid
                 LEFT JOIN studies s ON s.id = n.study_id
                 WHERE notes_fts MATCH ?
                 LIMIT 50`,
                [matchExpression]
            );
            for (const note of attachTagsAndAnchors(rows)) {
                note.type = 'note';
                noteResults.push(note);
            }
        } catch (e) {
            console.error('FTS note search failed:', e);
        }
    }

    // Tag name search — user tags + system topics
    const tagResults = queryAll(db,
        `SELECT name FROM tags WHERE name LIKE ?
         UNION
         SELECT name FROM topics WHERE name LIKE ? AND display = 1
         LIMIT 20`,
        [`%${query.toLowerCase()}%`, `%${query}%`]
    ).map(row => ({ type: 'tag', name: row.name }));

    // Study name search
    const studyResults = queryAll(db,
        `SELECT id, name FROM studies WHERE name LIKE ? ORDER BY modified_at DESC LIMIT 20`,
        [`%${query}%`]
    ).map(row => ({ type: 'study', ...row }));

    return { verses: verseResults, notes: noteResults, tags: tagResults, studies: studyResults };
}

// ============================================================
// App State
// ============================================================

export function getState(key) {
    return queryValue(db, 'SELECT value FROM app_state WHERE key = ?', [key]) || null;
}

export function setState(key, value) {
    db.run(
        'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)',
        [key, typeof value === 'string' ? value : JSON.stringify(value)]
    );
    saveToStorage(db.export());
}

// ============================================================
// Study Queries
// ============================================================

export function createStudy(name = 'Untitled Study') {
    db.run('INSERT INTO studies (name) VALUES (?)', [name]);
    const studyId = lastInsertRowId();
    saveToStorage(db.export());
    return studyId;
}

// Build 5 Item 3: generates one study plus one note per template_steps row,
// each note's body pre-filled verbatim with that step's prompt_text. Single
// logical operation — persisted once at the end, matching the no-explicit-
// transaction pattern insertPlan()/insertTemplate() already use (sql.js runs
// synchronously in one thread, so sequential db.run() calls are already
// atomic in practice; nothing else here can partially fail).
//
// Unconditional: never reads reader selection state and never creates a
// note_anchors row for any generated note, regardless of what's selected.
//
// Visibility: studies has no visibility column of its own (only notes
// does), so generated notes simply omit visibility from the INSERT and take
// the notes table's own DEFAULT 'private' — the same thing saveNote() does.
export function generateStudyFromTemplate(templateId, studyName) {
    db.run('INSERT INTO studies (name, template_id) VALUES (?, ?)', [studyName, templateId]);
    const studyId = lastInsertRowId();

    const steps = queryAll(db,
        'SELECT id, prompt_text FROM template_steps WHERE template_id = ? ORDER BY step_index',
        [templateId]
    );

    for (const { id: stepId, prompt_text: promptText } of steps) {
        db.run(
            'INSERT INTO notes (body, study_id, template_step_id) VALUES (?, ?, ?)',
            [promptText, studyId, stepId]
        );
        const noteId = lastInsertRowId();
        db.run('INSERT INTO notes_fts(rowid, body) VALUES (?, ?)', [noteId, promptText]);
    }

    saveToStorage(db.export());
    return studyId;
}

export function getStudyName(studyId) {
    return queryValue(db, 'SELECT name FROM studies WHERE id = ?', [studyId]) || '';
}

export function renameStudy(studyId, name) {
    db.run('UPDATE studies SET name = ?, modified_at = datetime(\'now\') WHERE id = ?', [name, studyId]);
    saveToStorage(db.export());
}

export function getStudies() {
    return queryAll(db,
        `SELECT s.id, s.name, s.created_at, s.modified_at, s.status,
                COUNT(n.id) AS note_count
         FROM studies s
         LEFT JOIN notes n ON n.study_id = s.id
         GROUP BY s.id
         ORDER BY s.modified_at DESC`
    );
}

export function deleteStudy(studyId) {
    // notes.study_id has no CASCADE at all (and even where CASCADE is
    // declared elsewhere, sql.js doesn't enforce it) — delete every note's
    // rows explicitly via the same helper deleteNote() uses.
    const noteIds = queryAll(db, 'SELECT id FROM notes WHERE study_id = ?', [studyId]).map(r => r.id);
    for (const noteId of noteIds) {
        deleteNoteRows(noteId);
    }
    db.run('DELETE FROM studies WHERE id = ?', [studyId]);
    saveToStorage(db.export());
}

export function getNotesForStudy(studyId) {
    const results = queryAll(db,
        `SELECT n.id, n.body, n.created_at, n.modified_at
         FROM notes n
         WHERE n.study_id = ?
         ORDER BY n.created_at ASC, n.id ASC`,
        [studyId]
    );
    return attachTagsAndAnchors(results);
}

// Every note, by study id, each study's notes in getNotesForStudy() order: one
// pass instead of one per study (the readable export). Notes whose study is
// missing (saveNote() allows a null one) are under null.
export function getNotesByStudy() {
    const notes = attachTagsAndAnchors(queryAll(db,
        `SELECT n.id, n.body, n.created_at, n.modified_at,
                CASE WHEN s.id IS NULL THEN NULL ELSE n.study_id END AS study_id
         FROM notes n
         LEFT JOIN studies s ON s.id = n.study_id
         ORDER BY n.created_at ASC, n.id ASC`
    ));
    const byStudy = new Map();
    for (const { study_id: studyId, ...note } of notes) {
        if (!byStudy.has(studyId)) byStudy.set(studyId, []);
        byStudy.get(studyId).push(note);
    }
    return byStudy;
}

// ============================================================
// Markup Queries
// ============================================================

export function createMarkup(verseStart, verseEnd, type, color) {
    const now = Date.now();
    db.run(
        'INSERT INTO markups (verse_start, verse_end, type, color, created_at) VALUES (?, ?, ?, ?, ?)',
        [verseStart, verseEnd ?? null, type, color, now]
    );
    const id = lastInsertRowId();
    saveToStorage(db.export());
    return id;
}

export function deleteMarkup(id) {
    db.run('DELETE FROM markups WHERE id = ?', [id]);
    saveToStorage(db.export());
}

const MARKUP_COLUMNS = 'id, verse_start, verse_end, type, color, created_at';

// Returns all markups that overlap the given chapter (BBCCC prefix).
// Efficient for rendering a whole chapter — one query, not one per verse.
export function getMarkupsForChapter(bookChapter) {
    const chapterStart = bookChapter * 1000 + 1;
    const chapterEnd   = bookChapter * 1000 + 999;
    return queryAll(db,
        `SELECT ${MARKUP_COLUMNS}
         FROM markups
         WHERE verse_start <= ? AND COALESCE(verse_end, verse_start) >= ?
         ORDER BY created_at DESC`,
        [chapterEnd, chapterStart]
    );
}

// Returns the existing markup row that exactly matches range + type, or null.
// Used to implement toggle: applying the same markup twice removes the first.
export function getExistingMarkup(verseStart, verseEnd, type) {
    return queryOne(db,
        `SELECT ${MARKUP_COLUMNS}
         FROM markups
         WHERE verse_start = ?
           AND (verse_end IS ? OR (verse_end IS NOT NULL AND verse_end = ?))
           AND type = ?
         LIMIT 1`,
        [verseStart, verseEnd ?? null, verseEnd ?? null, type]
    );
}

// Returns cross-references for a single verse (use verse_start for ranges).
// Options:
//   floor   — minimum votes to include (default: window.emberDebug.crossrefFloor ?? 5)
//   limit   — max rows to return (default: window.emberDebug.crossrefTopN ?? 25)
//   showAll — if true, ignore floor and limit entirely
// Returns [] when no results.
export function getCrossReferencesForVerse(verseId, options = {}) {
    const floor = options.showAll ? null
        : (options.floor   ?? window.emberDebug?.crossrefFloor  ?? CROSSREF_VOTE_FLOOR_DEFAULT);
    const limit = options.showAll ? null
        : (options.limit   ?? window.emberDebug?.crossrefTopN   ?? CROSSREF_TOP_N_DEFAULT);

    if (options.showAll) {
        return queryAll(db,
            `SELECT target_start, target_end, votes
             FROM cross_references
             WHERE source_verse = ?
             ORDER BY votes DESC, target_start ASC`,
            [verseId]
        );
    }
    return queryAll(db,
        `SELECT target_start, target_end, votes
         FROM cross_references
         WHERE source_verse = ? AND votes >= ?
         ORDER BY votes DESC, target_start ASC
         LIMIT ?`,
        [verseId, floor, limit]
    );
}

// ============================================================
// Context — the Info tab's people and places (context.db, from STEPBible's
// TIPNR; scripts/build_context.py)
// ============================================================

// The people, peoples and places named in a chapter, in order of first
// appearance: [{ name_id, shown_as, name, kind ('person' | 'group' | 'place'),
// type, description, brief, summary, ambiguous, first_verse, verse_count }].
// ambiguous is 1 for a name TIPNR uses for both a people and its ancestor
// (Israel, Judah), with nothing to say which a verse means. shown_as is the form used in the
// chapter ("Abram" in Genesis 12), name the one TIPNR files them under
// ("Abraham"); brief and summary are TIPNR's @Brief and @Short.
// Rejects when context.db can't be had (offline before its first download).
export async function getChapterNames(bookId, chapter) {
    const contextDb = await openReferenceDb(CONTEXT_DB);
    return queryAll(contextDb,
        `SELECT c.name_id, c.shown_as, n.name, n.kind, n.type, n.description, n.brief, n.summary,
                n.ambiguous, c.first_verse, c.verse_count
         FROM chapter_names c JOIN context_names n ON n.id = c.name_id
         WHERE c.book = ? AND c.chapter = ?
         ORDER BY c.first_verse, c.shown_as, c.name_id`,
        [bookId, chapter]
    );
}

export function warnContextUnavailable(e) {
    warnReferenceDbUnavailable(CONTEXT_DB, e);
}

// ============================================================
// Language — original-language words, Greek lexicon (Build 6),
// Greek grammar decode / TEGMC (Grammar Decode spec)
// ============================================================

const ORIGINAL_WORD_COLUMNS = `id, verse_id, word_position, language, surface_text, transliteration, lemma,
                               gloss_contextual, gloss_dictionary, strongs_number, morph_code, group_id`;

// Rows for every selected verse, ordered for interlinear rendering (verse,
// then word_position within it). All async — language.db is lazy-loaded.
export async function getOriginalWordsForVerses(verseIds) {
    if (verseIds.length === 0) return [];
    const langDb = await getLanguageDb();
    const placeholders = verseIds.map(() => '?').join(',');
    return queryAll(langDb,
        `SELECT ${ORIGINAL_WORD_COLUMNS}
         FROM original_words
         WHERE verse_id IN (${placeholders})
         ORDER BY verse_id ASC, word_position ASC`,
        verseIds
    );
}

// TBESG entry for a Greek word's exact (disambiguated) Strong's number. Hebrew
// has its own file — see getHebrewLexiconEntry below. A small number of Greek codes (~0.2%) have no TBESG match due to a disambig-
// uation-suffix mismatch between TAGNT and TBESG in the source data itself;
// callers should treat a null return as "no lexicon entry available", not
// an error.
export async function getGreekLexiconEntry(strongsNumber) {
    if (!strongsNumber) return null;
    const langDb = await getLanguageDb();
    return queryOne(langDb,
        `SELECT strongs_number, lemma, transliteration, morph, gloss, meaning
         FROM step_lexicon_greek WHERE strongs_number = ?`,
        [strongsNumber]
    );
}

// Strong's and BDB for one Hebrew or Aramaic Strong's number: { strongs, bdb,
// bdbHeadwords }. Takes the STEP form
// (H0776G) and looks up its base number; BDB entries come back in display_rank
// order, most frequent in the OSHB text first (scripts/build_lexicon_hebrew.py).
// null for STEP-only numbers (>= 9000), without opening the file, and for a
// number with no rows. Rejects when the file can't be had right now.
export async function getHebrewLexiconEntry(strongsNumber) {
    const match = /^H(\d+)/.exec(strongsNumber || '');
    if (!match) return null;
    const strongsBase = Number(match[1]);
    if (strongsBase >= 9000) return null;

    const lexiconDb = await openReferenceDb(HEBREW_LEXICON_DB);
    const strongs = queryOne(lexiconDb,
        `SELECT headword, transliteration, part_of_speech AS partOfSpeech, language,
                source_markup AS sourceMarkup, meaning_markup AS meaningMarkup,
                usage_markup AS usageMarkup, note_markup AS noteMarkup
         FROM lexicon_strongs_hebrew WHERE strongs_base = ?`,
        [strongsBase]
    );
    const bdb = queryAll(lexiconDb,
        `SELECT b.bdb_id AS bdbId, b.headword, b.language, b.status,
                b.body_markup AS bodyMarkup, l.oshb_occurrences AS occurrences
         FROM lexicon_hebrew_links l
         JOIN lexicon_bdb_hebrew b ON b.bdb_id = l.bdb_id
         WHERE l.strongs_base = ?
         ORDER BY l.display_rank ASC`,
        [strongsBase]
    );
    if (!strongs && bdb.length === 0) return null;

    // Entries whose headword wasn't transcribed point at another entry by its
    // id (<w src="a.be.ad">a.be.ad</w>); the renderer shows that entry's
    // headword. bdbId -> { headword, language }.
    const pointedAt = new Set();
    for (const entry of bdb) {
        for (const match of entry.bodyMarkup.matchAll(/<w src="([^"]+)">\1<\/w>/g)) pointedAt.add(match[1]);
    }
    const bdbHeadwords = new Map();
    if (pointedAt.size > 0) {
        const ids = [...pointedAt];
        for (const row of queryAll(lexiconDb,
            `SELECT bdb_id, headword, language FROM lexicon_bdb_hebrew
             WHERE bdb_id IN (${ids.map(() => '?').join(',')}) AND headword IS NOT NULL`, ids)) {
            bdbHeadwords.set(row.bdb_id, { headword: row.headword, language: row.language });
        }
    }
    return { strongs, bdb, bdbHeadwords };
}

// TEGMC grammatical categories for one raw Greek morphology-code fragment
// (e.g. "V-PAP-NSM" or "CONJ") — NOT the full original_words.morph_code
// value, which may be an N-way " + " compound; callers split that first (see
// grammar-decode.js's splitMorphCode). Returns [] (never throws) when the
// fragment has no TEGMC entry — two known raw-file codes (V-PMO-1S/V-PMO-3P)
// are absent by design and neither appears in current data; callers must
// treat [] as "nothing to decode," not an error.
export async function getGreekMorphCategories(code) {
    if (!code) return [];
    const langDb = await getLanguageDb();
    return queryAll(langDb,
        `SELECT category, raw_value FROM step_morphology_greek
         WHERE code = ? ORDER BY sort_order ASC`,
        [code]
    );
}

// ============================================================
// Language — Hebrew word anatomy (Hebrew Word Anatomy spec):
// TEHMC morphology, per-piece Strong's numbers, affixes, Ketiv/variants.
// Tables and the decisions behind them: scripts/build_language.py,
// docs/HEBREW_ANATOMY_DATA_REPORT.md.
// ============================================================

// TEHMC categories for one Hebrew/Aramaic morph-code piece ("HR", "HNcfsa" —
// grammar-decode.js splits the full morph_code first), in source order.
// derived = 1 for values TEHMC gives as implied by the Stem or Form ("hence
// Action=…; Tense=…"), which it calls likely, not definite. [] when the piece
// has no TEHMC entry (none in current data).
export async function getHebrewMorphCategories(code) {
    if (!code) return [];
    const langDb = await getLanguageDb();
    return queryAll(langDb,
        `SELECT category, value, derived, position FROM step_morphology_hebrew
         WHERE code = ? ORDER BY position ASC`,
        [code]
    );
}

// Word ids per IN (...) — well under sql.js's bound-parameter limit, and a
// rendered selection can span hundreds of verses.
const WORD_ID_CHUNK = 500;

async function queryByWordIds(sql, wordIds) {
    const langDb = await getLanguageDb();
    const rows = [];
    for (let i = 0; i < wordIds.length; i += WORD_ID_CHUNK) {
        const chunk = wordIds.slice(i, i + WORD_ID_CHUNK);
        rows.push(...queryAll(langDb, sql.replace('?ids', chunk.map(() => '?').join(',')), chunk));
    }
    return rows;
}

// Multi-piece Hebrew words among wordIds -> Map<wordId, { pieceStrongs,
// rootGlosses, affixForms }>, for grammar-decode.js's splitHebrewWord(). A word
// with no entry is a one-piece word. One query per 500 words, never per word.
// "All occurrences" of a word (the Language tab's word card): everywhere its
// STEP number (H0430G, not every sense of H0430) appears. Book counts first,
// [{ book, count }] in canon order; a book's verses only when it is opened.
export async function getOccurrenceCounts(strongsNumber) {
    const languageDb = await getLanguageDb();
    return queryAll(languageDb,
        `SELECT verse_id / 1000000 AS book, COUNT(*) AS count
         FROM original_words WHERE strongs_number = ?
         GROUP BY book ORDER BY book`, [strongsNumber]);
}

// [{ verseId, glosses: [contextual gloss of each occurrence, in word order] }]
// for one book, in verse order.
export async function getOccurrencesInBook(strongsNumber, book) {
    const languageDb = await getLanguageDb();
    const rows = queryAll(languageDb,
        `SELECT verse_id, gloss_contextual FROM original_words
         WHERE strongs_number = ? AND verse_id BETWEEN ? AND ?
         ORDER BY verse_id, word_position`,
        [strongsNumber, book * 1_000_000, book * 1_000_000 + 999_999]);
    const verses = [];
    for (const row of rows) {
        if (verses.at(-1)?.verseId !== row.verse_id) verses.push({ verseId: row.verse_id, glosses: [] });
        verses.at(-1).glosses.push(row.gloss_contextual ?? '');
    }
    return verses;
}

export async function getPiecesForWords(wordIds) {
    const pieces = new Map();
    if (wordIds.length === 0) return pieces;
    const rows = await queryByWordIds(
        `SELECT word_id, piece_strongs, root_glosses, affix_forms
         FROM original_word_pieces WHERE word_id IN (?ids)`, wordIds);
    for (const row of rows) {
        pieces.set(row.word_id, {
            pieceStrongs: row.piece_strongs,
            rootGlosses:  row.root_glosses,
            affixForms:   row.affix_forms,
        });
    }
    return pieces;
}

// Hebrew words among wordIds whose text type isn't plain Leningrad or that have
// a recorded variant -> Map<wordId, { textType, meaningVariants,
// spellingVariants, ketivHebrew, ketivKind }>. ketivKind is 'meaning' (Q(K)),
// 'spelling' (Q(k)) or null. No entry means plain Leningrad text.
export async function getVariantsForWords(wordIds) {
    const variants = new Map();
    if (wordIds.length === 0) return variants;
    const rows = await queryByWordIds(
        `SELECT word_id, text_type, meaning_variants, spelling_variants, ketiv_hebrew, ketiv_kind
         FROM original_word_variants WHERE word_id IN (?ids)`, wordIds);
    for (const row of rows) {
        variants.set(row.word_id, {
            textType:         row.text_type,
            meaningVariants:  row.meaning_variants,
            spellingVariants: row.spelling_variants,
            ketivHebrew:      row.ketiv_hebrew,
            ketivKind:        row.ketiv_kind,
        });
    }
    return variants;
}

// Prefix/suffix Strong's numbers (H9001-H9013, H9020-H9049), loaded once per
// session: Map<strongsNumber, { form, gloss, glossByForm }>. form/gloss are the
// number's usual column-12 pair; glossByForm also holds the other forms a few
// numbers take (the subject-form suffixes of לְבַד "alone"), which
// original_word_pieces.affix_forms names per word.
let _hebrewAffixesCache = null;

export async function getHebrewAffixes() {
    if (_hebrewAffixesCache) return _hebrewAffixesCache;
    const langDb = await getLanguageDb();
    const affixes = new Map();
    for (const row of queryAll(langDb,
        `SELECT strongs_number, form, gloss, usual FROM hebrew_affixes ORDER BY strongs_number`)) {
        if (!affixes.has(row.strongs_number)) {
            affixes.set(row.strongs_number, { form: null, gloss: null, glossByForm: new Map() });
        }
        const affix = affixes.get(row.strongs_number);
        affix.glossByForm.set(row.form, row.gloss);
        if (row.usual) {
            affix.form = row.form;
            affix.gloss = row.gloss;
        }
    }
    _hebrewAffixesCache = affixes;
    return affixes;
}
