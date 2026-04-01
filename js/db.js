// db.js — Database initialization, queries, and persistence

let db             = null;
let _booksCache    = null;
let _storageWorker = null;

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

    return db;
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

export function getChapter(bookId, chapter, translationId = 'KJV') {
    const stmt = db.prepare(
        `SELECT id, verse, text FROM verses
         WHERE book_id = ? AND chapter = ? AND translation_id = ?
         ORDER BY verse`
    );
    stmt.bind([bookId, chapter, translationId]);
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
    return db.exec(
        'SELECT COUNT(*) FROM verses WHERE book_id = ? AND chapter = ? AND translation_id = "KJV"',
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

// ============================================================
// Search
// ============================================================

export function search(query) {
    const verseResults = [];
    const noteResults  = [];

    // Scripture full-text search
    try {
        const vstmt = db.prepare(
            `SELECT v.id, v.book_id, v.chapter, v.verse, v.text, b.name AS book_name
             FROM verses_fts fts
             JOIN verses v ON v.rowid = fts.rowid
             JOIN books b ON b.id = v.book_id
             WHERE verses_fts MATCH ?
             AND v.translation_id = ?
             LIMIT 50`
        );
        vstmt.bind([query, getCurrentTranslation()]);
        while (vstmt.step()) {
            verseResults.push({ type: 'verse', ...vstmt.getAsObject() });
        }
        vstmt.free();
    } catch (e) {
        // FTS query syntax error — skip verse results
    }

    // Notes full-text search
    try {
        const nstmt = db.prepare(
            `SELECT n.id, n.body, n.created_at
             FROM notes_fts fts
             JOIN notes n ON n.id = fts.rowid
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
        // FTS query syntax error — skip note results
    }

    // Tag name search
    const tagResults = [];
    const tstmt = db.prepare(
        'SELECT id, name, type FROM tags WHERE name LIKE ? LIMIT 20'
    );
    tstmt.bind([`%${query.toLowerCase()}%`]);
    while (tstmt.step()) {
        tagResults.push({ type: 'tag', ...tstmt.getAsObject() });
    }
    tstmt.free();

    return { verses: verseResults, notes: noteResults, tags: tagResults };
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

// ============================================================
// Study Queries
// ============================================================

export function createStudy(name = 'Untitled Study') {
    db.run('INSERT INTO studies (name) VALUES (?)', [name]);
    const studyId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    saveToStorage(db.export());
    return studyId;
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
