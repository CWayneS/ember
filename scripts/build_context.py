#!/usr/bin/env python3
"""
build_context.py — Build data/context.db, the Info tab's reference data
(docs/Info_Tab_Spec.md, Items 3 and 5).

Usage (run from project root):
    python3 -I scripts/build_context.py [--raw-dir DIR] [--output PATH] [--ship]

Downloads what it needs into data/context-prep/raw/ (gitignored) at the pinned
commit below, refuses to build if the file's sha256 differs from the pinned
value, and writes:
    data/context-prep/output/context.db   (build artifact; --output overrides)
    data/context.db                       (shipped copy, written only with --ship)

Source:
    STEPBible/STEPBible-Data  Proper Nouns/TIPNR - Translators Individualised
                              Proper Names with all References - STEPBible.org CC BY.txt
    Pinned at be4191f (2026-10-24), the commit language.db is built from; it is
    also the last commit to change TIPNR as of 2026-11-25. CC BY 4.0, "Data
    created by www.STEPBible.org based on work at Tyndale House Cambridge".

What goes in, and what doesn't:
    TIPNR is a "$"-separated list of records, one per individual person, place
    or other name. A record's first line holds UniqueName=uStrong and
    descriptive fields; its sub-records ("– Named", "– Greek", "– Spelled", ...)
    each give one Hebrew or Greek form of the name with an exhaustive list of
    the verses it occurs in (standard English versification, Psalm titles as
    verse 0, which is Ember's numbering too).

    People:  PERSON(s) records of type Male or Female. TIPNR already tells
             apart people who share a name (each Zechariah is his own record).
    Places:  PLACE and PLACE+PERSON records.
    Left out: Group records (the Amorites) and "– Group" sub-records (gentilics
             such as Abiezrite); "– Mentioned" sub-records (people with no name
             in the text); "– Form" sub-records (verbs and adjectives made from a
             name); LXX-only references; OTHER and EXCLUDED OTHER records (God,
             Sheol, months, titles).
    Not used: @Briefest, @Brief, @Short and @Article. TIPNR says they were
             "adapted from the output by Claude 3 Opus AI in April 2024": AI-written
             copy, which the spec's review rule would have to cover first.

    The name shown for a chapter is the form used there: "Abram" in Genesis 12
    (TIPNR's AltName|UnifiedName gives it), with the unified name kept beside it.

Tables written:
    context_names     one row per person or place
    chapter_names     each name's appearances in a chapter: the form shown,
                      its first verse there, and how many verses
    context_meta      source commit, sha256, licence

Rebuilding from unchanged sources with the same SQLite version gives a
byte-identical file: no build date, rows inserted in sorted order. Upstream
slips the build works around are listed in docs/DATA_QUIRKS.md; the build
prints each one it meets, and stops if their number changes.

--ship also rewrites data/reference-catalog.json (scripts/build_catalogs.py), so
installs replace their copy in the background after their next online launch.
"""

import argparse
import collections
import hashlib
import re
import shutil
import sqlite3
import struct
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR      = PROJECT_ROOT / 'data' / 'context-prep' / 'raw'
OUTPUT_DB    = PROJECT_ROOT / 'data' / 'context-prep' / 'output' / 'context.db'
SHIPPED_DB   = PROJECT_ROOT / 'data' / 'context.db'
KJV_DB       = PROJECT_ROOT / 'data' / 'translations' / 'kjv.db'

STEPBIBLE_COMMIT = 'be4191f0082aeedddb0eff0c02c966292b2bd641'  # 2026-10-24
TIPNR_PATH   = 'Proper Nouns/TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt'
TIPNR_FILE   = 'TIPNR.txt'
TIPNR_SHA256 = 'd595b9163d32a400bb0ef96b27a6de58335a63da840b82531fe9f5e1d16a318c'

MAX_SIZE_BYTES = 2 * 1024 * 1024   # the spec expects "likely under 1 MB"

STEPBIBLE_BOOK_ORDER = [
    'Gen', 'Exo', 'Lev', 'Num', 'Deu', 'Jos', 'Jdg', 'Rut', '1Sa', '2Sa',
    '1Ki', '2Ki', '1Ch', '2Ch', 'Ezr', 'Neh', 'Est', 'Job', 'Psa', 'Pro',
    'Ecc', 'Sng', 'Isa', 'Jer', 'Lam', 'Ezk', 'Dan', 'Hos', 'Jol', 'Amo',
    'Oba', 'Jon', 'Mic', 'Nam', 'Hab', 'Zep', 'Hag', 'Zec', 'Mal',
    'Mat', 'Mrk', 'Luk', 'Jhn', 'Act', 'Rom', '1Co', '2Co', 'Gal', 'Eph',
    'Php', 'Col', '1Th', '2Th', '1Ti', '2Ti', 'Tit', 'Phm', 'Heb', 'Jas',
    '1Pe', '2Pe', '1Jn', '2Jn', '3Jn', 'Jud', 'Rev',
]
BOOK_ID = {abbrev: index + 1 for index, abbrev in enumerate(STEPBIBLE_BOOK_ORDER)}

