#!/usr/bin/env python3
"""
build_db.py — Build script for data/core.db  (Build 2 schema)

Produces core.db containing:
  - books            (66 rows, canonical metadata incl. genre)
  - translations     (manifest: 6 bundled translations)
  - cross_references (OpenBible ranked dataset, ~345,500 rows)
  - topics           (Nave's Topical Bible)
  - topic_verses     (Nave's verse mappings, BBCCCVVV keys)

Scripture text is NOT stored in core.db after Build 2. It lives in
per-translation .db files seeded by scripts/build_translation.py.

Usage:
    python3 build/build_db.py [--kjv-db PATH]

    --kjv-db PATH  Path to KJV.db built by build_translation.py.
                   Used for verse-ID validation and split-range clamping.
                   Default: data/translations-prep/output/KJV.db
"""

import argparse
import csv
import os
import re
import sqlite3
import sys
import time

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_PATH  = os.path.join(PROJECT_ROOT, 'data', 'core.db')
SOURCES_DIR  = os.path.join(SCRIPT_DIR, 'sources')
CROSSREF_SRC = os.path.join(SOURCES_DIR, 'cross_references.txt')
NAVE_CSV     = os.path.join(SOURCES_DIR, 'NavesTopicalDictionary.csv')
SPLIT_REPORT = os.path.join(PROJECT_ROOT, 'scripts', 'crossref_split_report.txt')

DEFAULT_KJV_DB = os.path.join(
    PROJECT_ROOT, 'data', 'translations-prep', 'output', 'KJV.db'
)

# ---------------------------------------------------------------------------
# Book metadata: (id, name, abbrev, testament, genre, chapters)
# ---------------------------------------------------------------------------

