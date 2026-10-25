#!/usr/bin/env python3
"""
piece_alignment.py — D4 report: affix constancy and piece alignment.

Usage (from project root):
    python3 -I scripts/analysis/hebrew_anatomy/piece_alignment.py RAW_DIR

Uses build_language.py's own functions (normalize_expanded_tags,
align_tahot_pieces, split_tahot_column, piece_strongs_text,
tahot_dictionary_gloss), so what it reports is what the import does.
"""

import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import build_language as bl  # noqa: E402

SAMPLES = ['Gen.1.1#01=L', 'Gen.1.3#01=L', 'Gen.2.2#05=L', '2Ki.19.37#08=Q(K)', '1Ch.27.12#06=Q(K)',
           'Neh.2.13#17=Q(K)', 'Gen.1.1#07=L', 'Exo.4.2#04=Q(K)', 'Psa.44.14(44.15)#06=V']


def tahot_rows(raw_dir):
    for name in bl.TAHOT_FILES:
        with open(Path(raw_dir) / name, encoding='utf-8') as f:
            for line in f:
                cols = line.rstrip('\n').split('\t')
                if len(cols) < 12 or not bl.TAHOT_REF_RE.match(cols[0]) or not cols[1].strip():
                    continue
                cols[11] = bl.normalize_expanded_tags(cols[11])
                yield cols


