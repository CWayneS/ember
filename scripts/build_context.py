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
    Peoples: PERSON(s) records of type Group (the Amorites); every "– Group"
             sub-record (gentilics: Levite, Philistine, Egyptian, Gibeonite), one
             entry per record they're under; and the records in ANCESTOR_PEOPLES,
             whose own name TIPNR uses for the people too (see there).
    Places:  PLACE and PLACE+PERSON records.
    Left out: "– Mentioned" sub-records (people with no name in the text);
             "– Form" sub-records (verbs and adjectives made from a name);
             LXX-only references; OTHER and EXCLUDED OTHER records (God, Sheol,
             months, titles).
    Descriptions: @Brief (up to ten words) and @Short (one sentence) are kept.
             TIPNR says they were "adapted from the output by Claude 3 Opus AI in
             April 2024"; STEPBible uses them itself (TIPNR's own extraction recipe
             maps them to its lexicon's @STEPSuperMeaning and @ShortDef), which is
             what Ember takes them on (Wayne, 2026-11-25). Their <ref> markup is
             turned into plain references ("Exodus 6:23"). @Briefest (often empty)
             and @Article (up to six paragraphs) aren't used.

    The name shown for a chapter is the form used there: "Abram" in Genesis 12
    (TIPNR's AltName|UnifiedName gives it), with the unified name kept beside it.

Second source, the chapter summaries (Item 4):
    lb42/KJV_1611     chaps/<Book>_<NN>.xml for the 66 books, Lou Burnard's TEI
                      edition of the 1611 King James Bible. Pinned at c62d87f
                      (2017-10-29); fetched file by file and checked by one sha256
                      over all of them (KJV1611_SHA256). No licence is stated; the
                      1611 text is in the public domain, and Ember credits the
                      repository (Wayne's call, 2026-11-25).
    Each chapter's second <head> is the 1611 summary ("1 Christ teacheth
    Nicodemus the necessitie of regeneration. 14 Of faith in his death. ...").
    The original is kept as printed (entities decoded, whitespace collapsed);
    the modern form changes spelling, and adds the apostrophe of a possessive
    (Wayne, 2026-11-25), only by build/context/1611-spelling.tsv
    (made by scripts/analysis/kjv1611/derive_spelling.py, which says how).
    Proverbs 11-24 have none in the 1611 either: they get Proverbs 10's note
    ("From this Chapter to the five and twentieth, are sundry observations of
    moral virtues ..."), with borrowed_from = 10 so the app can say so.
    build/context/1611-glosses.tsv, kept by hand, glosses the hard words.

Tables written:
    context_names     one row per person, people or place
    chapter_names     each name's appearances in a chapter: the form shown,
                      its first verse there, and how many verses
    chapter_summaries each chapter's 1611 summary, as printed and modernized
    summary_glosses   the hard words and their meanings
    context_meta      source commits, sha256, licence

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
import html
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
CORE_DB      = PROJECT_ROOT / 'data' / 'core.db'

STEPBIBLE_COMMIT = 'be4191f0082aeedddb0eff0c02c966292b2bd641'  # 2026-10-24
TIPNR_PATH   = 'Proper Nouns/TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt'
TIPNR_FILE   = 'TIPNR.txt'
TIPNR_SHA256 = 'd595b9163d32a400bb0ef96b27a6de58335a63da840b82531fe9f5e1d16a318c'

KJV1611_COMMIT = 'c62d87f7945403bcd2df4712ecaa83246ed9930d'  # 2017-10-29
KJV1611_SHA256 = '487fbcc5d6d990b4268d72b8025e5bda51289a5826d75d120775073a1b51d39f'   # over every chapter file used; see kjv1611_digest()
SPELLING_LIST = PROJECT_ROOT / 'build' / 'context' / '1611-spelling.tsv'
GLOSS_LIST = PROJECT_ROOT / 'build' / 'context' / '1611-glosses.tsv'

MAX_SIZE_BYTES = 3 * 1024 * 1024   # the spec guessed "likely under 1 MB"; the 1611 summaries, kept as printed and modernized, take it near 2 MB

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
GENTILIC_SUBRECORD = '– Group'
EXCLUDED_SUBRECORDS = {'– Mentioned', '– Total', '– Form (verb)', '– Form (adjective)',
                       '– Form (verb) OR (adjective)'}

RECORD_KINDS = {'PERSON(s)': 'person', 'PLACE': 'place', 'PLACE+PERSON': 'place'}
PERSON_TYPES = {'Male', 'Female'}

# Records whose own name TIPNR uses both for the man and for the tribe or nation
# named after him, with nothing to say which a verse means: all 2,501 Old
# Testament "Israel"s are under Israel@Gen.25.26, the patriarch, and Judah's
# record is the man, the tribe, the kingdom and "Jews". These go under Peoples,
# marked `ambiguous`, so the app says the verse may mean either (Wayne chose this,
# 2026-11-25). Chosen by hand: no rule in the data finds them (one on references
# long after the man's life also catches David, Moses and Abraham). Each name is
# used for its people outside Genesis: the tribes in Numbers, Joshua, Judges and
# Revelation 7; Esau for Edom (Obadiah, Malachi 1:2-3); Javan for Greece (Isaiah
# 66:19, Ezekiel 27:13); Kedar for the tribe (Isaiah 21:16-17, Jeremiah 49:28).
# Nations TIPNR already keeps apart from their ancestor (Moab, Edom, Amalek,
# Dan, Cush, Midian, Canaan) need nothing here; ANCESTOR_PEOPLES_MISSING stops
# the build if one of these goes missing.
ANCESTOR_PEOPLES = (
    'Israel@Gen.25.26-Rev', 'Reuben@Gen.29.32-Rev', 'Simeon@Gen.29.33-Rev', 'Levi@Gen.29.34-Rev',
    'Judah@Gen.29.35-Rev', 'Issachar@Gen.30.18-Rev', 'Zebulun@Gen.30.20-Rev', 'Gad@Gen.30.11-Rev',
    'Asher@Gen.30.13-Rev', 'Naphtali@Gen.30.8-Rev', 'Joseph@Gen.30.24-Rev', 'Benjamin@Gen.35.18-Rev',
    'Ephraim@Gen.41.52-Zec', 'Manasseh@Gen.41.51-Rev', 'Esau@Gen.25.25-Heb', 'Javan@Gen.10.2-Col',
    'Kedar@Gen.25.13-Ezk',
)

# Exact because the source is pinned: a difference means this script changed.
# Entries with no verse left (only "– Mentioned" or LXX references) aren't kept.
EXPECTED_COUNTS = {'people': 2979, 'peoples': 271, 'places': 1003, 'chapter rows': 14697}

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
        elif line.startswith(('@Brief=', '@Short=')):
            key, _, value = line.partition('=')
            current[key[1:].lower()] = value.strip('\t ')
    return records


REFERENCE_MARKUP = re.compile(r'<ref="([^"]*)">([^<]*)</ref>')
SHOWN_REFERENCE = re.compile(r'^([1-3]?[A-Z][a-z]+)\.(\d+)\.(\d+)(.*)$', re.S)


def plain_references(text, book_names):
    """'… a priest. (<ref="Exo.6.23">Exo.6.23</ref>)' → '… a priest. (Exodus 6:23)'.
    The shown text is kept ('1Ch.6.23, 37' → '1 Chronicles 6:23, 37'); a book
    code it doesn't know is taken from the attribute ('Joel.1.1' → 'Joel 1:1')."""
    def readable(match):
        attribute, shown = match.groups()
        parts = SHOWN_REFERENCE.match(shown.strip())
        if not parts:
            return shown
        book, chapter, verse, rest = parts.groups()
        if book not in BOOK_ID:
            from_attribute = REFERENCE.match(attribute.split(';')[0].split(',')[0].strip())
            if not from_attribute or from_attribute.group(2) not in BOOK_ID:
                return shown
            book = from_attribute.group(2)
        return f'{book_names[BOOK_ID[book]]} {chapter}:{verse}{rest}'
    return REFERENCE_MARKUP.sub(readable, text)


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


def gentilic_form(translated):
    """The form a gentilic sub-record's translations column gives, ESV's if marked:
    'Gibeonite =ESV,NIV,KJV; Gibeon =ESV,NIV' → 'Gibeonite'; 'Egyptian,Egypt' →
    'Egyptian'. '' if there's none ('[ ] =ESV')."""
    segments = [segment.strip() for segment in translated.split(';') if segment.strip()]
    chosen = next((segment for segment in segments if 'ESV' in segment.partition('=')[2]), segments[0] if segments else '')
    form = chosen.partition('=')[0].split(',')[0].strip()
    return '' if form.startswith('[') else form


def build_rows(records, verses, book_names, slips):
    """context_names rows, chapter_names rows, and counts for the report.

    An entry is one person, people or place. A record becomes one entry, and its
    gentilic sub-records a second one (kind 'group', unique name + '#group'),
    except for Group records, whose gentilics are part of the record's own
    entry. ANCESTOR_PEOPLES keep theirs apart: "Jew" means the people, so only
    Judah's own name is marked ambiguous."""
    entries = {}          # unique_name → (name, kind, type, description, brief, summary, ambiguous)
    appearances = {}      # (unique_name, book, chapter) → {verse: form}
    counts = collections.Counter()
    found_ancestors = set()

    def add_references(entry_name, sub, form):
        for book, chapter, verse, lxx_only in parse_references(sub[4] if len(sub) > 4 else '', slips):
            if lxx_only:
                counts['LXX-only references left out'] += 1
                continue
            if (book, chapter, verse) not in verses:
                slips[f'no such verse: {STEPBIBLE_BOOK_ORDER[book - 1]}.{chapter}.{verse} ({entry_name})'] += 1
                continue
            appearances.setdefault((entry_name, book, chapter), {}).setdefault(verse, form)
            counts['references'] += 1

    for record in records:
        kind = RECORD_KINDS.get(record['kind'])
        head = record['head']
        record_type = head[8].strip() if len(head) > 8 else ''
        if kind is None:
            counts[f'skipped record: {record["kind"]}'] += 1
            continue
        unique_name = head[0].split('=', 1)[0].strip()
        _, unified = display_names(unique_name)
        ambiguous = unique_name in ANCESTOR_PEOPLES
        if kind == 'person' and (record_type == 'Group' or ambiguous):
            kind = 'group'
            if ambiguous:
                found_ancestors.add(unique_name)
        elif kind == 'person' and record_type not in PERSON_TYPES:
            counts[f'skipped person type: {record_type}'] += 1
            continue
        # People: "Man living at the time of the Patriarchs". Places' first field
        # is OpenBible's name, so the geographical area stands in when there is one.
        if kind == 'place':
            area = head[6].strip() if len(head) > 6 else ''
            description = '' if area in ('', '>') else area
        else:
            description = head[1].strip()
        brief = record.get('brief', '')
        summary = plain_references(record.get('short', ''), book_names)
        if '<' in summary:
            sys.exit(f'markup left in the @Short of {unique_name}: {summary}')
        entries[unique_name] = (unified, kind, record_type, description, brief, summary, int(ambiguous))
        counts[kind] += 1

        gentilic_entry = unique_name if record_type == 'Group' else f'{unique_name}#group'
        for sub in record['subs']:
            label = sub[0].strip()
            label = '– ' + label[1:].strip() if label.startswith('–') else label
            if label in EXCLUDED_SUBRECORDS:
                counts[f'sub-record left out: {label}'] += 1
            elif label == GENTILIC_SUBRECORD:
                form = gentilic_form(sub[3] if len(sub) > 3 else '') or display_names(sub[1])[0]
                if gentilic_entry not in entries:
                    # "Descendants of Amram", "People of Gibeon": who they're named after.
                    named_after = 'People of' if kind == 'place' else 'Descendants of'
                    entries[gentilic_entry] = (form, 'group', 'Group', f'{named_after} {unified}', '', '', 0)
                    counts['group'] += 1
                    counts['gentilic entries'] += 1
                add_references(gentilic_entry, sub, form)
            elif label in INCLUDED_SUBRECORDS:
                add_references(unique_name, sub, display_names(sub[1])[0])
            else:
                sys.exit(f'unknown sub-record {label!r} in {unique_name}: decide whether it names the person or place')

    missing = set(ANCESTOR_PEOPLES) - found_ancestors
    if missing:
        sys.exit(f'ANCESTOR_PEOPLES not found in TIPNR: {sorted(missing)}')
    # A gentilic entry with no verse left (all LXX-only) isn't kept.
    used = {entry_name for entry_name, _book, _chapter in appearances}
    ids = {unique_name: index + 1 for index, unique_name in enumerate(sorted(name for name in entries if name in used))}
    name_rows = [(ids[name], name, *entries[name]) for name in sorted(ids)]
    chapter_rows = []
    for (unique_name, book, chapter), by_verse in sorted(appearances.items(), key=lambda item: (item[0][1], item[0][2], ids[item[0][0]])):
        first_verse = min(by_verse)
        chapter_rows.append((book, chapter, ids[unique_name], by_verse[first_verse], first_verse, len(by_verse)))
    counts['entries kept'] = len(ids)
    return name_rows, chapter_rows, counts


def book_names():
    """Ember's book names by id, from core.db ("1 Chronicles")."""
    con = sqlite3.connect(f'file:{CORE_DB}?mode=ro', uri=True)
    try:
        return dict(con.execute('SELECT id, name FROM books'))
    finally:
        con.close()


def kjv_verses():
    """Every (book, chapter, verse) in the KJV file, Psalm titles (verse 0) included:
    the versification all of Ember's translations share."""
    con = sqlite3.connect(f'file:{KJV_DB}?mode=ro', uri=True)
    try:
        return set(con.execute('SELECT book, chapter, verse FROM verses'))
    finally:
        con.close()


# ---- The 1611 chapter summaries ------------------------------------------------

def kjv1611_file_names(book_names_by_id, chapter_counts):
    """chaps/<Book>_<NN>.xml for the 66 books: "Song-of-Solomon_01.xml"."""
    return [f"{book_names_by_id[book].replace(' ', '-')}_{chapter:02d}.xml"
            for book in sorted(book_names_by_id) for chapter in range(1, chapter_counts[book] + 1)]


def kjv1611_digest(directory, names):
    """One sha256 over the files used: each name, a NUL, its own sha256, a newline."""
    digest = hashlib.sha256()
    for name in names:
        digest.update(name.encode() + b'\0' + hashlib.sha256((directory / name).read_bytes()).hexdigest().encode() + b'\n')
    return digest.hexdigest()


def fetch_and_verify_kjv1611(raw_dir, names):
    """Downloads missing chapter files at the pinned commit, eight at a time, and
    refuses them unless together they match KJV1611_SHA256."""
    from concurrent.futures import ThreadPoolExecutor
    directory = raw_dir / 'KJV_1611' / 'chaps'
    directory.mkdir(parents=True, exist_ok=True)
    missing = [name for name in names if not (directory / name).exists()]

    def fetch(name):
        url = f'https://raw.githubusercontent.com/lb42/KJV_1611/{KJV1611_COMMIT}/chaps/{urllib.parse.quote(name)}'
        with urllib.request.urlopen(url, timeout=120) as response:
            (directory / name).write_bytes(response.read())

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(fetch, missing))
    digest = kjv1611_digest(directory, names)
    if KJV1611_SHA256 is None:
        sys.exit(f'KJV1611_SHA256 is not set; the {len(names)} files give {digest}. Check them, then pin it.')
    if digest != KJV1611_SHA256:
        sys.exit(f'sha256 mismatch, not building:\n  KJV_1611 chapter files: expected {KJV1611_SHA256}, got {digest}')
    print(f'{len(names)} KJV_1611 chapter files match their pinned sha256 {KJV1611_SHA256[:12]} ({len(missing)} downloaded)')
    return directory


def tei_text(markup):
    """Text of a TEI fragment: tags removed, entities decoded, whitespace collapsed."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', markup))).strip()


def read_spelling_list():
    """{printed: modern} from 1611-spelling.tsv: spellings keyed in lower case,
    possessives exactly as printed ("Gods", "Lots wife")."""
    changes = {}
    for line in SPELLING_LIST.read_text(encoding='utf-8').splitlines():
        if line.startswith('#') or not line.strip():
            continue
        printed, modern = line.split('\t')[:2]
        changes[printed] = modern
    return changes


SUMMARY_WORD = re.compile(r"[A-Za-zÀ-ÿĀ-ſ]+")


def modernize(text, changes):
    """Spelling, and the apostrophe of a possessive, by the list: phrases first
    ("Lots wife" → "Lot’s wife"), then each word as printed ("Gods" → "God’s", not
    "gods"), then its spelling in lower case with the printed word's capital.
    Everything else, other punctuation included, as printed."""
    for phrase in sorted((key for key in changes if ' ' in key), key=len, reverse=True):
        text = re.sub(r'(?<![\w’])' + re.escape(phrase) + r'(?![\w’])', changes[phrase], text)

    def replace(match):
        word = match.group(0)
        if word in changes and word != word.lower():
            return changes[word]
        modern = changes.get(word.lower())
        if modern is None:
            return word
        return modern[0].upper() + modern[1:] if word[0].isupper() else modern
    return SUMMARY_WORD.sub(replace, text)


# Numbers in a summary that aren't verses of its chapter: counts, and slips
# (docs/DATA_QUIRKS.md). The app links only numbers within the chapter's verses.
NOT_VERSES = {
    (2, 24): {40},            # "he continueth 40. dayes, and 40. nights" (a count)
    (13, 21): {70000},        # "after the death of 70000" (a count)
    (27, 8): {2300},          # "The 2300. daies" (a count)
    (12, 7): {22},            # a slip: 2 Kings 7 has 20 verses; probably 12
    (26, 15): {16},           # a slip: Ezekiel 15 has 8 verses; probably 6
    (38, 3): {18},            # a slip: Zechariah 3 has 10 verses; probably 8
}
VERSE_NUMBER = re.compile(r'(?<![\w])(\d+)(?!\w)')
BORROWED_SUMMARIES = {(20, chapter): 10 for chapter in range(11, 25)}   # Proverbs 11-24 from 10


def read_summaries(directory, names, book_ids, verse_counts, changes, problems):
    """chapter_summaries rows: (book, chapter, original, modern, borrowed_from)."""
    rows = {}
    for name in names:
        stem, _, number = name[:-4].rpartition('_')
        book, chapter = book_ids[stem.replace('-', ' ')], int(number)
        heads = [tei_text(head) for head in re.findall(r'<head>(.*?)</head>', (directory / name).read_text(encoding='utf-8'), re.S)]
        if len(heads) > 1:
            original = heads[1]
            rows[(book, chapter)] = (book, chapter, original, modernize(original, changes), None)
            # Every number is a verse of this chapter, or a listed count or slip.
            numbers = {int(found) for found in VERSE_NUMBER.findall(original)}
            stray = {number for number in numbers if not 1 <= number <= verse_counts[(book, chapter)]}
            if stray != NOT_VERSES.get((book, chapter), set()):
                problems.append(f'{name}: numbers that are no verse of the chapter {sorted(stray)}, '
                                f'expected {sorted(NOT_VERSES.get((book, chapter), set()))}')
        elif (book, chapter) not in BORROWED_SUMMARIES:
            problems.append(f'{name}: no summary')
    for (book, chapter), source_chapter in BORROWED_SUMMARIES.items():
        if (book, chapter) in rows:
            problems.append(f'Proverbs {chapter} has its own summary now: drop it from BORROWED_SUMMARIES')
            continue
        _, _, original, modern, _ = rows[(book, source_chapter)]
        rows[(book, chapter)] = (book, chapter, original, modern, source_chapter)
    return [rows[key] for key in sorted(rows)]


def read_glosses(summary_rows, problems):
    """summary_glosses rows: (phrase, meaning, example, reviewed). Each phrase must
    occur, as whole words, in some modernized summary."""
    texts = [row[3] for row in summary_rows]
    rows = []
    for line in GLOSS_LIST.read_text(encoding='utf-8').splitlines():
        if line.startswith('#') or not line.strip():
            continue
        fields = line.split('\t') + ['', '']
        phrase, meaning, example, reviewed = (field.strip() for field in fields[:4])
        pattern = re.compile(r'(?<![\w])' + re.escape(phrase) + r'(?!\w)', re.I)
        if not any(pattern.search(text) for text in texts):
            problems.append(f'gloss "{phrase}" matches no summary')
        rows.append((phrase.lower(), meaning, example, reviewed))
    return sorted(rows)


def verse_counts():
    con = sqlite3.connect(f'file:{KJV_DB}?mode=ro', uri=True)
    try:
        return dict(((book, chapter), count) for book, chapter, count in
                    con.execute('SELECT book, chapter, COUNT(*) FROM verses WHERE verse > 0 GROUP BY book, chapter'))
    finally:
        con.close()


# ---- Writing -----------------------------------------------------------------

SCHEMA = """
CREATE TABLE context_names (
    id           INTEGER PRIMARY KEY,
    unique_name  TEXT NOT NULL UNIQUE,   -- TIPNR's UniqueName, e.g. Abraham@Gen.11.26-1Pe
    name         TEXT NOT NULL,          -- the name it's filed under, e.g. Abraham
    kind         TEXT NOT NULL CHECK (kind IN ('person', 'group', 'place')),
    type         TEXT NOT NULL,          -- Male, Female, Group or Place
    description  TEXT NOT NULL,          -- e.g. "Man living at the time of the Patriarchs"; '' if none
    brief        TEXT NOT NULL,          -- @Brief, e.g. "Moses' brother, first high priest of Israel"; '' if none
    summary      TEXT NOT NULL,          -- @Short, one sentence, references as plain text
    ambiguous    INTEGER NOT NULL        -- 1: the name may mean the people or their ancestor (ANCESTOR_PEOPLES)
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
CREATE TABLE chapter_summaries (
    book          INTEGER NOT NULL,
    chapter       INTEGER NOT NULL,
    original      TEXT NOT NULL,        -- as printed in 1611 ("loue", "Iohn")
    modern        TEXT NOT NULL,        -- spelling and possessives' apostrophes by 1611-spelling.tsv, nothing else
    borrowed_from INTEGER,              -- Proverbs 11-24: 10, whose note covers them; else NULL
    PRIMARY KEY (book, chapter)
) WITHOUT ROWID;
CREATE TABLE summary_glosses (
    phrase   TEXT PRIMARY KEY,          -- lower case, modern spelling: "humane", "no let"
    meaning  TEXT NOT NULL,
    example  TEXT NOT NULL,             -- a chapter it's used in
    reviewed TEXT NOT NULL              -- who checked it and when; '' while a draft
);
CREATE TABLE context_meta (key TEXT PRIMARY KEY, value TEXT);
"""


def meta_rows():
    """Sources and licences, and deliberately no build date."""
    return sorted([
        ('kjv1611_commit', KJV1611_COMMIT),
        ('sha256:KJV_1611 chapter files', KJV1611_SHA256),
        ('kjv1611_source', 'Chapter summaries from the 1611 King James Bible, transcribed by Lou Burnard '
                           '(github.com/lb42/KJV_1611) from www.kingjamesbibleonline.org. Public domain text; '
                           'the repository states no licence.'),
        ('stepbible_commit', STEPBIBLE_COMMIT),
        (f'sha256:{TIPNR_PATH}', TIPNR_SHA256),
        ('source', 'TIPNR, STEPBible.org (github.com/STEPBible/STEPBible-Data)'),
        ('licence', 'CC BY 4.0. Data created by www.STEPBible.org based on work at Tyndale House Cambridge.'),
    ])


def write_database(path, name_rows, chapter_rows, summary_rows, gloss_rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    con = sqlite3.connect(path)
    con.execute('PRAGMA page_size = 4096')
    con.execute('PRAGMA journal_mode = DELETE')
    con.executescript(SCHEMA)
    con.executemany('INSERT INTO context_names VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', name_rows)
    con.executemany('INSERT INTO chapter_names VALUES (?, ?, ?, ?, ?, ?)', chapter_rows)
    con.executemany('INSERT INTO chapter_summaries VALUES (?, ?, ?, ?, ?)', summary_rows)
    con.executemany('INSERT INTO summary_glosses VALUES (?, ?, ?, ?)', gloss_rows)
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
    abihu = con.execute("SELECT summary FROM context_names WHERE unique_name = 'Abihu@Exo.6.23-1Ch'").fetchone()[0]
    aaron = con.execute("SELECT brief FROM context_names WHERE unique_name = 'Aaron@Exo.4.14-Heb'").fetchone()[0]
    without = con.execute("SELECT COUNT(*) FROM context_names WHERE summary = '' AND unique_name NOT LIKE '%#group'").fetchone()[0]
    ambiguous = [row[0] for row in con.execute("SELECT name FROM context_names WHERE ambiguous = 1 ORDER BY name")]
    jew = con.execute("""SELECT n.ambiguous, n.description FROM chapter_names c JOIN context_names n ON n.id = c.name_id
                         WHERE c.book = 43 AND c.chapter = 3 AND c.shown_as = 'Jew'""").fetchone()
    numbers_26_peoples = con.execute("""SELECT COUNT(*) FROM chapter_names c JOIN context_names n ON n.id = c.name_id
                                         WHERE c.book = 4 AND c.chapter = 26 AND n.kind = 'group'""").fetchone()[0]
    genesis_32 = chapter(1, 32)
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
        (f"Aaron's @Brief ({aaron!r})", aaron == "Moses' brother, first high priest of Israel"),
        (f"Abihu's @Short with its reference as text ({abihu!r})", abihu.endswith('(Exodus 6:23)')),
        (f'every record has an @Short; gentilics have none of their own ({without} without)', without == 0),
        (f'{len(ambiguous)} ancestor peoples marked ambiguous', len(ambiguous) == 17 and 'Israel' in ambiguous and 'Judah' in ambiguous),
        ('Genesis 12: the Canaanite at 12:6 and the Egyptians at 12:12 are peoples',
         has(genesis_12, 'Canaanite', 'group', 6) and has(genesis_12, 'Egyptian', 'group', 12)),
        ('John 3: the Jews at 3:1 and Israel at 3:10 are peoples, not people',
         has(john_3, 'Jew', 'group', 1) and has(john_3, 'Israel', 'group', 10) and not any(row[1] == 'person' and row[0] == 'Israel' for row in john_3)),
        (f'John 3: "Jew" is a plain people, not marked ambiguous ({jew})', jew == (0, 'Descendants of Judah')),
        ('Genesis 32: Jacob is under Peoples too, as the data can\'t tell', has(genesis_32, 'Jacob', 'group', 1)),
        (f'Numbers 26: the clans are peoples ({numbers_26_peoples})', numbers_26_peoples > 40),
    ], {'Genesis 12': genesis_12, 'John 3': john_3, 'Psalm 3': psalm_3}


def build(raw_dir, output, ship):
    heading('Source')
    source = fetch_and_verify_source(raw_dir)
    report_upstream_position()

    names_by_id = book_names()
    counts_by_chapter = verse_counts()
    chapter_counts = collections.Counter(book for book, _chapter in counts_by_chapter)
    chapter_files = kjv1611_file_names(names_by_id, chapter_counts)
    kjv1611 = fetch_and_verify_kjv1611(raw_dir, chapter_files)

    problems = []
    slips = collections.Counter()
    name_rows, chapter_rows, counts = build_rows(read_records(source), kjv_verses(), names_by_id, slips)
    summary_rows = read_summaries(kjv1611, chapter_files, {name: book for book, name in names_by_id.items()},
                                  counts_by_chapter, read_spelling_list(), problems)
    gloss_rows = read_glosses(summary_rows, problems)
    write_database(output, name_rows, chapter_rows, summary_rows, gloss_rows)

    heading('Counts')
    for label, value in sorted(counts.items()):
        print(f'  {label}: {value}')
    print(f'  chapter rows: {len(chapter_rows)}')
    chapters_covered = len({(row[0], row[1]) for row in chapter_rows})
    print(f'  chapters with at least one person or place: {chapters_covered} of 1189')
    kinds = collections.Counter(row[3] for row in name_rows)
    measured = {'people': kinds['person'], 'peoples': kinds['group'], 'places': kinds['place'],
                'chapter rows': len(chapter_rows)}
    for label, expected in EXPECTED_COUNTS.items():
        passed = measured[label] == expected
        print(f'{"ok  " if passed else "FAR "} {label}: {measured[label]} (expected exactly {expected})')
        if not passed:
            problems.append(f'{label}: {measured[label]}, expected {expected}')

    heading('1611 summaries')
    borrowed = sum(1 for row in summary_rows if row[4] is not None)
    print(f'  {len(summary_rows)} chapters: {len(summary_rows) - borrowed} with their own summary, '
          f'{borrowed} with Proverbs 10\'s note; {len(gloss_rows)} glosses')
    if (len(summary_rows), borrowed) != (1189, 14):
        problems.append(f'summaries: {len(summary_rows)} chapters, {borrowed} borrowed; expected 1189 and 14')
    for book, chapter in ((43, 3), (19, 23), (20, 15)):
        row = next(row for row in summary_rows if row[:2] == (book, chapter))
        print(f'  {names_by_id[book]} {chapter}: {row[3]}')
    expected = {(19, 23): 'David’s confidence in God’s grace.',
                (1, 19): 'Lot’s wife is a pillar of salt',
                (17, 3): 'He casteth Lots.',
                (43, 21): 'his Lambs and sheep'}
    for (book, chapter), wanted in expected.items():
        modern = next(row[3] for row in summary_rows if row[:2] == (book, chapter))
        ok = wanted in modern
        print(f'{"ok  " if ok else "FAIL"} {names_by_id[book]} {chapter}: "{wanted}"')
        if not ok:
            problems.append(f'{names_by_id[book]} {chapter}: "{wanted}" not in "{modern}"')

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
EXPECTED_SLIPS = {'Num.13.8,16': 1, 'comma between references': 1}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build data/context.db from STEPBible TIPNR.')
    parser.add_argument('--raw-dir', type=Path, default=RAW_DIR,
                        help=f'directory for the downloaded source file (default: {RAW_DIR})')
    parser.add_argument('--output', type=Path, default=OUTPUT_DB,
                        help=f'build artifact path (default: {OUTPUT_DB})')
    parser.add_argument('--ship', action='store_true', help=f'copy the finished build to {SHIPPED_DB}')
    args = parser.parse_args()
    build(raw_dir=args.raw_dir.resolve(), output=args.output.resolve(), ship=args.ship)