BOOKS = [
    ( 1, 'Genesis',         'Gen',  'OT', 'law',          50),
    ( 2, 'Exodus',          'Exo',  'OT', 'law',          40),
    ( 3, 'Leviticus',       'Lev',  'OT', 'law',          27),
    ( 4, 'Numbers',         'Num',  'OT', 'law',          36),
    ( 5, 'Deuteronomy',     'Deu',  'OT', 'law',          34),
    ( 6, 'Joshua',          'Jos',  'OT', 'history',      24),
    ( 7, 'Judges',          'Jdg',  'OT', 'history',      21),
    ( 8, 'Ruth',            'Rut',  'OT', 'history',       4),
    ( 9, '1 Samuel',        '1Sa',  'OT', 'history',      31),
    (10, '2 Samuel',        '2Sa',  'OT', 'history',      24),
    (11, '1 Kings',         '1Ki',  'OT', 'history',      22),
    (12, '2 Kings',         '2Ki',  'OT', 'history',      25),
    (13, '1 Chronicles',    '1Ch',  'OT', 'history',      29),
    (14, '2 Chronicles',    '2Ch',  'OT', 'history',      36),
    (15, 'Ezra',            'Ezr',  'OT', 'history',      10),
    (16, 'Nehemiah',        'Neh',  'OT', 'history',      13),
    (17, 'Esther',          'Est',  'OT', 'history',      10),
    (18, 'Job',             'Job',  'OT', 'poetry',       42),
    (19, 'Psalms',          'Psa',  'OT', 'poetry',      150),
    (20, 'Proverbs',        'Pro',  'OT', 'poetry',       31),
    (21, 'Ecclesiastes',    'Ecc',  'OT', 'poetry',       12),
    (22, 'Song of Solomon', 'Son',  'OT', 'poetry',        8),
    (23, 'Isaiah',          'Isa',  'OT', 'prophecy',     66),
    (24, 'Jeremiah',        'Jer',  'OT', 'prophecy',     52),
    (25, 'Lamentations',    'Lam',  'OT', 'prophecy',      5),
    (26, 'Ezekiel',         'Eze',  'OT', 'prophecy',     48),
    (27, 'Daniel',          'Dan',  'OT', 'prophecy',     12),
    (28, 'Hosea',           'Hos',  'OT', 'prophecy',     14),
    (29, 'Joel',            'Joe',  'OT', 'prophecy',      3),
    (30, 'Amos',            'Amo',  'OT', 'prophecy',      9),
    (31, 'Obadiah',         'Oba',  'OT', 'prophecy',      1),
    (32, 'Jonah',           'Jon',  'OT', 'prophecy',      4),
    (33, 'Micah',           'Mic',  'OT', 'prophecy',      7),
    (34, 'Nahum',           'Nah',  'OT', 'prophecy',      3),
    (35, 'Habakkuk',        'Hab',  'OT', 'prophecy',      3),
    (36, 'Zephaniah',       'Zep',  'OT', 'prophecy',      3),
    (37, 'Haggai',          'Hag',  'OT', 'prophecy',      2),
    (38, 'Zechariah',       'Zec',  'OT', 'prophecy',     14),
    (39, 'Malachi',         'Mal',  'OT', 'prophecy',      4),
    (40, 'Matthew',         'Mat',  'NT', 'gospel',       28),
    (41, 'Mark',            'Mar',  'NT', 'gospel',       16),
    (42, 'Luke',            'Luk',  'NT', 'gospel',       24),
    (43, 'John',            'Joh',  'NT', 'gospel',       21),
    (44, 'Acts',            'Act',  'NT', 'history',      28),
    (45, 'Romans',          'Rom',  'NT', 'epistle',      16),
    (46, '1 Corinthians',   '1Co',  'NT', 'epistle',      16),
    (47, '2 Corinthians',   '2Co',  'NT', 'epistle',      13),
    (48, 'Galatians',       'Gal',  'NT', 'epistle',       6),
    (49, 'Ephesians',       'Eph',  'NT', 'epistle',       6),
    (50, 'Philippians',     'Php',  'NT', 'epistle',       4),
    (51, 'Colossians',      'Col',  'NT', 'epistle',       4),
    (52, '1 Thessalonians', '1Th',  'NT', 'epistle',       5),
    (53, '2 Thessalonians', '2Th',  'NT', 'epistle',       3),
    (54, '1 Timothy',       '1Ti',  'NT', 'epistle',       6),
    (55, '2 Timothy',       '2Ti',  'NT', 'epistle',       4),
    (56, 'Titus',           'Tit',  'NT', 'epistle',       3),
    (57, 'Philemon',        'Phm',  'NT', 'epistle',       1),
    (58, 'Hebrews',         'Heb',  'NT', 'epistle',      13),
    (59, 'James',           'Jas',  'NT', 'epistle',       5),
    (60, '1 Peter',         '1Pe',  'NT', 'epistle',       5),
    (61, '2 Peter',         '2Pe',  'NT', 'epistle',       3),
    (62, '1 John',          '1Jo',  'NT', 'epistle',       5),
    (63, '2 John',          '2Jo',  'NT', 'epistle',       1),
    (64, '3 John',          '3Jo',  'NT', 'epistle',       1),
    (65, 'Jude',            'Jud',  'NT', 'epistle',       1),
    (66, 'Revelation',      'Rev',  'NT', 'apocalyptic',  22),
]

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA = """
-- ── Canonical book metadata ──────────────────────────────────────────────────
-- Duplicated into each translation .db file for self-containment, but kept
-- here too so screens that don't need Scripture text (book picker, reference
-- panel header) can read it without opening a translation handle.

CREATE TABLE IF NOT EXISTS books (
    id        INTEGER PRIMARY KEY,
    name      TEXT    NOT NULL,
    abbrev    TEXT    NOT NULL,
    testament TEXT    NOT NULL,
    genre     TEXT    NOT NULL,
    chapters  INTEGER NOT NULL
);

-- ── Translation manifest ──────────────────────────────────────────────────────
-- One row per installed translation. Bundled translations are seeded here
-- at build time (is_bundled = 1). User-added translations append rows at
-- install time (is_bundled = 0, future feature).

CREATE TABLE IF NOT EXISTS translations (
    id           INTEGER PRIMARY KEY,
    filename     TEXT    UNIQUE NOT NULL,
    name         TEXT    NOT NULL,
    abbreviation TEXT    NOT NULL,
    year         TEXT,
    license      TEXT,
    installed_at INTEGER NOT NULL,
    is_bundled   INTEGER NOT NULL DEFAULT 0
);

-- ── OpenBible cross-references ───────────────────────────────────────────────
-- Populated by the ingest step below (from build/sources/cross_references.txt).
-- All ~345,500 rows stored; vote floor is applied at query time in js/db.js.

CREATE TABLE IF NOT EXISTS cross_references (
    source_verse INTEGER NOT NULL,
    target_start INTEGER NOT NULL,
    target_end   INTEGER,
    votes        INTEGER NOT NULL DEFAULT 0,
    sources      TEXT    NOT NULL DEFAULT 'ob'
);

CREATE INDEX IF NOT EXISTS idx_crossrefs_source_votes
    ON cross_references(source_verse, votes DESC);

-- ── Nave's Topical Bible ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS topics (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT    NOT NULL,
    entry   TEXT    NOT NULL,
    section TEXT    NOT NULL,
    display INTEGER NOT NULL DEFAULT 0  -- 1 = visible chip, 0 = searchable only
);

CREATE INDEX IF NOT EXISTS idx_topics_name    ON topics(name);
CREATE INDEX IF NOT EXISTS idx_topics_display ON topics(display);

-- verse_id stores BBCCCVVV integers (book * 1_000_000 + chapter * 1_000 + verse).
-- No FK to a verses table — Scripture text lives in per-translation files.

CREATE TABLE IF NOT EXISTS topic_verses (
    topic_id INTEGER NOT NULL,
    verse_id INTEGER NOT NULL,
    PRIMARY KEY (topic_id, verse_id),
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topic_verses_topic ON topic_verses(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_verses_verse ON topic_verses(verse_id);
"""

