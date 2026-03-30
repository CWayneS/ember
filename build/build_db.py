#!/usr/bin/env python3
"""
build_db.py — Build script for data/core.db

Downloads the KJV text from scrollmapper/bible_databases, creates the full
application schema, populates books/translations/verses, and builds the
FTS index. All other tables are created empty for future use.

Usage:
    python3 build/build_db.py

No external packages required — uses only the Python standard library.
"""

import os
import sqlite3
import sys
import tempfile
import urllib.request

# ---------------------------------------------------------------------------
# Book metadata: (id, name, abbrev, testament, genre, chapters)
# ---------------------------------------------------------------------------
BOOKS = [
    ( 1, 'Genesis',         'Gen',  'OT', 'law',         50),
    ( 2, 'Exodus',          'Exo',  'OT', 'law',         40),
    ( 3, 'Leviticus',       'Lev',  'OT', 'law',         27),
    ( 4, 'Numbers',         'Num',  'OT', 'law',         36),
    ( 5, 'Deuteronomy',     'Deu',  'OT', 'law',         34),
    ( 6, 'Joshua',          'Jos',  'OT', 'history',     24),
    ( 7, 'Judges',          'Jdg',  'OT', 'history',     21),
    ( 8, 'Ruth',            'Rut',  'OT', 'history',      4),
    ( 9, '1 Samuel',        '1Sa',  'OT', 'history',     31),
    (10, '2 Samuel',        '2Sa',  'OT', 'history',     24),
    (11, '1 Kings',         '1Ki',  'OT', 'history',     22),
    (12, '2 Kings',         '2Ki',  'OT', 'history',     25),
    (13, '1 Chronicles',    '1Ch',  'OT', 'history',     29),
    (14, '2 Chronicles',    '2Ch',  'OT', 'history',     36),
    (15, 'Ezra',            'Ezr',  'OT', 'history',     10),
    (16, 'Nehemiah',        'Neh',  'OT', 'history',     13),
    (17, 'Esther',          'Est',  'OT', 'history',     10),
    (18, 'Job',             'Job',  'OT', 'poetry',      42),
    (19, 'Psalms',          'Psa',  'OT', 'poetry',     150),
    (20, 'Proverbs',        'Pro',  'OT', 'poetry',      31),
    (21, 'Ecclesiastes',    'Ecc',  'OT', 'poetry',      12),
    (22, 'Song of Solomon', 'Son',  'OT', 'poetry',       8),
    (23, 'Isaiah',          'Isa',  'OT', 'prophecy',    66),
    (24, 'Jeremiah',        'Jer',  'OT', 'prophecy',    52),
    (25, 'Lamentations',    'Lam',  'OT', 'prophecy',     5),
    (26, 'Ezekiel',         'Eze',  'OT', 'prophecy',    48),
    (27, 'Daniel',          'Dan',  'OT', 'prophecy',    12),
    (28, 'Hosea',           'Hos',  'OT', 'prophecy',    14),
    (29, 'Joel',            'Joe',  'OT', 'prophecy',     3),
    (30, 'Amos',            'Amo',  'OT', 'prophecy',     9),
    (31, 'Obadiah',         'Oba',  'OT', 'prophecy',     1),
    (32, 'Jonah',           'Jon',  'OT', 'prophecy',     4),
    (33, 'Micah',           'Mic',  'OT', 'prophecy',     7),
    (34, 'Nahum',           'Nah',  'OT', 'prophecy',     3),
    (35, 'Habakkuk',        'Hab',  'OT', 'prophecy',     3),
    (36, 'Zephaniah',       'Zep',  'OT', 'prophecy',     3),
    (37, 'Haggai',          'Hag',  'OT', 'prophecy',     2),
    (38, 'Zechariah',       'Zec',  'OT', 'prophecy',    14),
    (39, 'Malachi',         'Mal',  'OT', 'prophecy',     4),
    (40, 'Matthew',         'Mat',  'NT', 'gospel',      28),
    (41, 'Mark',            'Mar',  'NT', 'gospel',      16),
    (42, 'Luke',            'Luk',  'NT', 'gospel',      24),
    (43, 'John',            'Joh',  'NT', 'gospel',      21),
    (44, 'Acts',            'Act',  'NT', 'history',     28),
    (45, 'Romans',          'Rom',  'NT', 'epistle',     16),
    (46, '1 Corinthians',   '1Co',  'NT', 'epistle',     16),
    (47, '2 Corinthians',   '2Co',  'NT', 'epistle',     13),
    (48, 'Galatians',       'Gal',  'NT', 'epistle',      6),
    (49, 'Ephesians',       'Eph',  'NT', 'epistle',      6),
    (50, 'Philippians',     'Php',  'NT', 'epistle',      4),
    (51, 'Colossians',      'Col',  'NT', 'epistle',      4),
    (52, '1 Thessalonians', '1Th',  'NT', 'epistle',      5),
    (53, '2 Thessalonians', '2Th',  'NT', 'epistle',      3),
    (54, '1 Timothy',       '1Ti',  'NT', 'epistle',      6),
    (55, '2 Timothy',       '2Ti',  'NT', 'epistle',      4),
    (56, 'Titus',           'Tit',  'NT', 'epistle',      3),
    (57, 'Philemon',        'Phm',  'NT', 'epistle',      1),
    (58, 'Hebrews',         'Heb',  'NT', 'epistle',     13),
    (59, 'James',           'Jas',  'NT', 'epistle',      5),
    (60, '1 Peter',         '1Pe',  'NT', 'epistle',      5),
    (61, '2 Peter',         '2Pe',  'NT', 'epistle',      3),
    (62, '1 John',          '1Jo',  'NT', 'epistle',      5),
    (63, '2 John',          '2Jo',  'NT', 'epistle',      1),
    (64, '3 John',          '3Jo',  'NT', 'epistle',      1),
    (65, 'Jude',            'Jud',  'NT', 'epistle',      1),
    (66, 'Revelation',      'Rev',  'NT', 'apocalyptic', 22),
]

