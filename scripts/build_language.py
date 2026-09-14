#!/usr/bin/env python3
"""
build_language.py — Build data/language.db from STEPBible-Data (TAHOT/TAGNT/TBESG).

Usage (run from project root):
    python3 scripts/build_language.py

Reads raw STEPBible-Data source files from data/stepbible-prep/raw/ (gitignored,
re-downloadable — see data/stepbible-prep/raw/README or Build_6_Spec.md Item 1
for the exact source URLs) and writes:
    data/stepbible-prep/output/language.db   (build artifact)
    data/language.db                          (shipped copy, served by the app)

Source files expected in data/stepbible-prep/raw/:
    TAHOT_Gen-Deu.txt, TAHOT_Jos-Est.txt, TAHOT_Job-Sng.txt, TAHOT_Isa-Mal.txt
    TAGNT_Mat-Jhn.txt, TAGNT_Act-Rev.txt
    TBESG.txt
    TEGMC.txt

All column layouts below were verified directly against the real downloaded
files (see Build_6_Spec.md's implementation notes), not assumed from
STEPBible's prose field descriptions, which describe fields in a different
order than the actual tab-separated columns.

TAHOT data row — 17 tab-separated columns, only some used:
  [0]  Ref: Book.Chapter.Verse(HebChapter.HebVerse)#NN=TextType
  [1]  Hebrew (with pointing)
  [2]  Transliteration
  [3]  English — contextual gloss for this occurrence
  [4]  dStrongs — e.g. "H9003/{H7225G}"; root Strong's is inside {}; a
       trailing "+" on the whole field means this word's root continues
       onto the next word (compound split across printed words)
  [5]  Grammar (morphology code)
  [6]  Meaning variant — unused
  [7]  Spelling variant — unused
  [8]  sStrong+Instance — unused
  [9]  Alt Strongs — unused
  [10] Conjoin word — unused (STEPBible marks this "not yet implemented")
  [11] Expanded Strong tags — "{dStrong=HebrewForm=Gloss[»SubMeaning]}",
       used to derive gloss_dictionary
  [12-16] unused

TAGNT data row — 17 tab-separated columns, only some used:
  [0]  Ref: Book.Chapter.Verse[BracketChapter.Verse]#NN=Editions — the
       bracketed chapter.verse, when present, is the actual KJV verse;
       the primary (pre-bracket) number is NRSV-based and must NOT be used
       when a bracket is present (verified at Php.1.16[1.17]/Php.1.17[1.16])
  [1]  Greek: "word (transliteration)"
  [2]  English — contextual gloss for this occurrence
  [3]  dStrong=Morph — e.g. "G3588=T-NSM"
  [4]  Dictionary form & gloss — "lemma=gloss1/gloss2/..."
  [5]  Editions — unused
  [6]  Variants — unused
  [7]  unused
  [8]  Spanish — unused
  [9]  Sub-meaning — unused (not part of Ember's 2-gloss schema)
  [10] Word position + conjoin — "#NN", or "#NN»MM:GXXXX" (conjoined
       forward to word MM), or "#NN«MM:GXXXX" (conjoined backward to word
       MM — real data uses both directions; STEPBible's docs only mention
       the forward marker)
  [11] sStrong+Instance — unused
  [12] Alt Strongs — unused
  [13-16] unused

TBESG — 8 tab-separated columns, all used:
  eStrong / dStrong / uStrong / Greek / Transliteration / Morph / Gloss / Meaning

TEGMC — not tabular. The file has two sections: "BRIEF LEXICAL MORPHOLOGY
CODES" (uses "G:"/"A:"-language-prefixed codes, e.g. "G:N-F" — does NOT match
original_words.morph_code's format, NOT ingested) and "FULL MORPHOLOGY CODES"
(the one used — codes like "V-PAP-NSM" match original_words.morph_code
exactly). Full-section records are 4 physical lines delimited by lines
containing only "$": (1) "CODE\\tKey=Value; Key=Value; ..." — the only line
persisted; (2) a plain-English summary phrase; (3) a description sentence;
(4) an example sentence. Lines 2-4 are intentionally not parsed/persisted —
see parse_tegmc_file's docstring.
"""