# ---------------------------------------------------------------------------
# Translations manifest seed data
# ---------------------------------------------------------------------------

# filenames use lowercase to match OPFS path: translations/{filename}
TRANSLATIONS = [
    (1, 'kjv.db',   'King James Version',        'KJV',   '1611', 'Public Domain'),
    (2, 'asv.db',   'American Standard Version',  'ASV',   '1901', 'Public Domain'),
    (3, 'web.db',   'World English Bible',         'WEB',   '2000', 'Public Domain'),
    (4, 'ylt.db',   "Young's Literal Translation", 'YLT',   '1862', 'Public Domain'),
    (5, 'darby.db', 'Darby Translation',           'Darby', '1890', 'Public Domain'),
    (6, 'bsb.db',   'Berean Standard Bible',       'BSB',   '2023', 'Public Domain'),
]

# ---------------------------------------------------------------------------
# Cross-reference ingestion (ported from scripts/build_crossrefs.py)
# Verse counts are looked up from KJV.db (uses `book` column, not `book_id`).
# ---------------------------------------------------------------------------

BOOK_TOKENS = {
    'Gen':   1,  'Exod':  2,  'Lev':   3,  'Num':   4,  'Deut':  5,
    'Josh':  6,  'Judg':  7,  'Ruth':  8,  '1Sam':  9,  '2Sam': 10,
    '1Kgs': 11,  '2Kgs': 12,  '1Chr': 13,  '2Chr': 14,  'Ezra': 15,
    'Neh':  16,  'Esth': 17,  'Job':  18,  'Ps':   19,  'Prov': 20,
    'Eccl': 21,  'Song': 22,  'Isa':  23,  'Jer':  24,  'Lam':  25,
    'Ezek': 26,  'Dan':  27,  'Hos':  28,  'Joel': 29,  'Amos': 30,
    'Obad': 31,  'Jonah':32,  'Mic':  33,  'Nah':  34,  'Hab':  35,
    'Zeph': 36,  'Hag':  37,  'Zech': 38,  'Mal':  39,
    'Matt': 40,  'Mark': 41,  'Luke': 42,  'John': 43,  'Acts': 44,
    'Rom':  45,  '1Cor': 46,  '2Cor': 47,  'Gal':  48,  'Eph':  49,
    'Phil': 50,  'Col':  51,  '1Thess':52, '2Thess':53, '1Tim': 54,
    '2Tim': 55,  'Titus':56,  'Phlm': 57,  'Heb':  58,  'Jas':  59,
    '1Pet': 60,  '2Pet': 61,  '1John':62,  '2John':63,  '3John':64,
    'Jude': 65,  'Rev':  66,
}

