#!/usr/bin/env python3
"""
tbesh_gloss_check.py — Compare TAHOT column-12 glosses with TBESH's Gloss column (D2).

Usage (from project root):
    python3 -I scripts/analysis/hebrew_anatomy/tbesh_gloss_check.py RAW_DIR TBESH.txt

TBESH (STEPBible's brief lexicon of extended Strong's numbers for Hebrew) is not
a build input; it is read here only as STEP's own statement of each dStrong's
dictionary gloss. Its Gloss column writes a sense of a word as
"<base gloss>: <sense gloss>" (H6440G "face: before").

For every distinct (dStrong, column-12 slot) it builds candidate glosses —
    sense    today's rule (text before '»', minus the leading ':')
    base     the spec's rule (text after '»', up to ':<n>_')
    combined '<base>: <sense>' for ':'-form slots, else the plain gloss
— and counts, per rule, how many rows and dStrongs match TBESH after a light
normalization ('_' -> ' ', ';' -> '/', whitespace collapsed, case folded).
"""

import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gloss_slot_survey as survey  # noqa: E402


def load_tbesh(path):
    glosses = {}
    with open(path, encoding='utf-8-sig') as f:
        for line in f:
            cols = line.rstrip('\n').split('\t')
            if len(cols) < 7 or not re.match(r'^H\d', cols[0]):
                continue
            dstrong = cols[1].split('=')[0].strip()
            if re.fullmatch(r'H\d+[A-Za-z]?', dstrong):
                glosses[dstrong] = cols[6].strip()
    return glosses


def normalize(text):
    text = text.replace('_', ' ').replace(';', '/')
    text = re.sub(r'\s*/\s*', '/', text)
    return re.sub(r'\s+', ' ', text).strip().casefold()


def candidates(slot):
    sense = survey.old_rule(slot)
    base = survey.spec_rule(slot)
    combined = f'{base}: {sense}' if slot.startswith(':') and '»' in slot else base
    return {'sense': sense, 'base': base, 'combined': combined}


def main():
    raw_dir, tbesh_path = sys.argv[1], sys.argv[2]
    tbesh = load_tbesh(tbesh_path)
    print(f'TBESH entries: {len(tbesh):,}')

    slot_rows = Counter()
    for ref, strongs, lemma, slot in survey.rows(raw_dir):
        slot_rows[(strongs, slot)] += 1

    for form in ("':'-form", 'plain'):
        keys = [k for k in slot_rows if (k[1].startswith(':')) == (form == "':'-form")]
        total_rows = sum(slot_rows[k] for k in keys)
        missing = [k for k in keys if k[0] not in tbesh]
        print(f'\n{form}: {len(keys):,} distinct (dStrong, slot), {total_rows:,} rows; '
              f'{len(missing)} dStrongs not in TBESH ({sum(slot_rows[k] for k in missing):,} rows)')
        for rule in ('sense', 'base', 'combined'):
            hit_keys = [k for k in keys if k[0] in tbesh
                        and normalize(candidates(k[1])[rule]) == normalize(tbesh[k[0]])]
            print(f'  {rule:<9} matches TBESH: {len(hit_keys):>5,} keys  '
                  f'{sum(slot_rows[k] for k in hit_keys):>8,} rows')
        if form == "':'-form":
            misses = Counter()
            for k in keys:
                if k[0] in tbesh and normalize(candidates(k[1])['combined']) != normalize(tbesh[k[0]]):
                    misses[(k[0], candidates(k[1])['combined'], tbesh[k[0]])] += slot_rows[k]
            print(f'  combined ≠ TBESH, largest by rows ({len(misses)} keys):')
            for (strongs, ours, theirs), n in misses.most_common(25):
                print(f'    {strongs}\t{ours!r}\tTBESH {theirs!r}\t{n:,}')


if __name__ == '__main__':
    main()
