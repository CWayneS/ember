#!/usr/bin/env python3
"""Check whether STEP dStrong letter suffixes correspond to OSHB augment letters (gloss-word overlap heuristic).
Usage: hebrewlexicon_letters.py <openscriptures/HebrewLexicon checkout>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys,re,sqlite3,collections,xml.etree.ElementTree as ET
ROOT = __import__('pathlib').Path(__file__).resolve().parents[3]  # project root
HL=sys.argv[1]; NS='{http://openscriptures.github.com/morphhb/namespace}'
li={e.get('id'):(''.join(e.find(NS+'def').itertext()) if e.find(NS+'def') is not None else '') for e in ET.parse(f'{HL}/LexicalIndex.xml').getroot().iter(NS+'entry')}
aug={w.get('aug'):w.text for w in ET.parse(f'{HL}/AugIndex.xml').getroot().iter(NS+'w')}
con=sqlite3.connect(f'file:{ROOT}/data/language.db?mode=ro&immutable=1',uri=True)
rows=con.execute("select strongs_number,max(gloss_dictionary),max(lemma) from original_words where language='hebrew' group by 1").fetchall()
words=lambda s:set(w for w in re.findall(r'[a-z]+',(s or '').lower()) if len(w)>2 and w not in{'the','and','for','one','who'})
C=collections.Counter(); bad=[]
letters=collections.Counter()
for sn,gl,lem in rows:
    m=re.match(r'^H(\d+)([A-Za-z]?)$',sn); num=str(int(m.group(1))); L=m.group(2)
    if L: letters[L]+=1
    if not L or (num+L.lower()) not in aug: continue
    mine=li[aug[num+L.lower()]]; others=[li[aug[k]] for k in aug if re.fullmatch(num+r'[a-z]',k) and k!=num+L.lower()]
    g=words(gl.replace('_',' ') if gl else '')
    hit=bool(g & words(mine)); ohit=any(g & words(o) for o in others)
    grp='A-F' if L<='F' else 'G+'
    C[(grp,'same-letter gloss overlap' if hit else ('overlaps a DIFFERENT letter' if ohit else 'no overlap either'))]+=1
    if not hit and ohit and len(bad)<8: bad.append((sn,gl,mine,others))
print('STEP letter distribution',sorted(letters.items()))
for k,v in sorted(C.items()): print(' ',k,v)
print('mismatch examples:'); [print('  ',b) for b in bad]