CHAPTERS = [
    0,
    50, 40, 27, 36, 34, 24, 21, 4,  31, 24,  # Gen–2Sam
    22, 25, 29, 36, 10, 13, 10, 42, 150, 31,  # 1Kgs–Prov
    12, 8,  66, 52, 5,  48, 12, 14, 3,  9,    # Eccl–Amos
    1,  4,  7,  3,  3,  3,  2,  14, 4,         # Obad–Mal
    28, 16, 24, 21, 28, 16, 16, 13, 6,  6,    # Matt–Eph
    4,  4,  5,  3,  6,  4,  3,  1,  13, 5,    # Phil–Heb
    5,  3,  5,  1,  1,  1,  22,                # Jas–Rev
]

_verse_counts_cache: dict[tuple, int] = {}


def bbcccvvv(book: int, chapter: int, verse: int) -> int:
    return book * 1_000_000 + chapter * 1_000 + verse


def parse_ref(token: str):
    parts = token.split('.')
    if len(parts) != 3:
        return None
    book_name, chap_str, verse_str = parts
    book_id = BOOK_TOKENS.get(book_name)
    if book_id is None:
        return None
    try:
        return (book_id, int(chap_str), int(verse_str))
    except ValueError:
        return None


def get_verse_count(kjv_conn, book_id: int, chapter: int) -> int:
    """Max verse number in (book_id, chapter) from KJV.db.
    KJV.db uses column `book` (not `book_id`).
    """
    key = (book_id, chapter)
    if key not in _verse_counts_cache:
        row = kjv_conn.execute(
            'SELECT MAX(verse) FROM verses WHERE book = ? AND chapter = ?',
            (book_id, chapter),
        ).fetchone()
        _verse_counts_cache[key] = row[0] if row and row[0] else 0
    return _verse_counts_cache[key]


def split_range(kjv_conn, start_book, start_chap, start_verse,
                end_book, end_chap, end_verse, votes, split_report_lines):
    rows = []
    cross_book = (start_book != end_book)

    book = start_book
    chap = start_chap

    while True:
        seg_start_verse = start_verse if (book == start_book and chap == start_chap) else 1

        if book == end_book and chap == end_chap:
            seg_end_verse = end_verse
        else:
            seg_end_verse = get_verse_count(kjv_conn, book, chap)
            if seg_end_verse == 0:
                seg_end_verse = 999

        t_start = bbcccvvv(book, chap, seg_start_verse)
        t_end   = None if seg_start_verse == seg_end_verse else bbcccvvv(book, chap, seg_end_verse)
        rows.append((t_start, t_end))

        if book == end_book and chap == end_chap:
            break

        chap += 1
        if chap > CHAPTERS[book]:
            if book == end_book:
                break
            book += 1
            chap = 1

    if cross_book:
        orig_start = f'{start_book:02d}.{start_chap}.{start_verse}'
        orig_end   = f'{end_book:02d}.{end_chap}.{end_verse}'
        split_report_lines.append(
            f'CROSS-BOOK  {orig_start} — {orig_end}  votes={votes}  → {len(rows)} rows'
        )
        for t_start, t_end in rows:
            split_report_lines.append(f'    {t_start}  {t_end}')

    return rows