SOURCE_URL = (
    'https://github.com/scrollmapper/bible_databases'
    '/raw/master/formats/sqlite/KJV.db'
)

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_PATH  = os.path.join(PROJECT_ROOT, 'data', 'core.db')


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_source(url, dest_path):
    print(f'Downloading KJV source...')
    print(f'  {url}')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            total = int(response.headers.get('Content-Length', 0))
            downloaded = 0
            with open(dest_path, 'wb') as out:
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    out.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded * 100 // total
                        print(f'\r  {pct:3d}%  {downloaded:,} / {total:,} bytes',
                              end='', flush=True)
            print()
    except urllib.error.HTTPError as e:
        print(f'\nHTTP error {e.code}: {e.reason}', file=sys.stderr)
        print('Check that the scrollmapper repo URL is still valid.', file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f'\nNetwork error: {e.reason}', file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA = """
-- ============================================================
-- SCRIPTURE DATA (read-only, shipped with the app)
-- ============================================================

CREATE TABLE IF NOT EXISTS books (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    abbrev      TEXT NOT NULL,
    testament   TEXT NOT NULL,
    genre       TEXT NOT NULL,
    chapters    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS translations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    abbrev      TEXT NOT NULL,
    language    TEXT NOT NULL,
    license     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verses (
    id          INTEGER PRIMARY KEY,
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

CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
    text,
    content='verses',
    content_rowid='rowid'
);

CREATE TABLE IF NOT EXISTS verse_mappings (
    from_translation TEXT NOT NULL,
    from_verse_id    INTEGER NOT NULL,
    to_translation   TEXT NOT NULL,
    to_verse_id      INTEGER NOT NULL,
    PRIMARY KEY (from_translation, from_verse_id, to_translation)
);

CREATE TABLE IF NOT EXISTS cross_references (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    from_verse_start INTEGER NOT NULL,
    from_verse_end   INTEGER,
    to_verse_start   INTEGER NOT NULL,
    to_verse_end     INTEGER,
    source           TEXT NOT NULL,
    relevance        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_xref_from ON cross_references(from_verse_start);
CREATE INDEX IF NOT EXISTS idx_xref_to   ON cross_references(to_verse_start);

CREATE TABLE IF NOT EXISTS original_words (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id       INTEGER NOT NULL,
    word_position  INTEGER NOT NULL,
    original_text  TEXT NOT NULL,
    strongs_number TEXT NOT NULL,
    morphology     TEXT,
    FOREIGN KEY (verse_id) REFERENCES verses(id)
);

CREATE INDEX IF NOT EXISTS idx_origwords_verse   ON original_words(verse_id);
CREATE INDEX IF NOT EXISTS idx_origwords_strongs ON original_words(strongs_number);

CREATE TABLE IF NOT EXISTS lexicon (
    strongs_number  TEXT PRIMARY KEY,
    original_word   TEXT NOT NULL,
    transliteration TEXT,
    pronunciation   TEXT,
    short_def       TEXT NOT NULL,
    full_def        TEXT
);

-- ============================================================
-- USER DATA (read-write)
-- ============================================================

CREATE TABLE IF NOT EXISTS studies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL DEFAULT 'Untitled Study',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    modified_at TEXT NOT NULL DEFAULT (datetime('now')),
    status      TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_studies_status   ON studies(status);
CREATE INDEX IF NOT EXISTS idx_studies_modified ON studies(modified_at);

CREATE TABLE IF NOT EXISTS study_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    description    TEXT,
    estimated_time TEXT,
    is_builtin     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_steps (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id        INTEGER NOT NULL,
    step_number        INTEGER NOT NULL,
    prompt             TEXT NOT NULL,
    input_type         TEXT NOT NULL DEFAULT 'text',
    help_text          TEXT,
    target_verse_start INTEGER,
    target_verse_end   INTEGER,
    tool_to_open       TEXT,
    highlight_range    TEXT,
    FOREIGN KEY (template_id) REFERENCES study_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_records (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id        INTEGER,
    verse_start        INTEGER NOT NULL,
    verse_end          INTEGER NOT NULL,
    current_step       INTEGER NOT NULL DEFAULT 0,
    started_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    status             TEXT NOT NULL DEFAULT 'in-progress',
    visibility_default TEXT NOT NULL DEFAULT 'private',
    note_ids_json      TEXT,
    tags_used_json     TEXT,
    FOREIGN KEY (template_id) REFERENCES study_templates(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_status   ON session_records(status);
CREATE INDEX IF NOT EXISTS idx_sessions_template ON session_records(template_id);

CREATE TABLE IF NOT EXISTS notes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    body                TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    modified_at         TEXT NOT NULL DEFAULT (datetime('now')),
    visibility          TEXT NOT NULL DEFAULT 'private',
    parent_note_id      INTEGER,
    template_session_id INTEGER,
    study_id            INTEGER,
    FOREIGN KEY (parent_note_id)      REFERENCES notes(id)            ON DELETE CASCADE,
    FOREIGN KEY (template_session_id) REFERENCES session_records(id),
    FOREIGN KEY (study_id)            REFERENCES studies(id)
);

CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_note_id);
CREATE INDEX IF NOT EXISTS idx_notes_study  ON notes(study_id);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    body,
    content='notes',
    content_rowid='id'
);

CREATE TABLE IF NOT EXISTS note_anchors (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id        INTEGER NOT NULL,
    verse_start    INTEGER NOT NULL,
    verse_end      INTEGER,
    word_position  INTEGER,
    strongs_number TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_anchors_note  ON note_anchors(note_id);
CREATE INDEX IF NOT EXISTS idx_anchors_verse ON note_anchors(verse_start);

CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'tag'
);

CREATE TABLE IF NOT EXISTS tag_assignments (
    tag_id  INTEGER NOT NULL,
    note_id INTEGER NOT NULL,
    PRIMARY KEY (tag_id, note_id),
    FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tagassign_note ON tag_assignments(note_id);

CREATE TABLE IF NOT EXISTS note_quotes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id     INTEGER NOT NULL,
    verse_start INTEGER NOT NULL,
    verse_end   INTEGER,
    position    INTEGER NOT NULL,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotes_note ON note_quotes(note_id);

CREATE TABLE IF NOT EXISTS text_markups (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_start  INTEGER NOT NULL,
    verse_end    INTEGER,
    word_position INTEGER,
    markup_type  TEXT NOT NULL,
    color        TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_markups_verse ON text_markups(verse_start);

CREATE TABLE IF NOT EXISTS bookmarks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id   INTEGER NOT NULL,
    label      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    type                TEXT NOT NULL,
    template_id         INTEGER,
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
    plan_id      INTEGER NOT NULL,
    day_number   INTEGER NOT NULL,
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (plan_id, day_number),
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_verses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_start   INTEGER NOT NULL,
    verse_end     INTEGER,
    next_review   TEXT,
    interval_days INTEGER NOT NULL DEFAULT 1,
    ease_factor   REAL    NOT NULL DEFAULT 2.5,
    repetitions   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memory_reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id   INTEGER NOT NULL,
    reviewed_at TEXT    NOT NULL DEFAULT (datetime('now')),
    quality     INTEGER NOT NULL,
    FOREIGN KEY (memory_id) REFERENCES memory_verses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_state (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


# ---------------------------------------------------------------------------
# Build steps
# ---------------------------------------------------------------------------

def create_schema(conn):
    print('Creating schema...')
    conn.executescript(SCHEMA)
    print('  Done.')


def insert_books(conn):
    print('Inserting books...')
    conn.executemany(
        'INSERT INTO books (id, name, abbrev, testament, genre, chapters) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        BOOKS
    )
    print(f'  {len(BOOKS)} books inserted.')


def insert_translation(conn):
    print('Inserting translation...')
    conn.execute(
        'INSERT INTO translations (id, name, abbrev, language, license) '
        'VALUES (?, ?, ?, ?, ?)',
        ('KJV', 'King James Version', 'KJV', 'en', 'Public domain')
    )
    print('  KJV inserted.')


def insert_verses(conn, source_path):
    print('Reading verses from source database...')
    src = sqlite3.connect(source_path)
    try:
        src.row_factory = sqlite3.Row
        rows = src.execute(
            'SELECT book_id, chapter, verse, text FROM KJV_verses ORDER BY book_id, chapter, verse'
        ).fetchall()
    finally:
        src.close()

    print(f'  {len(rows):,} verses read.')
    print('Inserting verses (BBCCCVVV IDs)...')

    verse_rows = [
        (
            row['book_id'] * 1_000_000 + row['chapter'] * 1_000 + row['verse'],  # BBCCCVVV
            row['book_id'],
            row['chapter'],
            row['verse'],
            'KJV',
            row['text'],
        )
        for row in rows
    ]

    conn.executemany(
        'INSERT INTO verses (id, book_id, chapter, verse, translation_id, text) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        verse_rows
    )
    print(f'  {len(verse_rows):,} verses inserted.')
    return len(verse_rows)


def build_fts(conn):
    print('Building FTS index...')
    conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')")
    print('  verses_fts built.')


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

def verify(conn, expected_verse_count):
    print('\n--- Verification ---')
    ok = True

    def check(label, result, expected=None):
        nonlocal ok
        if expected is not None and result != expected:
            print(f'  FAIL  {label}: got {result}, expected {expected}')
            ok = False
        else:
            print(f'  pass  {label}: {result}')

    count = conn.execute(
        "SELECT COUNT(*) FROM verses WHERE translation_id = 'KJV'"
    ).fetchone()[0]
    check(f'Total KJV verses', count, expected_verse_count)

    book_count = conn.execute(
        'SELECT COUNT(DISTINCT book_id) FROM verses'
    ).fetchone()[0]
    check('Books with verses', book_count, 66)

    gen_1_1 = conn.execute(
        'SELECT text FROM verses WHERE id = ?', (1_001_001,)
    ).fetchone()
    if gen_1_1:
        print(f'  pass  Genesis 1:1 (id=1001001): "{gen_1_1[0][:72]}"')
    else:
        print('  FAIL  Genesis 1:1 not found')
        ok = False

    rev_22_21 = conn.execute(
        'SELECT text FROM verses WHERE id = ?', (66_022_021,)
    ).fetchone()
    if rev_22_21:
        print(f'  pass  Revelation 22:21 (id=66022021): "{rev_22_21[0]}"')
    else:
        print('  FAIL  Revelation 22:21 not found')
        ok = False

    fts_count = conn.execute(
        "SELECT COUNT(*) FROM verses_fts WHERE verses_fts MATCH 'love'"
    ).fetchone()[0]
    if fts_count > 0:
        print(f'  pass  FTS "love": {fts_count:,} results')
    else:
        print('  FAIL  FTS returned 0 results for "love"')
        ok = False

    psalm_119_count = conn.execute(
        'SELECT COUNT(*) FROM verses WHERE book_id = 19 AND chapter = 119'
    ).fetchone()[0]
    check('Psalm 119 verse count', psalm_119_count, 176)

    print('--------------------')
    return ok


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(os.path.join(PROJECT_ROOT, 'data'), exist_ok=True)

    if os.path.exists(OUTPUT_PATH):
        os.remove(OUTPUT_PATH)
        print(f'Removed existing {OUTPUT_PATH}')

    tmp_fd, tmp_path = tempfile.mkstemp(suffix='.db')
    os.close(tmp_fd)

    try:
        download_source(SOURCE_URL, tmp_path)

        conn = sqlite3.connect(OUTPUT_PATH)
        conn.execute('PRAGMA journal_mode = WAL')
        conn.execute('PRAGMA synchronous  = NORMAL')
        conn.execute('PRAGMA foreign_keys = OFF')  # off during bulk load

        create_schema(conn)
        insert_books(conn)
        insert_translation(conn)
        verse_count = insert_verses(conn, tmp_path)
        conn.commit()

        build_fts(conn)
        conn.commit()

        passed = verify(conn, verse_count)
        conn.close()

        size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
        print(f'\nOutput: {OUTPUT_PATH}  ({size_mb:.1f} MB)')

        if not passed:
            print('One or more verification checks failed.', file=sys.stderr)
            sys.exit(1)

        print('Build complete.')

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


if __name__ == '__main__':
    main()
