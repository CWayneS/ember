#!/usr/bin/env python3
"""Count Hebrew-language rows whose morph_code starts with A (Aramaic), by book/chapter/verse range.
Usage: aramaic_counts.py

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sqlite3, collections
ROOT = __import__('pathlib').Path(__file__).resolve().parents[3]  # project root
con=sqlite3.connect(f'file:{ROOT}/data/language.db?mode=ro&immutable=1',uri=True)
core=sqlite3.connect(f'file:{ROOT}/data/core.db?mode=ro&immutable=1',uri=True)
names={r[0]:r[1] for r in core.execute("select id,name from books")}
rows=con.execute("select verse_id,morph_code from original_words where language='hebrew' order by id").fetchall()
A=[(v,m) for v,m in rows if m.startswith('A')]
print('Aramaic-led rows',len(A),'of',len(rows))
# per book/chapter
bc=collections.Counter((v//1000000,(v//1000)%1000) for v,_ in A)
byb=collections.defaultdict(list)
for (b,c),n in sorted(bc.items()): byb[b].append((c,n))
for b,lst in byb.items():
    tot=sum(n for _,n in lst)
    # verse ranges
    vs=sorted({v for v,_ in A if v//1000000==b})
    rngs=[];s=p=vs[0]
    for v in vs[1:]:
        if v==p+1: p=v; continue
        rngs.append((s,p)); s=p=v
    rngs.append((s,p))
    f=lambda x:f"{(x//1000)%1000}:{x%1000}"
    print(f"{names[b]}: {tot} rows; chapters {[(c,n) for c,n in lst]}; verse ranges {[f(a)+('-'+f(z) if z!=a else '') for a,z in rngs]}")
# H-led rows inside verses that contain Aramaic (e.g. Dan 2:4's opening Hebrew words)
avs={v for v,_ in A}
print('H-led rows inside Aramaic-containing verses:',sum(1 for v,m in rows if v in avs and m.startswith('H')))
for v,m in rows:
    if v in avs and m.startswith('H'): print('  e.g.',v,m); break
