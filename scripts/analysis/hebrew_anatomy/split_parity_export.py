#!/usr/bin/env python3
"""
split_parity_export.py — Fixture for split_parity.mjs (Hebrew Word Anatomy U1).

Usage (from project root):
    python3 -I scripts/analysis/hebrew_anatomy/split_parity_export.py RAW_DIR LANGUAGE_DB OUT.json
    node scripts/analysis/hebrew_anatomy/split_parity.mjs OUT.json

Writes, from raw TAHOT (build order, so index + 1 == original_words.id), the
built database, and build_language.py's own functions:
  - every distinct morph_code with its language (for isHebrewMorphCode);
  - every Hebrew word's surface/English/morph and, for multi-piece words, its
    original_word_pieces row plus the expected split — pieces from the
    Python splitter, roles from the approved rules, and each piece's expected
    dictionary gloss taken straight from raw column 12 (affixes: the gloss as
    written; roots: tahot_dictionary_gloss), independent of hebrew_affixes;
  - hebrew_affixes.
"""

import json
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1]))
import build_language as bl  # noqa: E402
import piece_alignment as pa  # noqa: E402


def expected_roles(pieces, morph):
    roles = []
    for s, subword in enumerate(pieces):
        root_positions = [i for i, p in enumerate(subword) if p['is_root']]
        last_root = root_positions[-1] if root_positions else None
        for i, p in enumerate(subword):
            if p['is_root']:
                roles.append('root')
            elif last_root is not None:
                roles.append('prefix' if i < last_root else 'suffix')
            else:
                roles.append('suffix' if morph[s][i][1] == 'S' else 'prefix')
    return roles


def main():
    raw_dir, db_path, out_path = sys.argv[1:4]
    con = sqlite3.connect(f'file:{db_path}?mode=ro&immutable=1', uri=True)
    words = {r[0]: r[1:] for r in con.execute(
        "SELECT id, surface_text, gloss_contextual, gloss_dictionary, morph_code "
        "FROM original_words WHERE language = 'hebrew'")}
    piece_rows = {r[0]: r[1:] for r in con.execute(
        'SELECT word_id, piece_strongs, root_glosses, affix_forms FROM original_word_pieces')}

    fixture = {'morphCodes': [list(r) for r in con.execute(
        'SELECT DISTINCT morph_code, language FROM original_words WHERE morph_code IS NOT NULL')],
        'affixes': [list(r) for r in con.execute('SELECT strongs_number, form, gloss, usual FROM hebrew_affixes')],
        'words': []}

    for word_id, cols in enumerate(pa.tahot_rows(raw_dir), start=1):
        surface, english, gloss_dictionary, morph = words[word_id]
        assert surface == cols[1]
        entry = {'id': word_id, 'ref': cols[0], 'surface_text': surface, 'gloss_contextual': english,
                 'gloss_dictionary': gloss_dictionary, 'morph_code': morph,
                 'pySurface': bl.split_tahot_column(surface, 'surface'),
                 'pyEnglish': bl.split_tahot_column(english or '', 'english'),
                 'pyMorph': bl.split_hebrew_morph_code(morph)}
        if word_id in piece_rows:
            piece_strongs, root_glosses, affix_forms = piece_rows[word_id]
            pieces, problem = bl.align_tahot_pieces(cols)
            assert pieces and not problem
            flat = [p for subword in pieces for p in subword]
            entry['pieceRow'] = {'pieceStrongs': piece_strongs, 'rootGlosses': root_glosses, 'affixForms': affix_forms}
            entry['expected'] = [{
                'strongsNumber': p['strongs'],
                'role': role,
                'dictionaryGloss': bl.tahot_dictionary_gloss(p['gloss_slot']) if p['is_root'] else p['gloss_slot'],
            } for p, role in zip(flat, expected_roles(pieces, entry['pyMorph']))]
        fixture['words'].append(entry)

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(fixture, f, ensure_ascii=False)
    print(f"wrote {out_path}: {len(fixture['words']):,} Hebrew words "
          f"({len(piece_rows):,} multi-piece), {len(fixture['morphCodes']):,} distinct morph codes")


if __name__ == '__main__':
    main()
