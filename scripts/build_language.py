#!/usr/bin/env python3
"""
build_language.py — Build data/language.db from STEPBible-Data (TAHOT/TAGNT/TBESG/TEGMC/TEHMC).

Usage (run from project root):
    python3 scripts/build_language.py [--raw-dir DIR] [--output PATH] [--ship]

Reads raw STEPBible-Data source files from data/stepbible-prep/raw/ (gitignored,
re-downloadable — see data/stepbible-prep/raw/README or Build_6_Spec.md Item 1
for the exact source URLs), or from --raw-dir, and writes:
    data/stepbible-prep/output/language.db   (build artifact; --output overrides)
    data/language.db                          (shipped copy, served by the app —
                                               written only with --ship)

The shipped copy is tracked in git, so a build no longer overwrites it unless
asked: build, check the output, then rebuild with --ship. Each source file's
sha256 is printed at the start of the run.

Source files expected in the raw directory:
    TAHOT_Gen-Deu.txt, TAHOT_Jos-Est.txt, TAHOT_Job-Sng.txt, TAHOT_Isa-Mal.txt
    TAGNT_Mat-Jhn.txt, TAGNT_Act-Rev.txt
    TBESG.txt
    TEGMC.txt, TEHMC.txt

The shipped language.db was built from STEPBible-Data commit
be4191f0082aeedddb0eff0c02c966292b2bd641 (2026-10-24), fetched with
scripts/analysis/hebrew_anatomy/fetch_sources.sh into
data/stepbible-prep/raw/be4191f/ (pass it with --raw-dir). sha256:
    e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b  TAHOT_Gen-Deu.txt
    195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775  TAHOT_Jos-Est.txt
    bb508af3af07822fca84cc43a0eba79eb70eecf672aabc0245b8d8cecf329d96  TAHOT_Job-Sng.txt
    f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5  TAHOT_Isa-Mal.txt
    ab8eaaeb68e17a1dcfa34e1e9350358f22f03bc2a97244d848750ad81044bc8e  TAGNT_Mat-Jhn.txt
    524e32375361e6d3fa2f7ef00b87605fdc4317a762f395651a05fdc31ad031b7  TAGNT_Act-Rev.txt
    312f723d7b8ef263bbdfb0451c9b8057125804dfff390b6f8544cff2a84b57f4  TBESG.txt
    5f0416f7617019a6082285214903bde569a980d5fd3b88b8d7020d944e94de82  TEGMC.txt
    78779bea824b31d4467dec0161d547481c86f266bc39def12cd11dc7dcbe6da7  TEHMC.txt
(The previous build, commit faf6a35, differs only in TAHOT Job-Sng: four Psalm
rows, see docs/HEBREW_ANATOMY_DATA_REPORT.md D1.)

Tables written:
    original_words           one row per Hebrew/Greek printed word
    step_lexicon_greek       TBESG
    step_morphology_greek    TEGMC full morphology codes
    step_morphology_hebrew   TEHMC full morphology codes
    original_word_pieces     per-piece Strong's numbers of multi-piece Hebrew words
    hebrew_affixes           prefix/suffix Strong's numbers with col-12 form and gloss
    original_word_variants   Hebrew text type, TAHOT cols 7/8, parsed Ketiv
The Hebrew Word Anatomy decisions behind the last four (and the gloss rule) are
recorded in docs/HEBREW_ANATOMY_DATA_REPORT.md.

All column layouts below were verified directly against the real downloaded
files (see Build_6_Spec.md's implementation notes), not assumed from
STEPBible's prose field descriptions, which describe fields in a different
order than the actual tab-separated columns.

TAHOT data row — 17 tab-separated columns, only some used:
  [0]  Ref: Book.Chapter.Verse(HebChapter.HebVerse)#NN=TextType (text type
       goes to original_word_variants)
  [1]  Hebrew (with pointing)
  [2]  Transliteration
  [3]  English — contextual gloss for this occurrence
  [4]  dStrongs — e.g. "H9003/{H7225G}"; root Strong's is inside {}; a
       trailing "+" on the whole field means this word's root continues
       onto the next word (compound split across printed words)
  [5]  Grammar (morphology code)
  [6]  Meaning variant — stored raw in original_word_variants; Ketiv for Q(K)
  [7]  Spelling variant — stored raw in original_word_variants; Ketiv for Q(k)
  [8]  sStrong+Instance — unused
  [9]  Alt Strongs — unused
  [10] Conjoin word — unused (STEPBible marks this "not yet implemented")
  [11] Expanded Strong tags — "{dStrong=HebrewForm=GlossSlot}", used to
       derive lemma and gloss_dictionary (see tahot_dictionary_gloss), and
       per-piece forms/glosses for hebrew_affixes and root_glosses
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

TEHMC — the Hebrew/Aramaic counterpart of TEGMC, same 4-line "$" record layout
and the same two sections (only FULL MORPHOLOGY CODES is read). Line 1 nests
derived values in "(hence ...)" groups, so it has its own parser,
parse_tehmc_file, and its own table, step_morphology_hebrew.
"""