def ingest_crossrefs(conn, kjv_conn):
    print('Ingesting cross-references…')

    dedup: dict[tuple, int] = {}
    skipped    = 0
    raw_rows   = 0
    split_rows = 0
    split_report_lines: list[str] = []

    with open(CROSSREF_SRC, encoding='utf-8') as fh:
        next(fh)  # skip header row

        for line in fh:
            cols = line.rstrip('\n').split('\t')
            if len(cols) < 3:
                skipped += 1
                continue

            from_token, to_token, votes_str = cols[0], cols[1], cols[2]

            try:
                votes = int(votes_str)
            except ValueError:
                skipped += 1
                continue

            src = parse_ref(from_token)
            if src is None:
                skipped += 1
                continue
            source_verse = bbcccvvv(*src)

            if '-' in to_token:
                halves      = to_token.split('-', 1)
                t_start_ref = parse_ref(halves[0])
                t_end_ref   = parse_ref(halves[1])
                if t_start_ref is None or t_end_ref is None:
                    skipped += 1
                    continue

                sb, sc, sv = t_start_ref
                eb, ec, ev = t_end_ref
                raw_rows += 1

                if sb == eb and sc == ec:
                    t_start = bbcccvvv(sb, sc, sv)
                    t_end   = bbcccvvv(eb, ec, ev)
                    if t_start == t_end:
                        t_end = None
                    key = (source_verse, t_start, t_end)
                    dedup[key] = max(dedup.get(key, votes), votes)
                else:
                    segs = split_range(
                        kjv_conn, sb, sc, sv, eb, ec, ev, votes,
                        split_report_lines,
                    )
                    for t_start, t_end in segs:
                        split_rows += 1
                        key = (source_verse, t_start, t_end)
                        dedup[key] = max(dedup.get(key, votes), votes)
            else:
                t_ref = parse_ref(to_token)
                if t_ref is None:
                    skipped += 1
                    continue
                raw_rows += 1
                t_start = bbcccvvv(*t_ref)
                key = (source_verse, t_start, None)
                dedup[key] = max(dedup.get(key, votes), votes)

    conn.executemany(
        'INSERT INTO cross_references '
        '(source_verse, target_start, target_end, votes, sources) '
        'VALUES (?, ?, ?, ?, ?)',
        [(sv, ts, te, v, 'ob') for (sv, ts, te), v in dedup.items()],
    )

    with open(SPLIT_REPORT, 'w', encoding='utf-8') as rpt:
        rpt.write('Cross-reference split report\n')
        rpt.write('=' * 60 + '\n\n')
        rpt.write('\n'.join(split_report_lines) if split_report_lines else '(no cross-book splits)')
        rpt.write('\n')

    total = len(dedup)
    print(f'  Raw rows:      {raw_rows:>8,}')
    print(f'  From splits:   {split_rows:>8,}')
    print(f'  After dedup:   {total:>8,}')
    print(f'  Skipped:       {skipped:>8,}')
    if abs(total - 345_500) > 2_000:
        print(f'  WARNING: row count {total:,} is far from expected ~345,500', file=sys.stderr)

    return total

# ---------------------------------------------------------------------------
# Nave's Topical Bible ingestion
# (unchanged logic from previous version; valid_ids now sourced from KJV.db)
# ---------------------------------------------------------------------------

