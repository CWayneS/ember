#!/usr/bin/env python3
"""
build_translation.py — Build a translation .db file for Ember.

Usage (run from project root):
    python3 scripts/build_translation.py KJV   data/core.db \
        --name "King James Version" --year 1611

    python3 scripts/build_translation.py ASV \
        data/translations-prep/data/translations-prep/scrollmapper/formats/sqlite/ASV.db \
        --name "American Standard Version" --year 1901

    python3 scripts/build_translation.py YLT \
        data/translations-prep/data/translations-prep/scrollmapper/formats/sqlite/YLT.db \
        --name "Young's Literal Translation" --year 1862

    python3 scripts/build_translation.py Darby \
        data/translations-prep/data/translations-prep/scrollmapper/formats/sqlite/Darby.db \
        --name "Darby Translation" --year 1890

    python3 scripts/build_translation.py BSB \
        data/translations-prep/bsb/bsb.txt \
        --name "Berean Standard Bible" --year 2023

    python3 scripts/build_translation.py WEB \
        data/translations-prep/web/ \
        --name "World English Bible" --year 2000

Source type is auto-detected from the source path:
  - Directory  → WEB per-chapter files (engwebp_NNN_BOOK_CC_read.txt)
  - .txt file  → BSB TSV ("Book Chapter:Verse<TAB>Text", 3-line header)
  - .db + KJV  → Ember core.db  (verses table, book_id + translation_id = 'KJV')
  - .db + other → scrollmapper  ({ABBREV}_verses / {ABBREV}_books tables)

Output: data/translations-prep/output/{ABBREV}.db
"""

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path

# ── Project paths ─────────────────────────────────────────────────────────────

SCRIPT_DIR   = Path(__file__).resolve().parent   # scripts/
PROJECT_ROOT = SCRIPT_DIR.parent                  # ember/
OUTPUT_DIR   = PROJECT_ROOT / "data" / "translations-prep" / "output"

EXPECTED_VERSE_COUNT = 31_102

# ── Canonical book table ──────────────────────────────────────────────────────
# 66 entries: (full name, abbreviation, testament, chapter_count)
# Index 0 = Genesis (book ID 1), index 65 = Revelation (book ID 66).

BOOKS = [
    ("Genesis",         "Gen",    "OT",  50),
    ("Exodus",          "Exod",   "OT",  40),
    ("Leviticus",       "Lev",    "OT",  27),
    ("Numbers",         "Num",    "OT",  36),
    ("Deuteronomy",     "Deut",   "OT",  34),
    ("Joshua",          "Josh",   "OT",  24),
    ("Judges",          "Judg",   "OT",  21),
    ("Ruth",            "Ruth",   "OT",   4),
    ("1 Samuel",        "1Sam",   "OT",  31),
    ("2 Samuel",        "2Sam",   "OT",  24),
    ("1 Kings",         "1Kgs",   "OT",  22),
    ("2 Kings",         "2Kgs",   "OT",  25),
    ("1 Chronicles",    "1Chr",   "OT",  29),
    ("2 Chronicles",    "2Chr",   "OT",  36),
    ("Ezra",            "Ezra",   "OT",  10),
    ("Nehemiah",        "Neh",    "OT",  13),
    ("Esther",          "Esth",   "OT",  10),
    ("Job",             "Job",    "OT",  42),
    ("Psalms",          "Ps",     "OT", 150),
    ("Proverbs",        "Prov",   "OT",  31),
    ("Ecclesiastes",    "Eccl",   "OT",  12),
    ("Song of Solomon", "Song",   "OT",   8),
    ("Isaiah",          "Isa",    "OT",  66),
    ("Jeremiah",        "Jer",    "OT",  52),
    ("Lamentations",    "Lam",    "OT",   5),
    ("Ezekiel",         "Ezek",   "OT",  48),
    ("Daniel",          "Dan",    "OT",  12),
    ("Hosea",           "Hos",    "OT",  14),
    ("Joel",            "Joel",   "OT",   3),
    ("Amos",            "Amos",   "OT",   9),
    ("Obadiah",         "Obad",   "OT",   1),
    ("Jonah",           "Jonah",  "OT",   4),
    ("Micah",           "Mic",    "OT",   7),
    ("Nahum",           "Nah",    "OT",   3),
    ("Habakkuk",        "Hab",    "OT",   3),
    ("Zephaniah",       "Zeph",   "OT",   3),
    ("Haggai",          "Hag",    "OT",   2),
    ("Zechariah",       "Zech",   "OT",  14),
    ("Malachi",         "Mal",    "OT",   4),
    ("Matthew",         "Matt",   "NT",  28),
    ("Mark",            "Mark",   "NT",  16),
    ("Luke",            "Luke",   "NT",  24),
    ("John",            "John",   "NT",  21),
    ("Acts",            "Acts",   "NT",  28),
    ("Romans",          "Rom",    "NT",  16),
    ("1 Corinthians",   "1Cor",   "NT",  16),
    ("2 Corinthians",   "2Cor",   "NT",  13),
    ("Galatians",       "Gal",    "NT",   6),
    ("Ephesians",       "Eph",    "NT",   6),
    ("Philippians",     "Phil",   "NT",   4),
    ("Colossians",      "Col",    "NT",   4),
    ("1 Thessalonians", "1Thess", "NT",   5),
    ("2 Thessalonians", "2Thess", "NT",   3),
    ("1 Timothy",       "1Tim",   "NT",   6),
    ("2 Timothy",       "2Tim",   "NT",   4),
    ("Titus",           "Titus",  "NT",   3),
    ("Philemon",        "Phlm",   "NT",   1),
    ("Hebrews",         "Heb",    "NT",  13),
    ("James",           "Jas",    "NT",   5),
    ("1 Peter",         "1Pet",   "NT",   5),
    ("2 Peter",         "2Pet",   "NT",   3),
    ("1 John",          "1John",  "NT",   5),
    ("2 John",          "2John",  "NT",   1),
    ("3 John",          "3John",  "NT",   1),
    ("Jude",            "Jude",   "NT",   1),
    ("Revelation",      "Rev",    "NT",  22),
]