import argparse
import hashlib
import os
import re
import sqlite3
import shutil
import sys
from collections import Counter, defaultdict
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
TEHMC_FILE  = "TEHMC.txt"

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
    r'^([A-Za-z1-3]+)\.(\d+)\.(\d+)(?:\(\d+\.\d+\))?#(\d+)=(.+)$'
)
ROOT_STRONGS_RE = re.compile(r'\{([HG]\d+[A-Za-z]?)\}')
GROUP_CONTINUES_RE = re.compile(r'\}\+')
# Col 12's root segment is "{dStrong=HebrewForm=GlossSlot}" — HebrewForm
# (captured separately below) is the word's dictionary/root form, distinct from
# surface_text's inflected, pointed, prefix/suffix-attached printed form. Not in
# Build_6_Spec.md's literal schema (which has no `lemma` column) — added because
# Item 4 requires a Lemma field and this data is already being parsed for
# gloss_dictionary; skipping it would leave Hebrew's Lemma field with nothing to
# show. Symmetric with Greek, whose lemma comes from TAGNT col 5's own lemma=gloss
# split, already computed in parse_tagnt_file below.
EXPANDED_TAG_RE = re.compile(r'\{[HG]\d+[A-Za-z]?=([^=]*)=([^{}]*)\}')

# A few col-12 tags carry an instance number after the Strong's number —
# "H9003#1=ב=in/{H3816#4=לְאֹם=people}" (5 rows at STEPBible-Data be4191f: the
# four Psa 44:14/57:9/108:3/149:7 "V" rows and 1Ch.18.10#09). Dropped before any
# col-12 parsing, so those tags read like every other one.
TAG_INSTANCE_RE = re.compile(r'([HG]\d+[A-Za-z]?)#\d+(?==)')


def normalize_expanded_tags(expanded_field):
    return TAG_INSTANCE_RE.sub(r'\1', expanded_field)


# The gloss slot (text after the tag's 2nd "=") has three shapes:
#   plain           "to create"
#   plain with »    "God»LORD@Gen.1.1-Heb" (name ID), "son»son:9_youngAnimal)"
#                   — the gloss is the text before "»"
#   ":"-form        ": surface»face:4_surface;_land" — for an extended Strong's
#                   number that marks one sense of a word: ": <sense gloss>»<base
#                   word's gloss>:<sense number>_<sense label>"
# The ":"-form becomes "<base>: <sense>" ("face: surface", "land: country;
# planet", "to call: call by") — the form STEP's own Hebrew lexicon (TBESH) gives
# these numbers — or just "<base>" when the sense only restates it ("people:
# people" -> "people", "to see: see" -> "to see"). Every gloss then drops a
# trailing ":<n>_..." sense suffix (only Pro.26.17#04's malformed plain slot
# "to pass:3_bring" has one) and shows "_" as a space. STEP's "[...]"/"(...)"
# annotations are kept as written. Decided in docs/HEBREW_ANATOMY_DATA_REPORT.md
# (D2). The same function produces original_word_pieces.root_glosses.
SENSE_SUFFIX_RE = re.compile(r':\d+_.*$')
GLOSS_ANNOTATION_RE = re.compile(r'\[.*?\]|\(.*?\)')


def _gloss_core(gloss):
    """Comparison key for "does the sense only restate the base?"."""
    text = gloss.replace('_', ' ').replace(';', '/')
    text = re.sub(r'\s*/\s*', '/', text)
    text = re.sub(r'\s+', ' ', text).strip().casefold()
    return re.sub(r'^to ', '', GLOSS_ANNOTATION_RE.sub('', text)).strip()


def tahot_dictionary_gloss(slot):
    slot = slot.strip()
    if slot.startswith(':') and '»' in slot:
        sense_part, base_part = slot[1:].split('»', 1)
        sense = sense_part.strip()
        base = SENSE_SUFFIX_RE.sub('', base_part).strip()
        sense_core, base_core = _gloss_core(sense), _gloss_core(base)
        if sense_core == base_core or sense_core in base_core.split('/'):
            gloss = base
        else:
            gloss = f'{base}: {sense}'
    else:
        gloss = SENSE_SUFFIX_RE.sub('', slot.split('»', 1)[0]).strip()
        if gloss.startswith(':'):
            gloss = gloss[1:].strip()
    return gloss.replace('_', ' ') or None


