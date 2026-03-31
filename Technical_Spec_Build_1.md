# Bible Study Software — Technical Specification: Build 1

---

## Overview

Build 1 is the minimum functional version of the application. It proves the core architecture by delivering: Scripture text rendering and navigation, verse selection with a contextual toolbar, basic passage-bound notes, basic tags, a side panel, full-text search, and PWA installation with offline capability.

One translation is included (KJV). The database schema includes tables for future features (cross-references, lexicon, markups, templates, plans, etc.) but only the tables needed for Build 1 functionality are populated and wired to the UI.

**The user experience of Build 1:** Open the app. See the text of Genesis 1 (or wherever you left off). Navigate to any book and chapter. Click a verse. See a toolbar. Click "Note." Write something. Tag it. Save. Navigate somewhere else. Come back. Your note is there. Search for a word or a tag. Find it instantly. Close the app. Open it again. Everything is still there, even offline.

---

## Project Structure

```
scripture-study/
├── index.html              # Single HTML page — app shell
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── css/
│   └── style.css           # All styles, CSS custom properties for theming
├── js/
│   ├── app.js              # Entry point, app initialization
│   ├── db.js               # Database initialization, queries, and helpers
│   ├── reader.js           # Scripture rendering, chapter navigation
│   ├── selection.js        # Verse/range selection and contextual toolbar
│   ├── notes.js            # Note creation, editing, display
│   ├── tags.js             # Tag creation, assignment, autocomplete
│   ├── sidepanel.js        # Side panel rendering and tab management
│   ├── search.js           # Full-text search interface and queries
│   └── state.js            # Simple application state management
├── data/
│   └── core.db             # SQLite database (KJV text, empty future tables)
└── fonts/
    └── (system fonts used; no custom fonts in Build 1)
```

All JavaScript is vanilla — no framework, no build step, no bundler. Files are loaded as ES modules via `<script type="module">`. The database file is loaded via sql.js (WebAssembly).

---

## Database

### sql.js Setup

sql.js is loaded from a local copy (no CDN dependency for offline use). The WASM binary is bundled with the app.

```javascript
// db.js — initialization
import initSqlJs from './vendor/sql-wasm.js';

let db = null;

export async function initDatabase() {
    const SQL = await initSqlJs({
        locateFile: file => `./vendor/${file}`
    });

    // Try to load existing database from persistent storage
    const stored = await loadFromStorage();
    if (stored) {
        db = new SQL.Database(new Uint8Array(stored));
    } else {
        // First visit: fetch the shipped database
        const response = await fetch('./data/core.db');
        const buffer = await response.arrayBuffer();
        db = new SQL.Database(new Uint8Array(buffer));
        await saveToStorage(db.export());
    }

    // Ensure user tables exist (idempotent)
    createUserTables();

    return db;
}
```

Persistent storage uses OPFS where available, falling back to IndexedDB:

```javascript
async function saveToStorage(data) {
    // Attempt OPFS first
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        try {
            const root = await navigator.storage.getDirectory();
            const handle = await root.getFileHandle('core.db', { create: true });
            const writable = await handle.createWritable();
            await writable.write(data);
            await writable.close();
            return;
        } catch (e) {
            // Fall through to IndexedDB
        }
    }

    // IndexedDB fallback
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ScriptureStudy', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('db');
        };
        request.onsuccess = () => {
            const tx = request.result.transaction('db', 'readwrite');
            tx.objectStore('db').put(data, 'core');
            tx.oncomplete = resolve;
            tx.onerror = reject;
        };
        request.onerror = reject;
    });
}

async function loadFromStorage() {
    // Attempt OPFS first
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

    // IndexedDB fallback
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
```

Database changes are persisted after every write operation (note save, tag creation, etc.) by calling `saveToStorage(db.export())`. This is simple and reliable for the data sizes involved. If performance becomes a concern with larger databases, a debounced save (e.g., save at most once per second) can be introduced.

### Schema

The full schema is created at initialization. Tables not used in Build 1 remain empty but are structurally present for future builds.