# ── WEB: eBible USFM book code → Ember book ID ───────────────────────────────
# Non-canonical books (Apocrypha) that appear in engwebp files are silently
# skipped because their codes won't be found here.

WEB_BOOK_CODES = {
    # Old Testament
    "GEN":  1, "EXO":  2, "LEV":  3, "NUM":  4, "DEU":  5,
    "JOS":  6, "JDG":  7, "RUT":  8, "1SA":  9, "2SA": 10,
    "1KI": 11, "2KI": 12, "1CH": 13, "2CH": 14, "EZR": 15,
    "NEH": 16, "EST": 17, "JOB": 18, "PSA": 19, "PRO": 20,
    "ECC": 21, "SNG": 22, "ISA": 23, "JER": 24, "LAM": 25,
    "EZK": 26, "DAN": 27, "HOS": 28, "JOL": 29, "AMO": 30,
    "OBA": 31, "JON": 32, "MIC": 33, "NAM": 34, "HAB": 35,
    "ZEP": 36, "HAG": 37, "ZEC": 38, "MAL": 39,
    # New Testament
    "MAT": 40, "MRK": 41, "LUK": 42, "JHN": 43, "ACT": 44,
    "ROM": 45, "1CO": 46, "2CO": 47, "GAL": 48, "EPH": 49,
    "PHP": 50, "COL": 51, "1TH": 52, "2TH": 53, "1TI": 54,
    "2TI": 55, "TIT": 56, "PHM": 57, "HEB": 58, "JAS": 59,
    "1PE": 60, "2PE": 61, "1JN": 62, "2JN": 63, "3JN": 64,
    "JUD": 65, "REV": 66,
    # Variant spellings seen in some eBible distributions
    "SOS": 22, "SOL": 22,   # Song of Solomon
    "EZE": 26,              # Ezekiel alternate
}

# ── BSB: full English book name → Ember book ID ──────────────────────────────

BSB_BOOK_NAMES: dict[str, int] = {
    name: (i + 1) for i, (name, *_) in enumerate(BOOKS)
}
BSB_BOOK_NAMES.update({
    "Psalm":           19,  # BSB uses singular form
    "Song of Songs":   22,  # alternate name
})

# ── Source loaders ────────────────────────────────────────────────────────────
# Each returns a list of (book_id, chapter, verse, text) tuples where
# book_id is 1-66 (Genesis = 1, Revelation = 66).


