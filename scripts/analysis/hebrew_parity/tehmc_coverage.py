#!/usr/bin/env python3
"""Coverage of Hebrew original_words.morph_code pieces (split on "/", H/A carried forward) against TEHMC.
Usage: tehmc_coverage.py <tehmc_codes.json>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys
ROOT = __import__('pathlib').Path(__file__).resolve().parents[3]  # project root
import json, sqlite3, collections, sys
d=json.load(open(sys.argv[1])); codes=set(d)
con=sqlite3.connect(f'file:{ROOT}/data/language.db?mode=ro&immutable=1',uri=True)
print(con.execute("select language,count(*),count(distinct morph_code),sum(morph_code is null) from original_words group by 1").fetchall())
rows=con.execute("select morph_code,count(*) from original_words where language='hebrew' and morph_code is not null group by 1").fetchall()
tot=0;ok=0;miss=collections.Counter();misscodes=collections.Counter();shapes=collections.Counter()
distinct_pieces=set(); words_full=0; words_tot=0
for mc,n in rows:
    pieces=mc.split('/'); lang=pieces[0][0]
    if lang not in 'HA': shapes['bad lead '+mc]+=n
    full=[pieces[0]]+[lang+p for p in pieces[1:]]
    allok=True
    for p in full:
        tot+=n; distinct_pieces.add(p)
        if p in codes: ok+=n
        else: miss[p]+=n; misscodes[mc]+=n; allok=False
    words_tot+=n; words_full+=n if allok else 0
    shapes[len(pieces)]+=n
print('piece occurrences',tot,'resolved',ok,f'{100*ok/tot:.3f}%')
print('distinct pieces',len(distinct_pieces),'resolved',len(distinct_pieces&codes))
print('words fully resolved',words_full,words_tot,f'{100*words_full/words_tot:.3f}%')
print('pieces-per-word',sorted(shapes.items(),key=str))
print('MISSING pieces:',len(miss))
for p,n in miss.most_common(): print(' ',repr(p),n)
print('morph codes containing a miss (top 30):')
for p,n in misscodes.most_common(30): print(' ',p,n)
print('TEHMC codes never used:',len(codes-distinct_pieces))
print(sorted(codes-distinct_pieces)[:60])