```sql
-- ============================================================
-- SCRIPTURE DATA (read-only, shipped with the app)
-- ============================================================

CREATE TABLE IF NOT EXISTS books (
    id          INTEGER PRIMARY KEY,    -- 1-66, standard KJV ordering
    name        TEXT NOT NULL,          -- "Genesis", "Exodus", etc.
    abbrev      TEXT NOT NULL,          -- "Gen", "Exo", etc.
    testament   TEXT NOT NULL,          -- "OT" or "NT"
    genre       TEXT NOT NULL,          -- "law", "history", "poetry", "prophecy", "gospel", "epistle", "apocalyptic"
    chapters    INTEGER NOT NULL        -- number of chapters in the book
);

CREATE TABLE IF NOT EXISTS translations (
    id          TEXT PRIMARY KEY,       -- "KJV", "BSB", "WEB"
    name        TEXT NOT NULL,          -- "King James Version"
    abbrev      TEXT NOT NULL,          -- "KJV"
    language    TEXT NOT NULL,          -- "en"
    license     TEXT NOT NULL           -- "Public domain"
);

CREATE TABLE IF NOT EXISTS verses (
    id          INTEGER PRIMARY KEY,    -- composite: BBCCCVVV (e.g., 01001001 = Gen 1:1)
    book_id     INTEGER NOT NULL,
    chapter     INTEGER NOT NULL,
    verse       INTEGER NOT NULL,
    translation_id TEXT NOT NULL,
    text        TEXT NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (translation_id) REFERENCES translations(id)
);

CREATE INDEX IF NOT EXISTS idx_verses_location
    ON verses(book_id, chapter, verse, translation_id);

CREATE INDEX IF NOT EXISTS idx_verses_translation
    ON verses(translation_id, book_id, chapter);

-- FTS5 virtual table for full-text search across Scripture text
CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
    text,
    content='verses',
    content_rowid='rowid'
);

-- Versification mappings (empty at launch)
CREATE TABLE IF NOT EXISTS verse_mappings (
    from_translation TEXT NOT NULL,
    from_verse_id    INTEGER NOT NULL,
    to_translation   TEXT NOT NULL,
    to_verse_id      INTEGER NOT NULL,
    PRIMARY KEY (from_translation, from_verse_id, to_translation)
);

-- Cross-references (empty in Build 1, populated in Build 2)
CREATE TABLE IF NOT EXISTS cross_references (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    from_verse_start INTEGER NOT NULL,
    from_verse_end   INTEGER,           -- NULL if single verse
    to_verse_start   INTEGER NOT NULL,
    to_verse_end     INTEGER,           -- NULL if single verse
    source          TEXT NOT NULL,       -- "tsk", "openbible", "user"
    relevance       INTEGER DEFAULT 0   -- vote count from OpenBible, 0 for TSK/user
);

CREATE INDEX IF NOT EXISTS idx_xref_from ON cross_references(from_verse_start);
CREATE INDEX IF NOT EXISTS idx_xref_to ON cross_references(to_verse_start);

-- Original language data (empty in Build 1)
CREATE TABLE IF NOT EXISTS original_words (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id        INTEGER NOT NULL,
    word_position   INTEGER NOT NULL,
    original_text   TEXT NOT NULL,       -- Hebrew/Greek Unicode
    strongs_number  TEXT NOT NULL,       -- e.g., "H1234" or "G5678"
    morphology      TEXT,               -- morphology code
    FOREIGN KEY (verse_id) REFERENCES verses(id)
);

CREATE INDEX IF NOT EXISTS idx_origwords_verse ON original_words(verse_id);
CREATE INDEX IF NOT EXISTS idx_origwords_strongs ON original_words(strongs_number);

-- Lexicon (empty in Build 1)
CREATE TABLE IF NOT EXISTS lexicon (
    strongs_number  TEXT PRIMARY KEY,   -- "H1234" or "G5678"
    original_word   TEXT NOT NULL,
    transliteration TEXT,
    pronunciation   TEXT,
    short_def       TEXT NOT NULL,
    full_def        TEXT
);

-- ============================================================
-- USER DATA (read-write)
-- ============================================================

CREATE TABLE IF NOT EXISTS notes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    body                TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    modified_at         TEXT NOT NULL DEFAULT (datetime('now')),
    visibility          TEXT NOT NULL DEFAULT 'private',  -- 'private' or 'shareable'
    parent_note_id      INTEGER,                          -- NULL = top-level note
    template_session_id INTEGER,                          -- NULL = freeform note; references session_records(id)
    study_id            INTEGER,                          -- NULL = freeform note (not part of any study)
    FOREIGN KEY (parent_note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (template_session_id) REFERENCES session_records(id),
    FOREIGN KEY (study_id) REFERENCES studies(id)
);

CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_note_id);
CREATE INDEX IF NOT EXISTS idx_notes_study ON notes(study_id);

-- FTS5 for searching note content
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    body,
    content='notes',
    content_rowid='id'
);

CREATE TABLE IF NOT EXISTS note_anchors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id         INTEGER NOT NULL,
    verse_start     INTEGER NOT NULL,   -- BBCCCVVV format
    verse_end       INTEGER,            -- NULL if single verse
    word_position   INTEGER,            -- NULL if not word-level
    strongs_number  TEXT,               -- NULL if not word-level
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_anchors_note ON note_anchors(note_id);
CREATE INDEX IF NOT EXISTS idx_anchors_verse ON note_anchors(verse_start);

CREATE TABLE IF NOT EXISTS tags (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL UNIQUE,        -- normalized lowercase
    type    TEXT NOT NULL DEFAULT 'tag'  -- 'tag' or 'theme'
);

CREATE TABLE IF NOT EXISTS tag_assignments (
    tag_id  INTEGER NOT NULL,
    note_id INTEGER NOT NULL,
    PRIMARY KEY (tag_id, note_id),
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tagassign_note ON tag_assignments(note_id);

-- Studies (empty in Build 1)
CREATE TABLE IF NOT EXISTS studies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL DEFAULT 'Untitled Study',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    modified_at TEXT NOT NULL DEFAULT (datetime('now')),
    status      TEXT NOT NULL DEFAULT 'active'  -- 'active', 'archived'
);

CREATE INDEX IF NOT EXISTS idx_studies_status ON studies(status);
CREATE INDEX IF NOT EXISTS idx_studies_modified ON studies(modified_at);

-- Note quotes (empty in Build 1) — inline Scripture quotations embedded in notes
CREATE TABLE IF NOT EXISTS note_quotes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id     INTEGER NOT NULL,
    verse_start INTEGER NOT NULL,       -- BBCCCVVV format
    verse_end   INTEGER,                -- NULL if single verse
    position    INTEGER NOT NULL,       -- character offset in note body where quote is inserted
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotes_note ON note_quotes(note_id);

-- Text markups (empty in Build 1)
CREATE TABLE IF NOT EXISTS text_markups (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_start     INTEGER NOT NULL,
    verse_end       INTEGER,
    word_position   INTEGER,
    markup_type     TEXT NOT NULL,       -- 'highlight', 'underline', 'circle'
    color           TEXT NOT NULL,       -- hex color code
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_markups_verse ON text_markups(verse_start);

CREATE TABLE IF NOT EXISTS bookmarks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id    INTEGER NOT NULL,
    label       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Study templates (empty in Build 1)
CREATE TABLE IF NOT EXISTS study_templates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    description     TEXT,
    estimated_time  TEXT,
    is_builtin      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_steps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id     INTEGER NOT NULL,
    step_number     INTEGER NOT NULL,
    prompt          TEXT NOT NULL,
    input_type      TEXT NOT NULL DEFAULT 'text',  -- 'text', 'passage', 'tag', 'word'
    help_text       TEXT,
    target_verse_start INTEGER,
    target_verse_end   INTEGER,
    tool_to_open    TEXT,               -- 'crossrefs', 'language', etc.
    highlight_range TEXT,
    FOREIGN KEY (template_id) REFERENCES study_templates(id) ON DELETE CASCADE
);

-- Reading plans (empty in Build 1)
CREATE TABLE IF NOT EXISTS plans (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    type                TEXT NOT NULL,   -- 'book', 'chronological', 'custom'
    template_id         INTEGER,         -- NULL = no workflow
    sharing_destination TEXT,
    FOREIGN KEY (template_id) REFERENCES study_templates(id)
);

CREATE TABLE IF NOT EXISTS plan_days (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     INTEGER NOT NULL,
    day_number  INTEGER NOT NULL,
    verse_start INTEGER NOT NULL,
    verse_end   INTEGER NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plan_progress (
    plan_id     INTEGER NOT NULL,
    day_number  INTEGER NOT NULL,
    completed   INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (plan_id, day_number),
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- Session records (empty in Build 1)
CREATE TABLE IF NOT EXISTS session_records (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id         INTEGER,                            -- NULL = freeform session
    verse_start         INTEGER NOT NULL,                   -- passage range start (BBCCCVVV)
    verse_end           INTEGER NOT NULL,                   -- passage range end (BBCCCVVV)
    current_step        INTEGER NOT NULL DEFAULT 0,         -- 0-indexed step position
    started_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    status              TEXT NOT NULL DEFAULT 'in-progress', -- 'in-progress', 'complete', 'ended'
    visibility_default  TEXT NOT NULL DEFAULT 'private',
    note_ids_json       TEXT,                               -- JSON array of note IDs created during session
    tags_used_json      TEXT,                               -- JSON array of tag names used
    FOREIGN KEY (template_id) REFERENCES study_templates(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON session_records(status);
CREATE INDEX IF NOT EXISTS idx_sessions_template ON session_records(template_id);

-- Memory verses (empty in Build 1)
CREATE TABLE IF NOT EXISTS memory_verses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_start     INTEGER NOT NULL,
    verse_end       INTEGER,
    next_review     TEXT,
    interval_days   INTEGER NOT NULL DEFAULT 1,
    ease_factor     REAL NOT NULL DEFAULT 2.5,
    repetitions     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memory_reviews (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id       INTEGER NOT NULL,
    reviewed_at     TEXT NOT NULL DEFAULT (datetime('now')),
    quality         INTEGER NOT NULL,   -- 0-5 SM-2 scale
    FOREIGN KEY (memory_id) REFERENCES memory_verses(id) ON DELETE CASCADE
);

-- App state (simple key-value for persisting current location, preferences, etc.)
CREATE TABLE IF NOT EXISTS app_state (
    key     TEXT PRIMARY KEY,
    value   TEXT
);
```

### Verse ID System

The composite verse ID follows the scrollmapper convention: `BBCCCVVV` where BB = book number (01-66), CCC = chapter (001-150), VVV = verse (001-176).

Examples:
- Genesis 1:1 = `01001001`
- Psalm 119:176 = `19119176`
- Revelation 22:21 = `66022021`

Helper functions in db.js:

```javascript
export function makeVerseId(book, chapter, verse) {
    return book * 1000000 + chapter * 1000 + verse;
}

export function parseVerseId(id) {
    const book = Math.floor(id / 1000000);
    const chapter = Math.floor((id % 1000000) / 1000);
    const verse = id % 1000;
    return { book, chapter, verse };
}
```

### Core Queries (db.js exports)

