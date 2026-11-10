#!/usr/bin/env python3
"""Generate js/hebrew-versification.js: Hebrew (Masoretic) verse numbering
mapped onto Ember's English (KJV) numbering, for the Old Testament.

Brown-Driver-Briggs cites verses by Hebrew numbering (Joel 4:6, Mal 3:21, a
titled Psalm's verse 3 for English verse 1), so a BDB reference has to be
renumbered before the reader can open it. lexicon-hebrew.db keeps BDB's own
numbers; the map lives in a JS module because a rebuilt reference database
never reaches an install that already has one.

The source is TAHOT, the same pinned STEPBible files language.db is built
from (see scripts/build_language.py). Each TAHOT row's reference is
`Book.Chapter.Verse(HebrewChapter.HebrewVerse)`: the primary number is the
English one, and the parenthesis appears only where the Hebrew differs.

Usage:
    python3 scripts/build_hebrew_versification.py [--raw-dir DIR]

Default raw directory: data/stepbible-prep/raw/be4191f/ (fetched with
scripts/analysis/hebrew_anatomy/fetch_sources.sh). The output is the same,
byte for byte, on every run from the same files.
"""

import argparse
import hashlib
import re
import sys
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / 'data' / 'stepbible-prep' / 'raw' / 'be4191f'
OUTPUT = PROJECT_ROOT / 'js' / 'hebrew-versification.js'

# The files language.db was built from (STEPBible-Data commit be4191f).
TAHOT_SHA256 = {
    'TAHOT_Gen-Deu.txt': 'e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b',
    'TAHOT_Jos-Est.txt': '195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775',
    'TAHOT_Job-Sng.txt': 'bb508af3af07822fca84cc43a0eba79eb70eecf672aabc0245b8d8cecf329d96',
    'TAHOT_Isa-Mal.txt': 'f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5',
}

STEPBIBLE_OT_BOOKS = [
    'Gen', 'Exo', 'Lev', 'Num', 'Deu', 'Jos', 'Jdg', 'Rut', '1Sa', '2Sa', '1Ki', '2Ki',
    '1Ch', '2Ch', 'Ezr', 'Neh', 'Est', 'Job', 'Psa', 'Pro', 'Ecc', 'Sng', 'Isa', 'Jer',
    'Lam', 'Ezk', 'Dan', 'Hos', 'Jol', 'Amo', 'Oba', 'Jon', 'Mic', 'Nam', 'Hab', 'Zep',
    'Hag', 'Zec', 'Mal',
]
BOOK_ID = {code: index + 1 for index, code in enumerate(STEPBIBLE_OT_BOOKS)}

REF_RE = re.compile(r'^([A-Za-z1-3]+)\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#')


def read_mapping(raw_dir):
    """{(book, hebrewChapter, hebrewVerse): set of (englishChapter, englishVerse)}."""
    mismatches = []
    for name, expected in TAHOT_SHA256.items():
        actual = hashlib.sha256((raw_dir / name).read_bytes()).hexdigest()
        if actual != expected:
            mismatches.append(f'{name}: {actual}')
    if mismatches:
        sys.exit('sha256 mismatch, not building:\n  ' + '\n  '.join(mismatches))

    mapping = defaultdict(set)
    for name in TAHOT_SHA256:
        with open(raw_dir / name, encoding='utf-8') as source:
            for line in source:
                match = REF_RE.match(line)
                if not match:
                    continue
                book = BOOK_ID[match[1]]
                english = (int(match[2]), int(match[3]))
                hebrew = (int(match[4]), int(match[5])) if match[4] else english
                mapping[(book,) + hebrew].add(english)
    return mapping


def choose_english(targets):
    """A Hebrew verse that English splits (a Psalm title plus the start of verse
    1) opens at its first numbered verse, not the title."""
    ordered = sorted(targets)
    numbered = [target for target in ordered if target[1] > 0]
    return numbered[0] if numbered else ordered[0]


def build(raw_dir):
    mapping = read_mapping(raw_dir)
    chosen = {hebrew: choose_english(targets) for hebrew, targets in mapping.items()}

    # Verse counts, after checking every Hebrew chapter is numbered 1..n.
    verses_by_chapter = defaultdict(list)
    for book, chapter, verse in chosen:
        verses_by_chapter[(book, chapter)].append(verse)
    verse_counts = defaultdict(list)
    for (book, chapter) in sorted(verses_by_chapter):
        verses = sorted(verses_by_chapter[(book, chapter)])
        assert verses == list(range(1, len(verses) + 1)), f'gap in Hebrew {book}.{chapter}: {verses[:5]}…'
        assert chapter == len(verse_counts[book]) + 1, f'missing Hebrew chapter before {book}.{chapter}'
        verse_counts[book].append(len(verses))

    # Runs: consecutive Hebrew verses moved by the same amount.
    runs = []
    for (book, chapter, verse) in sorted(chosen):
        english_chapter, english_verse = chosen[(book, chapter, verse)]
        if (english_chapter, english_verse) == (chapter, verse):
            continue
        offset = english_verse - verse
        last = runs[-1] if runs else None
        if last and last[:2] == [book, chapter] and last[3] == verse - 1 and last[4:] == [english_chapter, offset]:
            last[3] = verse
        else:
            runs.append([book, chapter, verse, verse, english_chapter, offset])

    # The runs must reproduce the chosen mapping exactly.
    expanded = {}
    for book, chapter, first, last, english_chapter, offset in runs:
        for verse in range(first, last + 1):
            expanded[(book, chapter, verse)] = (english_chapter, verse + offset)
    for hebrew, english in chosen.items():
        assert expanded.get(hebrew, hebrew[1:]) == english, f'run mismatch at {hebrew}'

    return verse_counts, runs, len(chosen), sum(1 for hebrew, english in chosen.items() if hebrew[1:] != english)


def write_module(verse_counts, runs):
    lines = [
        '// hebrew-versification.js — generated by scripts/build_hebrew_versification.py',
        '// from TAHOT (STEPBible-Data be4191f). Do not edit by hand.',
        '//',
        '// Hebrew (Masoretic) verse numbering, as Brown-Driver-Briggs cites it, onto',
        "// Ember's English (KJV) numbering. Old Testament books 1-39 only.",
        '',
        '// HEBREW_VERSE_COUNTS[book][chapter - 1]: verses in that Hebrew chapter.',
        'export const HEBREW_VERSE_COUNTS = {',
    ]
    for book in sorted(verse_counts):
        lines.append(f'    {book}: [{", ".join(map(str, verse_counts[book]))}],')
    lines += [
        '};',
        '',
        '// Where the numbering differs: [book, hebrewChapter, firstVerse, lastVerse,',
        '// englishChapter, verseOffset]. Hebrew verse v of the run is English',
        '// englishChapter:(v + verseOffset). Every other verse keeps its number.',
        'export const HEBREW_TO_ENGLISH_RUNS = [',
    ]
    for run in runs:
        lines.append(f'    [{", ".join(map(str, run))}],')
    lines += ['];', '']
    OUTPUT.write_text('\n'.join(lines), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--raw-dir', type=Path, default=RAW_DIR)
    args = parser.parse_args()
    verse_counts, runs, verse_total, renumbered = build(args.raw_dir.resolve())
    write_module(verse_counts, runs)
    print(f'{verse_total} Hebrew verses, {renumbered} numbered differently, in {len(runs)} runs')
    print(f'wrote {OUTPUT.relative_to(PROJECT_ROOT)}, sha256 {hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