# Sub-records whose references are the person or place named in the text.
INCLUDED_SUBRECORDS = {
    '– Named', '– Greek', '– Spelled', '– Spelled combined', '– Name combined',
    '– Aramaic', '– Aramaic combined', '– (same form with Variant)',
    '– (same form with alt. meaning)', '– (same ref[s] with Variant)',
    '– (same ref[s] with alt Tags)', '– LXX addition',
}
EXCLUDED_SUBRECORDS = {'– Group', '– Mentioned', '– Total', '– Form (verb)', '– Form (adjective)',
                       '– Form (verb) OR (adjective)'}

RECORD_KINDS = {'PERSON(s)': 'person', 'PLACE': 'place', 'PLACE+PERSON': 'place'}
PERSON_TYPES = {'Male', 'Female'}

# Exact because the source is pinned: a difference means this script changed.
EXPECTED_COUNTS = {'people': 3054, 'places': 1006, 'chapter rows': 13571}

# A reference: "Gen.12.8", "Gen.12.8a" (a second occurrence in the verse),
# "LXX.Est.3.1" (only in the Septuagint).
REFERENCE = re.compile(r'^(LXX\.?)?([1-3]?[A-Z][a-z]{1,2})\.(\d+)\.(\d+)[a-z]?$')
# Slips found in the pinned file (docs/DATA_QUIRKS.md, TIPNR). Each is read the
# way it was evidently meant; the build stops if the set changes.
KNOWN_SLIPS = {
    'Num.13.8,16': ['Num.13.8', 'Num.13.16'],   # a second verse after a comma
}


# ---- Sources -----------------------------------------------------------------

def fetch_and_verify_source(raw_dir):
    """Downloads TIPNR at the pinned commit if it's missing, and refuses it if its
    sha256 isn't the pinned value, including a copy already on disk."""
    path = raw_dir / TIPNR_FILE
    if not path.exists():
        url = (f'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/{STEPBIBLE_COMMIT}/'
               + urllib.parse.quote(TIPNR_PATH))
        raw_dir.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as response:
            path.write_bytes(response.read())
        print(f'downloaded {TIPNR_FILE}')
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != TIPNR_SHA256:
        sys.exit(f'sha256 mismatch, not building:\n  {TIPNR_FILE}: expected {TIPNR_SHA256}, got {actual}')
    print(f'{TIPNR_FILE} matches its pinned sha256 {TIPNR_SHA256[:12]}')
    return path


def report_upstream_position():
    """The source is pinned, so a moved repository doesn't change this build, but
    a newer TIPNR may have corrections worth taking."""
    try:
        output = subprocess.run(['git', 'ls-remote', 'https://github.com/STEPBible/STEPBible-Data.git', 'HEAD'],
                                capture_output=True, text=True, timeout=30, check=True).stdout
    except (OSError, subprocess.SubprocessError) as error:
        print(f'  STEPBible-Data: could not check upstream ({error})')
        return
    head = output.split()[0] if output.split() else 'unknown'
    state = ('at the pin' if head == STEPBIBLE_COMMIT
             else f'upstream is at {head[:7]}: check whether TIPNR changed since the pin')
    print(f'  STEPBible-Data: pinned {STEPBIBLE_COMMIT[:7]}, {state}')


# ---- Parsing -----------------------------------------------------------------

def read_records(path):
    """TIPNR's records after its explanatory header, as
    {'kind', 'head': [fields], 'subs': [[fields], ...]}."""
    lines = path.read_text(encoding='utf-8').replace('\r\n', '\n').split('\n')
    # The header documents each record layout with its own "$==========" lines;
    # the data starts at the first one written "$========== " with a space.
    start = next(index for index, line in enumerate(lines) if line.startswith('$========== '))
    records = []
    current = None
    for line in lines[start:]:
        if line.startswith('$=========='):
            current = {'kind': line.strip('$= \t'), 'head': None, 'subs': []}
            records.append(current)
        elif current is None:
            continue
        elif current['head'] is None:
            if line.strip():
                current['head'] = line.split('\t')
        elif line.startswith('– '):
            current['subs'].append(line.split('\t'))
    return records


