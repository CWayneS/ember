// db.js — Database initialization, queries, and persistence

import { resolveUsfmRef } from './usfm.js';

const CROSSREF_VOTE_FLOOR_DEFAULT = 5;
const CROSSREF_TOP_N_DEFAULT      = 25;

const NOTES_FTS_REPAIRED_KEY = 'notes_fts_repaired';

// Anchors spanning more than this many verse-id units (about five chapters) are
// the rare "long" ones, kept in their own partial index — see anchorsOverlapping().
const LONG_ANCHOR_SPAN = 5000;
const IS_LONG_ANCHOR   = `COALESCE(verse_end, verse_start) - verse_start > ${LONG_ANCHOR_SPAN}`;

const BUNDLED_PLAN_FILES = [
    'mcheyne-1year.json',
    'bible-in-a-year-canonical.json',
    'bible-in-a-year-chronological.json'
];

const BUNDLED_TEMPLATE_FILES = [
    'inductive-study.json',
    'word-study.json',
    'passage-overview.json'
];

let db             = null;
let _booksCache    = null;
let _storageWorker = null;
let _SQL           = null; // cached sql.js module — reused by restore's validation step

// Translation handles — keyed by integer translation ID (1 = KJV, 2 = ASV, …).
// Populated during initDatabase(); read-only after that. Never handed out:
// every query against a translation goes through a function in this file.
const _translationDbs = new Map();

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
// translation handle from _translationDbs, or the lazily-opened language.db.
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

    // Seed bundled reading plans on first install (idempotent — skips any
    // plan_id already present).
    await seedBundledPlans();

    // Seed built-in study templates on first install (idempotent — skips any
    // template name already present).
    await seedBundledTemplates();

    // Seed translation files into OPFS on first install (no-op on subsequent loads).
    await seedTranslations();

    // Open sql.js Database handles for all bundled translations.
    await openTranslationHandles(SQL);

    return db;
}

// ============================================================
// Translation seeding + handle management
// ============================================================