import os
import re
import sqlite3
import shutil
import sys
from pathlib import Path

# ── Project paths ─────────────────────────────────────────────────────────────

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
RAW_DIR      = PROJECT_ROOT / "data" / "stepbible-prep" / "raw"
OUTPUT_DIR   = PROJECT_ROOT / "data" / "stepbible-prep" / "output"
OUTPUT_DB    = OUTPUT_DIR / "language.db"
SHIPPED_DB   = PROJECT_ROOT / "data" / "language.db"

TAHOT_FILES = ["TAHOT_Gen-Deu.txt", "TAHOT_Jos-Est.txt", "TAHOT_Job-Sng.txt", "TAHOT_Isa-Mal.txt"]
TAGNT_FILES = ["TAGNT_Mat-Jhn.txt", "TAGNT_Act-Rev.txt"]
TBESG_FILE  = "TBESG.txt"
TEGMC_FILE  = "TEGMC.txt"

# ── Book code map ────────────────────────────────────────────────────────────
# STEPBible's abbreviations, in the exact order they appear across the 6
# TAHOT/TAGNT files (verified directly, not assumed) — this order matches
# Ember's own books table id order (1=Genesis..66=Revelation) exactly, even
# though several individual abbreviation spellings differ from Ember's own
# (e.g. STEPBible's "Nam" for Nahum vs Ember's "Nah"; "Jhn" vs Ember's "Joh").
# A position-based zip is therefore correct and safer than string-matching
# abbreviations against Ember's books table.

STEPBIBLE_BOOK_ORDER = [
    "Gen", "Exo", "Lev", "Num", "Deu",
    "Jos", "Jdg", "Rut", "1Sa", "2Sa", "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Neh", "Est",
    "Job", "Psa", "Pro", "Ecc", "Sng",
    "Isa", "Jer", "Lam", "Ezk", "Dan", "Hos", "Jol", "Amo", "Oba", "Jon", "Mic", "Nam",
    "Hab", "Zep", "Hag", "Zec", "Mal",
    "Mat", "Mrk", "Luk", "Jhn",
    "Act", "Rom", "1Co", "2Co", "Gal", "Eph", "Php", "Col", "1Th", "2Th", "1Ti", "2Ti",
    "Tit", "Phm", "Heb", "Jas", "1Pe", "2Pe", "1Jn", "2Jn", "3Jn", "Jud", "Rev",
]
BOOK_ID = {abbrev: i + 1 for i, abbrev in enumerate(STEPBIBLE_BOOK_ORDER)}
assert len(BOOK_ID) == 66, f"expected 66 books, got {len(BOOK_ID)}"


def verse_id(book_abbrev, chapter, verse):
    return BOOK_ID[book_abbrev] * 1_000_000 + chapter * 1_000 + verse


# ── TAHOT parsing ────────────────────────────────────────────────────────────

TAHOT_REF_RE = re.compile(
    r'^([A-Za-z1-3]+)\.(\d+)\.(\d+)(?:\(\d+\.\d+\))?#(\d+)=.+$'
)
ROOT_STRONGS_RE = re.compile(r'\{([HG]\d+[A-Za-z]?)\}')
GROUP_CONTINUES_RE = re.compile(r'\}\+')
# Col 12's root segment is "{dStrong=HebrewForm=Gloss[»SubMeaning]}" — HebrewForm
# (captured separately below) is the word's dictionary/root form, distinct from
# surface_text's inflected, pointed, prefix/suffix-attached printed form. Not in
# Build_6_Spec.md's literal schema (which has no `lemma` column) — added because
# Item 4 requires a Lemma field and this data is already being parsed for
# gloss_dictionary; skipping it would leave Hebrew's Lemma field with nothing to
# show. Symmetric with Greek, whose lemma comes from TAGNT col 5's own lemma=gloss
# split, already computed in parse_tagnt_file below.
EXPANDED_TAG_RE = re.compile(r'\{[HG]\d+[A-Za-z]?=([^=]*)=([^{}]*)\}')