def parse_tahot_lemma_and_gloss(expanded_field):
    m = EXPANDED_TAG_RE.search(normalize_expanded_tags(expanded_field))
    if not m:
        return None, None
    lemma = m.group(1).strip() or None
    return lemma, tahot_dictionary_gloss(m.group(2))


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
            cols[11] = normalize_expanded_tags(cols[11])
            lemma, gloss_dictionary = parse_tahot_lemma_and_gloss(cols[11])
            pieces, pieces_problem = align_tahot_pieces(cols)

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
                # Not original_words columns — feed original_word_pieces and
                # original_word_variants:
                'reference':         cols[0],
                'text_type':         m.group(5),
                'meaning_variants':  cols[6],
                'spelling_variants': cols[7],
                'pieces':            pieces,
                'pieces_problem':    pieces_problem,
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


# ── TEHMC parsing ────────────────────────────────────────────────────────────

# TEHMC uses TEGMC's 4-line "$"-delimited record layout, but its line 1 nests
# derived parsing inside "(hence ...)" groups —
#   "Stem=Hishtaphel (hence Action=Causative/declarative; Voice=Reflexive/iterative)"
# — so parse_tegmc_file can't read it (it splits inside the group, and drops
# "Hc" outright: that record's trailing ";" leaves an empty pair). A separate
# parser, so the Greek path stays byte-for-byte unchanged.
TEHMC_FULL_SECTION = 'FULL MORPHOLOGY CODES:'
HENCE_GROUP_RE = re.compile(r'^(.*?)\s*\(hence\s+(.*)\)\s*$')
# Case fixes for values that appear once in a different case from every other
# record: AVPj3mp/HVPj3mp say "Mood=jussive", the other 32 jussive records
# "Jussive". The misspelling "transtive" (248 Action values; "Intensive/
# resultive/transtive") is NOT corrected — it is TEHMC's own text, and the
# authored wording in js/grammar-decode.js keys on it, so it never reaches the
# screen as written.
TEHMC_VALUE_CASE_FIXES = {('Mood', 'jussive'): 'Jussive'}


def split_at_depth_zero(text, separator=';'):
    """Split on `separator` only outside parentheses."""
    parts, depth, current = [], 0, []
    for character in text:
        if character == '(':
            depth += 1
        elif character == ')':
            depth = max(depth - 1, 0)
        if character == separator and depth == 0:
            parts.append(''.join(current))
            current = []
        else:
            current.append(character)
    parts.append(''.join(current))
    return parts


def parse_tehmc_pair(pair_text):
    """'Stem=Piel (hence Action=X; Voice=Y)' -> [(Stem, Piel, 0), (Action, X, 1), (Voice, Y, 1)].
    Only a '(hence ...)' group is unwrapped; other parentheses are part of the
    value ('Form=Definite article (Aramaic)')."""
    category, raw_value = (piece.strip() for piece in pair_text.split('=', 1))
    hence = HENCE_GROUP_RE.match(raw_value)
    pairs = [(category, hence.group(1) if hence else raw_value, 0)]
    if hence:
        for derived_text in split_at_depth_zero(hence.group(2)):
            if derived_text.strip():
                derived_category, derived_value = (piece.strip() for piece in derived_text.split('=', 1))
                pairs.append((derived_category, derived_value, 1))
    return [(c, TEHMC_VALUE_CASE_FIXES.get((c, normalize_tegmc_value(v)), normalize_tegmc_value(v)), d)
            for c, v, d in pairs]


def parse_tehmc_file(path, problems=None):
    """Yields dicts, one per (code, category, value) from TEHMC's FULL MORPHOLOGY
    CODES section, in source order; '(hence ...)' values come out as their own
    rows with derived=1. The BRIEF LEXICAL MORPHOLOGY CODES section (lexicon-style
    codes such as "H:N-M", the form TBESH's Morph column uses) is not read.

    Layout, verified at STEPBible-Data be4191f: header prose, then each record
    preceded by a line holding only "$"; the final record (HVvw3ms) has no "$"
    after it. Only each record's first line ("CODE\tKey=Value; ...") is read.
    A record whose line 1 doesn't parse is reported through `problems` (a list)
    instead of being silently dropped."""
    with open(path, encoding='utf-8-sig') as f:
        text = f.read()
    section_start = text.find(TEHMC_FULL_SECTION)
    if section_start < 0:
        raise ValueError(f'{path}: no "{TEHMC_FULL_SECTION}" section')
    chunks = text[section_start:].split('\n$\n')[1:]   # [0] is the section's header prose
    for chunk in chunks:
        first_line = next((line for line in chunk.split('\n') if line.strip()), None)
        if not first_line or '\t' not in first_line:
            if problems is not None:
                problems.append(('no code line', chunk[:80]))
            continue
        code, kv_string = first_line.split('\t', 1)
        code = code.strip()
        try:
            pairs = [pair for pair_text in split_at_depth_zero(kv_string) if pair_text.strip()
                     for pair in parse_tehmc_pair(pair_text)]
        except ValueError:
            pairs = []
        if not code or not pairs:
            if problems is not None:
                problems.append(('unparsed line 1', first_line[:120]))
            continue
        for position, (category, value, derived) in enumerate(pairs, start=1):
            yield {'code': code, 'category': category, 'value': value,
                   'derived': derived, 'position': position}