def display_names(unique_name):
    """'Abram|Abraham@Gen.11.26-1Pe' → ('Abram', 'Abraham'); 'Aaron@Exo.4.14-Heb' →
    ('Aaron', 'Aaron'). The first is the form this sub-record is; the second the
    name the record is filed under."""
    names = unique_name.split('@', 1)[0]
    alternative, _, unified = names.rpartition('|')
    unified = unified.strip()
    return (alternative.strip() or unified), unified


def parse_references(text, slips):
    """Verse references in a sub-record's All Refs field, as (book, chapter, verse,
    lxx_only). Anything else is recorded in `slips` and, unless it's a known slip
    read as listed in KNOWN_SLIPS, skipped."""
    references = []
    for token in (part.strip() for part in text.split(';')):
        if not token:
            continue
        pieces = [token]
        if token in KNOWN_SLIPS:
            slips[token] += 1
            pieces = KNOWN_SLIPS[token]
        elif ',' in token:
            # "Exo.1.13, Exo.1.19": two references with a comma between them.
            pieces = [piece.strip() for piece in token.split(',')]
            if all(REFERENCE.match(piece) for piece in pieces):
                slips['comma between references'] += 1
            else:
                slips[f'unreadable: {token}'] += 1
                continue
        for piece in pieces:
            match = REFERENCE.match(piece)
            if not match or match.group(2) not in BOOK_ID:
                slips[f'unreadable: {piece}'] += 1
                continue
            references.append((BOOK_ID[match.group(2)], int(match.group(3)), int(match.group(4)),
                               bool(match.group(1))))
    return references


def build_rows(records, verses, slips):
    """context_names rows, chapter_names rows, and counts for the report."""
    names = []            # (unique_name, name, kind, type, description)
    appearances = {}      # (unique_name, book, chapter) → {verse: form}
    counts = collections.Counter()
    for record in records:
        kind = RECORD_KINDS.get(record['kind'])
        head = record['head']
        record_type = head[8].strip() if len(head) > 8 else ''
        if kind is None:
            counts[f'skipped record: {record["kind"]}'] += 1
            continue
        if kind == 'person' and record_type not in PERSON_TYPES:
            counts[f'skipped person type: {record_type}'] += 1
            continue
        unique_name = head[0].split('=', 1)[0].strip()
        _, unified = display_names(unique_name)
        # People: "Man living at the time of the Patriarchs". Places' first field
        # is OpenBible's name, so the geographical area stands in when there is one.
        if kind == 'person':
            description = head[1].strip()
        else:
            area = head[6].strip() if len(head) > 6 else ''
            description = '' if area in ('', '>') else area
        names.append((unique_name, unified, kind, record_type, description))
        counts[kind] += 1

        for sub in record['subs']:
            label = sub[0].strip()
            label = '– ' + label[1:].strip() if label.startswith('–') else label
            if label in EXCLUDED_SUBRECORDS:
                counts[f'sub-record left out: {label}'] += 1
                continue
            if label not in INCLUDED_SUBRECORDS:
                sys.exit(f'unknown sub-record {label!r} in {unique_name}: decide whether it names the person or place')
            form, _ = display_names(sub[1])
            for book, chapter, verse, lxx_only in parse_references(sub[4] if len(sub) > 4 else '', slips):
                if lxx_only:
                    counts['LXX-only references left out'] += 1
                    continue
                if (book, chapter, verse) not in verses:
                    slips[f'no such verse: {STEPBIBLE_BOOK_ORDER[book - 1]}.{chapter}.{verse} ({unique_name})'] += 1
                    continue
                chapter_verses = appearances.setdefault((unique_name, book, chapter), {})
                chapter_verses.setdefault(verse, form)
                counts['references'] += 1

    ids = {unique_name: index + 1 for index, (unique_name, *_rest) in enumerate(sorted(names))}
    name_rows = [(ids[row[0]], *row) for row in sorted(names)]
    chapter_rows = []
    for (unique_name, book, chapter), by_verse in sorted(appearances.items(), key=lambda item: (item[0][1], item[0][2], ids[item[0][0]])):
        first_verse = min(by_verse)
        chapter_rows.append((book, chapter, ids[unique_name], by_verse[first_verse], first_verse, len(by_verse)))
    return name_rows, chapter_rows, counts


def kjv_verses():
    """Every (book, chapter, verse) in the KJV file, Psalm titles (verse 0) included:
    the versification all of Ember's translations share."""
    con = sqlite3.connect(f'file:{KJV_DB}?mode=ro', uri=True)
    try:
        return set(con.execute('SELECT book, chapter, verse FROM verses'))
    finally:
        con.close()