def parse_tahot_lemma_and_gloss(expanded_field):
    m = EXPANDED_TAG_RE.search(expanded_field)
    if not m:
        return None, None
    lemma = m.group(1).strip() or None
    gloss = m.group(2).split('»', 1)[0]  # '»' — split off sub-meaning
    gloss = gloss.strip()
    if gloss.startswith(':'):
        gloss = gloss[1:].strip()
    return lemma, (gloss or None)


def parse_tahot_file(path):
    """Yields dicts, one per word row, in file order (== verse/word order).

    A handful of target verses (14, matching TAHOT's own documented list —
    "English verses occasionally start a verse on a different word", e.g.
    Num.26.1, 1Ki.18.33, and 4 Psalm titles) receive words from more than one
    independent source group, each restarting its own #01 numbering (an "X"
    LXX-restored clause plus the normal text, sharing one target verse).
    word_position is therefore a running counter over final target-verse row
    order, not word_pos-1 directly, and the '+' group-chain never carries
    across a #01 boundary even when the target verse hasn't changed.
    """
    with open(path, encoding='utf-8') as f:
        pending_group = None
        prev_verse_key = None
        running_pos = 0
        for line in f:
            cols = line.rstrip('\n').split('\t')
            if len(cols) < 12:
                continue
            m = TAHOT_REF_RE.match(cols[0])
            if not m:
                continue

            book, chapter, verse, word_pos = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
            if book not in BOOK_ID:
                continue

            # A rare Ketiv-only "ghost" word (Text type "Q(K)" — the Qere reading
            # STEPBible follows by default has nothing here; only the Ketiv,
            # unfollowed variant, has a word) has empty Hebrew/English fields and
            # gloss_contextual "[ ]". 14 occurrences total across the OT — not a
            # real word to render, so skip rather than import a blank row.
            if not cols[1].strip():
                continue

            verse_key = (book, chapter, verse)
            if verse_key != prev_verse_key:
                pending_group = None
                running_pos = 0
                prev_verse_key = verse_key
            elif word_pos == 1:
                pending_group = None

            raw_dstrongs = cols[4]
            # The '+' continuation marker sits immediately after the root tag's
            # closing '}' — it is NOT always the field's last character, since a
            # trailing punctuation-linkage segment (e.g. "{H8423}+\H9014") can
            # follow it (verified at Gen.4.22's second "Tubal-cain" occurrence).
            ends_plus = bool(GROUP_CONTINUES_RE.search(raw_dstrongs))

            if pending_group is not None:
                group_id = pending_group
                pending_group = group_id if ends_plus else None
            elif ends_plus:
                group_id = _next_group_id()
                pending_group = group_id
            else:
                group_id = None

            strongs_m = ROOT_STRONGS_RE.search(raw_dstrongs)
            lemma, gloss_dictionary = parse_tahot_lemma_and_gloss(cols[11])

            yield {
                'verse_id':          verse_id(book, chapter, verse),
                'word_position':     running_pos,
                'language':          'hebrew',
                'surface_text':      cols[1],
                'transliteration':   cols[2] or None,
                'lemma':             lemma,
                'gloss_contextual':  cols[3] or None,
                'gloss_dictionary':  gloss_dictionary,
                'strongs_number':    strongs_m.group(1) if strongs_m else None,
                'morph_code':        cols[5] or None,
                'group_id':          group_id,
            }
            running_pos += 1


# ── TAGNT parsing ────────────────────────────────────────────────────────────


# Reference format is Book.Chapter.Verse, optionally followed by a versification
# difference marker: [KJV.Verse] when this word's KJV placement differs from the
# primary (NRSV-based) reference — this is the one that matters for Ember and
# must override the primary number (verified at Php.1.16[1.17]/1.17[1.16]).
# (NA.Verse) and {Other.Verse} mark differences against the NA/other traditions
# instead — irrelevant to Ember's KJV-based versification, so they're matched
# (to avoid dropping the row) but ignored, same as having no marker at all.
TAGNT_REF_RE = re.compile(
    r'^([A-Za-z1-3]+)\.(\d+)\.(\d+)'
    r'(?:\[(\d+)\.(\d+)\])?(?:\(\d+\.\d+\))?(?:\{\d+\.\d+\})?'
    r'#(\d+)=.+$'
)
GREEK_WORD_RE = re.compile(r'^(.*?)\s*\(([^()]*)\)\s*$')
WORDPOS_RE = re.compile(r'^#(\d+)(?:([»«])(\d+))?(?::\S+)?$')