def split_hebrew_morph_code(morph_code):
    """'HR/Ncfsa' -> [['HR', 'HNcfsa']]; 'HVqp3ms//Ncmsa' -> [['HVqp3ms'], ['HNcmsa']].

    "//" separates two written words in one row, "/" the pieces of a word. The
    language letter (H/A) is the code's first character only: no subword after
    "//" restates it (checked against all 27 "//" codes at be4191f), and a later
    piece starting with "A" is an Adjective ("HR/Ncbsa//Aamsa"), not Aramaic. So
    it is prefixed onto every piece but the first. An empty piece (none at
    be4191f once "//" is split first) is kept, so callers can see it. The
    runtime splitter in js/grammar-decode.js must give the same result for
    every morph code (checked by a parity test when it is written)."""
    language = morph_code[:1]
    subwords = [subword.split('/') for subword in morph_code.split('//')]
    return [[piece if (s == 0 and p == 0) else language + piece for p, piece in enumerate(pieces)]
            for s, pieces in enumerate(subwords)]


# ── Hebrew word pieces ───────────────────────────────────────────────────────

# A printed Hebrew word is often several pieces — "בְּ/רֵאשִׁ֖ית" = "in" +
# "beginning" — and TAHOT tags every piece: surface, transliteration, English,
# dStrongs, grammar and col 12 all separate pieces with "/". original_words
# keeps those columns verbatim; original_word_pieces adds only what is lost:
# each piece's Strong's number (braces kept on the root, so the root is known —
# H90xx numbers are sometimes the root: "H9005/{H9033}" לוֹ "to him"), plus the
# glosses of second roots. Splitting rules, applied identically to every column
# here and by the runtime splitter in js/grammar-decode.js:
#
# 1. Strip punctuation segments: "\" up to the next "/" or "\" (sof pasuq,
#    maqqef, paseq, setumah/petuchah — "\׃", "\H9016", "\H9016=׃=verseEnd").
# 2. Split on "/". A segment that is a word break starts a new subword: "//"
#    (empty segment), "/ /" (a space), or "/־/" — a maqqef written as its own
#    segment, spelled per column: "־" (surface), "-" (transliteration, English),
#    "H9014" (dStrongs), "H9014=־=link" (col 12). Only the 27 "//" rows, all
#    two written words in one row (mostly Q(K)), have one; the grammar column
#    always writes it "//".
# 3. A row's pieces are stored only when surface, English, dStrongs, grammar and
#    col 12 split into the same subwords and pieces, and each piece's Strong's
#    number agrees between dStrongs and col 12.
PUNCTUATION_SEGMENT_RE = re.compile(r'\\[^/\\]*')
WORD_BREAK_SEGMENTS = {
    'surface':         {'', '־'},
    'transliteration': {'', '-'},
    'english':         {'', '-'},
    'dstrongs':        {'', 'H9014'},
    'expanded':        {'', 'H9014=־=link'},
}
AFFIX_STRONGS_RE = re.compile(r'^H90\d\d$')
PIECE_STRONGS_RE = re.compile(r'^(\{?)([HG]\d+[A-Za-z]?)(\}?)\+?$')
EXPANDED_PIECE_RE = re.compile(r'^(\{?)([HG]\d+[A-Za-z]?)=([^=]*)=(.*?)(\}?)\+?$')


def strip_punctuation_segments(text):
    return PUNCTUATION_SEGMENT_RE.sub('', text)


def split_tahot_column(text, column):
    """-> [[piece, ...], ...] — subwords of pieces, punctuation stripped. Pieces
    are returned as written (English pieces keep their leading space)."""
    breaks = WORD_BREAK_SEGMENTS[column]
    subwords = [[]]
    for segment in strip_punctuation_segments(text).split('/'):
        if segment.strip() in breaks:
            subwords.append([])
        else:
            subwords[-1].append(segment)
    return subwords


def subword_shape(subwords):
    return tuple(len(pieces) for pieces in subwords)


