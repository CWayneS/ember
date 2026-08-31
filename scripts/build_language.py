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
"""


def build():
    for name in TAHOT_FILES + TAGNT_FILES + [TBESG_FILE]:
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
