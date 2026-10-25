#!/usr/bin/env python3
"""
check_rebuild.py — Pass/fail check of a language.db rebuild against the baseline (D6).

Usage (from project root):
    python3 -I scripts/analysis/hebrew_anatomy/check_rebuild.py OLD.db NEW.db RAW_DIR

OLD.db is the previous shipped build (git show 8169e14:data/language.db), NEW.db
the rebuild, RAW_DIR the pinned sources NEW.db was built from. Exits 1 if any
check fails. Rows are keyed by (language, verse_id, word_position), never by id
(see compare_language_db.py).

Allowed differences in Hebrew original_words, and nothing else
(docs/HEBREW_ANATOMY_DATA_REPORT.md):
  - any column, and added/removed rows, in Psa 44:14, 57:9, 108:3, 149:7
    (upstream merged two rows into one "V" row);
  - lemma: only the rows whose col 12 carries "#N" instance numbers;
  - gloss_dictionary: exactly the rows where the previous rule and
    tahot_dictionary_gloss() disagree on that row's col 12, with the old value
    equal to the previous rule's and the new value to the new rule's.
Group memberships must be unchanged outside the Psalm verses. Greek, TBESG and
TEGMC tables must be identical. The new tables get structural checks.
"""

import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1]))
import build_language as bl  # noqa: E402
from compare_language_db import CONTENT_COLUMNS, load_words, open_read_only  # noqa: E402

PSALM_VERSES = {19044014, 19057009, 19108003, 19149007}
PREVIOUS_TAG_RE = re.compile(r'\{[HG]\d+[A-Za-z]?=([^=]*)=([^{}]*)\}')   # build_language.py at 8169e14

results = []


def check(name, ok, details=()):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
    for line in list(details)[:25]:
        print(f'        {line}')


def previous_lemma_and_gloss(raw_expanded):
    """The previous build's parse_tahot_lemma_and_gloss, verbatim in behavior."""
    m = PREVIOUS_TAG_RE.search(raw_expanded)
    if not m:
        return None, None
    gloss = m.group(2).split('»', 1)[0].strip()
    if gloss.startswith(':'):
        gloss = gloss[1:].strip()
    return (m.group(1).strip() or None), (gloss or None)


def raw_hebrew_rows(raw_dir):
    """(key, raw cols) in build order, keyed exactly as parse_tahot_file keys rows."""
    for name in bl.TAHOT_FILES:
        with open(Path(raw_dir) / name, encoding='utf-8') as f:
            raw = [line.rstrip('\n').split('\t') for line in f]
        raw = [c for c in raw if len(c) >= 12 and bl.TAHOT_REF_RE.match(c[0])
               and c[0].split('.')[0] in bl.BOOK_ID and c[1].strip()]
        parsed = list(bl.parse_tahot_file(Path(raw_dir) / name))
        assert len(raw) == len(parsed)
        for cols, row in zip(raw, parsed):
            assert row['reference'] == cols[0]
            yield (row['verse_id'], row['word_position']), cols