def align_tahot_pieces(cols):
    """Split one TAHOT row's columns (cols as in parse_tahot_file, col 12 already
    through normalize_expanded_tags) and check they agree.

    Returns (pieces, problem): pieces is a list of subwords, each a list of
    {'strongs', 'is_root', 'form', 'gloss_slot'} dicts, when every column agrees;
    otherwise None and a short reason string."""
    splits = {
        'surface':  split_tahot_column(cols[1], 'surface'),
        'english':  split_tahot_column(cols[3], 'english'),
        'dstrongs': split_tahot_column(cols[4], 'dstrongs'),
        'grammar':  split_hebrew_morph_code(cols[5]) if cols[5] else [[]],
        'expanded': split_tahot_column(cols[11], 'expanded'),
    }
    shapes = {name: subword_shape(subwords) for name, subwords in splits.items()}
    if len(set(shapes.values())) != 1:
        return None, 'shape ' + ' '.join(f'{name}={"+".join(map(str, shape))}' for name, shape in shapes.items())
    pieces = []
    for dstrongs_subword, expanded_subword in zip(splits['dstrongs'], splits['expanded']):
        subword = []
        for dstrongs_piece, expanded_piece in zip(dstrongs_subword, expanded_subword):
            strongs_match = PIECE_STRONGS_RE.match(dstrongs_piece.strip())
            expanded_match = EXPANDED_PIECE_RE.match(expanded_piece.strip())
            if not strongs_match or not expanded_match:
                return None, f'unparsed piece {dstrongs_piece!r} / {expanded_piece!r}'
            is_root = strongs_match.group(1) == '{'
            if (strongs_match.group(2), is_root) != (expanded_match.group(2), expanded_match.group(1) == '{'):
                return None, f'Strong\'s mismatch {dstrongs_piece!r} / {expanded_piece!r}'
            subword.append({'strongs': strongs_match.group(2), 'is_root': is_root,
                            'form': expanded_match.group(3), 'gloss_slot': expanded_match.group(4)})
        pieces.append(subword)
    return pieces, None


def piece_strongs_text(pieces):
    """'H9003/{H7225G}'; '{H0935G}//{H1409}' — braces mark roots."""
    return '//'.join('/'.join('{%s}' % p['strongs'] if p['is_root'] else p['strongs'] for p in subword)
                     for subword in pieces)


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

-- One row per (code, category, value) from TEHMC's "Full Morphology Codes"
-- section. derived = 1 for values TEHMC gives inside a "(hence ...)" group —
-- Action/Voice implied by the Stem, Tense/Mood implied by the Form — which
-- TEHMC itself calls likely, not definite. position = order in the source line.
CREATE TABLE step_morphology_hebrew (
    code       TEXT NOT NULL,
    category   TEXT NOT NULL,
    value      TEXT NOT NULL,
    derived    INTEGER NOT NULL,
    position   INTEGER NOT NULL
);
CREATE INDEX idx_morph_hebrew_code ON step_morphology_hebrew(code);

-- One row per multi-piece Hebrew word whose columns all split alike (see
-- align_tahot_pieces); one-piece words get no row. Each piece's Hebrew, morph
-- code and contextual gloss are split at display time from original_words'
-- own "/"-separated columns; only what those columns lack is stored here.
--   piece_strongs  per-piece Strong's numbers in reading order, "//" between
--                  written words and "/" between pieces as in the split
--                  columns; braces mark roots: 'H9003/{H7225G}',
--                  'H9005/{H9033}', '{H0935G}//{H1409}'
--   root_glosses   NULL except rows with 2+ roots: '/'-joined dictionary
--                  glosses of the roots, in order (the first is also
--                  original_words.gloss_dictionary)
--   affix_forms    NULL except rows where an affix piece's col-12 form isn't
--                  its number's usual form (hebrew_affixes.usual): same
--                  structure as piece_strongs, '*' for every other piece —
--                  '*/*/Ss3m' (the 87 suffixes of לְבַד "alone")
CREATE TABLE original_word_pieces (
    word_id        INTEGER PRIMARY KEY,
    piece_strongs  TEXT NOT NULL,
    root_glosses   TEXT,
    affix_forms    TEXT
);

-- Prefix/suffix Strong's numbers (H9001-H9013, H9020-H9049) with col 12's
-- form and gloss as written. usual = 1 for the pair a number has everywhere
-- except where original_word_pieces.affix_forms says otherwise.
CREATE TABLE hebrew_affixes (
    strongs_number  TEXT NOT NULL,
    form            TEXT NOT NULL,
    gloss           TEXT NOT NULL,
    usual           INTEGER NOT NULL,
    PRIMARY KEY (strongs_number, form)
);