```javascript
// Get all verses for a chapter
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

// Get book metadata
export function getBooks() {
    return db.exec("SELECT * FROM books ORDER BY id")[0]?.values.map(row => ({
        id: row[0], name: row[1], abbrev: row[2],
        testament: row[3], genre: row[4], chapters: row[5]
    })) || [];
}

// Get a single book
export function getBook(bookId) {
    const stmt = db.prepare("SELECT * FROM books WHERE id = ?");
    stmt.bind([bookId]);
    let book = null;
    if (stmt.step()) {
        book = stmt.getAsObject();
    }
    stmt.free();
    return book;
}

// Save a note and return its ID
export function saveNote(body, anchors, tagNames) {
    db.run("INSERT INTO notes (body) VALUES (?)", [body]);
    const noteId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

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
        db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [normalized]);
        const tagId = db.exec(
            "SELECT id FROM tags WHERE name = ?", [normalized]
        )[0].values[0][0];
        db.run(
            "INSERT OR IGNORE INTO tag_assignments (tag_id, note_id) VALUES (?, ?)",
            [tagId, noteId]
        );
    }

    // Update FTS index
    db.run("INSERT INTO notes_fts(rowid, body) VALUES (?, ?)", [noteId, body]);

    saveToStorage(db.export());
    return noteId;
}

// Update an existing note
export function updateNote(noteId, body) {
    db.run(
        "UPDATE notes SET body = ?, modified_at = datetime('now') WHERE id = ?",
        [body, noteId]
    );
    // Update FTS
    db.run("DELETE FROM notes_fts WHERE rowid = ?", [noteId]);
    db.run("INSERT INTO notes_fts(rowid, body) VALUES (?, ?)", [noteId, body]);

    saveToStorage(db.export());
}

// Delete a note
export function deleteNote(noteId) {
    db.run("DELETE FROM notes WHERE id = ?", [noteId]);
    db.run("DELETE FROM notes_fts WHERE rowid = ?", [noteId]);
    saveToStorage(db.export());
}

// Get notes for a verse (any note anchored to a range containing this verse)
export function getNotesForVerse(verseId) {
    const stmt = db.prepare(
        `SELECT DISTINCT n.id, n.body, n.created_at, n.modified_at
         FROM notes n
         JOIN note_anchors a ON a.note_id = n.id
         WHERE a.verse_start <= ? AND (a.verse_end >= ? OR a.verse_end IS NULL)
         AND n.parent_note_id IS NULL
         ORDER BY n.created_at DESC`
    );
    stmt.bind([verseId, verseId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();

    // Attach tags to each note
    for (const note of results) {
        note.tags = getTagsForNote(note.id);
        note.anchors = getAnchorsForNote(note.id);
    }
    return results;
}

// Get tags for a note
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

// Get anchors for a note
export function getAnchorsForNote(noteId) {
    const stmt = db.prepare(
        "SELECT * FROM note_anchors WHERE note_id = ?"
    );
    stmt.bind([noteId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// Get all tags (for autocomplete)
export function getAllTags() {
    return db.exec("SELECT id, name, type FROM tags ORDER BY name")[0]?.values.map(
        row => ({ id: row[0], name: row[1], type: row[2] })
    ) || [];
}

// Full-text search across verses and notes
export function search(query) {
    const verseResults = [];
    const noteResults = [];

    // Search Scripture text
    try {
        const vstmt = db.prepare(
            `SELECT v.id, v.book_id, v.chapter, v.verse, v.text, b.name as book_name
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

    // Search notes
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
            note.type = 'note';
            note.tags = getTagsForNote(note.id);
            note.anchors = getAnchorsForNote(note.id);
            noteResults.push(note);
        }
        nstmt.free();
    } catch (e) {
        // FTS query syntax error — skip note results
    }

    // Search tags by name
    const tagResults = [];
    const tstmt = db.prepare(
        "SELECT id, name, type FROM tags WHERE name LIKE ? LIMIT 20"
    );
    tstmt.bind([`%${query.toLowerCase()}%`]);
    while (tstmt.step()) {
        tagResults.push({ type: 'tag', ...tstmt.getAsObject() });
    }
    tstmt.free();

    return { verses: verseResults, notes: noteResults, tags: tagResults };
}

// App state helpers
export function getState(key) {
    const result = db.exec("SELECT value FROM app_state WHERE key = ?", [key]);
    return result[0]?.values[0]?.[0] || null;
}

export function setState(key, value) {
    db.run(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)",
        [key, typeof value === 'string' ? value : JSON.stringify(value)]
    );
    saveToStorage(db.export());
}

function getCurrentTranslation() {
    return getState('translation') || 'KJV';
}
```

### Implementation Notes (db.js)

The following deviations and decisions were made during Build 1 implementation:

- **`window.initSqlJs` instead of `import`** — `sql-wasm.js` is loaded as a plain `<script>` tag (not a module), so it exposes `initSqlJs` as a browser global. ES modules must reference it as `window.initSqlJs`.

- **`locateFile` path is `./js/vendor/${file}`** — the spec shows `./vendor/${file}`, but since files are served from the project root, the correct path to the WASM binary is `./js/vendor/sql-wasm.wasm`.

- **`saveNote` accepts an optional `studyId`** — signature is `saveNote(body, anchors, tagNames, studyId = null)`. When a `studyId` is provided, the function also bumps `studies.modified_at`.

- **`updateNote` propagates `modified_at` to parent study** — after updating a note, if it has a `study_id`, the study's `modified_at` is updated to keep the All Studies list sorted correctly.

- **`getCurrentTranslation` is exported** — the spec marks it as a private function, but it is useful to other modules (e.g., reader) so it is exported.

- **`createUserTables` runs on every init** — all `CREATE TABLE IF NOT EXISTS` statements run idempotently at startup. The shipped `core.db` already contains these tables, but this guards against schema drift across versions.

### Session Lifecycle Queries

These queries support the template bar's session management. They are not wired to UI in Build 1 (templates are Build 3), but the schema must support them.

**Get in-progress sessions for the selector menu:**

```sql
SELECT sr.id, sr.template_id, sr.verse_start, sr.verse_end,
       sr.current_step, sr.updated_at, st.name AS template_name,
       (SELECT COUNT(*) FROM template_steps ts WHERE ts.template_id = sr.template_id) AS total_steps
FROM session_records sr
JOIN study_templates st ON st.id = sr.template_id
WHERE sr.status = 'in-progress'
ORDER BY sr.updated_at DESC
```

**Start a new session:**

```sql
INSERT INTO session_records (template_id, verse_start, verse_end, status, visibility_default)
VALUES (?, ?, ?, 'in-progress', ?)
```

**Update session progress (on step change):**

```sql
UPDATE session_records
SET current_step = ?, updated_at = datetime('now')
WHERE id = ?
```

**Complete a session:**

```sql
UPDATE session_records
SET status = 'complete', current_step = ?, updated_at = datetime('now')
WHERE id = ?
```

**End a session early:**

```sql
UPDATE session_records
SET status = 'ended', updated_at = datetime('now')
WHERE id = ?
```

### Study Lifecycle Queries

These queries support the study grouping and Notebook features.

**Create a new study:**

```sql
INSERT INTO studies (name) VALUES (?)
```

**List all studies (for Notebook):**

```sql
SELECT s.id, s.name, s.created_at, s.modified_at, s.status,
       COUNT(n.id) AS note_count