def main():
    raw_dir = sys.argv[1]
    total = single = written = 0
    skipped = []
    translit_mismatch = []
    affix_pairs = defaultdict(Counter)          # strongs -> Counter((role, form, gloss))
    affix_occurrences = defaultdict(list)       # (strongs, form, gloss) -> [(ref, role, morph, english, surface)]
    unbraced_non_affix = Counter()
    rootless_subwords = []
    multi_root_rows = []
    english_extra_slash = []
    break_forms = Counter()
    samples = {}

    for cols in tahot_rows(raw_dir):
        total += 1
        ref = cols[0]
        pieces, problem = bl.align_tahot_pieces(cols)
        piece_count = sum(len(s) for s in pieces) if pieces else None

        if '//' in cols[5]:
            forms = []
            for column, index in (('surface', 1), ('english', 3), ('dstrongs', 4), ('expanded', 11)):
                text = bl.strip_punctuation_segments(cols[index]).split('/')
                forms.append(f"{column}:{'|'.join(repr(seg.strip()) for seg in text if seg.strip() in bl.WORD_BREAK_SEGMENTS[column])}")
            break_forms[' '.join(forms)] += 1

        if pieces is None:
            skipped.append((ref, problem, cols[1], cols[3], cols[4], cols[5]))
        else:
            if piece_count == 1:
                single += 1
            else:
                written += 1
                if bl.subword_shape(bl.split_tahot_column(cols[2], 'transliteration')) != bl.subword_shape(pieces):
                    translit_mismatch.append((ref, cols[2], cols[5]))
            roots = [p for s in pieces for p in s if p['is_root']]
            if len(roots) > 1:
                multi_root_rows.append((ref, bl.piece_strongs_text(pieces),
                                        [bl.tahot_dictionary_gloss(p['gloss_slot']) for p in roots]))
            for subword in pieces:
                root_index = next((i for i, p in enumerate(subword) if p['is_root']), None)
                if root_index is None:
                    rootless_subwords.append((ref, bl.piece_strongs_text([subword])))
                for i, p in enumerate(subword):
                    role = 'root' if p['is_root'] else (
                        'prefix' if root_index is not None and i < root_index else
                        'suffix' if root_index is not None else 'no-root')
                    if re.fullmatch(r'H90\d\d', p['strongs']):
                        affix_pairs[p['strongs']][(role, p['form'], p['gloss_slot'])] += 1
                        affix_occurrences[(p['strongs'], p['form'], p['gloss_slot'])].append(
                            (ref, role, bl.split_hebrew_morph_code(cols[5])[pieces.index(subword)][i],
                             bl.split_tahot_column(cols[3], 'english')[pieces.index(subword)][i].strip(), cols[1]))
                    elif not p['is_root']:
                        unbraced_non_affix[p['strongs']] += 1
        if ref in SAMPLES:
            samples.setdefault(ref, (cols, pieces, problem))

        # English '/' that isn't a piece break: more '/'-segments in English than pieces
        if pieces is not None and piece_count > 1:
            english = bl.split_tahot_column(cols[3], 'english')
            if bl.subword_shape(english) != bl.subword_shape(pieces):
                english_extra_slash.append(ref)

    print(f'Hebrew rows: {total:,}')
    print(f'  one-piece (no row written): {single:,}')
    print(f'  multi-piece, all columns agree (row written): {written:,}')
    print(f'  skipped (columns disagree): {len(skipped):,}')
    for item in skipped:
        print('    ', item)
    print(f'English column: rows whose English splits differently from the pieces: {len(english_extra_slash)}')
    print(f'Transliteration splits differently (reported, not a gate): {len(translit_mismatch)}')
    for item in translit_mismatch[:20]:
        print('    ', item)

    print('\n"//" rows: how the break is written (punctuation stripped)')
    for form, n in break_forms.most_common():
        print(f'  {n:>3}  {form}')

    print('\nAFFIX CONSTANCY (H90xx numbers, every role)')
    varies = []
    for strongs in sorted(affix_pairs):
        pairs = Counter()
        roles = Counter()
        for (role, form, gloss), n in affix_pairs[strongs].items():
            pairs[(form, gloss)] += n
            roles[role] += n
        flag = '' if len(pairs) == 1 else '   <-- VARIES'
        if len(pairs) > 1:
            varies.append(strongs)
        print(f'  {strongs}  {dict(pairs)}  roles {dict(roles)}{flag}')
    print(f'numbers whose (form, gloss) varies: {varies or "none"}')
    for strongs in varies:
        pairs = Counter({k: len(v) for k, v in affix_occurrences.items() if k[0] == strongs})
        for key, n in pairs.most_common()[1:]:
            occurrences = affix_occurrences[key]
            print(f'  {strongs} minority pair {key[1:]} x{n}: morph {dict(Counter(o[2] for o in occurrences))} '
                  f'roles {dict(Counter(o[1] for o in occurrences))} english {dict(Counter(o[3] for o in occurrences))}')
            for o in occurrences:
                print(f'      {o[0]}  {o[4]}  role={o[1]} morph={o[2]} english={o[3]!r}')
        majority = pairs.most_common(1)[0]
        majority_morph = Counter(o[2] for o in affix_occurrences[majority[0]])
        print(f'  {strongs} majority pair {majority[0][1:]} x{majority[1]}: morph {dict(majority_morph.most_common(6))}')
    print(f'unbraced pieces that are not H90xx: {dict(unbraced_non_affix) or "none"}')
    print(f'subwords with no root: {len(rootless_subwords)} {rootless_subwords[:10]}')

    print(f'\nROWS WITH MORE THAN ONE ROOT: {len(multi_root_rows)}')
    for item in multi_root_rows:
        print('  ', item)

    print('\nSAMPLES')
    for ref, (cols, pieces, problem) in samples.items():
        print(f'--- {ref}')
        print(f'  raw: surface {cols[1]!r} | translit {cols[2]!r} | english {cols[3]!r} | dStrongs {cols[4]!r} | grammar {cols[5]!r}')
        print(f'       col12 {cols[11]!r}')
        if pieces is None:
            print(f'  NOT WRITTEN: {problem}')
            continue
        roots = [p for s in pieces for p in s if p['is_root']]
        print(f'  stored: piece_strongs {bl.piece_strongs_text(pieces)!r}'
              + (f", root_glosses {'/'.join(bl.tahot_dictionary_gloss(p['gloss_slot']) for p in roots)!r}" if len(roots) > 1 else ''))
        surface = bl.split_tahot_column(cols[1], 'surface')
        english = bl.split_tahot_column(cols[3], 'english')
        grammar = bl.split_hebrew_morph_code(cols[5])
        for s, subword in enumerate(pieces):
            for i, p in enumerate(subword):
                print(f'  runtime split: subword {s} piece {i}: surface {surface[s][i]!r} morph {grammar[s][i]!r} '
                      f'english {english[s][i].strip()!r} strongs {p["strongs"]} root={p["is_root"]}')


if __name__ == '__main__':
    main()