-- One row per Hebrew word whose text type isn't plain "L" or whose TAHOT col 7
-- (Meaning variants) or col 8 (Spelling variants) has text; absence means plain
-- Leningrad text with no recorded variant. Columns 7/8 are stored as written
-- (whitespace-only counts as empty), so a later spec can show Aleppo/BHS/LXX
-- variants without a rebuild. ketiv_hebrew: the Ketiv (the written consonants
-- where the text follows the Qere), parsed from col 7's "K=" for Q(K)
-- (ketiv_kind 'meaning') and col 8's "K=" for Q(k) ('spelling'); "\"
-- punctuation stripped, "/" piece breaks kept; NULL when it doesn't parse.
CREATE TABLE original_word_variants (
    word_id            INTEGER PRIMARY KEY,
    text_type          TEXT NOT NULL,
    meaning_variants   TEXT,
    spelling_variants  TEXT,
    ketiv_hebrew       TEXT,
    ketiv_kind         TEXT
);
"""


def write_piece_tables(cur, hebrew_words):
    """original_word_pieces + hebrew_affixes. Exits rather than guess if an
    affix number's (form, gloss) data can't be stored as specified."""
    affix_pairs = defaultdict(Counter)            # strongs -> Counter((form, gloss))
    multi_piece = []
    skipped = []
    for word_id, row in hebrew_words:
        pieces = row['pieces']
        if pieces is None:
            skipped.append((row['reference'], row['pieces_problem']))
            continue
        for subword in pieces:
            for piece in subword:
                if AFFIX_STRONGS_RE.match(piece['strongs']):
                    affix_pairs[piece['strongs']][(piece['form'], piece['gloss_slot'])] += 1
        if sum(len(subword) for subword in pieces) > 1:
            multi_piece.append((word_id, pieces))

    usual = {}
    affix_rows = []
    for strongs, pairs in sorted(affix_pairs.items()):
        ranked = pairs.most_common()
        glosses_per_form = Counter(form for form, _ in pairs)
        if len(ranked) > 1 and ranked[0][1] == ranked[1][1] or any(n > 1 for n in glosses_per_form.values()):
            sys.exit(f"STOP: {strongs} has no single usual (form, gloss), or a form with two glosses: {dict(pairs)}")
        usual[strongs] = ranked[0][0]
        affix_rows += [(strongs, form, gloss, int((form, gloss) == ranked[0][0])) for (form, gloss), _ in ranked]
    cur.executemany("INSERT INTO hebrew_affixes (strongs_number, form, gloss, usual) VALUES (?, ?, ?, ?)", affix_rows)

    piece_rows = []
    for word_id, pieces in multi_piece:
        roots = [piece for subword in pieces for piece in subword if piece['is_root']]
        root_glosses = None
        if len(roots) > 1:
            glosses = [tahot_dictionary_gloss(piece['gloss_slot']) or '' for piece in roots]
            if any('/' in gloss for gloss in glosses):
                sys.exit(f"STOP: a root gloss contains '/', which root_glosses uses as its separator: {glosses}")
            root_glosses = '/'.join(glosses)
        unusual = lambda piece: piece['strongs'] in usual and (piece['form'], piece['gloss_slot']) != usual[piece['strongs']]
        affix_forms = None
        if any(unusual(piece) for subword in pieces for piece in subword):
            affix_forms = '//'.join('/'.join(piece['form'] if unusual(piece) else '*' for piece in subword)
                                    for subword in pieces)
        piece_rows.append((word_id, piece_strongs_text(pieces), root_glosses, affix_forms))
    cur.executemany("INSERT INTO original_word_pieces (word_id, piece_strongs, root_glosses, affix_forms) "
                    "VALUES (?, ?, ?, ?)", piece_rows)

    print(f"original_word_pieces: {len(piece_rows):,} multi-piece words "
          f"({sum(r[2] is not None for r in piece_rows)} with root_glosses, "
          f"{sum(r[3] is not None for r in piece_rows)} with affix_forms); "
          f"{len(hebrew_words) - len(multi_piece) - len(skipped):,} one-piece words; "
          f"{len(skipped)} skipped (columns disagree)")
    for reference, problem in skipped:
        print(f"  skipped {reference}: {problem}")
    print(f"hebrew_affixes: {len(affix_rows)} rows for {len(usual)} numbers "
          f"({sum(1 for p in affix_pairs.values() if len(p) > 1)} with more than one form)")


# Col 7 for Q(K): "K= 'o.ho.Lo/h (אָהֳלֹ/ה\׃) "his tent" (H0168G/H9023=HNcmsc/Sp3ms)",
# sometimes after another variant ("B= … ¦ K= …", Neh.2.13#17).
# Col 8 for Q(k): "L= הַוְצֵ֣א ¦ ;K= הוֹצֵא".
KETIV_MEANING_RE = re.compile(r'^K=\s*[^()"]*?\s*\(([^()]*)\)')
KETIV_SPELLING_RE = re.compile(r'^K=\s*(.+?)\s*$')
HEBREW_TEXT_RE = re.compile(r'^[\u0590-\u05FF\uFB1D-\uFB4F/\\ ]+$')


def parse_ketiv(text_type, meaning_variants, spelling_variants):
    """-> (ketiv_hebrew, ketiv_kind), or (None, kind) if the Ketiv doesn't parse."""
    if text_type == 'Q(K)':
        kind, segments, pattern = 'meaning', meaning_variants.split('¦'), KETIV_MEANING_RE
    elif text_type == 'Q(k)':
        kind, segments, pattern = 'spelling', re.split(r'[¦;]', spelling_variants), KETIV_SPELLING_RE
    else:
        return None, None
    found = [m.group(1) for m in (pattern.match(seg.strip()) for seg in segments) if m]
    if len(found) != 1 or not HEBREW_TEXT_RE.match(found[0]):
        return None, kind
    ketiv = strip_punctuation_segments(found[0]).strip()
    return (ketiv or None), kind