FROM studies s
LEFT JOIN notes n ON n.study_id = s.id
GROUP BY s.id
ORDER BY s.modified_at DESC
```

**Get notes for a study:**

```sql
SELECT n.id, n.body, n.created_at, n.modified_at
FROM notes n
WHERE n.study_id = ?
ORDER BY n.created_at ASC
```

**Associate a note with a study:**

```sql
UPDATE notes SET study_id = ?, modified_at = datetime('now') WHERE id = ?
```

**Update study timestamp (called when any note in the study is modified):**

```sql
UPDATE studies SET modified_at = datetime('now') WHERE id = ?
```

**Archive a study:**

```sql
UPDATE studies SET status = 'archived', modified_at = datetime('now') WHERE id = ?
```

---

## Application Shell (index.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scripture Study</title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="manifest" href="manifest.json">
</head>
<body>
    <div id="app">
        <header id="app-header">
            <div id="nav-controls">
                <button id="book-selector-btn" aria-label="Select book"></button>
                <span id="current-location"></span>
                <button id="prev-chapter" aria-label="Previous chapter">‹</button>
                <button id="next-chapter" aria-label="Next chapter">›</button>
            </div>
            <div id="search-bar">
                <input type="text" id="search-input" placeholder="Search Scripture and notes…" />
            </div>
            <div id="translation-label">KJV</div>
        </header>

        <main id="workspace">
            <section id="reader">
                <div id="scripture-text"></div>
            </section>

            <aside id="side-panel" class="hidden">
                <div id="panel-tabs">
                    <button class="panel-tab active" data-tab="notes">Notes</button>
                    <!-- Future tabs: Cross-refs, Language, etc. -->
                </div>
                <div id="panel-content">
                    <div id="notes-panel" class="tab-content active"></div>
                </div>
                <button id="panel-close" aria-label="Close panel">×</button>
            </aside>
        </main>

        <!-- Contextual toolbar (positioned dynamically near selection) -->
        <div id="context-toolbar" class="hidden">
            <button data-action="note" title="Add note">Note</button>
            <button data-action="tag" title="Add tag">Tag</button>
            <button data-action="bookmark" title="Bookmark" disabled>Bookmark</button>
            <button data-action="crossrefs" title="Cross-references" disabled>Cross-refs</button>
        </div>

        <!-- Book/chapter selector overlay -->
        <div id="book-overlay" class="hidden">
            <div id="book-list"></div>
            <div id="chapter-grid" class="hidden"></div>
        </div>

        <!-- Search results overlay -->
        <div id="search-results" class="hidden"></div>

        <!-- Loading screen -->
        <div id="loading">Loading Scripture…</div>
    </div>

    <script src="js/vendor/sql-wasm.js"></script>
    <script type="module" src="js/app.js"></script>
</body>
</html>
```

### HTML / CSS Structural Notes (Future Builds)

The following structural changes are documented here for reference. They are not implemented in Build 1 but the schema supports them.

**Template bar:** The template bar element (`#template-bar`) is placed in the `#app-frame` layout between `#title-bar` and `#main`, spanning the full application width. The selector menu within the bar renders four groups: in-progress sessions, start new, actions, and end session. This markup is detailed in the Template Bar Design document and the companion wireframe (`ember-wireframe-template-bar.html`).

**Side panel simplification:** The `#study-section` element previously in the side panel is removed. The side panel contains two sections (`#notes-section` and `#tools-section`) with a single resize handle between them.

**Notes panel:** The notes panel header gains two new elements: (1) A Notebook icon at the top-left of `#notes-section` header that opens a floating overlay (`#notebook-overlay`) listing all studies, and (2) a study tab bar below the notes header, rendered as a horizontal scrollable row of tabs with a "+" button for creating new studies.

**Reader panel:** The contextual toolbar (`#context-toolbar`) that appeared on verse click is removed. Verse click now only applies the `.selected` class to the verse element; the application listens for selection changes and updates the notes panel and reference panel contextually. A floating highlighter element (`#highlighter-toggle`) is added inside `#reader-area`, positioned with `position: sticky` or `position: fixed` relative to the reader viewport, vertically centered on the left inside edge. A bookmark button is added to the reader header bar.

**Search empty state:** When `#search-input` is focused and its value is empty, the `#search-results` container displays a static shortcuts panel (prefix shortcuts, search help link, settings link) instead of search results. The shortcuts panel is replaced by live search results as soon as the user begins typing.

---

## Module Specifications

### app.js — Entry Point

Responsibilities:
- Initialize sql.js and load the database via db.js
- Restore last reading position from app_state (or default to Genesis 1)
- Initialize all modules (reader, selection, notes, tags, sidepanel, search)
- Register the service worker
- Hide the loading screen when ready

```javascript
import { initDatabase, getState } from './db.js';
import { initReader, navigateTo } from './reader.js';
import { initSelection } from './selection.js';
import { initNotes } from './notes.js';
import { initTags } from './tags.js';
import { initSidePanel } from './sidepanel.js';
import { initSearch } from './search.js';

async function init() {
    await initDatabase();

    initReader();
    initSelection();
    initNotes();
    initTags();
    initSidePanel();
    initSearch();

    // Restore last position or default to Genesis 1
    const lastBook = parseInt(getState('currentBook')) || 1;
    const lastChapter = parseInt(getState('currentChapter')) || 1;
    navigateTo(lastBook, lastChapter);

    // Hide loading screen
    document.getElementById('loading').classList.add('hidden');

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js');
    }
}

init();
```

### reader.js — Scripture Rendering

Responsibilities:
- Render a chapter of verses into the #scripture-text container
- Each verse is a clickable element with its verse ID as a data attribute
- Handle previous/next chapter navigation
- Handle book/chapter selector overlay
- Persist current location to app_state

```javascript
import { getChapter, getBooks, getBook, setState, getNotesForVerse } from './db.js';

let currentBook = 1;
let currentChapter = 1;

export function initReader() {
    document.getElementById('prev-chapter').addEventListener('click', prevChapter);
    document.getElementById('next-chapter').addEventListener('click', nextChapter);
    document.getElementById('book-selector-btn').addEventListener('click', toggleBookOverlay);
}

export function navigateTo(bookId, chapter) {
    currentBook = bookId;
    currentChapter = chapter;

    const book = getBook(bookId);
    const verses = getChapter(bookId, chapter);
    const container = document.getElementById('scripture-text');

    // Update header
    document.getElementById('current-location').textContent =
        `${book.name} ${chapter}`;
    document.getElementById('book-selector-btn').textContent = book.abbrev;

    // Render verses
    container.innerHTML = '';
    for (const v of verses) {
        const el = document.createElement('div');
        el.className = 'verse';
        el.dataset.verseId = v.id;

        const numSpan = document.createElement('span');
        numSpan.className = 'verse-number';
        numSpan.textContent = v.verse;

        const textSpan = document.createElement('span');
        textSpan.className = 'verse-text';
        textSpan.textContent = v.text;

        // Check if this verse has notes (show indicator)
        const notes = getNotesForVerse(v.id);
        if (notes.length > 0) {
            const indicator = document.createElement('span');
            indicator.className = 'note-indicator';
            indicator.title = `${notes.length} note(s)`;
            el.appendChild(indicator);
        }

        el.appendChild(numSpan);
        el.appendChild(textSpan);
        container.appendChild(el);
    }

    // Persist location
    setState('currentBook', bookId);
    setState('currentChapter', chapter);
}

function prevChapter() {
    if (currentChapter > 1) {
        navigateTo(currentBook, currentChapter - 1);
    } else if (currentBook > 1) {
        const prevBook = getBook(currentBook - 1);
        navigateTo(currentBook - 1, prevBook.chapters);
    }
}

function nextChapter() {
    const book = getBook(currentBook);
    if (currentChapter < book.chapters) {
        navigateTo(currentBook, currentChapter + 1);
    } else if (currentBook < 66) {
        navigateTo(currentBook + 1, 1);
    }
}

function toggleBookOverlay() {
    const overlay = document.getElementById('book-overlay');
    overlay.classList.toggle('hidden');

    if (!overlay.classList.contains('hidden')) {
        renderBookList();
    }
}

function renderBookList() {
    const books = getBooks();
    const container = document.getElementById('book-list');
    container.innerHTML = '';

    for (const book of books) {
        const btn = document.createElement('button');
        btn.className = 'book-item';
        btn.textContent = book.abbrev;
        btn.title = book.name;
        btn.addEventListener('click', () => showChapterGrid(book));
        container.appendChild(btn);
    }
}

function showChapterGrid(book) {
    const grid = document.getElementById('chapter-grid');
    grid.innerHTML = '';
    grid.classList.remove('hidden');

    for (let c = 1; c <= book.chapters; c++) {
        const btn = document.createElement('button');
        btn.className = 'chapter-item';
        btn.textContent = c;
        btn.addEventListener('click', () => {
            navigateTo(book.id, c);
            document.getElementById('book-overlay').classList.add('hidden');
            grid.classList.add('hidden');
        });
        grid.appendChild(btn);
    }
}

export function getCurrentLocation() {
    return { book: currentBook, chapter: currentChapter };
}
```