# ---- Writing -----------------------------------------------------------------

SCHEMA = """
CREATE TABLE context_names (
    id           INTEGER PRIMARY KEY,
    unique_name  TEXT NOT NULL UNIQUE,   -- TIPNR's UniqueName, e.g. Abraham@Gen.11.26-1Pe
    name         TEXT NOT NULL,          -- the name it's filed under, e.g. Abraham
    kind         TEXT NOT NULL CHECK (kind IN ('person', 'place')),
    type         TEXT NOT NULL,          -- Male, Female or Place
    description  TEXT NOT NULL           -- e.g. "Man living at the time of the Patriarchs"; '' if none
);
CREATE TABLE chapter_names (
    book         INTEGER NOT NULL,
    chapter      INTEGER NOT NULL,
    name_id      INTEGER NOT NULL REFERENCES context_names(id),
    shown_as     TEXT NOT NULL,          -- the form at first_verse, e.g. Abram
    first_verse  INTEGER NOT NULL,       -- verse number; 0 is a Psalm title
    verse_count  INTEGER NOT NULL,
    PRIMARY KEY (book, chapter, name_id)
) WITHOUT ROWID;
CREATE TABLE context_meta (key TEXT PRIMARY KEY, value TEXT);
"""


def meta_rows():
    """Source and licence, and deliberately no build date."""
    return sorted([
        ('stepbible_commit', STEPBIBLE_COMMIT),
        (f'sha256:{TIPNR_PATH}', TIPNR_SHA256),
        ('source', 'TIPNR, STEPBible.org (github.com/STEPBible/STEPBible-Data)'),
        ('licence', 'CC BY 4.0. Data created by www.STEPBible.org based on work at Tyndale House Cambridge.'),
    ])


