#!/usr/bin/env python3
"""
review_page.py — A read-only review page for the 1611 summaries' word lists:
build/context/1611-spelling.tsv (spelling changes, possessives, words left as
printed, rejected changes) and build/context/1611-glosses.tsv, each word shown
in the summaries it's used in, as printed and as modernized.

Usage (from project root, after scripts/build_context.py):
    python3 -I scripts/analysis/kjv1611/review_page.py OUT_DIR

Writes OUT_DIR/index.html (a copy of review_page.html beside this script) and
OUT_DIR/data.json. Open index.html through a local web server (it fetches
data.json), or publish the folder as a page. Reads data/context.db for the
summaries, so run it after a build that used the lists as they are now.
"""

import json
import re
import shutil
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SPELLING_LIST = PROJECT_ROOT / 'build' / 'context' / '1611-spelling.tsv'
GLOSS_LIST = PROJECT_ROOT / 'build' / 'context' / '1611-glosses.tsv'
CONTEXT_DB = PROJECT_ROOT / 'data' / 'context.db'
CORE_DB = PROJECT_ROOT / 'data' / 'core.db'
PAGE = Path(__file__).with_name('review_page.html')

USES_SHOWN = 3
VERSE_NUMBER = re.compile(r'(?<![\w])\d+(?!\w)')


def read_lists():
    """Rows by section, from the spelling list's own layout: entries, then
    '# Possessives', '# Left as printed', '# Rejected' with commented rows."""
    sections = {'spelling': [], 'possessive': [], 'unchanged': [], 'rejected': []}
    section = 'spelling'
    for line in SPELLING_LIST.read_text(encoding='utf-8').splitlines():
        if line.startswith('# Possessives'):
            section = 'possessive'
            continue
        if line.startswith('# Left as printed'):
            section = 'unchanged'
            continue
        if line.startswith('# Rejected'):
            section = 'rejected'
            continue
        if section in ('unchanged', 'rejected'):
            if line.startswith('#\t'):
                fields = line[2:].split('\t')
                if section == 'unchanged':
                    sections[section].append({'printed': fields[0], 'uses': int(fields[1])})
                else:
                    sections[section].append({'printed': fields[0], 'basis': fields[1]})
            continue
        if line.startswith('#') or not line.strip():
            continue
        printed, modern, uses, basis = line.split('\t')
        sections[section].append({'printed': printed, 'modern': modern, 'uses': int(uses), 'basis': basis})
    glosses = []
    for line in GLOSS_LIST.read_text(encoding='utf-8').splitlines():
        if line.startswith('#') or not line.strip():
            continue
        fields = line.split('\t') + ['', '']
        glosses.append({'printed': fields[0], 'meaning': fields[1], 'example': fields[2], 'reviewed': fields[3]})
    return sections, glosses


def parts(text):
    """The summary split where each verse reference starts, as the app shows it."""
    starts = [match.start() for match in VERSE_NUMBER.finditer(text)]
    bounds = [0] + [start for start in starts if start > 0] + [len(text)]
    return [text[a:b].strip() for a, b in zip(bounds, bounds[1:]) if text[a:b].strip()]


def find_uses(word, summaries, names, exact, in_modern=False):
    """Up to USES_SHOWN uses: [chapter, part as printed, part modernized]. Matched
    as printed (case-blind unless `exact`), or in the modern text for a gloss."""
    flags = 0 if exact else re.I
    pattern = re.compile(r'(?<![\w’])' + re.escape(word) + r'(?![\w’])', flags)
    uses = []
    for (book, chapter), (original, modern, borrowed) in summaries.items():
        if borrowed:
            continue   # Proverbs 11-24 repeat Proverbs 10
        old_parts, new_parts = parts(original), parts(modern)
        if len(old_parts) != len(new_parts):
            old_parts, new_parts = [original], [modern]
        for old_part, new_part in zip(old_parts, new_parts):
            if pattern.search(new_part if in_modern else old_part):
                uses.append([f'{names[book]} {chapter}', old_part, new_part])
                break
        if len(uses) >= USES_SHOWN:
            break
    return uses


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    sections, glosses = read_lists()

    core = sqlite3.connect(f'file:{CORE_DB}?mode=ro', uri=True)
    names = dict(core.execute('SELECT id, name FROM books'))
    core.close()
    context = sqlite3.connect(f'file:{CONTEXT_DB}?mode=ro', uri=True)
    summaries = {(book, chapter): (original, modern, borrowed) for book, chapter, original, modern, borrowed in
                 context.execute('SELECT book, chapter, original, modern, borrowed_from FROM chapter_summaries ORDER BY book, chapter')}
    meta = dict(context.execute('SELECT key, value FROM context_meta'))
    context.close()

    for row in sections['spelling'] + sections['unchanged'] + sections['rejected']:
        row['seen'] = find_uses(row['printed'], summaries, names, exact=False)
    for row in sections['possessive']:
        row['seen'] = find_uses(row['printed'], summaries, names, exact=True)
    for row in glosses:
        row['seen'] = find_uses(row['printed'], summaries, names, exact=False, in_modern=True)

    data = {
        'source': {'commit': meta.get('kjv1611_commit', ''), 'chapters': len(summaries)},
        'spelling': sections['spelling'], 'possessive': sections['possessive'],
        'unchanged': sections['unchanged'], 'rejected': sections['rejected'], 'glosses': glosses,
    }
    (out / 'data.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    shutil.copyfile(PAGE, out / 'index.html')
    counts = {key: len(value) for key, value in data.items() if isinstance(value, list)}
    print(f'Wrote {out / "index.html"} and data.json ({(out / "data.json").stat().st_size:,} bytes): {counts}')


if __name__ == '__main__':
    main()