### selection.js — Verse Selection and Contextual Toolbar

Responsibilities:
- Listen for clicks on verse elements
- Track selected verse(s)
- Position and show the contextual toolbar near the selection
- Dispatch actions (note, tag) to appropriate modules

```javascript
import { showNoteEditor } from './notes.js';
import { openPanel } from './sidepanel.js';

let selectedVerses = [];

export function initSelection() {
    document.getElementById('scripture-text').addEventListener('click', handleVerseClick);
    document.getElementById('context-toolbar').addEventListener('click', handleToolbarAction);

    // Close toolbar when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.verse') && !e.target.closest('#context-toolbar')) {
            hideToolbar();
        }
    });
}

function handleVerseClick(e) {
    const verseEl = e.target.closest('.verse');
    if (!verseEl) return;

    const verseId = parseInt(verseEl.dataset.verseId);

    // Clear previous selection
    document.querySelectorAll('.verse.selected').forEach(el =>
        el.classList.remove('selected')
    );

    // Select this verse
    verseEl.classList.add('selected');
    selectedVerses = [verseId];

    // Position and show toolbar
    showToolbar(verseEl);
}

function showToolbar(anchorEl) {
    const toolbar = document.getElementById('context-toolbar');
    const rect = anchorEl.getBoundingClientRect();

    toolbar.style.top = `${rect.bottom + window.scrollY + 4}px`;
    toolbar.style.left = `${rect.left + window.scrollX}px`;
    toolbar.classList.remove('hidden');
}

function hideToolbar() {
    document.getElementById('context-toolbar').classList.add('hidden');
    document.querySelectorAll('.verse.selected').forEach(el =>
        el.classList.remove('selected')
    );
    selectedVerses = [];
}

function handleToolbarAction(e) {
    const action = e.target.dataset?.action;
    if (!action || selectedVerses.length === 0) return;

    switch (action) {
        case 'note':
            openPanel('notes');
            showNoteEditor(selectedVerses);
            hideToolbar();
            break;
        case 'tag':
            openPanel('notes');
            showNoteEditor(selectedVerses, { focusTag: true });
            hideToolbar();
            break;
        // Future: crossrefs, bookmark, markup
    }
}

export function getSelectedVerses() {
    return [...selectedVerses];
}
```

### notes.js — Note Creation and Display

Responsibilities:
- Render the note editor in the side panel
- Save notes with passage anchors and tags
- Display existing notes for the current verse
- Edit and delete notes

```javascript
import { saveNote, updateNote, deleteNote, getNotesForVerse, parseVerseId } from './db.js';
import { getBooks } from './db.js';
import { navigateTo, getCurrentLocation } from './reader.js';

let editingNoteId = null;

export function initNotes() {
    // Notes module initialized — event listeners are set up in showNoteEditor
}

export function showNoteEditor(verseIds, options = {}) {
    const panel = document.getElementById('notes-panel');
    const verseStart = Math.min(...verseIds);
    const verseEnd = verseIds.length > 1 ? Math.max(...verseIds) : null;
    const parsed = parseVerseId(verseStart);
    const books = getBooks();
    const bookName = books.find(b => b.id === parsed.book)?.name || '';

    const locationLabel = verseEnd
        ? `${bookName} ${parsed.chapter}:${parsed.verse}–${parseVerseId(verseEnd).verse}`
        : `${bookName} ${parsed.chapter}:${parsed.verse}`;

    // Show existing notes for this verse, plus the editor
    const existingNotes = getNotesForVerse(verseStart);

    panel.innerHTML = `
        <div class="notes-section">
            <h3 class="notes-header">Notes for ${locationLabel}</h3>

            <div id="existing-notes">
                ${existingNotes.map(note => renderNoteCard(note)).join('')}
            </div>

            <div id="note-editor">
                <div class="editor-anchor">${locationLabel}</div>
                <textarea id="note-body" placeholder="Write your note…" rows="4"></textarea>
                <div class="editor-tags">
                    <input type="text" id="tag-input" placeholder="Add tags (press Enter)" />
                    <div id="tag-chips"></div>
                    <div id="tag-suggestions" class="hidden"></div>
                </div>
                <div class="editor-actions">
                    <button id="save-note">Save</button>
                    <button id="cancel-note" class="secondary">Cancel</button>
                </div>
            </div>
        </div>
    `;

    const pendingTags = [];

    // Tag input handling
    const tagInput = document.getElementById('tag-input');
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && tagInput.value.trim()) {
            e.preventDefault();
            addTagChip(tagInput.value.trim(), pendingTags);
            tagInput.value = '';
        }
    });

    // Autocomplete is handled in tags.js
    import('./tags.js').then(({ setupAutocomplete }) => {
        setupAutocomplete(tagInput, pendingTags);
    });

    // Save
    document.getElementById('save-note').addEventListener('click', () => {
        const body = document.getElementById('note-body').value.trim();
        if (!body && pendingTags.length === 0) return;

        if (editingNoteId) {
            updateNote(editingNoteId, body);
            editingNoteId = null;
        } else {
            saveNote(
                body,
                [{ verseStart, verseEnd }],
                pendingTags
            );
        }

        // Refresh the reader to show note indicators
        const loc = getCurrentLocation();
        navigateTo(loc.book, loc.chapter);

        // Refresh the notes list
        showNotesForVerse(verseStart);
    });

    // Cancel
    document.getElementById('cancel-note').addEventListener('click', () => {
        editingNoteId = null;
        showNotesForVerse(verseStart);
    });

    // Focus tag input if requested
    if (options.focusTag) {
        tagInput.focus();
    }

    // Wire up existing note actions
    wireNoteActions(verseStart);
}

function renderNoteCard(note) {
    const tags = note.tags.map(t =>
        `<span class="tag-chip">${t.name}</span>`
    ).join('');

    const dateStr = new Date(note.created_at).toLocaleDateString();

    return `
        <div class="note-card" data-note-id="${note.id}">
            <div class="note-body">${escapeHtml(note.body)}</div>
            <div class="note-meta">
                <span class="note-date">${dateStr}</span>
                ${tags}
            </div>
            <div class="note-actions">
                <button class="edit-note" data-note-id="${note.id}">Edit</button>
                <button class="delete-note" data-note-id="${note.id}">Delete</button>
            </div>
        </div>
    `;
}

function wireNoteActions(verseId) {
    document.querySelectorAll('.edit-note').forEach(btn => {
        btn.addEventListener('click', () => {
            const noteId = parseInt(btn.dataset.noteId);
            const notes = getNotesForVerse(verseId);
            const note = notes.find(n => n.id === noteId);
            if (note) {
                editingNoteId = noteId;
                document.getElementById('note-body').value = note.body;
                document.getElementById('note-body').focus();
            }
        });
    });

    document.querySelectorAll('.delete-note').forEach(btn => {
        btn.addEventListener('click', () => {
            const noteId = parseInt(btn.dataset.noteId);
            if (confirm('Delete this note?')) {
                deleteNote(noteId);
                const loc = getCurrentLocation();
                navigateTo(loc.book, loc.chapter);
                showNotesForVerse(verseId);
            }
        });
    });
}

export function showNotesForVerse(verseId) {
    const notes = getNotesForVerse(verseId);
    const container = document.getElementById('existing-notes');
    if (container) {
        container.innerHTML = notes.map(n => renderNoteCard(n)).join('');
        wireNoteActions(verseId);
    }
}

function addTagChip(name, pendingTags) {
    const normalized = name.toLowerCase().trim();
    if (pendingTags.includes(normalized)) return;
    pendingTags.push(normalized);

    const chips = document.getElementById('tag-chips');
    const chip = document.createElement('span');
    chip.className = 'tag-chip removable';
    chip.textContent = normalized;
    chip.addEventListener('click', () => {
        const idx = pendingTags.indexOf(normalized);
        if (idx > -1) pendingTags.splice(idx, 1);
        chip.remove();
    });
    chips.appendChild(chip);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

### tags.js — Tag Autocomplete

Responsibilities:
- Provide autocomplete suggestions from existing tags
- Allow selecting a suggestion to add it as a tag chip

```javascript
import { getAllTags } from './db.js';