def load_from_core_db(source_path: str) -> list[tuple]:
    """Extract KJV from Ember's core.db (book_id + translation_id = 'KJV')."""
    conn = sqlite3.connect(source_path)
    try:
        rows = conn.execute(
            "SELECT book_id, chapter, verse, text FROM verses "
            "WHERE translation_id = 'KJV' "
            "ORDER BY book_id, chapter, verse"
        ).fetchall()
    finally:
        conn.close()
    return [(int(b), int(c), int(v), t) for b, c, v, t in rows]


def load_from_scrollmapper(source_path: str, abbrev: str) -> list[tuple]:
    """
    Load from a scrollmapper SQLite file.
    Table names: {abbrev}_verses (book_id, chapter, verse, text)
                 {abbrev}_books  (id, name)
    book_id in scrollmapper maps directly to Ember's 1-66 ordering.
    Applies the missing-space-before-God fix for Darby.
    """
    conn = sqlite3.connect(source_path)
    try:
        # Sanity-check that book_id 1 = Genesis
        first = conn.execute(
            f"SELECT name FROM {abbrev}_books WHERE id = 1"
        ).fetchone()
        if first and first[0] != "Genesis":
            print(f"  Warning: book_id 1 = '{first[0]}' (expected Genesis). "
                  "Book IDs may not map correctly.", file=sys.stderr)

        rows = conn.execute(
            f"SELECT book_id, chapter, verse, text "
            f"FROM {abbrev}_verses "
            f"ORDER BY book_id, chapter, verse"
        ).fetchall()
    finally:
        conn.close()

    verses = [(int(b), int(c), int(v), t) for b, c, v, t in rows]

    if abbrev == "Darby":
        # scrollmapper's Darby source drops the space before "God" throughout.
        # Pattern: any lowercase letter immediately followed by uppercase "God".
        # e.g. "withGod" → "with God", "andGod" → "and God"
        fix = re.compile(r'([a-z])(God)')
        verses = [(b, c, v, fix.sub(r'\1 \2', t)) for b, c, v, t in verses]
        print("  Applied Darby God-spacing fix.")

    return verses


