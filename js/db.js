// db.js — Database initialization, queries, and persistence

const CROSSREF_VOTE_FLOOR_DEFAULT = 5;
const CROSSREF_TOP_N_DEFAULT      = 25;

let db             = null;
let _booksCache    = null;
let _storageWorker = null;

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

    // Future drag-to-reorder: position column on notes (idempotent).
    // NULL = use created_at order. Will be populated when ordering is implemented.
    try { db.run('ALTER TABLE notes ADD COLUMN position REAL'); } catch (_) {}
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

export function deleteNote(noteId) {
    db.run('DELETE FROM notes WHERE id = ?', [noteId]);
    db.run('DELETE FROM notes_fts WHERE rowid = ?', [noteId]);
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
    // CASCADE on notes FK handles notes deletion, but notes_fts is a virtual
    // table without CASCADE — clean it up manually first.
    const noteIds = db.exec(
        'SELECT id FROM notes WHERE study_id = ?', [studyId]
    )[0]?.values.map(r => r[0]) || [];
    for (const id of noteIds) {
        db.run('DELETE FROM notes_fts WHERE rowid = ?', [id]);
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