def write_database(path, name_rows, chapter_rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    con = sqlite3.connect(path)
    con.execute('PRAGMA page_size = 4096')
    con.execute('PRAGMA journal_mode = DELETE')
    con.executescript(SCHEMA)
    con.executemany('INSERT INTO context_names VALUES (?, ?, ?, ?, ?, ?)', name_rows)
    con.executemany('INSERT INTO chapter_names VALUES (?, ?, ?, ?, ?, ?)', chapter_rows)
    con.executemany('INSERT INTO context_meta VALUES (?, ?)', meta_rows())
    con.commit()
    con.execute('VACUUM')
    con.close()


def sqlite_header_check(path):
    """The rule js/db.js:isCompleteSqliteFile() applies to a downloaded file."""
    header = path.read_bytes()[:100]
    page_size = struct.unpack('>H', header[16:18])[0]
    change_counter, page_count = struct.unpack('>II', header[24:32])
    version_valid_for = struct.unpack('>I', header[92:96])[0]
    return (header[:16] == b'SQLite format 3\0' and change_counter == version_valid_for
            and page_size * page_count == path.stat().st_size)


# ---- Report ------------------------------------------------------------------

def heading(text):
    print(f'\n== {text}')


def spot_checks(con):
    """Chapters whose people and places are well known, read back from the file."""
    def chapter(book, number):
        return [(row[0], row[1], row[2]) for row in con.execute(
            """SELECT c.shown_as, n.kind, c.first_verse FROM chapter_names c
               JOIN context_names n ON n.id = c.name_id
               WHERE c.book = ? AND c.chapter = ? ORDER BY c.first_verse, c.shown_as""", (book, number))]

    def has(rows, shown_as, kind, first_verse):
        return (shown_as, kind, first_verse) in rows

    genesis_12 = chapter(1, 12)
    john_3 = chapter(43, 3)
    psalm_3 = chapter(19, 3)
    psalm_51 = chapter(19, 51)
    zechariahs = con.execute("SELECT COUNT(*) FROM context_names WHERE name = 'Zechariah' AND kind = 'person'").fetchone()[0]
    return [
        ('Genesis 12: Abram at 12:1, not Abraham', has(genesis_12, 'Abram', 'person', 1)
         and not any(row[0] == 'Abraham' for row in genesis_12)),
        ('Genesis 12: Sarai at 12:5, Pharaoh at 12:15', has(genesis_12, 'Sarai', 'person', 5) and has(genesis_12, 'Pharaoh', 'person', 15)),
        ('Genesis 12: Bethel and Egypt are places', has(genesis_12, 'Bethel', 'place', 8) and has(genesis_12, 'Egypt', 'place', 10)),
        ('John 3: Nicodemus at 3:1, Moses at 3:14, Aenon at 3:23', has(john_3, 'Nicodemus', 'person', 1)
         and has(john_3, 'Moses', 'person', 14) and has(john_3, 'Aenon', 'place', 23)),
        ('Psalm 3: David and Absalom in the title (verse 0)', has(psalm_3, 'David', 'person', 0) and has(psalm_3, 'Absalom', 'person', 0)),
        # TIPNR files Zion under Jerusalem ("Zion|Jerusalem"); 51:18 names both.
        ('Psalm 51: Nathan and Bathsheba in the title, Jerusalem at 51:18', has(psalm_51, 'Nathan', 'person', 0)
         and has(psalm_51, 'Bathsheba', 'person', 0) and has(psalm_51, 'Jerusalem', 'place', 18)),
        (f'people who share a name stay apart (Zechariah: {zechariahs} people)', zechariahs > 20),
    ], {'Genesis 12': genesis_12, 'John 3': john_3, 'Psalm 3': psalm_3}


def build(raw_dir, output, ship):
    heading('Source')
    source = fetch_and_verify_source(raw_dir)
    report_upstream_position()

    slips = collections.Counter()
    name_rows, chapter_rows, counts = build_rows(read_records(source), kjv_verses(), slips)
    write_database(output, name_rows, chapter_rows)

    problems = []
    heading('Counts')
    for label, value in sorted(counts.items()):
        print(f'  {label}: {value}')
    print(f'  chapter rows: {len(chapter_rows)}')
    chapters_covered = len({(row[0], row[1]) for row in chapter_rows})
    print(f'  chapters with at least one person or place: {chapters_covered} of 1189')
    measured = {'people': counts['person'], 'places': counts['place'], 'chapter rows': len(chapter_rows)}
    for label, expected in EXPECTED_COUNTS.items():
        passed = measured[label] == expected
        print(f'{"ok  " if passed else "FAR "} {label}: {measured[label]} (expected exactly {expected})')
        if not passed:
            problems.append(f'{label}: {measured[label]}, expected {expected}')

    heading('Upstream slips (docs/DATA_QUIRKS.md)')
    for label, value in sorted(slips.items()):
        print(f'  {label}: {value}')
    if dict(slips) != EXPECTED_SLIPS:
        problems.append('the upstream slips differ from EXPECTED_SLIPS: check each, record it in docs/DATA_QUIRKS.md, then update the list')

    heading('Spot checks')
    con = sqlite3.connect(f'file:{output}?mode=ro', uri=True)
    checks, samples = spot_checks(con)
    for label, passed in checks:
        print(f'{"ok  " if passed else "FAIL"} {label}')
        if not passed:
            problems.append(f'spot check failed: {label}')
    for label, rows in samples.items():
        print(f'  {label}: ' + ', '.join(f'{shown}({kind[0]}){verse}' for shown, kind, verse in rows))
    con.close()

    heading('File')
    size = output.stat().st_size
    print(f'size: {size} bytes ({size / 1024 / 1024:.2f} MiB), limit {MAX_SIZE_BYTES / 1024 / 1024:.0f} MiB')
    if size > MAX_SIZE_BYTES:
        problems.append(f'file is {size} bytes, over the {MAX_SIZE_BYTES} byte limit')
    if not sqlite_header_check(output):
        problems.append('file fails the isCompleteSqliteFile header check')
    print(f'sha256: {hashlib.sha256(output.read_bytes()).hexdigest()}')

    if problems:
        heading('STOPPED: not shipping')
        for problem in problems:
            print(f'  {problem}')
        sys.exit(1)

    if ship:
        shutil.copyfile(output, SHIPPED_DB)
        print(f'\nShipped to {SHIPPED_DB}')
        # The catalog's sha256 is how installs learn the file changed.
        subprocess.run([sys.executable, str(Path(__file__).with_name('build_catalogs.py'))], check=True)
    else:
        print(f'\nBuilt {output}; rerun with --ship to copy it to {SHIPPED_DB}')


# Every slip the pinned file has in the records this build reads, each checked by
# hand; see docs/DATA_QUIRKS.md. (Its other slips are in records left out.)
EXPECTED_SLIPS = {'Num.13.8,16': 1}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build data/context.db from STEPBible TIPNR.')
    parser.add_argument('--raw-dir', type=Path, default=RAW_DIR,
                        help=f'directory for the downloaded source file (default: {RAW_DIR})')
    parser.add_argument('--output', type=Path, default=OUTPUT_DB,
                        help=f'build artifact path (default: {OUTPUT_DB})')
    parser.add_argument('--ship', action='store_true', help=f'copy the finished build to {SHIPPED_DB}')
    args = parser.parse_args()
    build(raw_dir=args.raw_dir.resolve(), output=args.output.resolve(), ship=args.ship)