def load_from_bsb_tsv(source_path: str) -> list[tuple]:
    """
    Parse BSB plain-text TSV.
    Format: "Book Chapter:Verse<TAB>Text"
    First few lines are license header + column header; skipped automatically.
    """
    verses = []
    unknown_books: set[str] = set()

    # utf-8-sig strips the UTF-8 BOM if present
    with open(source_path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.rstrip("\n")
            if "\t" not in line:
                continue
            ref, text = line.split("\t", 1)
            ref  = ref.strip()
            text = text.strip()

            if ref == "Verse":
                continue  # column header row

            # "Genesis 1:1" / "Song of Solomon 4:5" / "1 Samuel 9:12"
            m = re.match(r'^(.+?)\s+(\d+):(\d+)$', ref)
            if not m:
                continue  # license / blank / other non-verse line

            book_name = m.group(1)
            chapter   = int(m.group(2))
            verse     = int(m.group(3))

            book_id = BSB_BOOK_NAMES.get(book_name)
            if book_id is None:
                unknown_books.add(book_name)
                continue

            verses.append((book_id, chapter, verse, text))

    if unknown_books:
        print(f"  Warning: unrecognized book names: {sorted(unknown_books)}",
              file=sys.stderr)

    return verses


def _parse_web_chapter_file(filepath: str) -> list[str]:
    """
    Parse one WEB per-chapter file into a list of verse texts (in order).

    File structure (consistent across all 1,189 chapter files):
      Line 1 (non-empty): Book title  e.g. "Genesis." or "The First Book of Moses..."
      Line 2 (non-empty): Chapter heading  e.g. "Chapter 2." or "Psalm 119."
      Lines 3+:           Verse text, one non-empty line per verse.

    Strategy: scan for the first line that matches a chapter/section heading
    pattern; everything after it is verse content.  This handles both the
    short ("Genesis.") and long ("The First Book of Moses, Commonly Called
    Genesis.") book-title variants without hard-coding line counts.
    """
    with open(filepath, encoding="utf-8-sig") as f:
        lines = [l.rstrip("\n") for l in f]

    non_empty = [l for l in lines if l.strip()]

    heading_re = re.compile(
        r'\b(?:Chapter|Psalm|Psalms)\s+\d+',
        re.IGNORECASE,
    )

    for i, line in enumerate(non_empty):
        if heading_re.search(line):
            return [l for l in non_empty[i + 1:] if l.strip()]

    # Fallback: skip first 2 non-empty lines (should not be reached)
    print(f"  Warning: no chapter heading found in {filepath}, using fallback.",
          file=sys.stderr)
    return [l for l in non_empty[2:] if l.strip()]


def load_from_web_dir(source_path: str) -> list[tuple]:
    """
    Parse WEB per-chapter text files from the engwebp distribution.
    Filename pattern: engwebp_NNN_BOOK_CC_read.txt
    Non-canonical book codes (Apocrypha) are silently skipped.
    """
    file_re = re.compile(r'^engwebp_\d+_([A-Z0-9]+)_(\d+)_read\.txt$')
    verses: list[tuple] = []

    for filename in sorted(os.listdir(source_path)):
        m = file_re.match(filename)
        if not m:
            continue

        book_code = m.group(1)
        chapter   = int(m.group(2))

        book_id = WEB_BOOK_CODES.get(book_code)
        if book_id is None:
            continue  # Apocryphal or unrecognized book — skip

        filepath   = os.path.join(source_path, filename)
        verse_texts = _parse_web_chapter_file(filepath)

        for verse_num, text in enumerate(verse_texts, start=1):
            verses.append((book_id, chapter, verse_num, text))

    return verses


# ── DB creation ───────────────────────────────────────────────────────────────


def create_output_db(output_path: str) -> sqlite3.Connection:
    """Create (or overwrite) the output file and initialize the schema."""
    if os.path.exists(output_path):
        os.remove(output_path)

    conn = sqlite3.connect(output_path)
    conn.executescript("""
        CREATE TABLE verses (
            book    INTEGER NOT NULL,
            chapter INTEGER NOT NULL,
            verse   INTEGER NOT NULL,
            text    TEXT    NOT NULL,
            PRIMARY KEY (book, chapter, verse)
        );

        CREATE TABLE books (
            id            INTEGER PRIMARY KEY,
            name          TEXT    NOT NULL,
            abbreviation  TEXT    NOT NULL,
            testament     TEXT    NOT NULL,
            chapter_count INTEGER NOT NULL
        );

        CREATE TABLE meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE verses_fts USING fts5(
            text,
            content=verses,
            content_rowid=rowid
        );
    """)
    return conn


def populate_books(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT INTO books (id, name, abbreviation, testament, chapter_count) "
        "VALUES (?, ?, ?, ?, ?)",
        [
            (i + 1, name, abbrev, testament, chapters)
            for i, (name, abbrev, testament, chapters) in enumerate(BOOKS)
        ],
    )


def populate_meta(
    conn: sqlite3.Connection,
    name: str,
    abbrev: str,
    year: str,
    license_: str,
) -> None:
    conn.executemany(
        "INSERT INTO meta (key, value) VALUES (?, ?)",
        [
            ("name",           name),
            ("abbreviation",   abbrev),
            ("year",           year),
            ("license",        license_),
            ("versification",  "english-standard"),
            ("schema_version", "1"),
        ],
    )


def populate_verses(conn: sqlite3.Connection, verses: list[tuple]) -> None:
    conn.executemany(
        "INSERT INTO verses (book, chapter, verse, text) VALUES (?, ?, ?, ?)",
        verses,
    )


def rebuild_fts(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')")


# ── Verification ──────────────────────────────────────────────────────────────


def verify(output_path: str, abbrev: str) -> bool:
    conn  = sqlite3.connect(output_path)
    ok    = True

    verse_count = conn.execute("SELECT COUNT(*) FROM verses").fetchone()[0]
    book_count  = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
    meta        = dict(conn.execute("SELECT key, value FROM meta").fetchall())
    fts_hits    = conn.execute(
        "SELECT v.book, v.chapter, v.verse, v.text "
        "FROM verses v "
        "WHERE v.rowid IN ("
        "  SELECT rowid FROM verses_fts WHERE text MATCH 'faith' LIMIT 3"
        ")"
    ).fetchall()

    # Spot checks
    gen1_1   = conn.execute(
        "SELECT text FROM verses WHERE book=1 AND chapter=1 AND verse=1"
    ).fetchone()
    jn3_16   = conn.execute(
        "SELECT text FROM verses WHERE book=43 AND chapter=3 AND verse=16"
    ).fetchone()
    rom8_28  = conn.execute(
        "SELECT text FROM verses WHERE book=45 AND chapter=8 AND verse=28"
    ).fetchone()

    conn.close()

    print(f"\n{'═' * 52}")
    print(f"  {abbrev} — verification")
    print(f"{'═' * 52}")
    # Verse count: KJV/ASV/YLT/Darby/BSB = 31,102 exactly.
    # WEB intentionally omits ~4 verses (Acts 8:37, Luke 17:36, etc.) that are
    # absent from the critical Greek text but present in the KJV Textus Receptus.
    # WEB also uses a different versification for Romans 14/16 (doxology placement).
    # Accept anything in the 30,900–31,200 range as valid.
    verse_ok = 30_900 <= verse_count <= 31_200
    verse_note = "✓" if verse_count == EXPECTED_VERSE_COUNT else (
        f"✓ ({verse_count - EXPECTED_VERSE_COUNT:+d} vs KJV — textual/versification difference)"
        if verse_ok else f"✗ expected ~{EXPECTED_VERSE_COUNT:,}"
    )
    print(f"  Verses : {verse_count:,}  {verse_note}")
    print(f"  Books  : {book_count}  {'✓' if book_count == 66 else '✗ expected 66'}")
    print(f"  Meta   : {meta}")
    print(f"  FTS    : {len(fts_hits)} hit(s) for 'faith'  {'✓' if fts_hits else '✗ no results'}")
    print(f"\n  Gen 1:1  — {gen1_1[0][:80] if gen1_1 else '✗ MISSING'}")
    print(f"  Jn  3:16 — {jn3_16[0][:80] if jn3_16 else '✗ MISSING'}")
    print(f"  Rom 8:28 — {rom8_28[0][:80] if rom8_28 else '✗ MISSING'}")

    if not verse_ok or book_count != 66 or not fts_hits:
        ok = False
        print("\n  ✗ One or more checks FAILED.", file=sys.stderr)
    else:
        print("\n  ✓ All checks passed.")

    return ok


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a translation .db file for Ember.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("abbrev",    help="Translation abbreviation (KJV, ASV, WEB, …)")
    parser.add_argument("source",    help="Source path: core.db, scrollmapper .db, BSB .txt, or WEB directory")
    parser.add_argument("--name",    required=True, help="Full translation name")
    parser.add_argument("--year",    default="",    help="Publication year")
    parser.add_argument("--license", default="Public Domain", dest="license_",
                        help="License string (default: 'Public Domain')")
    args = parser.parse_args()

    abbrev = args.abbrev
    source = args.source

    # ── Load verses ───────────────────────────────────────────────────────────

    if os.path.isdir(source):
        print(f"Loading {abbrev} from WEB directory: {source}")
        verses = load_from_web_dir(source)
    elif source.endswith((".txt", ".tsv")):
        print(f"Loading {abbrev} from BSB TSV: {source}")
        verses = load_from_bsb_tsv(source)
    elif source.endswith(".db") and abbrev.upper() == "KJV":
        print(f"Loading KJV from Ember core.db: {source}")
        verses = load_from_core_db(source)
    elif source.endswith(".db"):
        print(f"Loading {abbrev} from scrollmapper: {source}")
        verses = load_from_scrollmapper(source, abbrev)
    else:
        print(f"Error: cannot determine source type for '{source}'.\n"
              "Expected: a directory (WEB), a .txt file (BSB), or a .db file.",
              file=sys.stderr)
        sys.exit(1)

    print(f"  Loaded {len(verses):,} verses.")

    # ── Build output DB ───────────────────────────────────────────────────────

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = str(OUTPUT_DIR / f"{abbrev}.db")

    print(f"Building {output_path} …")
    conn = create_output_db(output_path)

    populate_books(conn)
    populate_meta(conn, args.name, abbrev, args.year, args.license_)
    populate_verses(conn, verses)

    print("  Rebuilding FTS index …")
    rebuild_fts(conn)

    conn.commit()
    conn.close()

    ok = verify(output_path, abbrev)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
