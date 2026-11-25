#!/usr/bin/env python3
"""Writes the two catalogs of shipped data files, from the files themselves.

data/translations/catalog.json lists every translation Ember offers, installed
or not (docs/Translation_Addons_Spec.md, Item 1). data/reference-catalog.json
lists language.db, lexicon-hebrew.db and context.db. size_bytes, sha256 and verse_count are
read from the real files, never typed by hand. Add checks a download against
them, and an installed file whose sha256 no longer matches its entry is replaced
by the app's background update (js/db.js:checkForDataUpdates). So run this after
any rebuild of a shipped file; build_language.py, build_lexicon_hebrew.py and
build_context.py run it themselves with --ship. tests/verify.py translations fails if either catalog
no longer matches the files.

The editorial fields (tier, description) live in CATALOG below. name, year and
license come from each translation file's own meta table, as the manifest rows do.

Usage (from the repo root):
    python3 scripts/build_catalogs.py
"""
import hashlib
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSLATIONS_DIR = os.path.join(ROOT, 'data', 'translations')
OUTPUT = os.path.join(TRANSLATIONS_DIR, 'catalog.json')
REFERENCE_OUTPUT = os.path.join(ROOT, 'data', 'reference-catalog.json')
REFERENCE_FILES = ['language.db', 'lexicon-hebrew.db', 'context.db']

SCHEMA_VERSION = 1

# IDs are permanent: the same ID is the same translation on every machine, and a
# removed ID is never reused. Must agree with build/build_db.py's TRANSLATIONS.
# KJV is the one locked translation (LOCKED_TRANSLATION_ID in js/db.js).
CATALOG = [
    (1, 'kjv.db',   'locked',    'The historic standard. Archaic, familiar, widely cross-referenced.'),
    (2, 'asv.db',   'default',   'The 1901 scholarly revision in the KJV line.'),
    (3, 'web.db',   'default',   'Modern English, public domain, actively maintained.'),
    (4, 'ylt.db',   'default',   'Hyper-literal. Follows the original word order and tenses closely; built for word study.'),
    (5, 'darby.db', 'available', '1890, literal-leaning, careful with Greek tense and the article.'),
    (6, 'bsb.db',   'default',   'Modern and essentially literal; public domain since 2023.'),
]


def describe(translation_id, filename, tier, description):
    path = os.path.join(TRANSLATIONS_DIR, filename)
    with open(path, 'rb') as handle:
        data = handle.read()
    conn = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    try:
        meta = dict(conn.execute('SELECT key, value FROM meta'))
        # verse 0 rows are Psalm titles (KJV, ASV, Darby): not counted.
        verse_count = conn.execute('SELECT COUNT(*) FROM verses WHERE verse > 0').fetchone()[0]
    finally:
        conn.close()
    return {
        'id': translation_id,
        'filename': filename,
        'name': meta['name'],
        'abbreviation': meta['abbreviation'],
        'year': meta['year'],
        'license': meta['license'],
        'tier': tier,
        'size_bytes': len(data),
        'verse_count': verse_count,
        'sha256': hashlib.sha256(data).hexdigest(),
        'description': description,
    }


def describe_reference(filename):
    with open(os.path.join(ROOT, 'data', filename), 'rb') as handle:
        data = handle.read()
    return {'filename': filename, 'size_bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def write_json(path, value):
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False)
        handle.write('\n')


def main():
    entries = [describe(*row) for row in CATALOG]
    if sum(entry['tier'] == 'locked' for entry in entries) != 1 or entries[0]['tier'] != 'locked':
        sys.exit('catalog: exactly one locked translation, ID 1 (KJV)')
    write_json(OUTPUT, {'schema_version': SCHEMA_VERSION, 'translations': entries})
    for entry in entries:
        print(f"  {entry['abbreviation']:<6} {entry['tier']:<9} {entry['size_bytes']:>10,} bytes  "
              f"{entry['verse_count']:,} verses  {entry['sha256'][:12]}")
    print(f'Wrote {os.path.relpath(OUTPUT, ROOT)}')

    files = [describe_reference(name) for name in REFERENCE_FILES]
    write_json(REFERENCE_OUTPUT, {'schema_version': SCHEMA_VERSION, 'files': files})
    for entry in files:
        print(f"  {entry['filename']:<18} {entry['size_bytes']:>11,} bytes  {entry['sha256'][:12]}")
    print(f'Wrote {os.path.relpath(REFERENCE_OUTPUT, ROOT)}')


if __name__ == '__main__':
    main()
