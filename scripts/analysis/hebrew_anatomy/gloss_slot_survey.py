#!/usr/bin/env python3
"""
gloss_slot_survey.py — Survey TAHOT column 12's root-tag gloss slot (D2).

Usage (from project root):
    python3 -I scripts/analysis/hebrew_anatomy/gloss_slot_survey.py RAW_DIR

Reads the four TAHOT files in RAW_DIR with build_language.py's own row rules
(ref regex, ghost-row skip), takes each row's FIRST root tag (the one that
feeds gloss_dictionary), and classifies its gloss slot (text after the 2nd '=').

Slot shapes seen in the data:
    plain           'to create'
    plain»…         'God»LORD@Gen.1.1-Heb', 'son»son:9_youngAnimal)'
    ':'-form        ': country;_planet»land:2_country;_planet'
                    = ': <sense gloss>»<base gloss>:<sense no.>_<sense detail>'

For the ':'-form it reports how many rows/Strong's numbers change under the
spec's rule (take the text after '»' up to the next ':'), split several ways,
to find which definition reproduces the spec's "69 Strong's numbers / 7,752 rows".
"""

import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import build_language as bl  # noqa: E402

TAG_RE = re.compile(r'\{([HG]\d+[A-Za-z]?)(?:#\d+)?=([^=]*)=([^{}]*)\}')


def rows(raw_dir):
    for name in bl.TAHOT_FILES:
        with open(Path(raw_dir) / name, encoding='utf-8') as f:
            for line in f:
                cols = line.rstrip('\n').split('\t')
                if len(cols) < 12 or not bl.TAHOT_REF_RE.match(cols[0]) or not cols[1].strip():
                    continue
                m = TAG_RE.search(cols[11])
                if m:
                    yield cols[0], m.group(1), m.group(2), m.group(3)


def old_rule(slot):
    """build_language.py's rule at faf6a35: before '»', minus a leading ':'."""
    gloss = slot.split('»', 1)[0].strip()
    return gloss[1:].strip() if gloss.startswith(':') else gloss


SENSE_SUFFIX_RE = re.compile(r':\d+_.*$')


def spec_rule(slot):
    """Proposed rule: ':'-form slots take the base gloss after '»'; every slot then
    drops a ':<sense no.>_…' suffix (needed for one malformed row, Pro 26:17)."""
    if slot.startswith(':') and '»' in slot:
        gloss = slot.split('»', 1)[1]
    else:
        gloss = slot.split('»', 1)[0]
    return SENSE_SUFFIX_RE.sub('', gloss).strip()


def main():
    args = sys.argv[1:]
    table_path = None
    if '--table' in args:
        i = args.index('--table')
        table_path = args[i + 1]
        del args[i:i + 2]
    raw_dir, probe = args[0], args[1:]

    by_strongs = defaultdict(Counter)   # strongs -> Counter((old, new)) over ALL rows
    shape_rows = Counter()
    slots_per_strongs = defaultdict(set)
    examples = {}
    for ref, strongs, lemma, slot in rows(raw_dir):
        slots_per_strongs[strongs].add(slot)
        shape = ("':'-form" if slot.startswith(':') else 'plain') + (' with »' if '»' in slot else '')
        shape_rows[shape] += 1
        examples.setdefault(shape, (ref, strongs, slot))
        by_strongs[strongs][(old_rule(slot), spec_rule(slot))] += 1

    print('Slot shapes (first root tag per row):')
    for shape, n in shape_rows.most_common():
        print(f'  {shape:<18} {n:>8,}   e.g. {examples[shape]}')
    multi_slot = {s for s, v in slots_per_strongs.items() if len(v) > 1}
    print(f"Strong's numbers with more than one distinct slot text: {len(multi_slot)}")

    def tally(label, predicate):
        hit_rows, hit_strongs = 0, set()
        for strongs, pairs in by_strongs.items():
            for (old, new), n in pairs.items():
                if predicate(old, new):
                    hit_rows += n
                    hit_strongs.add(strongs)
        print(f"  {label:<48} rows {hit_rows:>7,}  strongs {len(hit_strongs):>5,}")

    print('Rows where …')
    tally('old != new (the rule changes the value)', lambda o, n: o != n)
    tally("old contains ';' or '_' (spec's 69 / 7,752)", lambda o, n: ';' in o or '_' in o)
    tally("… of those, the rule changes the value", lambda o, n: (';' in o or '_' in o) and o != n)
    tally("new contains '_'", lambda o, n: '_' in n)
    tally("new contains ';'", lambda o, n: ';' in n)
    tally('new is empty', lambda o, n: not n)
    tally("new contains ':' (left after the rule)", lambda o, n: ':' in n)

    old_values = {s: {o for o, _ in p} for s, p in by_strongs.items()}
    new_values = {s: {n for _, n in p} for s, p in by_strongs.items()}
    print(f"Strong's numbers with >1 distinct gloss: old {sum(len(v) > 1 for v in old_values.values())}, "
          f"new {sum(len(v) > 1 for v in new_values.values())}")
    for s in sorted(k for k, v in new_values.items() if len(v) > 1):
        print(f'   {s}: old {sorted(old_values[s])}  new {sorted(new_values[s])}')

    if table_path:
        with open(table_path, 'w', encoding='utf-8') as out:
            out.write("strongs\told\tnew\trows\n")
            for strongs in sorted(by_strongs):
                for (old, new), n in sorted(by_strongs[strongs].items()):
                    if old != new:
                        out.write(f'{strongs}\t{old}\t{new}\t{n}\n')
        print(f'Before/after table (changed values only) written to {table_path}')

    for strongs in probe:
        print(strongs, dict(by_strongs.get(strongs, {})), slots_per_strongs.get(strongs))


if __name__ == '__main__':
    main()
