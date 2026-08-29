// db.js — Database initialization, queries, and persistence

import { resolveUsfmRef } from './usfm.js';

const CROSSREF_VOTE_FLOOR_DEFAULT = 5;
const CROSSREF_TOP_N_DEFAULT      = 25;

const BUNDLED_PLAN_FILES = [
    'mcheyne-1year.json',
    'bible-in-a-year-canonical.json',
    'bible-in-a-year-chronological.json'
];

let db             = null;
let _booksCache    = null;
let _storageWorker = null;
let _SQL           = null; // cached sql.js module — reused by restore's validation step

// Translation handles — keyed by integer translation ID (1 = KJV, 2 = ASV, …).
// Populated during initDatabase(); read-only after that.
const _translationDbs = new Map();

export function getTranslationDb(id) {
    return _translationDbs.get(id) ?? null;
}

function getStorageWorker() {
    if (!_storageWorker) {
        _storageWorker = new Worker('./js/storage-worker.js');
    }
    return _storageWorker;
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

    const rows = db.exec(
        'SELECT id, filename FROM translations WHERE is_bundled = 1 ORDER BY id'
    )[0]?.values ?? [];

    const loadingEl = document.getElementById('loading');
    let seeded = 0;

    for (const [, filename] of rows) {
        // Skip if already in OPFS.
        try {
            await transDir.getFileHandle(filename);
            continue;
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
    const rows = db.exec(
        'SELECT id, filename FROM translations WHERE is_bundled = 1 ORDER BY id'
    )[0]?.values ?? [];

    for (const [id, filename] of rows) {
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
            return await file.arrayBuffer();
        } catch (_) {
            // Not in OPFS — fall through to network.
        }
    }

    // Network fallback: fetch fresh each time (read-only, so safe).
    const response = await fetch(`./data/translations/${filename}`);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${filename}`);
    return await response.arrayBuffer();
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
    const noteFtsRow = db.exec(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes_fts'"
    );
    const noteFtsSql = (noteFtsRow[0]?.values[0]?.[0] || '').toLowerCase();

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
        const ftsCount  = db.exec('SELECT COUNT(*) FROM notes_fts')[0].values[0][0];
        const noteCount = db.exec('SELECT COUNT(*) FROM notes')[0].values[0][0];
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

    // Future drag-to-reorder: position column on notes (idempotent).
    // NULL = use created_at order. Will be populated when ordering is implemented.
    try { db.run('ALTER TABLE notes ADD COLUMN position REAL'); } catch (_) {}

    migratePlanTables();
    ensureMetaTable();
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

    const rowCount = db.exec('SELECT COUNT(*) FROM meta')[0].values[0][0];
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
    const planCols = db.exec("PRAGMA table_info(plans)")[0]?.values ?? [];
    const isLegacyPlansTable = planCols.length > 0 && !planCols.some(row => row[1] === 'plan_id');

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
    const existing = db.exec('SELECT id FROM plans WHERE plan_id = ?', [meta.id]);
    if (existing.length > 0) {
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

    const planRowId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
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

// Seed the bundled reading plans from data/plans/ on first install. Idempotent:
// a plan already present (matched by its stable plan_id) is left untouched.
async function seedBundledPlans() {
    for (const filename of BUNDLED_PLAN_FILES) {
        let plan;
        try {
            const response = await fetch(`./data/plans/${filename}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            plan = await response.json();
        } catch (e) {
            console.error(`seedBundledPlans: failed to load ${filename}:`, e);
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

// Returns all installed plans, sorted active (in progress) first, then
// not_started, then completed; alphabetically by title within each group.
export function getPlans() {
    return db.exec(`
        SELECT id, plan_id, title, description, author, duration_days, source, current_step, status
        FROM plans
        ORDER BY
            CASE status WHEN 'active' THEN 0 WHEN 'not_started' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
            title COLLATE NOCASE
    `)[0]?.values.map(row => ({
        id:            row[0],
        plan_id:       row[1],
        title:         row[2],
        description:   row[3],
        author:        row[4],
        duration_days: row[5],
        source:        row[6],
        current_step:  row[7],
        status:        row[8]
    })) || [];
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
    const planRows = db.exec(
        `SELECT id, plan_id, title, description, author, duration_days, current_step, status
         FROM plans WHERE id = ?`,
        [planRowId]
    )[0]?.values;
    if (!planRows || planRows.length === 0) return null;

    const [id, plan_id, title, description, author, duration_days, current_step, status] = planRows[0];

    const dayRows = db.exec(
        'SELECT day_number, title FROM plan_days WHERE plan_id = ? ORDER BY day_number',
        [planRowId]
    )[0]?.values ?? [];

    const firstPassageRows = db.exec(
        'SELECT day_number, display FROM plan_day_scripture WHERE plan_id = ? AND sequence = 1',
        [planRowId]
    )[0]?.values ?? [];
    const firstPassageByDay = new Map(firstPassageRows.map(([dayNumber, display]) => [dayNumber, display]));

    const days = dayRows.map(([day_number, dayTitle]) => ({
        day_number,
        title: dayTitle,
        first_passage_display: firstPassageByDay.get(day_number) ?? null
    }));

    return { id, plan_id, title, description, author, duration_days, current_step, status, days };
}

// Sets current_step to dayNumber and recomputes status (active, or
// completed if dayNumber reaches duration_days). Used by both Continue and
// clicking a specific day row in the plan detail popover.
export function setPlanProgress(planRowId, dayNumber) {
    const rows = db.exec('SELECT duration_days FROM plans WHERE id = ?', [planRowId])[0]?.values;
    if (!rows || rows.length === 0) return;
    const durationDays = rows[0][0];
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
    const rows = db.exec(
        'SELECT id, plan_id, title, duration_days, current_step, status FROM plans WHERE id = ?',
        [planRowId]
    )[0]?.values;
    if (!rows || rows.length === 0) return null;
    const [id, plan_id, title, duration_days, current_step, status] = rows[0];
    return { id, plan_id, title, duration_days, current_step, status };
}

// Every passage for one day, in sequence order, with pre-resolved
// book/chapter/verse for navigation.
export function getPlanDayScripture(planRowId, dayNumber) {
    return db.exec(
        `SELECT sequence, ref, display, book, chapter, verse_start, verse_end
         FROM plan_day_scripture WHERE plan_id = ? AND day_number = ? ORDER BY sequence`,
        [planRowId, dayNumber]
    )[0]?.values.map(row => ({
        sequence:    row[0],
        ref:         row[1],
        display:     row[2],
        book:        row[3],
        chapter:     row[4],
        verse_start: row[5],
        verse_end:   row[6]
    })) ?? [];
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
        const rows = testDb.exec(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='books'"
        );
        return rows.length > 0 && rows[0].values.length > 0;
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
    // Transfer the underlying ArrayBuffer — zero-copy, no clone needed.
    getStorageWorker().postMessage(data, [data.buffer]);
}

async function loadFromStorage() {
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        try {
            const root = await navigator.storage.getDirectory();
            const handle = await root.getFileHandle('core.db');
            const file = await handle.getFile();
            return await file.arrayBuffer();
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

// ============================================================
// Scripture Queries
// ============================================================

export function getChapter(translationId, bookId, chapter) {
    const tdb = _translationDbs.get(translationId) ?? _translationDbs.get(1);
    if (!tdb) return [];
    const stmt = tdb.prepare(
        `SELECT book * 1000000 + chapter * 1000 + verse AS id,
                verse, text
         FROM verses
         WHERE book = ? AND chapter = ?
         ORDER BY verse`
    );
    stmt.bind([bookId, chapter]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getTranslations() {
    return db.exec(
        'SELECT id, name, abbreviation FROM translations ORDER BY id'
    )[0]?.values.map(r => ({ id: r[0], name: r[1], abbreviation: r[2] })) || [];
}

export function getBooks() {
    if (!_booksCache) {
        _booksCache = db.exec('SELECT * FROM books ORDER BY id')[0]?.values.map(row => ({
            id:        row[0],
            name:      row[1],
            abbrev:    row[2],
            testament: row[3],
            genre:     row[4],
            chapters:  row[5]
        })) || [];
    }
    return _booksCache;
}

export function getBook(bookId) {
    const stmt = db.prepare('SELECT * FROM books WHERE id = ?');
    stmt.bind([bookId]);
    let book = null;
    if (stmt.step()) {
        book = stmt.getAsObject();
    }
    stmt.free();
    return book;
}

export function getChapterVerseCount(bookId, chapter) {
    const tdb = _translationDbs.get(1); // always use KJV for canonical count
    if (!tdb) return 0;
    return tdb.exec(
        'SELECT COUNT(*) FROM verses WHERE book = ? AND chapter = ?',
        [bookId, chapter]
    )[0]?.values[0][0] || 0;
}

export function getTopicsForVerse(verseId) {
    return db.exec(
        `SELECT t.id, t.name FROM topics t
         JOIN topic_verses tv ON tv.topic_id = t.id
         WHERE tv.verse_id = ? AND t.display = 1
         ORDER BY t.name`,
        [verseId]
    )[0]?.values.map(r => ({ id: r[0], name: r[1] })) || [];
}

export function getVersesForTopic(topicName, translationId = 1, limit = 100, offset = 0) {
    // Step 1: get verse IDs from core.db (topic_verses + topics are in core.db)
    const verseIds = db.exec(
        `SELECT tv.verse_id FROM topic_verses tv
         JOIN topics t ON t.id = tv.topic_id
         WHERE t.name = ? AND t.display = 1
         ORDER BY tv.verse_id LIMIT ? OFFSET ?`,
        [topicName, limit, offset]
    )[0]?.values.map(r => r[0]) || [];

    if (verseIds.length === 0) return [];

    // Step 2: fetch verse text from translation db in a single query
    const tdb = _translationDbs.get(translationId) ?? _translationDbs.get(1);
    if (!tdb) return [];

    const placeholders = verseIds.map(() => '?').join(', ');
    const rows = tdb.exec(
        `SELECT book, chapter, verse, text
         FROM verses
         WHERE book * 1000000 + chapter * 1000 + verse IN (${placeholders})
         ORDER BY book * 1000000 + chapter * 1000 + verse`,
        verseIds
    )[0]?.values || [];

    return rows.map(([book, chapter, verse, text]) => ({
        id:       book * 1000000 + chapter * 1000 + verse,
        book_id:  book,
        chapter,
        verse,
        text,
        book_name: getBook(book)?.name || `Book ${book}`
    }));
}

export function getTopicVerseCount(topicName) {
    return db.exec(
        `SELECT COUNT(*) FROM topic_verses tv
         JOIN topics t ON t.id = tv.topic_id
         WHERE t.name = ? AND t.display = 1`,
        [topicName]
    )[0]?.values[0][0] || 0;
}

export function getUserTagsForVerse(verseId) {
    return db.exec(
        `SELECT DISTINCT tg.name FROM tags tg
         JOIN tag_assignments ta ON ta.tag_id = tg.id
         JOIN notes n ON n.id = ta.note_id
         JOIN note_anchors a ON a.note_id = n.id
         WHERE a.verse_start <= ? AND COALESCE(a.verse_end, a.verse_start) >= ?
         ORDER BY tg.name`,
        [verseId, verseId]
    )[0]?.values.map(r => r[0]) || [];
}

// ============================================================
// Note Queries
// ============================================================

export function saveNote(body, anchors, tagNames, studyId = null) {
    db.run(
        'INSERT INTO notes (body, study_id) VALUES (?, ?)',
        [body, studyId]
    );
    const noteId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    for (const anchor of anchors) {
        db.run(
            `INSERT INTO note_anchors (note_id, verse_start, verse_end)
             VALUES (?, ?, ?)`,
            [noteId, anchor.verseStart, anchor.verseEnd || null]
        );
    }

    for (const name of tagNames) {
        const normalized = name.trim().toLowerCase();
        if (!normalized) continue;
        db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [normalized]);
        const tagId = db.exec(
            'SELECT id FROM tags WHERE name = ?', [normalized]
        )[0].values[0][0];
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
    return noteId;
}

export function updateNote(noteId, body) {
    db.run(
        "UPDATE notes SET body = ?, modified_at = datetime('now') WHERE id = ?",
        [body, noteId]
    );
    db.run('DELETE FROM notes_fts WHERE rowid = ?', [noteId]);
    db.run('INSERT INTO notes_fts(rowid, body) VALUES (?, ?)', [noteId, body]);

    // Propagate modified_at to the parent study if one exists
    const result = db.exec('SELECT study_id FROM notes WHERE id = ?', [noteId]);
    const studyId = result[0]?.values[0]?.[0];
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
    const stmt = db.prepare(
        `SELECT DISTINCT n.id, n.body, n.created_at, n.modified_at,
                n.study_id, s.name AS study_name
         FROM notes n
         JOIN note_anchors a ON a.note_id = n.id
         LEFT JOIN studies s ON s.id = n.study_id
         WHERE a.verse_start <= ? AND COALESCE(a.verse_end, a.verse_start) >= ?
         AND n.parent_note_id IS NULL
         ORDER BY n.created_at DESC`
    );
    stmt.bind([verseId, verseId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();

    for (const note of results) {
        note.tags    = getTagsForNote(note.id);
        note.anchors = getAnchorsForNote(note.id);
    }
    return results;
}

export function getTagsForNote(noteId) {
    const stmt = db.prepare(
        `SELECT t.id, t.name, t.type FROM tags t
         JOIN tag_assignments ta ON ta.tag_id = t.id
         WHERE ta.note_id = ?`
    );
    stmt.bind([noteId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function getAnchorsForNote(noteId) {
    const stmt = db.prepare('SELECT * FROM note_anchors WHERE note_id = ?');
    stmt.bind([noteId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

export function addAnchorToNote(noteId, verseStart, verseEnd = null) {
    db.run(
        'INSERT INTO note_anchors (note_id, verse_start, verse_end) VALUES (?, ?, ?)',
        [noteId, verseStart, verseEnd]
    );
    saveToStorage(db.export());
}

// ============================================================
// Tag Queries
// ============================================================

export function getAllTags() {
    return db.exec('SELECT id, name, type FROM tags ORDER BY name')[0]?.values.map(
        row => ({ id: row[0], name: row[1], type: row[2] })
    ) || [];
}

export function addNoteTag(noteId, tagName) {
    const normalized = tagName.trim().toLowerCase();
    if (!normalized) return;
    db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [normalized]);
    const tagId = db.exec('SELECT id FROM tags WHERE name = ?', [normalized])[0].values[0][0];
    db.run('INSERT OR IGNORE INTO tag_assignments (tag_id, note_id) VALUES (?, ?)', [tagId, noteId]);
    saveToStorage(db.export());
}

export function removeNoteTag(noteId, tagName) {
    const normalized = tagName.trim().toLowerCase();
    const result = db.exec('SELECT id FROM tags WHERE name = ?', [normalized]);
    const tagId  = result[0]?.values[0]?.[0];
    if (!tagId) return;
    db.run('DELETE FROM tag_assignments WHERE tag_id = ? AND note_id = ?', [tagId, noteId]);
    saveToStorage(db.export());
}

export function getNotesForTag(tagName) {
    const stmt = db.prepare(
        `SELECT n.id, n.body, n.study_id, s.name AS study_name
         FROM notes n
         JOIN tag_assignments ta ON ta.note_id = n.id
         JOIN tags t ON t.id = ta.tag_id
         LEFT JOIN studies s ON s.id = n.study_id
         WHERE t.name = ?
         ORDER BY n.created_at`
    );
    stmt.bind([tagName]);
    const results = [];
    while (stmt.step()) {
        const note   = stmt.getAsObject();
        note.anchors = getAnchorsForNote(note.id);
        note.tags    = getTagsForNote(note.id);
        results.push(note);
    }
    stmt.free();
    return results;
}

// ============================================================
// Search
// ============================================================

// ============================================================
// Bookmark Queries
// ============================================================

export function getAllBookmarks() {
    const result = db.exec(`
        SELECT b.id, b.verse_id, b.label, b.created_at, bk.name AS book_name
        FROM bookmarks b
        JOIN books bk ON bk.id = (b.verse_id / 1000000)
        ORDER BY b.created_at DESC
    `);
    if (!result[0]) return [];
    return result[0].values.map(([id, verse_id, label, created_at, book_name]) => ({
        id,
        verse_id,
        label,
        created_at,
        book_name,
        chapter: Math.floor((verse_id % 1000000) / 1000),
        verse:   verse_id % 1000,
    }));
}

export function getBookmarksForChapter(bookId, chapter) {
    const chapterStart = bookId * 1000000 + chapter * 1000 + 1;
    const chapterEnd   = bookId * 1000000 + chapter * 1000 + 999;
    const result = db.exec(
        'SELECT verse_id, id, label FROM bookmarks WHERE verse_id >= ? AND verse_id <= ?',
        [chapterStart, chapterEnd]
    );
    const map = new Map();
    if (result[0]) {
        for (const [verse_id, id, label] of result[0].values) {
            map.set(verse_id, { id, label });
        }
    }
    return map;
}

export function getBookmarkForVerse(verseId) {
    const result = db.exec(
        'SELECT id, verse_id, label, created_at FROM bookmarks WHERE verse_id = ? LIMIT 1',
        [verseId]
    );
    if (!result[0]) return null;
    const [id, verse_id, label, created_at] = result[0].values[0];
    return { id, verse_id, label, created_at };
}

export function addBookmark(verseId, label) {
    const trimmed = (label || '').trim() || null;
    db.run('INSERT INTO bookmarks (verse_id, label) VALUES (?, ?)', [verseId, trimmed]);
    saveToStorage(db.export());
    const result = db.exec('SELECT last_insert_rowid()');
    return result[0].values[0][0];
}

export function removeBookmark(bookmarkId) {
    db.run('DELETE FROM bookmarks WHERE id = ?', [bookmarkId]);
    saveToStorage(db.export());
}

// ============================================================

export function search(query, translationId = 1) {
    const verseResults = [];
    const noteResults  = [];

    // Scripture full-text search — routes to the active translation db
    const tdb = _translationDbs.get(translationId) ?? _translationDbs.get(1);
    if (tdb) {
        try {
            const vstmt = tdb.prepare(
                `SELECT book * 1000000 + chapter * 1000 + verse AS id,
                        book AS book_id, chapter, verse, text
                 FROM verses
                 WHERE rowid IN (SELECT rowid FROM verses_fts WHERE verses_fts MATCH ?)
                 LIMIT 50`
            );
            vstmt.bind([query]);
            while (vstmt.step()) {
                const row = vstmt.getAsObject();
                row.book_name = getBook(row.book_id)?.name || `Book ${row.book_id}`;
                verseResults.push({ type: 'verse', ...row });
            }
            vstmt.free();
        } catch (e) {
            console.error('FTS verse search failed, trying LIKE fallback:', e);
            try {
                const vstmt = tdb.prepare(
                    `SELECT book * 1000000 + chapter * 1000 + verse AS id,
                            book AS book_id, chapter, verse, text
                     FROM verses
                     WHERE text LIKE ?
                     LIMIT 50`
                );
                vstmt.bind([`%${query}%`]);
                while (vstmt.step()) {
                    const row = vstmt.getAsObject();
                    row.book_name = getBook(row.book_id)?.name || `Book ${row.book_id}`;
                    verseResults.push({ type: 'verse', ...row });
                }
                vstmt.free();
            } catch (e2) {
                console.error('LIKE verse search also failed:', e2);
            }
        }
    }

    // Notes full-text search
    try {
        const nstmt = db.prepare(
            `SELECT n.id, n.body, n.created_at, n.study_id, s.name AS study_name
             FROM notes_fts fts
             JOIN notes n ON n.id = fts.rowid
             LEFT JOIN studies s ON s.id = n.study_id
             WHERE notes_fts MATCH ?
             LIMIT 50`
        );
        nstmt.bind([query]);
        while (nstmt.step()) {
            const note = nstmt.getAsObject();
            note.type    = 'note';
            note.tags    = getTagsForNote(note.id);
            note.anchors = getAnchorsForNote(note.id);
            noteResults.push(note);
        }
        nstmt.free();
    } catch (e) {
        console.error('FTS note search failed:', e);
    }

    // Tag name search — user tags + system topics
    const tagResults = [];
    const tstmt = db.prepare(
        `SELECT name FROM tags WHERE name LIKE ?
         UNION
         SELECT name FROM topics WHERE name LIKE ? AND display = 1
         LIMIT 20`
    );
    tstmt.bind([`%${query.toLowerCase()}%`, `%${query}%`]);
    while (tstmt.step()) {
        tagResults.push({ type: 'tag', name: tstmt.getAsObject().name });
    }
    tstmt.free();

    // Study name search
    const studyResults = [];
    const sstmt = db.prepare(
        `SELECT id, name FROM studies WHERE name LIKE ? ORDER BY modified_at DESC LIMIT 20`
    );
    sstmt.bind([`%${query}%`]);
    while (sstmt.step()) {
        studyResults.push({ type: 'study', ...sstmt.getAsObject() });
    }
    sstmt.free();

    return { verses: verseResults, notes: noteResults, tags: tagResults, studies: studyResults };
}

// ============================================================
// App State
// ============================================================

export function getState(key) {
    const result = db.exec('SELECT value FROM app_state WHERE key = ?', [key]);
    return result[0]?.values[0]?.[0] || null;
}

export function setState(key, value) {
    db.run(
        'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)',
        [key, typeof value === 'string' ? value : JSON.stringify(value)]
    );
    saveToStorage(db.export());
}

export function getCurrentTranslation() {
    return getState('translation') || 'KJV';
}

export function getCurrentTranslationId() {
    const abbrev = getCurrentTranslation();
    const result = db.exec(
        'SELECT id FROM translations WHERE abbreviation = ?', [abbrev]
    );
    return result[0]?.values[0]?.[0] ?? 1;
}

// ============================================================
// Study Queries
// ============================================================

export function createStudy(name = 'Untitled Study') {
    db.run('INSERT INTO studies (name) VALUES (?)', [name]);
    const studyId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    saveToStorage(db.export());
    return studyId;
}

export function getStudyName(studyId) {
    return db.exec('SELECT name FROM studies WHERE id = ?', [studyId])[0]?.values[0][0] || '';
}

export function renameStudy(studyId, name) {
    db.run('UPDATE studies SET name = ?, modified_at = datetime(\'now\') WHERE id = ?', [name, studyId]);
    saveToStorage(db.export());
}

export function getStudies() {
    return db.exec(
        `SELECT s.id, s.name, s.created_at, s.modified_at, s.status,
                COUNT(n.id) AS note_count
         FROM studies s
         LEFT JOIN notes n ON n.study_id = s.id
         GROUP BY s.id
         ORDER BY s.modified_at DESC`
    )[0]?.values.map(row => ({
        id:         row[0],
        name:       row[1],
        created_at: row[2],
        modified_at: row[3],
        status:     row[4],
        note_count: row[5]
    })) || [];
}

export function deleteStudy(studyId) {
    // notes.study_id has no CASCADE at all (and even where CASCADE is
    // declared elsewhere, sql.js doesn't enforce it) — delete every note's
    // rows explicitly via the same helper deleteNote() uses.
    const noteIds = db.exec(
        'SELECT id FROM notes WHERE study_id = ?', [studyId]
    )[0]?.values.map(r => r[0]) ?? [];
    for (const noteId of noteIds) {
        deleteNoteRows(noteId);
    }
    db.run('DELETE FROM studies WHERE id = ?', [studyId]);
    saveToStorage(db.export());
}

export function getNotesForStudy(studyId) {
    const stmt = db.prepare(
        `SELECT n.id, n.body, n.created_at, n.modified_at
         FROM notes n
         WHERE n.study_id = ?
         ORDER BY n.created_at ASC`
    );
    stmt.bind([studyId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();

    for (const note of results) {
        note.tags    = getTagsForNote(note.id);
        note.anchors = getAnchorsForNote(note.id);
    }
    return results;
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
    const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    saveToStorage(db.export());
    return id;
}

export function deleteMarkup(id) {
    db.run('DELETE FROM markups WHERE id = ?', [id]);
    saveToStorage(db.export());
}

// Returns all markups whose range covers verseId.
export function getMarkupsForVerse(verseId) {
    const stmt = db.prepare(
        `SELECT id, verse_start, verse_end, type, color, created_at
         FROM markups
         WHERE verse_start <= ? AND COALESCE(verse_end, verse_start) >= ?
         ORDER BY created_at DESC`
    );
    stmt.bind([verseId, verseId]);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

// Returns all markups that overlap the given chapter (BBCCC prefix).
// Efficient for rendering a whole chapter — one query, not one per verse.
export function getMarkupsForChapter(bookChapter) {
    const chapterStart = bookChapter * 1000 + 1;
    const chapterEnd   = bookChapter * 1000 + 999;
    const stmt = db.prepare(
        `SELECT id, verse_start, verse_end, type, color, created_at
         FROM markups
         WHERE verse_start <= ? AND COALESCE(verse_end, verse_start) >= ?
         ORDER BY created_at DESC`
    );
    stmt.bind([chapterEnd, chapterStart]);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}

// Returns the existing markup row that exactly matches range + type, or null.
// Used to implement toggle: applying the same markup twice removes the first.
export function getExistingMarkup(verseStart, verseEnd, type) {
    const stmt = db.prepare(
        `SELECT id, verse_start, verse_end, type, color, created_at
         FROM markups
         WHERE verse_start = ?
           AND (verse_end IS ? OR (verse_end IS NOT NULL AND verse_end = ?))
           AND type = ?
         LIMIT 1`
    );
    stmt.bind([verseStart, verseEnd ?? null, verseEnd ?? null, type]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
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

    let stmt;
    if (options.showAll) {
        stmt = db.prepare(
            `SELECT target_start, target_end, votes
             FROM cross_references
             WHERE source_verse = ?
             ORDER BY votes DESC, target_start ASC`
        );
        stmt.bind([verseId]);
    } else {
        stmt = db.prepare(
            `SELECT target_start, target_end, votes
             FROM cross_references
             WHERE source_verse = ? AND votes >= ?
             ORDER BY votes DESC, target_start ASC
             LIMIT ?`
        );
        stmt.bind([verseId, floor, limit]);
    }

    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}
