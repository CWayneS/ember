#!/usr/bin/env python3
"""
hebrew_wording_export.py — Fixture for hebrew_wording_check.mjs (Hebrew Word Anatomy U2).

Usage (from project root):
    python3 -I scripts/analysis/hebrew_anatomy/hebrew_wording_export.py LANGUAGE_DB OUT.json
    node scripts/analysis/hebrew_anatomy/hebrew_wording_check.mjs OUT.json [--markdown]

Every TEHMC code the Hebrew data's pieces use, with its rows and how many
piece occurrences it has (morph codes split as at runtime).
"""
import json
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import build_language as bl  # noqa: E402

db = sqlite3.connect(f'file:{sys.argv[1]}?mode=ro&immutable=1', uri=True)
occurrences = Counter()
for morph, n in db.execute("SELECT morph_code, COUNT(*) FROM original_words WHERE language = 'hebrew' GROUP BY 1"):
    for subword in bl.split_hebrew_morph_code(morph):
        for piece in subword:
            occurrences[piece] += n
rows = defaultdict(list)
for code, category, value, derived, position in db.execute(
        'SELECT code, category, value, derived, position FROM step_morphology_hebrew ORDER BY code, position'):
    rows[code].append({'category': category, 'value': value, 'derived': derived, 'position': position})
fixture = [{'code': c, 'occurrences': n, 'rows': rows[c]} for c, n in sorted(occurrences.items())]
json.dump(fixture, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print(f'wrote {sys.argv[2]}: {len(fixture)} codes, {sum(occurrences.values()):,} piece occurrences')