NAVE_ABBREVS = {
    'GEN':  1,  'EXO':  2,  'LEV':  3,  'NUM':  4,  'DEU':  5,
    'JOS':  6,  'JDG':  7,  'RUT':  8,  '1SA':  9,  '2SA': 10,
    '1KI': 11,  '2KI': 12,  '1CH': 13,  '2CH': 14,  'EZR': 15,
    'NEH': 16,  'EST': 17,  'JOB': 18,  'PSA': 19,  'PRO': 20,
    'ECC': 21,  'SON': 22,  'SNG': 22,  'ISA': 23,  'JER': 24,
    'LAM': 25,  'EZE': 26,  'EZK': 26,  'DAN': 27,  'HOS': 28,
    'JOE': 29,  'JOL': 29,  'AMO': 30,  'OBA': 31,  'JON': 32,
    'MIC': 33,  'NAH': 34,  'NAM': 34,  'HAB': 35,  'ZEP': 36,
    'HAG': 37,  'ZEC': 38,  'MAL': 39,
    'MAT': 40,  'MAR': 41,  'MRK': 41,  'LUK': 42,  'JOH': 43,
    'JHN': 43,  'ACT': 44,  'ROM': 45,  '1CO': 46,  '2CO': 47,
    'GAL': 48,  'EPH': 49,  'PHP': 50,  'PHI': 50,  'COL': 51,
    '1TH': 52,  '2TH': 53,  '1TI': 54,  '2TI': 55,  'TIT': 56,
    'PHM': 57,  'HEB': 58,  'JAS': 59,  '1PE': 60,  '2PE': 61,
    '1JO': 62,  '1JN': 62,  '1JHN': 62,
    '2JO': 63,  '2JN': 63,
    '3JO': 64,  '3JN': 64,
    'JUD': 65,  'REV': 66,
}

_ANCHOR_RE = re.compile(r'\b([1-3]?[A-Z]{2,4})(?![A-Za-z])\s+(\d+)(?::([\d,\-]+))?')
_BARE_RE   = re.compile(r'(?<![:\d])(\d+):([\d,\-]+)')


def _expand_spec(chapter, spec):
    pairs = []
    spec = spec.strip('.,;) ')
    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            halves = part.split('-', 1)
            try:
                start, end = int(halves[0]), int(halves[1])
                for v in range(start, end + 1):
                    pairs.append((chapter, v))
            except (ValueError, IndexError):
                pass
        else:
            try:
                pairs.append((chapter, int(part)))
            except ValueError:
                pass
    return pairs


def parse_nave_refs(entry_text):
    triples  = []
    unparsed = []
    current_book = None

    for line in entry_text.splitlines():
        line = line.strip().lstrip('-').strip()
        if not line or re.match(r'^See\b', line, re.IGNORECASE):
            continue

        for seg in line.split(';'):
            seg = seg.strip()
            if not seg:
                continue

            anchor = _ANCHOR_RE.search(seg)
            if anchor:
                abbrev = anchor.group(1)
                if abbrev in NAVE_ABBREVS:
                    current_book = NAVE_ABBREVS[abbrev]
                    chapter      = int(anchor.group(2))
                    spec         = anchor.group(3)
                    if spec:
                        for ch, v in _expand_spec(chapter, spec):
                            triples.append((current_book, ch, v))
            else:
                bare = _BARE_RE.search(seg)
                if bare and current_book:
                    chapter = int(bare.group(1))
                    spec    = bare.group(2)
                    for ch, v in _expand_spec(chapter, spec):
                        triples.append((current_book, ch, v))
                elif re.search(r'\d+:\d+', seg):
                    unparsed.append(seg)

    return triples, unparsed


def _nave_display(name, ref_count, keywords, hitchcock):
    key = name.lower()
    if key in keywords:
        return 1
    if key in hitchcock:
        return 0
    if ref_count < 3 or ref_count > 300:
        return 0
    return 0


