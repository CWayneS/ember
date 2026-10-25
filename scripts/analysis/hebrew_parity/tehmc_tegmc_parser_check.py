#!/usr/bin/env python3
"""Run build_language.py's existing parse_tegmc_file against TEHMC to show where
TEGMC's parser breaks on the Hebrew file: it drops "Hc" (trailing ";") and splits
inside "(hence Action=...; Voice=...)" parentheticals.
Usage: tehmc_tegmc_parser_check.py <TEHMC.txt>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys, collections
ROOT = __import__('pathlib').Path(__file__).resolve().parents[3]  # project root
sys.path.insert(0, str(ROOT / 'scripts'))
import build_language as bl

rows = list(bl.parse_tegmc_file(sys.argv[1]))
codes = {r['code'] for r in rows}
print('existing TEGMC parser on TEHMC: codes', len(codes), 'rows', len(rows))
print('missing among Hc/AC/HVvw3ms:', [c for c in ['Hc', 'AC', 'HVvw3ms'] if c not in codes])
print(collections.Counter(r['category'] for r in rows))
print([(r['category'], r['raw_value']) for r in rows if r['code'] == 'HVvw3ms'])