class UnionFind:
    def __init__(self):
        self.parent = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def parse_tagnt_file(path):
    """Yields dicts, one per word row. Buffers one verse at a time to resolve
    bidirectional (»/«) conjoin grouping before yielding."""
    with open(path, encoding='utf-8') as f:
        verse_buffer = []
        prev_verse_key = None

        def flush():
            yield from _emit_tagnt_verse(verse_buffer)

        for line in f:
            cols = line.rstrip('\n').split('\t')
            if len(cols) < 11:
                continue
            m = TAGNT_REF_RE.match(cols[0])
            if not m:
                continue

            book = m.group(1)
            if book not in BOOK_ID:
                continue
            primary_ch, primary_vs = int(m.group(2)), int(m.group(3))
            bracket_ch, bracket_vs = m.group(4), m.group(5)
            chapter, verse = (int(bracket_ch), int(bracket_vs)) if bracket_ch else (primary_ch, primary_vs)
            word_pos = int(m.group(6))

            verse_key = (book, chapter, verse)
            if verse_key != prev_verse_key and verse_buffer:
                yield from _emit_tagnt_verse(verse_buffer)
                verse_buffer = []
            prev_verse_key = verse_key

            greek_m = GREEK_WORD_RE.match(cols[1])
            surface_text, translit = (greek_m.group(1), greek_m.group(2)) if greek_m else (cols[1], None)

            strongs_number, morph_code = (cols[3].split('=', 1) + [None])[:2] if '=' in cols[3] else (cols[3] or None, None)
            lemma, gloss_dictionary = (cols[4].split('=', 1) + [None])[:2] if '=' in cols[4] else (cols[4] or None, None)

            wp_m = WORDPOS_RE.match(cols[10])
            link_dir, link_pos = (wp_m.group(2), int(wp_m.group(3))) if wp_m and wp_m.group(2) else (None, None)

            # A handful of verses (34, matching STEPBible's own documented KJV/NA
            # boundary-difference list) receive words from more than one distinct
            # source reference — e.g. Rev.12.18[13.1] and Rev.13.1 both target KJV
            # 13:1, each restarting its own #01 numbering. source_key scopes the
            # »/« conjoin union-find to one source reference at a time, so two
            # unrelated source refs that both happen to use "#01"/"#02" etc. never
            # get falsely unioned into one group. word_position is NOT the source
            # file's own #NN — it's reassigned as a running index over the final
            # per-target-verse row order in _emit_tagnt_verse, below.
            source_key = (book, primary_ch, primary_vs)

            verse_buffer.append({
                'verse_id':         verse_id(book, chapter, verse),
                'language':         'greek',
                'surface_text':     surface_text,
                'transliteration':  translit,
                'lemma':            lemma,
                'gloss_contextual': cols[2] or None,
                'gloss_dictionary': gloss_dictionary,
                'strongs_number':   strongs_number,
                'morph_code':       morph_code,
                '_uf_key':          (source_key, word_pos),
                '_link_uf_key':     (source_key, link_pos) if link_pos is not None else None,
            })

        if verse_buffer:
            yield from _emit_tagnt_verse(verse_buffer)


def _emit_tagnt_verse(rows):
    uf = UnionFind()
    for row in rows:
        if row['_link_uf_key'] is not None:
            uf.union(row['_uf_key'], row['_link_uf_key'])

    set_sizes = {}
    for row in rows:
        root = uf.find(row['_uf_key'])
        set_sizes[root] = set_sizes.get(root, 0) + 1

    root_to_group = {}
    for i, row in enumerate(rows):
        root = uf.find(row['_uf_key'])
        if set_sizes[root] < 2:
            row['group_id'] = None
        else:
            if root not in root_to_group:
                root_to_group[root] = _next_group_id()
            row['group_id'] = root_to_group[root]
        row['word_position'] = i
        del row['_uf_key']
        del row['_link_uf_key']
        yield row