def write_variant_table(cur, hebrew_words):
    rows = []
    unparsed = []
    for word_id, row in hebrew_words:
        meaning = row['meaning_variants'] if row['meaning_variants'].strip() else None
        spelling = row['spelling_variants'] if row['spelling_variants'].strip() else None
        if row['text_type'] == 'L' and meaning is None and spelling is None:
            continue
        ketiv, kind = parse_ketiv(row['text_type'], meaning or '', spelling or '')
        if kind and not ketiv:
            unparsed.append((row['reference'], meaning, spelling))
        rows.append((word_id, row['text_type'], meaning, spelling, ketiv, kind))
    cur.executemany("INSERT INTO original_word_variants (word_id, text_type, meaning_variants, "
                    "spelling_variants, ketiv_hebrew, ketiv_kind) VALUES (?, ?, ?, ?, ?, ?)", rows)
    by_kind = Counter(r[5] for r in rows if r[4])
    print(f"original_word_variants: {len(rows):,} rows; Ketiv parsed: {by_kind['meaning']} meaning (Q(K)), "
          f"{by_kind['spelling']} spelling (Q(k)); {len(unparsed)} Q(K)/Q(k) rows unparsed")
    for item in unparsed:
        print(f"  Ketiv not parsed: {item}")


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def build(raw_dir=RAW_DIR, output_db=OUTPUT_DB, ship=False):
    source_names = TAHOT_FILES + TAGNT_FILES + [TBESG_FILE, TEGMC_FILE, TEHMC_FILE]
    for name in source_names:
        if not (raw_dir / name).exists():
            sys.exit(f"Missing source file: {raw_dir / name}")

    print(f"Sources: {raw_dir}")
    for name in source_names:
        print(f"  {sha256_of(raw_dir / name)}  {name}")

    output_db.parent.mkdir(parents=True, exist_ok=True)
    if output_db.exists():
        output_db.unlink()

    con = sqlite3.connect(output_db)
    cur = con.cursor()
    cur.executescript(SCHEMA)

    # Ids are written explicitly (the same values AUTOINCREMENT would give), so
    # original_word_pieces/original_word_variants can key on them as rows are read.
    word_cols = ['id', 'verse_id', 'word_position', 'language', 'surface_text',
                 'transliteration', 'lemma', 'gloss_contextual', 'gloss_dictionary',
                 'strongs_number', 'morph_code', 'group_id']
    insert_word = f"INSERT INTO original_words ({','.join(word_cols)}) VALUES ({','.join('?' * len(word_cols))})"

    total_words = 0
    batch = []
    BATCH_SIZE = 5000
    hebrew_words = []      # (word_id, row) for every Hebrew row, for the piece and variant tables

    def flush_batch():
        nonlocal batch
        if batch:
            cur.executemany(insert_word, batch)
            batch = []

    for name in TAHOT_FILES:
        print(f"Parsing {name} ...")
        n = 0
        for row in parse_tahot_file(raw_dir / name):
            row['id'] = total_words + n + 1
            hebrew_words.append((row['id'], {k: row[k] for k in (
                'reference', 'text_type', 'meaning_variants', 'spelling_variants', 'pieces', 'pieces_problem')}))
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
        for row in parse_tagnt_file(raw_dir / name):
            row['id'] = total_words + n + 1
            batch.append(tuple(row[c] for c in word_cols))
            n += 1
            if len(batch) >= BATCH_SIZE:
                flush_batch()
        flush_batch()
        print(f"  {n} words")
        total_words += n

    print(f"Total original_words rows: {total_words}")

    write_piece_tables(cur, hebrew_words)
    write_variant_table(cur, hebrew_words)

    print(f"Parsing {TBESG_FILE} ...")
    lex_cols = ['strongs_number', 'lemma', 'transliteration', 'morph', 'gloss', 'meaning']
    insert_lex = f"INSERT OR REPLACE INTO step_lexicon_greek ({','.join(lex_cols)}) VALUES ({','.join('?' * len(lex_cols))})"
    lex_rows = [tuple(r[c] for c in lex_cols) for r in parse_tbesg_file(raw_dir / TBESG_FILE)]
    cur.executemany(insert_lex, lex_rows)
    print(f"  {len(lex_rows)} lexicon entries")

    print(f"Parsing {TEGMC_FILE} ...")
    morph_cols = ['code', 'category', 'raw_value', 'sort_order']
    insert_morph = f"INSERT INTO step_morphology_greek ({','.join(morph_cols)}) VALUES ({','.join('?' * len(morph_cols))})"
    morph_rows = [tuple(r[c] for c in morph_cols) for r in parse_tegmc_file(raw_dir / TEGMC_FILE)]
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

    print(f"Parsing {TEHMC_FILE} ...")
    tehmc_problems = []
    hebrew_morph_cols = ['code', 'category', 'value', 'derived', 'position']
    hebrew_morph_rows = [tuple(r[c] for c in hebrew_morph_cols)
                         for r in parse_tehmc_file(raw_dir / TEHMC_FILE, tehmc_problems)]
    cur.executemany(
        f"INSERT INTO step_morphology_hebrew ({','.join(hebrew_morph_cols)}) "
        f"VALUES ({','.join('?' * len(hebrew_morph_cols))})", hebrew_morph_rows)
    tehmc_codes = {row[0] for row in hebrew_morph_rows}
    print(f"  {len(hebrew_morph_rows)} category rows across {len(tehmc_codes)} codes "
          f"({sum(c[0] == 'H' for c in tehmc_codes)} H, {sum(c[0] == 'A' for c in tehmc_codes)} A; "
          f"{sum(r[3] for r in hebrew_morph_rows)} derived)")
    for problem in tehmc_problems:
        print(f"WARNING: TEHMC record not parsed: {problem}")
    # 921 at STEPBible-Data be4191f (unchanged since faf6a35). As with TEGMC,
    # upstream drift may move this a little; a large drop means a format change.
    if len(tehmc_codes) < 900 or 'Hc' not in tehmc_codes:
        print(f"WARNING: expected ~921 TEHMC codes including 'Hc', got {len(tehmc_codes)} — check the raw file")

    # Coverage of Hebrew morph codes against TEHMC, piece by piece (same split
    # as the runtime decode). Printed diagnostic, like the TEGMC check above.
    cur.execute("SELECT morph_code, COUNT(*) FROM original_words "
                "WHERE language = 'hebrew' AND morph_code IS NOT NULL GROUP BY morph_code")
    piece_total = piece_misses = 0
    missing_pieces = Counter()
    for morph_code, count in cur.fetchall():
        for subword in split_hebrew_morph_code(morph_code):
            for piece in subword:
                piece_total += count
                if piece not in tehmc_codes:
                    piece_misses += count
                    missing_pieces[piece] += count
    print(f"TEHMC coverage: {piece_total - piece_misses:,} of {piece_total:,} Hebrew morph pieces resolve"
          + (f"; unresolved: {dict(missing_pieces.most_common(10))}" if missing_pieces else ""))

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

    size_bytes = output_db.stat().st_size
    print(f"\nBuilt {output_db} ({size_bytes:,} bytes, {size_bytes / (1024 * 1024):.1f} MiB)")
    if ship:
        shutil.copyfile(output_db, SHIPPED_DB)
        print(f"Copied to {SHIPPED_DB}")
    else:
        print(f"Not copied to {SHIPPED_DB} (pass --ship to ship this build)")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Build language.db from STEPBible-Data source files.")
    parser.add_argument('--raw-dir', type=Path, default=RAW_DIR,
                        help=f"directory holding the source files (default: {RAW_DIR})")
    parser.add_argument('--output', type=Path, default=OUTPUT_DB,
                        help=f"build artifact path (default: {OUTPUT_DB})")
    parser.add_argument('--ship', action='store_true',
                        help=f"copy the finished build to {SHIPPED_DB}")
    args = parser.parse_args()
    build(raw_dir=args.raw_dir.resolve(), output_db=args.output.resolve(), ship=args.ship)