def main():
    old_path, new_path, raw_dir = sys.argv[1:4]
    old_db, new_db = open_read_only(old_path), open_read_only(new_path)

    # ── Greek and the unchanged tables ───────────────────────────────────────
    old_greek, new_greek = load_words(old_db, 'greek'), load_words(new_db, 'greek')
    differing = [k for k in old_greek.keys() | new_greek.keys()
                 if old_greek.get(k) is None or new_greek.get(k) is None
                 or any(old_greek[k][c] != new_greek[k][c] for c in CONTENT_COLUMNS + ['group_members'])]
    check(f'Greek original_words identical ({len(new_greek):,} rows, content + group membership)',
          not differing, differing)
    query = 'SELECT strongs_number, lemma, transliteration, morph, gloss, meaning FROM step_lexicon_greek ORDER BY 1'
    check('step_lexicon_greek identical', list(old_db.execute(query)) == list(new_db.execute(query)))
    query = 'SELECT code, category, raw_value, sort_order FROM step_morphology_greek ORDER BY id'
    check('step_morphology_greek identical, in order', list(old_db.execute(query)) == list(new_db.execute(query)))

    # ── Hebrew original_words: every difference explained ────────────────────
    old_rows, new_rows = load_words(old_db, 'hebrew'), load_words(new_db, 'hebrew')
    raw_by_key = dict(raw_hebrew_rows(raw_dir))
    check(f'every new Hebrew row has its raw TAHOT row ({len(new_rows):,})', raw_by_key.keys() == new_rows.keys())

    added_removed = (old_rows.keys() ^ new_rows.keys())
    check('rows added/removed only in the 4 Psalm verses',
          {k[0] for k in added_removed} <= PSALM_VERSES,
          sorted(k for k in added_removed if k[0] not in PSALM_VERSES))
    check(f'Hebrew row count {len(old_rows):,} -> {len(new_rows):,} (expected -4)', len(new_rows) == len(old_rows) - 4)

    unexplained = []
    gloss_changed = lemma_changed = psalm_changed = 0
    expected_gloss_changes = set()
    for key, cols in raw_by_key.items():
        if key[0] in PSALM_VERSES:
            continue
        old_lemma, old_gloss = previous_lemma_and_gloss(cols[11])
        new_lemma, new_gloss = bl.parse_tahot_lemma_and_gloss(cols[11])
        if old_gloss != new_gloss:
            expected_gloss_changes.add(key)
        if key not in old_rows:
            continue
        old_row, new_row = old_rows[key], new_rows[key]
        for column in CONTENT_COLUMNS:
            if old_row[column] == new_row[column]:
                continue
            if column == 'gloss_dictionary' and old_row[column] == old_gloss and new_row[column] == new_gloss:
                gloss_changed += 1
            elif column == 'lemma' and old_row[column] == old_lemma and new_row[column] == new_lemma \
                    and bl.TAG_INSTANCE_RE.search(cols[11]):
                lemma_changed += 1
            else:
                unexplained.append((key, column, old_row[column], new_row[column]))
        if old_row['group_members'] != new_row['group_members']:
            unexplained.append((key, 'group_members', sorted(old_row['group_members'] or []),
                                sorted(new_row['group_members'] or [])))
    for key in old_rows.keys() & new_rows.keys():
        if key[0] in PSALM_VERSES and any(old_rows[key][c] != new_rows[key][c] for c in CONTENT_COLUMNS):
            psalm_changed += 1

    actual_gloss_changes = {k for k in old_rows.keys() & new_rows.keys() if k[0] not in PSALM_VERSES
                            and old_rows[k]['gloss_dictionary'] != new_rows[k]['gloss_dictionary']}
    check('no Hebrew difference outside the allowed set', not unexplained, unexplained)
    check(f'gloss_dictionary differs on exactly the rows where the rules disagree '
          f'({gloss_changed:,} outside the Psalm verses; expected {len(expected_gloss_changes):,})',
          actual_gloss_changes == expected_gloss_changes,
          sorted(actual_gloss_changes ^ expected_gloss_changes))
    check(f'lemma differs only on #N rows ({lemma_changed} outside the Psalm verses)', lemma_changed == 1)
    print(f'        (Psalm verses: {len(added_removed)} keys added/removed, {psalm_changed} shared keys changed)')

    # ── New tables: structure ────────────────────────────────────────────────
    hebrew_ids = {i: (v, p, s, m) for i, v, p, s, m in new_db.execute(
        "SELECT id, verse_id, word_position, surface_text, morph_code FROM original_words WHERE language = 'hebrew'")}
    pieces = new_db.execute('SELECT word_id, piece_strongs, root_glosses, affix_forms FROM original_word_pieces').fetchall()
    problems = []
    for word_id, piece_strongs, root_glosses, affix_forms in pieces:
        if word_id not in hebrew_ids:
            problems.append((word_id, 'not a Hebrew word'))
            continue
        verse, position, surface, morph = hebrew_ids[word_id]
        shape = tuple(len(s.split('/')) for s in piece_strongs.split('//'))
        if shape != bl.subword_shape(bl.split_tahot_column(surface, 'surface')) \
                or shape != bl.subword_shape(bl.split_hebrew_morph_code(morph)):
            problems.append((word_id, 'shape', piece_strongs, surface, morph))
        if sum(shape) < 2:
            problems.append((word_id, 'one-piece word has a row'))
        roots = piece_strongs.count('{')
        if (root_glosses is not None) != (roots > 1) or (root_glosses and len(root_glosses.split('/')) != roots):
            problems.append((word_id, 'root_glosses', piece_strongs, root_glosses))
        if affix_forms is not None and tuple(len(s.split('/')) for s in affix_forms.split('//')) != shape:
            problems.append((word_id, 'affix_forms shape', piece_strongs, affix_forms))
    multi_piece_words = sum(1 for _, (v, p, s, m) in hebrew_ids.items()
                            if sum(bl.subword_shape(bl.split_hebrew_morph_code(m))) > 1)
    check(f'original_word_pieces: {len(pieces):,} rows, each a multi-piece Hebrew word whose surface and '
          f'morph split to the stored shape; root_glosses iff 2+ roots; affix_forms shaped alike',
          not problems, problems)
    check(f'every multi-piece Hebrew word has a pieces row ({multi_piece_words:,})', multi_piece_words == len(pieces))

    affixes = new_db.execute('SELECT strongs_number, form, gloss, usual FROM hebrew_affixes').fetchall()
    usual_per_number = Counter(n for n, _, _, u in affixes if u)
    numbers = {n for n, _, _, _ in affixes}
    stored_numbers = {n.strip('{}') for (ps,) in new_db.execute('SELECT piece_strongs FROM original_word_pieces')
                      for n in re.split('/+', ps) if not n.startswith('{')}
    check(f'hebrew_affixes: {len(affixes)} rows, {len(numbers)} numbers, exactly one usual form each; '
          f'covers every affix number in piece_strongs',
          all(usual_per_number[n] == 1 for n in numbers) and stored_numbers <= numbers,
          sorted(stored_numbers - numbers))

    variants = new_db.execute('SELECT word_id, text_type, ketiv_hebrew, ketiv_kind FROM original_word_variants').fetchall()
    bad = [v for v in variants if v[0] not in hebrew_ids
           or (v[3] == 'meaning') != (v[1] == 'Q(K)') or (v[3] == 'spelling') != (v[1] == 'Q(k)')
           or (v[3] is not None and not v[2])]
    check(f'original_word_variants: {len(variants):,} rows on Hebrew words; ketiv_kind matches text type; '
          f'every Q(K)/Q(k) has a Ketiv ({sum(1 for v in variants if v[2]):,})', not bad, bad)

    codes = {c for (c,) in new_db.execute('SELECT DISTINCT code FROM step_morphology_hebrew')}
    check(f'step_morphology_hebrew: {len(codes)} codes, Hc present', len(codes) == 921 and 'Hc' in codes)

    print(f"\n{'ALL CHECKS PASSED' if all(results) else 'SOME CHECKS FAILED'} ({sum(results)}/{len(results)})")
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