export function initTags() {
    // Tags module ready — autocomplete is set up per-editor instance
}

export function setupAutocomplete(inputEl, pendingTags) {
    const suggestionsEl = document.getElementById('tag-suggestions');

    inputEl.addEventListener('input', () => {
        const query = inputEl.value.toLowerCase().trim();
        if (!query) {
            suggestionsEl.classList.add('hidden');
            return;
        }

        const allTags = getAllTags();
        const matches = allTags
            .filter(t => t.name.includes(query) && !pendingTags.includes(t.name))
            .slice(0, 5);

        if (matches.length === 0) {
            suggestionsEl.classList.add('hidden');
            return;
        }

        suggestionsEl.innerHTML = matches.map(t =>
            `<button class="suggestion" data-name="${t.name}">${t.name}</button>`
        ).join('');
        suggestionsEl.classList.remove('hidden');

        suggestionsEl.querySelectorAll('.suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                inputEl.value = '';
                suggestionsEl.classList.add('hidden');

                // Trigger the tag chip addition via a synthetic Enter
                const normalized = btn.dataset.name;
                if (!pendingTags.includes(normalized)) {
                    pendingTags.push(normalized);
                    const chips = document.getElementById('tag-chips');
                    const chip = document.createElement('span');
                    chip.className = 'tag-chip removable';
                    chip.textContent = normalized;
                    chip.addEventListener('click', () => {
                        const idx = pendingTags.indexOf(normalized);
                        if (idx > -1) pendingTags.splice(idx, 1);
                        chip.remove();
                    });
                    chips.appendChild(chip);
                }
            });
        });
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.editor-tags')) {
            suggestionsEl.classList.add('hidden');
        }
    });
}
```

### sidepanel.js — Side Panel Management

Responsibilities:
- Show/hide the side panel
- Manage tabs (only "Notes" tab in Build 1)
- Provide an API for other modules to open the panel to a specific tab

```javascript
export function initSidePanel() {
    document.getElementById('panel-close').addEventListener('click', closePanel);

    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });
}

export function openPanel(tabName = 'notes') {
    document.getElementById('side-panel').classList.remove('hidden');
    switchTab(tabName);
}

export function closePanel() {
    document.getElementById('side-panel').classList.add('hidden');
}

function switchTab(tabName) {
    document.querySelectorAll('.panel-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === tabName)
    );
    document.querySelectorAll('.tab-content').forEach(c =>
        c.classList.toggle('active', c.id === `${tabName}-panel`)
    );
}
```

### search.js — Full-Text Search

Responsibilities:
- Listen for input in the search bar
- Execute search queries via db.js
- Render results in the search results overlay
- Navigate to selected results

```javascript
import { search, parseVerseId } from './db.js';
import { navigateTo } from './reader.js';
import { openPanel } from './sidepanel.js';
import { showNoteEditor } from './notes.js';

let debounceTimer = null;

export function initSearch() {
    const input = document.getElementById('search-input');
    const resultsEl = document.getElementById('search-results');

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();

        if (!query) {
            resultsEl.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(() => {
            const results = search(query);
            renderResults(results, resultsEl);
        }, 300);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            resultsEl.classList.add('hidden');
        }
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#search-bar') && !e.target.closest('#search-results')) {
            resultsEl.classList.add('hidden');
        }
    });
}

function renderResults(results, container) {
    const sections = [];

    if (results.verses.length > 0) {
        sections.push(`
            <div class="result-group">
                <h4>Scripture</h4>
                ${results.verses.map(v => `
                    <button class="result-item verse-result"
                            data-book="${v.book_id}" data-chapter="${v.chapter}">
                        <span class="result-ref">${v.book_name} ${v.chapter}:${v.verse}</span>
                        <span class="result-preview">${truncate(v.text, 80)}</span>
                    </button>
                `).join('')}
            </div>
        `);
    }

    if (results.notes.length > 0) {
        sections.push(`
            <div class="result-group">
                <h4>Notes</h4>
                ${results.notes.map(n => {
                    const anchor = n.anchors[0];
                    const loc = anchor ? parseVerseId(anchor.verse_start) : null;
                    const tags = n.tags.map(t => t.name).join(', ');
                    return `
                        <button class="result-item note-result"
                                data-note-id="${n.id}"
                                data-verse="${anchor?.verse_start || ''}">
                            <span class="result-preview">${truncate(n.body, 80)}</span>
                            ${tags ? `<span class="result-tags">${tags}</span>` : ''}
                        </button>
                    `;
                }).join('')}
            </div>
        `);
    }

    if (results.tags.length > 0) {
        sections.push(`
            <div class="result-group">
                <h4>Tags</h4>
                ${results.tags.map(t => `
                    <button class="result-item tag-result" data-tag="${t.name}">
                        <span class="tag-chip">${t.name}</span>
                        <span class="result-type">${t.type}</span>
                    </button>
                `).join('')}
            </div>
        `);
    }

    if (sections.length === 0) {
        container.innerHTML = '<div class="no-results">No results found</div>';
    } else {
        container.innerHTML = sections.join('');
    }

    container.classList.remove('hidden');

    // Wire up click handlers
    container.querySelectorAll('.verse-result').forEach(btn => {
        btn.addEventListener('click', () => {
            navigateTo(parseInt(btn.dataset.book), parseInt(btn.dataset.chapter));
            container.classList.add('hidden');
            document.getElementById('search-input').value = '';
        });
    });

    container.querySelectorAll('.note-result').forEach(btn => {
        btn.addEventListener('click', () => {
            const verseId = parseInt(btn.dataset.verse);
            if (verseId) {
                const loc = parseVerseId(verseId);
                navigateTo(loc.book, loc.chapter);
                openPanel('notes');
                showNoteEditor([verseId]);
            }
            container.classList.add('hidden');
            document.getElementById('search-input').value = '';
        });
    });
}

function truncate(text, length) {
    if (text.length <= length) return text;
    return text.substring(0, length) + '…';
}
```

### state.js — Application State

A simple reactive state object for sharing state between modules without tight coupling.

```javascript
const state = {
    currentBook: 1,
    currentChapter: 1,
    selectedVerses: [],
    panelOpen: false,
    activeTab: 'notes'
};

const listeners = {};

export function getAppState(key) {
    return state[key];
}

export function setAppState(key, value) {
    state[key] = value;
    if (listeners[key]) {
        listeners[key].forEach(fn => fn(value));
    }
}

export function onStateChange(key, callback) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(callback);
}
```

---

## PWA Configuration

### manifest.json

```json
{
    "name": "Scripture Study",
    "short_name": "Scripture",
    "description": "A focused Bible study environment",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#1a1a2e",
    "icons": [
        {
            "src": "icons/icon-192.png",
            "sizes": "192x192",
            "type": "image/png"
        },
        {
            "src": "icons/icon-512.png",
            "sizes": "512x512",
            "type": "image/png"
        }
    ]
}
```

### sw.js — Service Worker

Cache-first strategy for the app shell and database. Network-first for nothing (fully offline app).

```javascript
const CACHE_NAME = 'scripture-study-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/db.js',
    '/js/reader.js',
    '/js/selection.js',
    '/js/notes.js',
    '/js/tags.js',
    '/js/sidepanel.js',
    '/js/search.js',
    '/js/state.js',
    '/js/vendor/sql-wasm.js',
    '/js/vendor/sql-wasm.wasm',
    '/data/core.db',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
```

---

## CSS Architecture (css/style.css)

The stylesheet uses CSS custom properties for all colors and key dimensions, making the application theme-ready from Build 1.

```css
/* ============================================================
   CSS Custom Properties — Theme Layer
   ============================================================ */
