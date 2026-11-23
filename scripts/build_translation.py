#!/usr/bin/env python3
"""
build_translation.py — Build a translation .db file for Ember.

Usage (run from project root):
    python3 scripts/build_translation.py KJV \
        data/translations-prep/data/translations-prep/scrollmapper/formats/sqlite/KJV.db \
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
        data/translations-prep/web-usfm/engwebp_usfm.zip \
        --name "Verse-only World English Bible" --year 2000

Source type is auto-detected from the source path:
  - .zip file  → WEB USFM (eBible's engwebp_usfm.zip, sha256-pinned)
  - .txt file  → BSB TSV ("Book Chapter:Verse<TAB>Text", 3-line header)
  - .db file   → scrollmapper  ({ABBREV}_verses / {ABBREV}_books tables)

Output: data/translations-prep/output/{ABBREV}.db

Psalm title placeholders (Psalm_Title_Fix_Spec.md):
  For KJV/ASV/Darby only, this script also inserts an empty-text verse=0 row
  for each of the 116 Psalms that carry a title in standard versification
  (see PSALM_TITLE_CHAPTERS below). These translations' source data has no
  title text to source (see spec — sourcing was investigated and declined),
  so the rows are placeholders: they give the title a real, addressable
  verse_id ahead of Build 6, which populates them from TAHOT's English-
  aligned gloss. YLT/BSB are untouched — their titles are already
  present, merged into verse 1's text by their own source data, and that
  representation is being kept as-is rather than split out. WEB's USFM marks
  its titles separately, so they become verse 0 rows with WEB's own wording.

Scripture search: verses_fts is FTS4 with the unicode61 tokenizer, which
sql.js can read (it has no FTS5). Whole words, so "love" doesn't match
"glove" or "beloved"; no stemming.
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

    if abbrev == "YLT":
        # scrollmapper's YLT source uses <FI>...<Fi> as italics markers.
        # Strip all such tags — they are display markup, not text.
        tag = re.compile(r'<FI>|<Fi>', re.IGNORECASE)
        verses = [(b, c, v, tag.sub('', t)) for b, c, v, t in verses]
        print("  Stripped YLT italic markup tags.")

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


# WEB comes from eBible's USFM edition (Strong's-tagged, 66-book protocanon):
#   https://ebible.org/Scriptures/engwebp_usfm.zip
# eBible replaces that zip in place whenever WEB is revised, so the pinned
# sha256 below changes with it. A mismatch means a new revision: compare the
# rebuilt text against the shipped web.db before shipping it, then update the pin.
WEB_USFM_SHA256 = "e36d23c5d28517a69faf91654cc6fc6657a298d9b6d66496166491f3ceab9749"

# WEB leaves these four verses out. The USFM keeps their \v markers, holding
# only a footnote, so they come out empty and are dropped. verify() checks
# that exactly these are absent. Romans 14 and 16 also differ from KJV, but
# that is WEB's own numbering (doxology at 14:24-26), not a gap.
WEB_OMITTED_VERSES = {
    (42, 17, 36),  # Luke 17:36
    (44,  8, 37),  # Acts 8:37
    (44, 15, 34),  # Acts 15:34
    (44, 24,  7),  # Acts 24:7
}
WEB_EXPECTED_VERSE_COUNT = 31_098
# Psalm 119's 22 letters, the 33 Song of Songs speaker labels, Psalms' 5 book divisions.
WEB_EXPECTED_HEADING_COUNT = 60
# Also footnote-only, and not a gap: it says WEB has the doxology at 14:24-26.
WEB_FOOTNOTE_ONLY_MARKERS = WEB_OMITTED_VERSES | {(45, 16, 25)}

# How each USFM marker found in the 66 books is treated. Any other marker
# stops the build, so nothing unexamined reaches the verse text.
USFM_PARAGRAPH = {"p", "q1", "q2", "b", "m", "mi", "pi1", "li1", "nb"}  # a space
USFM_CHARACTER = {"w", "+w", "wj", "qs", "bk"}  # keep the words, drop the markup
USFM_BOOK_TITLES = {"id", "ide", "h", "toc1", "toc2", "toc3", "mt1", "mt2", "mt3",
                    "cl"}  # dropped
# Kept out of the verse text, and stored in the headings table, which the
# Info tab shows: the Psalms' five book divisions (BOOK 1 ...) and the Song
# of Songs speaker labels. Psalm 119's letter headings are \d, handled below.
USFM_HEADINGS  = {"ms1", "sp"}
USFM_NOTE      = re.compile(r'\\(f|x) .*?\\\1\*', re.DOTALL)  # footnotes, cross-references
# An opening marker owns the one space after it ("Aren’\+w t" is "Aren’t").
USFM_MARKER    = re.compile(r'\\(\+?[a-z]+[0-9]*)(?:(\*)|\s?)')
USFM_CHAPTER_NUMBER = re.compile(r"\s*(\d+)")
USFM_VERSE_NUMBER   = re.compile(r"\s*(\d+)\s")
# Marks where a heading falls inside a verse's text until its offset is known.
HEADING_MARK = "\uE000"


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _parse_web_usfm_book(usfm: str, book_id: int) -> tuple[list[tuple], list[tuple]]:
    r"""
    Parse one book's USFM into (book_id, chapter, verse, text) rows, and
    (book_id, chapter, verse, offset, text) headings.

    A \d (Psalm title) before a titled Psalm's first verse becomes verse 0.
    Every other \d is one of Psalm 119's letter headings (ALEPH, BETH, ...).
    Footnotes, cross-references and book titles are dropped; \w word|strong="..."
    keeps just the word.

    A heading belongs to the text that follows it: offset 0 when that is the
    start of a verse (or a Psalm title, verse 0), or the character offset in
    the verse when the heading falls inside it (Song of Songs 1:4 "Friends").
    """
    usfm = USFM_NOTE.sub("", usfm)
    rows: list[tuple] = []
    headings: list[tuple] = []
    chapter = 0
    verse = None       # None: before the chapter's first verse
    target = None      # the list text goes to, or None to discard it
    buffers: dict[int, list[str]] = {}
    in_word = False    # inside \w ... \w*: drop the |attributes
    heading = None     # a heading's text while it is being read
    waiting = []       # headings read, not yet placed

    def close_heading():
        nonlocal heading
        if heading is not None:
            waiting.append(_normalize_space("".join(heading)))
            heading = None

    def place_waiting_before(verse_number):
        for text in waiting:
            headings.append((book_id, chapter, verse_number, 0, text))
        waiting.clear()

    def finish_chapter():
        within = []  # headings inside this chapter's verses, in order
        for verse_number, parts in buffers.items():
            raw = "".join(parts)
            text = _normalize_space(raw.replace(HEADING_MARK, " "))
            if not text:
                if (book_id, chapter, verse_number) not in WEB_FOOTNOTE_ONLY_MARKERS:
                    raise ValueError(f"empty verse {book_id} {chapter}:{verse_number}")
                continue
            rows.append((book_id, chapter, verse_number, text))
            for index, character in enumerate(raw):
                if character == HEADING_MARK:
                    before = _normalize_space(raw[:index].replace(HEADING_MARK, " "))
                    within.append((verse_number, len(before) + 1 if before else 0))
        # The marks were put in the order the headings were read.
        for (verse_number, offset), heading_row in zip(within, chapter_within):
            headings.append((book_id, chapter, verse_number, offset, heading_row))

    chapter_within: list[str] = []
    position = 0
    for match in USFM_MARKER.finditer(usfm + "\\p"):
        text = usfm[position:match.start()]
        position = match.end()
        marker, closing = match.group(1), match.group(2) is not None

        if in_word:
            text = text.split("|", 1)[0]
        if heading is not None:
            heading.append(text)
        elif target is not None:
            if waiting and text.strip() and verse is not None and target is buffers.get(verse):
                target.append(HEADING_MARK)  # a heading inside this verse
                chapter_within.extend(waiting)
                waiting.clear()
            target.append(text)

        if marker in ("w", "+w"):
            in_word = not closing
            continue
        if marker in USFM_CHARACTER:
            continue
        if closing:
            raise ValueError(f"unexpected closing marker \\{marker}*")

        # Block-level markers end a heading. The number of \c and \v comes first in the text after.
        close_heading()
        if marker == "c":
            if chapter:
                finish_chapter()
            number = USFM_CHAPTER_NUMBER.match(usfm, position)
            chapter, verse, buffers, target = int(number.group(1)), None, {}, None
            chapter_within = []
            position = number.end()
        elif marker == "v":
            number = USFM_VERSE_NUMBER.match(usfm, position)
            verse = int(number.group(1))
            if verse in buffers:
                raise ValueError(f"verse {book_id} {chapter}:{verse} appears twice")
            position = number.end()
            place_waiting_before(verse)
            target = buffers.setdefault(verse, [])
        elif marker == "d":
            if book_id != PSALMS_BOOK_ID:
                raise ValueError(f"\\d outside Psalms ({book_id} {chapter})")
            if verse is None and chapter in PSALM_TITLE_CHAPTERS:
                place_waiting_before(0)
                target = buffers.setdefault(0, [])
            else:
                heading, target = [], None
        elif marker in USFM_HEADINGS:
            heading, target = [], None
        elif marker in USFM_BOOK_TITLES:
            target = None
        elif marker in USFM_PARAGRAPH:
            if target is not None:
                target.append(" ")
            if verse is not None and target is None:
                target = buffers[verse]  # a heading interrupted this verse
        else:
            raise ValueError(f"unknown USFM marker \\{marker} in book {book_id} {chapter}")
    if chapter:
        finish_chapter()
    if waiting:
        raise ValueError(f"headings with no text after them: {waiting}")
    return rows, headings


def load_from_web_usfm(source_path: str) -> tuple[list[tuple], list[tuple]]:
    """
    Load WEB's verses and headings from eBible's USFM zip (engwebp_usfm.zip), read in place.
    Files are named NN-CODEengwebp.usfm; front matter (FRT) and the
    glossary (GLO) are skipped.
    """
    import hashlib
    import zipfile

    digest = hashlib.sha256(Path(source_path).read_bytes()).hexdigest()
    if digest != WEB_USFM_SHA256:
        print(f"Error: {source_path} has sha256 {digest},\n"
              f"  not the pinned {WEB_USFM_SHA256}.\n"
              "  eBible replaces this zip when WEB is revised. Compare the new text with\n"
              "  the shipped web.db, then update WEB_USFM_SHA256.", file=sys.stderr)
        sys.exit(1)

    verses: list[tuple] = []
    headings: list[tuple] = []
    seen_books = set()
    with zipfile.ZipFile(source_path) as archive:
        for name in sorted(archive.namelist()):
            m = re.match(r'^\d+-([A-Z0-9]{3})engwebp\.usfm$', name)
            if not m or m.group(1) in ("FRT", "GLO"):
                continue
            book_id = WEB_BOOK_CODES[m.group(1)]
            seen_books.add(book_id)
            book_verses, book_headings = _parse_web_usfm_book(
                archive.read(name).decode("utf-8-sig"), book_id)
            verses += book_verses
            headings += book_headings

    if seen_books != set(range(1, 67)):
        print(f"Error: books missing from the zip: {sorted(set(range(1, 67)) - seen_books)}",
              file=sys.stderr)
        sys.exit(1)

    titled = sorted(c for b, c, v, _ in verses if b == PSALMS_BOOK_ID and v == 0)
    if titled != PSALM_TITLE_CHAPTERS:
        print(f"Error: Psalm titles found for {len(titled)} chapters, expected the "
              f"{len(PSALM_TITLE_CHAPTERS)} in PSALM_TITLE_CHAPTERS.\n"
              f"  Extra: {sorted(set(titled) - set(PSALM_TITLE_CHAPTERS))}"
              f"  Missing: {sorted(set(PSALM_TITLE_CHAPTERS) - set(titled))}",
              file=sys.stderr)
        sys.exit(1)

    return sorted(verses, key=lambda row: (row[0], row[1], row[2])), headings


# ── Psalm title placeholders (Psalm_Title_Fix_Spec.md) ───────────────────────
# The 116 Psalms that carry a superscription/title in standard versification
# (Psalm 119 excluded — its ALEPH/BETH/... acrostic headings are a separate,
# structurally different problem, out of scope for this fix).

PSALM_TITLE_CHAPTERS = [
    3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42,
    44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
    62, 63, 64, 65, 66, 67, 68, 69, 70, 72, 73, 74, 75, 76, 77, 78, 79, 80,
    81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 92, 98, 100, 101, 102, 103, 108,
    109, 110, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131,
    132, 133, 134, 138, 139, 140, 141, 142, 143, 144, 145,
]

PSALMS_BOOK_ID = 19

# Translations whose own base text has no title wording to source (see spec's
# "Sourcing" section — investigated, declined). These get an empty-text
# verse=0 placeholder per titled Psalm now, so the row is addressable ahead
# of Build 6, which populates the text from TAHOT's English-aligned gloss.
PLACEHOLDER_ABBREVS = {"KJV", "ASV", "DARBY"}


def add_psalm_title_placeholders(verses: list[tuple], abbrev: str) -> list[tuple]:
    """Append empty-text verse=0 rows for the 116 titled Psalms.

    No-op for any translation not in PLACEHOLDER_ABBREVS — WEB/YLT/BSB
    already carry title text merged into verse 1 and are left as-is.
    """
    if abbrev.upper() not in PLACEHOLDER_ABBREVS:
        return verses
    placeholders = [(PSALMS_BOOK_ID, chapter, 0, '') for chapter in PSALM_TITLE_CHAPTERS]
    print(f"  Added {len(placeholders)} Psalm title placeholder rows (verse=0, empty text).")
    return sorted(verses + placeholders, key=lambda row: (row[0], row[1], row[2]))


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

        CREATE VIRTUAL TABLE verses_fts USING fts4(
            content="verses",
            text,
            tokenize=unicode61
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


# Headings kept out of the verse text (WEB only), shown in the Info tab.
# offset 0: before the verse (verse 0 is a Psalm title); otherwise the
# character offset in the verse's text where the heading falls.
def populate_headings(conn: sqlite3.Connection, headings: list[tuple]) -> None:
    conn.execute("""
        CREATE TABLE headings (
            book    INTEGER NOT NULL,
            chapter INTEGER NOT NULL,
            verse   INTEGER NOT NULL,
            offset  INTEGER NOT NULL,
            text    TEXT    NOT NULL
        )""")
    conn.execute("CREATE INDEX idx_headings_chapter ON headings(book, chapter)")
    conn.executemany(
        "INSERT INTO headings (book, chapter, verse, offset, text) VALUES (?, ?, ?, ?, ?)",
        headings,
    )


def populate_verses(conn: sqlite3.Connection, verses: list[tuple]) -> None:
    conn.executemany(
        "INSERT INTO verses (book, chapter, verse, text) VALUES (?, ?, ?, ?)",
        verses,
    )


def rebuild_fts(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')")
    conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('optimize')")


def compact(conn: sqlite3.Connection) -> None:
    """VACUUM away the free pages 'optimize' leaves (about a quarter of the file).

    verses has no INTEGER PRIMARY KEY, so SQLite allows VACUUM to renumber its
    rowids, which would leave the external-content index pointing at the wrong
    verses. So the rowids are compared before and after, and FTS4's own
    integrity-check confirms the index still matches the text.
    """
    def rowids():
        return conn.execute(
            "SELECT group_concat(rowid || ':' || book || ':' || chapter || ':' || verse) "
            "FROM (SELECT rowid, * FROM verses ORDER BY rowid)"
        ).fetchone()[0]
    before = rowids()
    conn.commit()
    conn.execute("VACUUM")
    if rowids() != before:
        raise SystemExit("Error: VACUUM renumbered verses' rowids; the FTS index would be wrong.")
    conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('integrity-check')")


# ── Verification ──────────────────────────────────────────────────────────────


def verify(output_path: str, abbrev: str) -> bool:
    conn  = sqlite3.connect(output_path)
    ok    = True

    # verse=0 rows are Psalm title placeholders (Psalm_Title_Fix_Spec.md), not
    # canonical verses — excluded here so the sanity range below still means
    # what it says for translations that carry them (KJV/ASV/Darby).
    verse_count = conn.execute("SELECT COUNT(*) FROM verses WHERE verse > 0").fetchone()[0]
    title_count = conn.execute("SELECT COUNT(*) FROM verses WHERE verse = 0").fetchone()[0]
    filled_titles = conn.execute("SELECT COUNT(*) FROM verses WHERE verse = 0 AND text != ''").fetchone()[0]

    # Leftover markup from a source parser. Spacing is checked for WEB only,
    # whose USFM parser is this script's own; the other sources' spacing is
    # theirs and kept as it is.
    spacing = ("OR text LIKE '%  %' OR text != trim(text) OR text GLOB '* [,.;:?!]*'"
               if abbrev == "WEB" else "")
    markup_left = conn.execute(
        "SELECT book, chapter, verse, text FROM verses "
        "WHERE text LIKE '%\\%' OR text LIKE '%|%' OR text LIKE '%strong=%' "
        f"{spacing} LIMIT 5"
    ).fetchall()
    # Whole-word FTS: "love" must find a verse with "love" and no verse that
    # only has "glove" or "beloved".
    fts_word_ok = conn.execute(
        "SELECT COUNT(*) FROM verses WHERE rowid IN "
        "(SELECT rowid FROM verses_fts WHERE verses_fts MATCH 'love') "
        "AND ' ' || lower(text) || ' ' NOT GLOB '*[^a-z]love[^a-z]*'"
    ).fetchone()[0] == 0
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

    # Every heading sits before a verse that exists, or at a word boundary inside one.
    heading_problems, heading_count = [], 0
    if abbrev == "WEB":
        rows = conn.execute(
            "SELECT h.book, h.chapter, h.verse, h.offset, h.text, v.text FROM headings h "
            "LEFT JOIN verses v USING (book, chapter, verse)").fetchall()
        heading_count = len(rows)
        for book, chapter, verse, offset, heading, verse_text in rows:
            if verse_text is None or not heading or (
                    offset and not (0 < offset < len(verse_text) and verse_text[offset - 1] == " ")):
                heading_problems.append(f"{book} {chapter}:{verse}@{offset} {heading!r}")

    shifted = []
    # An omitted verse must leave a hole, not shift the rest of its chapter.
    if abbrev == "WEB":
        for book, chapter, verse in sorted(WEB_OMITTED_VERSES):
            present = conn.execute(
                "SELECT 1 FROM verses WHERE book=? AND chapter=? AND verse=?",
                (book, chapter, verse),
            ).fetchone()
            if present:
                shifted.append(f"{book} {chapter}:{verse}")

    conn.close()

    print(f"\n{'═' * 52}")
    print(f"  {abbrev} — verification")
    print(f"{'═' * 52}")
    # Verse count: KJV/ASV/YLT/Darby/BSB = 31,102 exactly. WEB = 31,098: it
    # omits the four WEB_OMITTED_VERSES, and the Romans doxology at 14:24-26
    # instead of 16:25-27 nets to zero.
    expected = WEB_EXPECTED_VERSE_COUNT if abbrev == "WEB" else EXPECTED_VERSE_COUNT
    verse_ok = verse_count == expected
    verse_note = "✓" if verse_ok else f"✗ expected {expected:,}"
    if shifted:
        verse_ok = False
        verse_note += f"  ✗ should be absent: {', '.join(shifted)}"

    print(f"  Verses : {verse_count:,}  {verse_note}")
    if title_count:
        kind = "with WEB's own wording" if filled_titles else "placeholder(s), empty"
        print(f"  Titles : {title_count} Psalm title row(s) (verse=0), {kind}")
    print(f"  Markup : {'✓ none left' if not markup_left else '✗ ' + repr(markup_left)}")
    if abbrev == "WEB":
        heading_ok = heading_count == WEB_EXPECTED_HEADING_COUNT and not heading_problems
        print(f"  Heads  : {heading_count} heading(s)  "
              f"{'✓' if heading_ok else f'✗ expected {WEB_EXPECTED_HEADING_COUNT}, placed right'} "
              f"{heading_problems[:5] if heading_problems else ''}")
    print(f"  Words  : {'✓' if fts_word_ok else '✗'} 'love' matches whole words only")
    print(f"  Books  : {book_count}  {'✓' if book_count == 66 else '✗ expected 66'}")
    print(f"  Meta   : {meta}")
    print(f"  FTS    : {len(fts_hits)} hit(s) for 'faith'  {'✓' if fts_hits else '✗ no results'}")
    print(f"\n  Gen 1:1  — {gen1_1[0][:80] if gen1_1 else '✗ MISSING'}")
    print(f"  Jn  3:16 — {jn3_16[0][:80] if jn3_16 else '✗ MISSING'}")
    print(f"  Rom 8:28 — {rom8_28[0][:80] if rom8_28 else '✗ MISSING'}")

    headings_ok = abbrev != "WEB" or (heading_count == WEB_EXPECTED_HEADING_COUNT and not heading_problems)
    if not verse_ok or book_count != 66 or not fts_hits or markup_left or not fts_word_ok or not headings_ok:
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
    parser.add_argument("source",    help="Source path: scrollmapper .db, BSB .txt, or WEB USFM .zip")
    parser.add_argument("--name",    required=True, help="Full translation name")
    parser.add_argument("--year",    default="",    help="Publication year")
    parser.add_argument("--license", default="Public Domain", dest="license_",
                        help="License string (default: 'Public Domain')")
    args = parser.parse_args()

    abbrev = args.abbrev
    source = args.source

    # ── Load verses ───────────────────────────────────────────────────────────

    headings: list[tuple] = []
    if source.endswith(".zip"):
        print(f"Loading {abbrev} from WEB USFM: {source}")
        verses, headings = load_from_web_usfm(source)
    elif source.endswith((".txt", ".tsv")):
        print(f"Loading {abbrev} from BSB TSV: {source}")
        verses = load_from_bsb_tsv(source)
    elif source.endswith(".db"):
        print(f"Loading {abbrev} from scrollmapper: {source}")
        verses = load_from_scrollmapper(source, abbrev)
    else:
        print(f"Error: cannot determine source type for '{source}'.\n"
              "Expected: a .zip file (WEB USFM), a .txt file (BSB), or a .db file.",
              file=sys.stderr)
        sys.exit(1)

    print(f"  Loaded {len(verses):,} verses.")

    verses = add_psalm_title_placeholders(verses, abbrev)

    # ── Build output DB ───────────────────────────────────────────────────────

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = str(OUTPUT_DIR / f"{abbrev}.db")

    print(f"Building {output_path} …")
    conn = create_output_db(output_path)

    populate_books(conn)
    populate_meta(conn, args.name, abbrev, args.year, args.license_)
    populate_verses(conn, verses)
    if headings:
        populate_headings(conn, headings)

    print("  Rebuilding FTS index …")
    rebuild_fts(conn)
    compact(conn)

    conn.commit()
    conn.close()

    ok = verify(output_path, abbrev)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