# ── Global group_id counter (shared across TAHOT + TAGNT so ids never collide) ──

_group_id_counter = [0]


def _next_group_id():
    _group_id_counter[0] += 1
    return _group_id_counter[0]


# ── TBESG parsing ────────────────────────────────────────────────────────────

TBESG_DSTRONG_RE = re.compile(r'^(G\d+[A-Za-z]?)')


def parse_tbesg_file(path):
    """Keys on dStrong (col 2), not eStrong (col 1) — original_words.strongs_number
    for Greek is TAGNT's own disambiguated dStrong form (e.g. "G0040G"/"G0040H" are
    two distinct lexicon senses under one base eStrong "G0040"); keying on eStrong
    would collapse distinct entries onto one row (verified: 11,035 dStrong rows vs
    only 10,847 distinct eStrong values — 109 eStrong codes cover >1 real entry,
    up to 9x for common names like Simon/G4613)."""
    with open(path, encoding='utf-8') as f:
        for line in f:
            cols = line.rstrip('\n').split('\t')
            if len(cols) < 8:
                continue
            d_strong_m = TBESG_DSTRONG_RE.match(cols[1].strip())
            if not d_strong_m:
                continue  # skip header/comment lines
            yield {
                'strongs_number':  d_strong_m.group(1),
                'lemma':           cols[3] or None,
                'transliteration': cols[4] or None,
                'morph':           cols[5] or None,
                'gloss':           cols[6] or None,
                'meaning':         cols[7] or None,
            }


# ── TEGMC parsing ────────────────────────────────────────────────────────────

def normalize_tegmc_value(s):
    # Defensive only: verified the current file's line-1 Key=Value strings (the
    # only line persisted) never contain these — the '‚' (U+201A) comma-lookalike
    # and stray literal '"' quoting only ever occur in lines 2-4 (summary/
    # description/example), which this parser doesn't persist. Kept in case a
    # future re-download introduces either into line 1.
    return s.replace('‚', ',').strip().strip('"').strip()


def parse_tegmc_file(path):
    """Yields dicts, one per (code, category) pair, from the FULL MORPHOLOGY
    CODES section of TEGMC.

    Each 4-line record is separated by a line containing only "$"; only each
    chunk's first non-blank line is read (the "CODE\\tKey=Value; ..." line) —
    lines 2-4 (summary/description/example) are TEGMC's own prose, not a
    mechanical source for Ember's reader-facing phrasing (that mapping is
    authored separately, in js/grammar-decode.js), so they're never parsed.

    Reading only each chunk's first line also makes two known raw-file
    irregularities self-correcting, with no special-casing:
      - The file's preamble (title/license text, the "BRIEF LEXICAL
        MORPHOLOGY CODES" section, and the "FULL MORPHOLOGY CODES" section's
        own header/column-description prose) all fall before the first "$"
        in the file, forming one leading chunk whose first line has no tab
        and no "Key=Value" shape — it fails validation and is skipped, and
        it is the ONLY chunk that does (verified: exactly 1,644 codes
        recovered from 1,645 total chunks).
      - "V-PMO-1S" is missing its closing "$" in the raw file and is
        immediately followed by a corrupted, non-tabular "V-PMO-3P" block
        (a spreadsheet-export artifact leaking through, repeating the code
        across mismatched columns). Both sit in one chunk together; since
        that chunk's first line is V-PMO-1S's own well-formed line,
        V-PMO-1S decodes correctly and the garbled V-PMO-3P lines are never
        inspected. V-PMO-3P is therefore correctly absent from the output —
        confirmed unused by any current Greek morph_code, so this has no
        effect on decode coverage.
      - The file's true final record, "X-NSN", has no trailing "$" at all —
        it runs straight into a short trailing appendix of KJV/Robinson-
        apparatus-specific codes (out of scope, not ingested) with no
        delimiter. Treating the text after the last "$" as one final chunk
        recovers X-NSN the same way, and the appendix (never a chunk's
        first line) is correctly never inspected.
    """
    with open(path, encoding='utf-8-sig') as f:
        text = f.read()

    chunks = text.split('\n$\n')
    for chunk in chunks:
        first_line = next((line for line in chunk.split('\n') if line.strip()), None)
        if not first_line or '\t' not in first_line:
            continue
        code, kv_string = first_line.split('\t', 1)
        code = code.strip()
        pairs = []
        for part in kv_string.split(';'):
            part = part.strip()
            if '=' not in part:
                pairs = []
                break
            category, raw_value = part.split('=', 1)
            pairs.append((category.strip(), normalize_tegmc_value(raw_value)))
        if not code or not pairs:
            continue
        for i, (category, raw_value) in enumerate(pairs, start=1):
            yield {
                'code':       code,
                'category':   category,
                'raw_value':  raw_value,
                'sort_order': i,
            }