:root {
    /* Colors */
    --bg-primary: #ffffff;
    --bg-secondary: #f5f5f0;
    --bg-panel: #fafaf7;
    --bg-hover: #eeeee8;
    --bg-selected: #e8e4d9;
    --bg-toolbar: #1a1a2e;

    --text-primary: #2c2c2c;
    --text-secondary: #666660;
    --text-muted: #999990;
    --text-on-dark: #f0f0e8;

    --border-light: #e0e0d8;
    --border-medium: #ccccc4;

    --accent: #5c6b4f;
    --accent-hover: #4a5840;
    --accent-light: #e8ede4;

    --tag-bg: #e8ede4;
    --tag-text: #3d4a34;

    --note-indicator: #c4a35a;

    --danger: #a04040;
    --danger-hover: #883535;

    /* Dimensions */
    --header-height: 48px;
    --panel-width: 380px;
    --toolbar-radius: 6px;
    --content-max-width: 680px;

    /* Typography */
    --font-body: Georgia, 'Times New Roman', serif;
    --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --font-mono: 'Consolas', 'Monaco', monospace;

    --size-base: 18px;
    --size-small: 14px;
    --size-xs: 12px;
    --size-large: 22px;

    --line-height: 1.7;
}

/* Dark theme (applied via class on body or :root) */
.theme-dark {
    --bg-primary: #1a1a1e;
    --bg-secondary: #24242a;
    --bg-panel: #20202a;
    --bg-hover: #2e2e38;
    --bg-selected: #383848;
    --bg-toolbar: #2a2a3e;

    --text-primary: #d8d8d0;
    --text-secondary: #a0a098;
    --text-muted: #707068;
    --text-on-dark: #e8e8e0;

    --border-light: #333338;
    --border-medium: #444448;

    --accent: #8a9e78;
    --accent-hover: #a0b48e;
    --accent-light: #2a3328;

    --tag-bg: #2a3328;
    --tag-text: #a0b48e;

    --note-indicator: #c4a35a;
}

/* ============================================================
   Reset & Base
   ============================================================ */
*, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: var(--font-body);
    font-size: var(--size-base);
    line-height: var(--line-height);
    color: var(--text-primary);
    background: var(--bg-primary);
}

button {
    font-family: var(--font-ui);
    cursor: pointer;
    border: none;
    background: none;
    color: var(--text-primary);
}

input, textarea {
    font-family: var(--font-ui);
    font-size: var(--size-small);
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 4px;
    padding: 6px 10px;
}

textarea {
    font-family: var(--font-body);
    font-size: var(--size-base);
    resize: vertical;
}

.hidden {
    display: none !important;
}

/* ============================================================
   Header
   ============================================================ */
#app-header {
    display: flex;
    align-items: center;
    height: var(--header-height);
    padding: 0 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
    gap: 12px;
    font-family: var(--font-ui);
    font-size: var(--size-small);
}

#nav-controls {
    display: flex;
    align-items: center;
    gap: 8px;
}

#book-selector-btn {
    padding: 4px 10px;
    background: var(--bg-hover);
    border-radius: 4px;
    font-weight: 600;
    font-size: var(--size-small);
}

#current-location {
    font-weight: 600;
    min-width: 140px;
}

#prev-chapter, #next-chapter {
    padding: 4px 8px;
    font-size: var(--size-large);
    border-radius: 4px;
}

#prev-chapter:hover, #next-chapter:hover {
    background: var(--bg-hover);
}

#search-bar {
    flex: 1;
    max-width: 400px;
}

#search-input {
    width: 100%;
    padding: 6px 12px;
    border-radius: 20px;
    border: 1px solid var(--border-light);
    background: var(--bg-primary);
}

#translation-label {
    font-weight: 600;
    color: var(--text-secondary);
    padding: 4px 10px;
    background: var(--bg-hover);
    border-radius: 4px;
}

/* ============================================================
   Workspace Layout
   ============================================================ */
#workspace {
    display: flex;
    height: calc(100vh - var(--header-height));
}

#reader {
    flex: 1;
    overflow-y: auto;
    padding: 32px;
}

#scripture-text {
    max-width: var(--content-max-width);
    margin: 0 auto;
}

/* ============================================================
   Verses
   ============================================================ */
.verse {
    position: relative;
    padding: 2px 4px;
    margin: 2px 0;
    border-radius: 3px;
    cursor: pointer;
    display: inline;
}

.verse:hover {
    background: var(--bg-hover);
}

.verse.selected {
    background: var(--bg-selected);
}

.verse-number {
    font-family: var(--font-ui);
    font-size: var(--size-xs);
    font-weight: 700;
    color: var(--text-muted);
    vertical-align: super;
    margin-right: 2px;
    user-select: none;
}

.verse-text {
    /* Inherits body font */
}

.note-indicator {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--note-indicator);
    margin-left: 3px;
    vertical-align: super;
}

/* ============================================================
   Side Panel
   ============================================================ */
#side-panel {
    width: var(--panel-width);
    border-left: 1px solid var(--border-light);
    background: var(--bg-panel);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

#panel-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-light);
    padding: 0 8px;
}

.panel-tab {
    padding: 10px 16px;
    font-size: var(--size-small);
    font-weight: 600;
    color: var(--text-secondary);
    border-bottom: 2px solid transparent;
}

.panel-tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
}

#panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

#panel-close {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 18px;
    color: var(--text-muted);
    padding: 4px 8px;
}

/* ============================================================
   Contextual Toolbar
   ============================================================ */
#context-toolbar {
    position: absolute;
    z-index: 100;
    display: flex;
    gap: 2px;
    padding: 4px;
    background: var(--bg-toolbar);
    border-radius: var(--toolbar-radius);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

#context-toolbar button {
    color: var(--text-on-dark);
    padding: 6px 12px;
    font-size: var(--size-xs);
    font-weight: 600;
    border-radius: 4px;
}

#context-toolbar button:hover:not(:disabled) {
    background: rgba(255,255,255,0.1);
}

#context-toolbar button:disabled {
    opacity: 0.4;
    cursor: default;
}

/* ============================================================
   Notes
   ============================================================ */
.notes-header {
    font-family: var(--font-ui);
    font-size: var(--size-small);
    font-weight: 700;
    color: var(--text-secondary);
    margin-bottom: 12px;
}

.note-card {
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 10px;
}

.note-body {
    font-size: var(--size-small);
    line-height: 1.5;
    margin-bottom: 8px;
    white-space: pre-wrap;
}

.note-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    font-size: var(--size-xs);
    color: var(--text-muted);
}

.note-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}

.note-actions button {
    font-size: var(--size-xs);
    color: var(--text-secondary);
    padding: 2px 6px;
    border-radius: 3px;
}

.note-actions button:hover {
    background: var(--bg-hover);
}

.delete-note:hover {
    color: var(--danger) !important;
}

/* ============================================================
   Note Editor
   ============================================================ */
#note-editor {
    border-top: 1px solid var(--border-light);
    padding-top: 12px;
    margin-top: 12px;
}

.editor-anchor {
    font-family: var(--font-ui);
    font-size: var(--size-xs);
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 8px;
}

#note-body {
    width: 100%;
    min-height: 80px;
}

.editor-tags {
    margin-top: 8px;
    position: relative;
}

#tag-input {
    width: 100%;
}

#tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
}

.tag-chip {
    font-family: var(--font-ui);
    font-size: var(--size-xs);
    font-weight: 600;
    padding: 2px 8px;
    background: var(--tag-bg);
    color: var(--tag-text);
    border-radius: 10px;
}

.tag-chip.removable {
    cursor: pointer;
}

.tag-chip.removable:hover {
    text-decoration: line-through;
}

#tag-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 4px;
    z-index: 50;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

#tag-suggestions .suggestion {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    font-size: var(--size-small);
}