def ingest_naves(conn, kjv_conn):
    print("Loading Nave's sources…")

    kw_path = os.path.join(SOURCES_DIR, 'theological_keywords.txt')
    with open(kw_path, encoding='utf-8') as f:
        keywords = {line.strip().lower() for line in f if line.strip()}

    hitch_path = os.path.join(SOURCES_DIR, 'HitchcocksBibleNamesDictionary.csv')
    hitchcock  = set()
    with open(hitch_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            clean = {k.lstrip('\ufeff'): v for k, v in row.items()}
            hitchcock.add(clean['Name'].strip().lower())

    print(f'  Keywords: {len(keywords)},  Hitchcock names: {len(hitchcock)}')

    # Build valid_ids from KJV.db (BBCCCVVV integers for all verses present in KJV).
    # This validates that Nave's verse references point to real canonical verses.
    print("  Building valid-verse set from KJV.db…")
    valid_ids = set(
        book * 1_000_000 + chapter * 1_000 + verse
        for book, chapter, verse in kjv_conn.execute(
            'SELECT book, chapter, verse FROM verses'
        )
    )
    print(f'  Valid verse IDs: {len(valid_ids):,}')

    nave_rows = []
    with open(NAVE_CSV, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            nave_rows.append({k.lstrip('\ufeff'): v for k, v in row.items()})
    print(f"  Nave topics: {len(nave_rows):,}")

    print("  Inserting topics and verse mappings…")
    topic_count   = 0
    visible_count = 0
    mapping_count = 0
    all_unparsed  = []

    for row in nave_rows:
        name    = row['subject'].strip()
        entry   = row['entry'].strip()
        section = row['section'].strip()

        triples, unparsed = parse_nave_refs(entry)
        all_unparsed.extend(unparsed)

        verse_ids = set()
        for book_id, chapter, verse in triples:
            vid = book_id * 1_000_000 + chapter * 1_000 + verse
            if vid in valid_ids:
                verse_ids.add(vid)

        ref_count = len(verse_ids)
        display   = _nave_display(name, ref_count, keywords, hitchcock)

        conn.execute(
            'INSERT INTO topics (name, entry, section, display) VALUES (?, ?, ?, ?)',
            (name, entry, section, display)
        )
        topic_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]

        if verse_ids:
            conn.executemany(
                'INSERT OR IGNORE INTO topic_verses (topic_id, verse_id) VALUES (?, ?)',
                [(topic_id, vid) for vid in verse_ids]
            )

        topic_count   += 1
        visible_count += display
        mapping_count += len(verse_ids)

    print(f"  Topics inserted:     {topic_count:,}")
    print(f"  Visible (display=1): {visible_count:,}")
    print(f"  Searchable-only:     {topic_count - visible_count:,}")
    print(f"  Verse mappings:      {mapping_count:,}")

    unique_unparsed = sorted(set(all_unparsed))
    if unique_unparsed:
        print(f"  Unparsed segments:   {len(unique_unparsed):,} unique")
        for s in unique_unparsed[:5]:
            print(f"    {s!r}")
        if len(unique_unparsed) > 5:
            print(f"    … and {len(unique_unparsed) - 5} more")

    return topic_count, visible_count, mapping_count

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

def verify(conn):
    print('\n── Verification ──────────────────────────────────────')
    ok = True

    def check(label, got, expected):
        nonlocal ok
        status = '✓' if got == expected else '✗'
        print(f'  {status}  {label}: {got}  (expected {expected})')
        if got != expected:
            ok = False

    # books
    check('books rows', conn.execute('SELECT COUNT(*) FROM books').fetchone()[0], 66)

    # translations manifest
    check('translations rows', conn.execute('SELECT COUNT(*) FROM translations').fetchone()[0], 6)
    filenames = [r[0] for r in conn.execute('SELECT filename FROM translations ORDER BY id')]
    print(f'     filenames: {filenames}')

    # cross_references
    xref_total = conn.execute('SELECT COUNT(*) FROM cross_references').fetchone()[0]
    xref_ok    = 340_000 <= xref_total <= 350_000
    status     = '✓' if xref_ok else '✗'
    print(f'  {status}  cross_references rows: {xref_total:,}  (expected ~345,500)')
    if not xref_ok:
        ok = False

    # spot-check: John 3:16 cross-references
    john_3_16 = bbcccvvv(43, 3, 16)
    jn_refs   = conn.execute(
        'SELECT COUNT(*) FROM cross_references WHERE source_verse = ? AND votes >= 5',
        (john_3_16,)
    ).fetchone()[0]
    status = '✓' if jn_refs >= 10 else '✗'
    print(f'  {status}  John 3:16 refs (votes ≥ 5): {jn_refs}  (expected ≥ 10)')
    if jn_refs < 10:
        ok = False

    # topics
    topic_total   = conn.execute('SELECT COUNT(*) FROM topics').fetchone()[0]
    visible_total = conn.execute('SELECT COUNT(*) FROM topics WHERE display = 1').fetchone()[0]
    tv_total      = conn.execute('SELECT COUNT(*) FROM topic_verses').fetchone()[0]
    print(f'  ✓  topics: {topic_total:,}  (visible: {visible_total:,})')
    print(f'  ✓  topic_verses: {tv_total:,}')

    # no verses table
    has_verses = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='verses'"
    ).fetchone()[0]
    status = '✓' if has_verses == 0 else '✗'
    print(f'  {status}  verses table absent: {has_verses == 0}')
    if has_verses:
        ok = False

    print('──────────────────────────────────────────────────────')
    return ok

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Build core.db (Build 2 schema)')
    parser.add_argument('--kjv-db', default=DEFAULT_KJV_DB,
                        help='Path to KJV.db (for verse validation and split-range clamping)')
    args = parser.parse_args()

    kjv_db_path = os.path.join(PROJECT_ROOT, args.kjv_db) if not os.path.isabs(args.kjv_db) else args.kjv_db
    if not os.path.exists(kjv_db_path):
        # Try as relative to PROJECT_ROOT
        alt = os.path.join(PROJECT_ROOT, args.kjv_db)
        if os.path.exists(alt):
            kjv_db_path = alt
        else:
            print(f'ERROR: KJV.db not found at {kjv_db_path}', file=sys.stderr)
            print('Run scripts/build_translation.py KJV ... first.', file=sys.stderr)
            sys.exit(1)

    for path, label in [(CROSSREF_SRC, 'cross_references.txt'), (NAVE_CSV, 'NavesTopicalDictionary.csv')]:
        if not os.path.exists(path):
            print(f'ERROR: {label} not found at {path}', file=sys.stderr)
            sys.exit(1)

    print(f'KJV.db:      {kjv_db_path}')
    print(f'Output:      {OUTPUT_PATH}')

    # Remove existing output
    os.makedirs(os.path.join(PROJECT_ROOT, 'data'), exist_ok=True)
    if os.path.exists(OUTPUT_PATH):
        os.remove(OUTPUT_PATH)
        print('Removed existing core.db')

    # Open connections
    kjv_conn = sqlite3.connect(kjv_db_path)
    conn     = sqlite3.connect(OUTPUT_PATH)
    conn.execute('PRAGMA journal_mode = WAL')
    conn.execute('PRAGMA synchronous  = NORMAL')
    conn.execute('PRAGMA foreign_keys = ON')

    # 1. Schema
    print('\nCreating schema…')
    conn.executescript(SCHEMA)
    print('  Done.')

    # 2. Books
    print('Inserting books…')
    conn.executemany(
        'INSERT INTO books (id, name, abbrev, testament, genre, chapters) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        BOOKS,
    )
    print(f'  {len(BOOKS)} books inserted.')

    # 3. Translations manifest
    print('Inserting translations manifest…')
    now = int(time.time())
    conn.executemany(
        'INSERT INTO translations '
        '(id, filename, name, abbreviation, year, license, installed_at, is_bundled) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [(id_, fn, name, abbrev, year, lic, now)
         for id_, fn, name, abbrev, year, lic in TRANSLATIONS],
    )
    print(f'  {len(TRANSLATIONS)} translations inserted.')
    conn.commit()

    # 4. Nave's Topical Bible
    print("\nLoading Nave's Topical Bible…")
    ingest_naves(conn, kjv_conn)
    conn.commit()

    # 5. Cross-references
    print('\nLoading cross-references…')
    total_xrefs = ingest_crossrefs(conn, kjv_conn)
    conn.commit()

    kjv_conn.close()

    # 6. Verify
    passed = verify(conn)
    conn.close()

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f'\nOutput: {OUTPUT_PATH}  ({size_mb:.1f} MB)')

    if not passed:
        print('One or more verification checks FAILED.', file=sys.stderr)
        sys.exit(1)

    print('Build complete.')


if __name__ == '__main__':
    main()