# ── Schema + build ───────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE original_words (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id            INTEGER NOT NULL,
    word_position       INTEGER NOT NULL,
    language            TEXT NOT NULL,
    surface_text        TEXT NOT NULL,
    transliteration     TEXT,
    lemma               TEXT,
    gloss_contextual    TEXT,
    gloss_dictionary    TEXT,
    strongs_number      TEXT,
    morph_code          TEXT,
    group_id            INTEGER
);
CREATE INDEX idx_original_words_verse ON original_words(verse_id);
CREATE INDEX idx_original_words_strongs ON original_words(strongs_number);

CREATE TABLE step_lexicon_greek (
    strongs_number  TEXT PRIMARY KEY,
    lemma           TEXT,
    transliteration TEXT,
    morph           TEXT,
    gloss           TEXT,
    meaning         TEXT
);

-- One row per (code, category) pair from TEGMC's "Full Morphology Codes"
-- section, e.g. ('A-APF-C', 'Extra', 'Comparative'). No UNIQUE(code, category)
-- constraint — two real codes legitimately repeat a category key within one
-- record ("N-NSN-L" has two distinct "Name type" values; "PRT-N" has two
-- identical "Extra" values). raw_value can legitimately be the empty string
-- (e.g. "N-OI"/"N-PRI" carry "Indeclinable=" with nothing after "=" — the
-- key's presence alone is the signal) and must never be coerced to NULL.
CREATE TABLE step_morphology_greek (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL,
    category    TEXT NOT NULL,
    raw_value   TEXT NOT NULL,
    sort_order  INTEGER NOT NULL
);
CREATE INDEX idx_step_morphology_greek_code ON step_morphology_greek(code);
"""


def build():
    for name in TAHOT_FILES + TAGNT_FILES + [TBESG_FILE, TEGMC_FILE]:
        if not (RAW_DIR / name).exists():
            sys.exit(f"Missing source file: {RAW_DIR / name}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUTPUT_DB.exists():
        OUTPUT_DB.unlink()

    con = sqlite3.connect(OUTPUT_DB)
    cur = con.cursor()
    cur.executescript(SCHEMA)

    word_cols = ['verse_id', 'word_position', 'language', 'surface_text',
                 'transliteration', 'lemma', 'gloss_contextual', 'gloss_dictionary',
                 'strongs_number', 'morph_code', 'group_id']
    insert_word = f"INSERT INTO original_words ({','.join(word_cols)}) VALUES ({','.join('?' * len(word_cols))})"

    total_words = 0
    batch = []
    BATCH_SIZE = 5000

    def flush_batch():
        nonlocal batch
        if batch:
            cur.executemany(insert_word, batch)
            batch = []

    for name in TAHOT_FILES:
        print(f"Parsing {name} ...")
        n = 0
        for row in parse_tahot_file(RAW_DIR / name):
            batch.append(tuple(row[c] for c in word_cols))
            n += 1
            if len(batch) >= BATCH_SIZE:
                flush_batch()
        flush_batch()
        print(f"  {n} words")
        total_words += n

    for name in TAGNT_FILES:
        print(f"Parsing {name} ...")
        n = 0
        for row in parse_tagnt_file(RAW_DIR / name):
            batch.append(tuple(row[c] for c in word_cols))
            n += 1
            if len(batch) >= BATCH_SIZE:
                flush_batch()
        flush_batch()
        print(f"  {n} words")
        total_words += n

    print(f"Total original_words rows: {total_words}")

    print(f"Parsing {TBESG_FILE} ...")
    lex_cols = ['strongs_number', 'lemma', 'transliteration', 'morph', 'gloss', 'meaning']
    insert_lex = f"INSERT OR REPLACE INTO step_lexicon_greek ({','.join(lex_cols)}) VALUES ({','.join('?' * len(lex_cols))})"
    lex_rows = [tuple(r[c] for c in lex_cols) for r in parse_tbesg_file(RAW_DIR / TBESG_FILE)]
    cur.executemany(insert_lex, lex_rows)
    print(f"  {len(lex_rows)} lexicon entries")

    print(f"Parsing {TEGMC_FILE} ...")
    morph_cols = ['code', 'category', 'raw_value', 'sort_order']
    insert_morph = f"INSERT INTO step_morphology_greek ({','.join(morph_cols)}) VALUES ({','.join('?' * len(morph_cols))})"
    morph_rows = [tuple(r[c] for c in morph_cols) for r in parse_tegmc_file(RAW_DIR / TEGMC_FILE)]
    cur.executemany(insert_morph, morph_rows)
    tegmc_codes = {row[0] for row in morph_rows}
    print(f"  {len(morph_rows)} category rows across {len(tegmc_codes)} codes")
    # 1,644 confirmed at STEPBible-Data commit faf6a35 (2026-03-27); a future
    # re-download changing this count slightly is expected upstream drift, not
    # necessarily a bug — floor-check only, don't hard-fail the build on an
    # exact count.
    if len(tegmc_codes) < 1600:
        print(f"WARNING: expected ~1,644 TEGMC codes, got {len(tegmc_codes)} — check raw file for format changes")

    # Mechanizes the coverage claim behind the grammar-decode feature
    # (docs/Grammar_Decode_Spec_DRAFT.md): every Greek morph_code, once split on
    # " + " and any "G<digits>=" Strong's-number prefix stripped from each
    # piece, should resolve against a TEGMC code. Printed diagnostic, not a
    # hard failure — a genuine gap here doesn't break anything already built,
    # it just means that one piece won't have a decoded breakdown at runtime.
    cur.execute(
        "SELECT DISTINCT morph_code FROM original_words "
        "WHERE language = 'greek' AND morph_code IS NOT NULL"
    )
    strongs_prefix_re = re.compile(r'^G\d+=(.+)$')
    misses = set()
    for (morph_code,) in cur.fetchall():
        for piece in morph_code.split(' + '):
            piece = piece.strip()
            m = strongs_prefix_re.match(piece)
            base_code = m.group(1) if m else piece
            if base_code not in tegmc_codes:
                misses.add(base_code)
    if misses:
        print(f"WARNING: {len(misses)} distinct Greek morph_code piece(s) have no TEGMC entry: {sorted(misses)[:20]}")
    else:
        print("TEGMC coverage: 100% of distinct Greek morph_code pieces resolved")

    # A group_id must have >=2 members to mean anything ("shared ID across rows
    # that form one display unit" — Build_6_Spec.md Item 2). A '+'/conjoin marker
    # can open a chain that never gets a partner to close onto — e.g. a single
    # row encoding an internal Ketiv/Qere variant with a doubled {H...}+ pattern
    # (verified at Num.7.59 "Pedah-zur") rather than a split across two printed
    # words. Cheaper to catch any such orphan here than to special-case every
    # possible cause of one at parse time.
    cur.execute("""
        UPDATE original_words SET group_id = NULL WHERE group_id IN (
            SELECT group_id FROM original_words
            GROUP BY group_id HAVING COUNT(*) < 2
        )
    """)
    orphaned = cur.rowcount
    if orphaned:
        print(f"Cleared {orphaned} orphaned single-member group_id(s)")

    con.commit()
    con.execute("VACUUM")
    con.close()

    shutil.copyfile(OUTPUT_DB, SHIPPED_DB)

    size_mb = OUTPUT_DB.stat().st_size / (1024 * 1024)
    print(f"\nBuilt {OUTPUT_DB} ({size_mb:.1f} MB)")
    print(f"Copied to {SHIPPED_DB}")


if __name__ == '__main__':
    build()