#tag-suggestions .suggestion:hover {
    background: var(--bg-hover);
}

.editor-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.editor-actions button {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: var(--size-small);
    font-weight: 600;
}

#save-note {
    background: var(--accent);
    color: white;
}

#save-note:hover {
    background: var(--accent-hover);
}

.secondary {
    background: var(--bg-hover);
    color: var(--text-secondary);
}

/* ============================================================
   Book/Chapter Selector Overlay
   ============================================================ */
#book-overlay {
    position: fixed;
    top: var(--header-height);
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-primary);
    z-index: 200;
    overflow-y: auto;
    padding: 24px;
}

#book-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
    gap: 6px;
    max-width: 800px;
    margin: 0 auto;
}

.book-item {
    padding: 8px;
    text-align: center;
    font-size: var(--size-small);
    font-weight: 600;
    background: var(--bg-secondary);
    border-radius: 4px;
}

.book-item:hover {
    background: var(--bg-hover);
}

#chapter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 4px;
    max-width: 600px;
    margin: 16px auto 0;
}

.chapter-item {
    padding: 8px;
    text-align: center;
    font-size: var(--size-small);
    background: var(--bg-secondary);
    border-radius: 4px;
}

.chapter-item:hover {
    background: var(--accent-light);
}

/* ============================================================
   Search Results
   ============================================================ */
#search-results {
    position: absolute;
    top: var(--header-height);
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 600px;
    max-height: 60vh;
    overflow-y: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    z-index: 150;
    padding: 12px;
}

.result-group {
    margin-bottom: 16px;
}

.result-group h4 {
    font-family: var(--font-ui);
    font-size: var(--size-xs);
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
}

.result-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: 4px;
    font-size: var(--size-small);
}

.result-item:hover {
    background: var(--bg-hover);
}

.result-ref {
    font-weight: 700;
    color: var(--accent);
    margin-right: 8px;
}

.result-preview {
    color: var(--text-secondary);
}

.result-tags {
    font-size: var(--size-xs);
    color: var(--text-muted);
    display: block;
    margin-top: 2px;
}

.no-results {
    text-align: center;
    color: var(--text-muted);
    font-size: var(--size-small);
    padding: 24px;
}

/* ============================================================
   Loading Screen
   ============================================================ */
#loading {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--size-large);
    z-index: 999;
}
```

---

## Data Preparation

### Step 1: Obtain the KJV Data

Download the scrollmapper bible_databases repository. The KJV text is available in SQLite format.

Source: `https://github.com/scrollmapper/bible_databases`

The relevant data:
- `t_kjv` table — verse ID, book number, chapter, verse, text
- `key_english` table — book number to book name mapping

### Step 2: Build the Core Database

Write a build script (Python or Node.js) that:

1. Creates a new SQLite database with the full schema above.
2. Inserts the `books` table (66 entries with name, abbreviation, testament, genre, chapter count).
3. Inserts the `translations` table (one entry for KJV).
4. Reads the KJV verse data from the scrollmapper source, converts verse IDs to the BBCCCVVV format, and inserts into the `verses` table.
5. Populates the `verses_fts` virtual table from the verses data.
6. Creates all remaining tables (empty) for future use.
7. Outputs `core.db`.

### Step 3: Verify

Run basic verification queries:
- `SELECT COUNT(*) FROM verses WHERE translation_id = 'KJV'` — expect ~31,102 rows.
- `SELECT * FROM verses WHERE id = 01001001` — expect Genesis 1:1.
- `SELECT * FROM verses WHERE id = 66022021` — expect Revelation 22:21.
- `SELECT COUNT(DISTINCT book_id) FROM verses` — expect 66.
- Test FTS: `SELECT * FROM verses_fts WHERE verses_fts MATCH 'love' LIMIT 5`.

---

## Build 1 Checklist

Before Build 1 is considered complete, verify the following scenarios work end-to-end:

1. App loads and displays Genesis 1 (or last-visited chapter) within 2 seconds.
2. Navigate to any book and chapter using the overlay selector.
3. Navigate between chapters using previous/next arrows.
4. Wrapping works: previous from Genesis 1 does nothing; next from Revelation 22 does nothing; previous from Exodus 1 goes to Genesis 50.
5. Click a verse — it highlights and the contextual toolbar appears.
6. Click away — the toolbar and highlight disappear.
7. Click "Note" on the toolbar — the side panel opens with the note editor.
8. Write a note, add two tags, save. The note appears in the existing notes list. A note indicator dot appears on the verse.
9. Navigate away and come back to the same chapter. The note indicator is still visible. Click the verse — the note appears in the side panel.
10. Edit the note. Save. The updated content appears.
11. Delete the note. It disappears. The indicator dot disappears.
12. Create notes on three different verses in three different chapters. Search for a word that appears in one of the notes. The note appears in search results. Click it — navigate to the correct chapter with the note visible.
13. Search for a Scripture word (e.g., "firmament"). Verse results appear. Click one — navigate to that chapter.
14. Close the browser. Reopen. The app loads from cache (offline). All notes and tags are preserved. The last-visited chapter is restored.
15. Install the PWA. It launches in a standalone window with no browser chrome.
16. Toggle to dark theme (if theme toggle is included) — all colors update.

---

## What Comes Next (Build 2 Preview)

Build 2 adds:
- BSB and WEB translations with parallel view
- Cross-references (merged TSK + OpenBible dataset)
- Text markups (highlight, underline, circle with six colors)
- A basic reading plan (one built-in plan with progress tracking)
- Bookmarks
- The plan-aware home screen

Build 3 adds:
- Study templates (built-in templates + template creator form)
- Nested notes
- Tag palette with drag-and-drop
- Session summaries and continuity
- Export (JSON and Markdown)

These builds are additive. Nothing in Build 2 or 3 requires reworking Build 1 code — only extending it.

---

## Design Revision: Notes Module

The notes.js spec above (textarea editor, Save/Cancel buttons, panel-based display) was
superseded during Build 1 implementation. The revised design is documented here.

### Core principle: study as document

Every note belongs to a study — there are no freeform notes. A study works like a simple
text document. Notes are displayed as inline editable blocks stacked vertically within the
study document.

### Note lifecycle

1. Open or create a study via the tab bar (+ button creates and opens immediately)
2. Optionally select a verse in the reader (adds a verse anchor to the next note)
3. Click "+ Add Note" at the bottom of the study document
4. Type directly in the note block — contenteditable div, no separate overlay
5. Autosave fires 800ms after the last keystroke (no Save button)
6. Tags entered inline per note — type and press Enter to add a chip
7. Delete button on each card; drag-to-reorder is a future feature

### Notes panel views

- **Active study view** (`#notes-active-view`): the study document with note blocks
- **All Studies view** (`#notes-all-studies-view`): list of all studies; clicking one opens
  it in a new tab via `openStudy(id, name)` from panels.js

### Auto-create study

When `showNoteEditor(verseIds)` is called with no study active (e.g. navigating from search
results), a default study is auto-created named from the current passage and date:
`"Genesis 1 — March 30"`. The new study is opened in a tab immediately.

### notes.js exports

- `initNotes()` — register listeners for selection-changed and study-changed events
- `showNoteEditor(verseIds, options)` — ensure a study is open, scroll to or create a note
  for the given verses; used by search.js for navigation

### tags.js interface (established by notes.js)

Each note block contains a tag input. tags.js wires autocomplete by implementing:

    setupTagInput(inputEl, noteId, chipsEl)

notes.js calls this after building each block. Until tags.js is live, Enter-to-add
chips work without autocomplete; tags are persisted via `addNoteTag(noteId, tagName)`.

### db.js additions required

- `addNoteTag(noteId, tagName)` — create tag if needed, assign to note, save
- `removeNoteTag(noteId, tagName)` — remove tag assignment from note, save
- `ALTER TABLE notes ADD COLUMN position REAL` — run idempotently at init for
  future drag-to-reorder support (column is NULL until ordering is implemented)
