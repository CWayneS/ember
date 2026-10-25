#!/usr/bin/env python3
"""
compare_language_db.py — Content diff of two language.db builds.

Usage (from project root):
    python3 -I scripts/analysis/hebrew_anatomy/compare_language_db.py OLD.db NEW.db

Row ids are not compared. Hebrew rows are inserted before Greek, so removing
Hebrew rows shifts every later original_words.id, and group_id comes from one
global counter, so it shifts too. Instead:

- original_words rows are keyed by (language, verse_id, word_position) and
  their content columns compared;
- group_id is compared as membership: the set of keys sharing a row's group;
- step_lexicon_greek is keyed by strongs_number;
- step_morphology_greek is compared as an ordered list of
  (code, category, raw_value, sort_order).

Prints a summary. Exits 0 always; reading the summary is the point.
"""

import sqlite3
import sys
from collections import Counter, defaultdict

CONTENT_COLUMNS = ['surface_text', 'transliteration', 'lemma', 'gloss_contextual',
                   'gloss_dictionary', 'strongs_number', 'morph_code']


def open_read_only(path):
    return sqlite3.connect(f'file:{path}?mode=ro&immutable=1', uri=True)


def load_words(connection, language):
    rows = {}
    groups = defaultdict(set)
    columns = ', '.join(['verse_id', 'word_position', 'group_id'] + CONTENT_COLUMNS)
    for record in connection.execute(
            f'SELECT {columns} FROM original_words WHERE language = ?', (language,)):
        key = (record[0], record[1])
        rows[key] = {'group_id': record[2], **dict(zip(CONTENT_COLUMNS, record[3:]))}
        if record[2] is not None:
            groups[record[2]].add(key)
    for row in rows.values():
        row['group_members'] = frozenset(groups[row['group_id']]) if row['group_id'] is not None else None
    return rows


def compare_words(old_db, new_db, language):
    old_rows, new_rows = load_words(old_db, language), load_words(new_db, language)
    only_old = sorted(old_rows.keys() - new_rows.keys())
    only_new = sorted(new_rows.keys() - old_rows.keys())
    column_diffs = defaultdict(list)
    for key in sorted(old_rows.keys() & new_rows.keys()):
        old_row, new_row = old_rows[key], new_rows[key]
        for column in CONTENT_COLUMNS + ['group_members']:
            if old_row[column] != new_row[column]:
                column_diffs[column].append((key, old_row, new_row))

    print(f'\n== original_words [{language}] ==')
    print(f'rows: old {len(old_rows):,}  new {len(new_rows):,}  '
          f'only-in-old {len(only_old):,}  only-in-new {len(only_new):,}')
    old_groups = {r['group_members'] for r in old_rows.values() if r['group_members']}
    new_groups = {r['group_members'] for r in new_rows.values() if r['group_members']}
    print(f'groups: old {len(old_groups):,}  new {len(new_groups):,}  '
          f'identical membership {len(old_groups & new_groups):,}')

    keyed_verses = Counter(k[0] for k in only_old + only_new)
    for column, diffs in column_diffs.items():
        keyed_verses.update(k[0] for k, _, _ in diffs)
    if only_old or only_new:
        print(f'verses with added/removed rows: {sorted({k[0] for k in only_old + only_new})}')
    if not column_diffs:
        print('content columns: all identical on shared keys')
    for column, diffs in column_diffs.items():
        print(f'-- {column}: {len(diffs):,} rows differ')
        if column == 'gloss_dictionary':
            by_value = Counter((n['strongs_number'], o[column], n[column]) for _, o, n in diffs)
            for (strongs, old_value, new_value), count in sorted(by_value.items()):
                print(f'   {strongs}\t{old_value!r} -> {new_value!r}\t{count}')
        else:
            for key, old_row, new_row in diffs[:15]:
                old_value = old_row[column] if column != 'group_members' else sorted(old_row[column] or [])
                new_value = new_row[column] if column != 'group_members' else sorted(new_row[column] or [])
                print(f'   {key}\t{old_value!r} -> {new_value!r}')
            if len(diffs) > 15:
                print(f'   … {len(diffs) - 15:,} more; verses: {sorted({k[0] for k, _, _ in diffs})[:40]}')
    return old_rows, new_rows


def compare_greek_tables(old_db, new_db):
    print('\n== step_lexicon_greek ==')
    query = 'SELECT strongs_number, lemma, transliteration, morph, gloss, meaning FROM step_lexicon_greek'
    old_lex = {r[0]: r for r in old_db.execute(query)}
    new_lex = {r[0]: r for r in new_db.execute(query)}
    changed = [k for k in old_lex.keys() & new_lex.keys() if old_lex[k] != new_lex[k]]
    print(f'rows: old {len(old_lex):,}  new {len(new_lex):,}  only-in-old {len(old_lex.keys() - new_lex.keys())}  '
          f'only-in-new {len(new_lex.keys() - old_lex.keys())}  changed {len(changed)}')

    print('\n== step_morphology_greek ==')
    query = 'SELECT code, category, raw_value, sort_order FROM step_morphology_greek ORDER BY id'
    old_morph, new_morph = list(old_db.execute(query)), list(new_db.execute(query))
    print(f'rows: old {len(old_morph):,}  new {len(new_morph):,}  '
          f'identical in order: {old_morph == new_morph}')


def table_inventory(connection, label):
    names = [r[0] for r in connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    counts = {n: connection.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0] for n in names}
    print(f'{label} tables: ' + ', '.join(f'{n}={c:,}' for n, c in counts.items()))


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    old_db, new_db = open_read_only(sys.argv[1]), open_read_only(sys.argv[2])
    table_inventory(old_db, 'old')
    table_inventory(new_db, 'new')
    for language in ('greek', 'hebrew'):
        compare_words(old_db, new_db, language)
    compare_greek_tables(old_db, new_db)


if __name__ == '__main__':
    main()