// On first install: fetch each bundled translation file from ./data/translations/
// and write it into OPFS under translations/{filename}.
// On subsequent loads: all files already exist in OPFS — this is a fast no-op.
// If OPFS is unavailable, openTranslationHandles falls back to network fetch.
async function seedTranslations() {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
        return;
    }

    let transDir;
    try {
        const root = await navigator.storage.getDirectory();
        transDir = await root.getDirectoryHandle('translations', { create: true });
    } catch (e) {
        console.error('seedTranslations: cannot create translations/ in OPFS:', e);
        return;
    }

    const rows = queryAll(db, 'SELECT id, filename FROM translations WHERE is_bundled = 1 ORDER BY id');

    const loadingEl = document.getElementById('loading');
    let seeded = 0;

    for (const { filename } of rows) {
        // Skip if already in OPFS and whole. A tab closed mid-seed leaves an empty
        // file behind (see getCompleteOpfsFile), which seeds again here.
        try {
            const existing = await transDir.getFileHandle(filename);
            if (await isCompleteSqliteFile(await existing.getFile())) continue;
        } catch (_) {}

        // Not yet seeded — fetch and write.
        seeded++;
        if (loadingEl) {
            loadingEl.textContent = `Installing translations… ${seeded} of ${rows.length}`;
        }

        try {
            const response = await fetch(`./data/translations/${filename}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer   = await response.arrayBuffer();
            const handle   = await transDir.getFileHandle(filename, { create: true });
            const writable = await handle.createWritable();
            await writable.write(buffer);
            await writable.close();
        } catch (e) {
            console.error(`seedTranslations: failed to seed ${filename}:`, e);
        }
    }

    if (seeded > 0) {
        console.log(`Seeded ${seeded} translation file(s) into OPFS.`);
    }
}

// Open a sql.js Database handle for every bundled translation.
// Reads from OPFS; falls back to a direct network fetch if OPFS is unavailable
// (e.g. in browsers without OPFS support — handles are in-memory only in that case).
async function openTranslationHandles(SQL) {
    const rows = queryAll(db, 'SELECT id, filename FROM translations WHERE is_bundled = 1 ORDER BY id');

    for (const { id, filename } of rows) {
        try {
            const buffer = await loadTranslationBuffer(filename);
            if (buffer) {
                _translationDbs.set(id, new SQL.Database(new Uint8Array(buffer)));
            } else {
                console.warn(`openTranslationHandles: no data for ${filename}`);
            }
        } catch (e) {
            console.error(`openTranslationHandles: failed to open ${filename}:`, e);
        }
    }

    console.log(`Translation handles open: ${_translationDbs.size}/${rows.length}`);
}

// Load a translation file as an ArrayBuffer.
// OPFS is the primary store (fast, persistent); network is the fallback.
async function loadTranslationBuffer(filename) {
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        try {
            const root     = await navigator.storage.getDirectory();
            const transDir = await root.getDirectoryHandle('translations');
            const handle   = await transDir.getFileHandle(filename);
            const file     = await handle.getFile();
            if (await isCompleteSqliteFile(file)) return await file.arrayBuffer();
        } catch (_) {
            // Not in OPFS — fall through to network.
        }
    }

    // Network fallback: fetch fresh each time (read-only, so safe).
    const response = await fetch(`./data/translations/${filename}`);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${filename}`);
    return await response.arrayBuffer();
}

// ============================================================
// Language DB — TAHOT/TAGNT/TBESG (Build 6), lazy-loaded
// ============================================================
//
// Unlike translations (opened eagerly for all 6 at init — small files, always
// needed), language.db is ~64MB of read-only reference data most sessions may
// never open. Getting it onto the device and opening it are separate steps:
// startLanguageBackgroundDownload() streams the file into OPFS shortly after
// launch, so it is there before the user next goes offline, but nothing loads
// it into memory until the Language tab or a titled Psalm first needs it. Once
// opened, the handle is cached for the rest of the session. It is never part
// of the db.export()/saveToStorage() write cycle — it's read-only reference
// data, not part of core.db.

const LANGUAGE_DB_FILE = 'language.db';
const LANGUAGE_DB_URL  = './data/language.db';
const LANGUAGE_DOWNLOAD_DELAY_MS = 2000; // keeps it clear of first render
const SQLITE_MAGIC = 'SQLite format 3\0';

let _languageDb        = null;
let _languageDbPromise = null;
let _languageWarned    = false;

function getLanguageDb() {
    if (_languageDb) return Promise.resolve(_languageDb);
    if (_languageDbPromise) return _languageDbPromise;

    _languageDbPromise = (async () => {
        const buffer = await loadLanguageBuffer();
        _languageDb = new _SQL.Database(new Uint8Array(buffer));
        return _languageDb;
    })().catch(e => {
        // Not cached: the next use tries again, so the tab recovers without a
        // reload once the network is back.
        _languageDbPromise = null;
        throw e;
    });
    return _languageDbPromise;
}

// Being offline with no language.db yet is an expected state with its own
// message in the Language tab, not an error — one warning per session is
// enough, however many selections and Psalm titles run into it.
export function warnLanguageUnavailable(e) {
    if (_languageWarned) return;
    _languageWarned = true;
    console.warn('Original-language data is not available yet:', e.message);
}

export function isLanguageDownloading() {
    return _opfsDownloads.has(LANGUAGE_DB_FILE);
}

// OPFS is the primary store; a download into OPFS is how it gets there, shared
// with the background step so there is only ever one. A plain fetch into memory
// remains for browsers that can't write OPFS, and for a write that fails (quota).
async function loadLanguageBuffer() {
    const file = await getCompleteOpfsFile(LANGUAGE_DB_FILE);
    if (file) return await file.arrayBuffer();

    // `false` is reliable; `true` only means "maybe", so that case just tries.
    if (navigator.onLine === false) throw new Error('the browser is offline');

    if (canDownloadToOpfs()) {
        try {
            await downloadLanguageDb();
            const downloaded = await getCompleteOpfsFile(LANGUAGE_DB_FILE);
            if (downloaded) return await downloaded.arrayBuffer();
        } catch (e) {
            // File system calls reject with a DOMException; anything else is
            // the network or the response itself, which a second fetch won't fix.
            if (!(e instanceof DOMException)) throw e;
            console.warn('loadLanguageBuffer: could not store language.db, keeping it in memory for this session:', e);
        }
    }

    const response = await fetch(LANGUAGE_DB_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching language.db`);
    return await response.arrayBuffer();
}

// Called once the app is live. Only ever puts the file on disk — it must not
// create a Database, which would cost every session the memory the lazy open
// exists to save. If it can't finish now it tries again the next time the
// browser reports coming online; getLanguageDb() also retries on its next use.
export function startLanguageBackgroundDownload() {
    setTimeout(downloadLanguageDbInBackground, LANGUAGE_DOWNLOAD_DELAY_MS);
}

async function downloadLanguageDbInBackground() {
    if (_languageDb || !canDownloadToOpfs()) return;
    if (await getCompleteOpfsFile(LANGUAGE_DB_FILE)) return;

    try {
        if (navigator.onLine === false) throw new Error('the browser is offline');
        await downloadLanguageDb();
    } catch (e) {
        warnLanguageUnavailable(e);
        window.addEventListener('online', downloadLanguageDbInBackground, { once: true });
    }
}

function downloadLanguageDb() {
    const alreadyDownloading = isLanguageDownloading();
    const download = downloadToOpfs(LANGUAGE_DB_FILE, LANGUAGE_DB_URL);
    if (!alreadyDownloading) document.dispatchEvent(new CustomEvent('language-download-started'));
    return download;
}

// ---- Downloading a read-only .db file into OPFS ----------------------------

const _opfsDownloads = new Map(); // filename -> in-flight download promise

function canDownloadToOpfs() {
    return 'storage' in navigator && 'getDirectory' in navigator.storage
        && 'FileSystemFileHandle' in window && 'createWritable' in FileSystemFileHandle.prototype;
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

    // Future drag-to-reorder: position column on notes (idempotent).
    // NULL = use created_at order. Will be populated when ordering is implemented.
    try { db.run('ALTER TABLE notes ADD COLUMN position REAL'); } catch (_) {}

    migratePlanTables();
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

// Seed the bundled reading plans from data/plans/ on first install. Idempotent:
// a plan already present (matched by its stable plan_id) is left untouched.
async function seedBundledPlans() {
    if (navigator.onLine === false) return;
    for (const filename of BUNDLED_PLAN_FILES) {
        let plan;
        try {
            const response = await fetch(`./data/plans/${filename}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            plan = await response.json();
        } catch (e) {
            logSeedLoadFailure(`seedBundledPlans: failed to load ${filename}:`, e);
            continue;
        }

        const meta = plan.plan_metadata;
        let result;
        try {
            result = insertPlan(meta, plan.days, 'bundled');
        } catch (e) {
            if (e.code === 'DUPLICATE_PLAN_ID') continue; // already seeded
            console.error(`seedBundledPlans: failed to seed ${filename}:`, e);
            continue;
        }

        console.log(
            `seedBundledPlans: seeded "${meta.title}" (${plan.days.length} days, ` +
            `${result.approximateCount} approximate ranges, ${result.unresolvedCount} unresolved refs)`
        );
    }
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

// Seed the built-in study templates from data/templates/ on first install.
// Idempotent: a template already present (matched by its name) is left untouched.
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
        try {
            insertTemplate(meta, template.steps);
        } catch (e) {
            if (e.code === 'DUPLICATE_TEMPLATE_NAME') continue; // already seeded
            console.error(`seedBundledTemplates: failed to seed ${filename}:`, e);
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

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
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
// commit to it and let failure reject outright.
export async function restoreCoreDb(bytes) {
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        const root     = await navigator.storage.getDirectory();
        const handle   = await root.getFileHandle('core.db', { create: true });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return;
    }

    await new Promise((resolve, reject) => {
        const request = indexedDB.open('ScriptureStudy', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('db');
        };
        request.onsuccess = () => {
            const tx = request.result.transaction('db', 'readwrite');
            tx.objectStore('db').put(bytes, 'core');
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
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

export function getTranslations() {
    return queryAll(db, 'SELECT id, name, abbreviation FROM translations ORDER BY id');
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
function attachTagsAndAnchors(notes) {
    for (const note of notes) {
        note.tags    = getTagsForNote(note.id);
        note.anchors = getAnchorsForNote(note.id);
    }
    return notes;
}

function getTagsForNote(noteId) {
    return queryAll(db,
        `SELECT t.id, t.name, t.type FROM tags t
         JOIN tag_assignments ta ON ta.tag_id = t.id
         WHERE ta.note_id = ?`,
        [noteId]
    );
}

function getAnchorsForNote(noteId) {
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

// The translation files carry an FTS5 verses_fts table, but sql.js's WASM
// build has no FTS5 module, so the MATCH query throws ("no such module:
// fts5") and Scripture search falls back to LIKE. That is a property of the
// runtime, not of the query, so the failure is remembered after the first
// attempt: later searches go straight to LIKE instead of preparing a
// doomed statement and logging an error on every keystroke.
let _verseFtsUnavailable = false;

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
    if (tdb) {
        let rows = null;
        if (!_verseFtsUnavailable) {
            try {
                rows = queryAll(tdb,
                    `SELECT ${VERSE_COLUMNS}
                     FROM verses
                     WHERE rowid IN (SELECT rowid FROM verses_fts WHERE verses_fts MATCH ?)
                     LIMIT 50`,
                    [query]
                );
            } catch (e) {
                _verseFtsUnavailable = true;
                console.warn('FTS verse search unavailable in this runtime; using LIKE for the rest of the session:', e.message);
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
    try {
        const rows = queryAll(db,
            `SELECT n.id, n.body, n.created_at, n.study_id, s.name AS study_name
             FROM notes_fts fts
             JOIN notes n ON n.id = fts.rowid
             LEFT JOIN studies s ON s.id = n.study_id
             WHERE notes_fts MATCH ?
             LIMIT 50`,
            [query]
        );
        for (const note of attachTagsAndAnchors(rows)) {
            note.type = 'note';
            noteResults.push(note);
        }
    } catch (e) {
        console.error('FTS note search failed:', e);
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
         ORDER BY n.created_at ASC`,
        [studyId]
    );
    return attachTagsAndAnchors(results);
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
// has no lexicon table — see Build_6_Spec.md Item 1's TBESH resolution. A
// small number of Greek codes (~0.2%) have no TBESG match due to a disambig-
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
