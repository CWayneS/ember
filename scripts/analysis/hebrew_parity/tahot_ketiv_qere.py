#!/usr/bin/env python3
"""TAHOT text-type distribution, Ketiv/Qere variant columns, skipped ghost rows, "//" rows, two-root rows.
Usage: tahot_ketiv_qere.py <joined.pkl>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys
import pickle, re, collections
d=pickle.load(open(sys.argv[1],'rb'))
tt=collections.Counter(); ex=collections.defaultdict(list)
for fn,ln,c in d['all']:
    t=c[0].split('=',1)[1]; tt[t]+=1
    if len(ex[t])<2: ex[t].append((c[0],c[1],c[3],c[4],c[5],c[6][:60],c[7][:90]))
print('TEXT TYPES (all data rows):'); 
for t,n in tt.most_common(): print(f'  {t!r}: {n}')
print('EXAMPLES:')
for t,v in ex.items(): print(' ',t); [print('     ',x) for x in v]
# variant columns
mv=sum(1 for _,_,c in d['all'] if c[6].strip()); sv=sum(1 for _,_,c in d['all'] if c[7].strip())
print('rows with Meaning variants col7:',mv,' Spelling variants col8:',sv)
kq_in_sv=collections.Counter()
for _,_,c in d['all']:
    for m in re.findall(r'\b([KQLRBHPSVX][A-Za-z]*)=',c[7]): kq_in_sv[m]+=1
print('labels in spelling-variant col:',kq_in_sv.most_common(20))
print('SKIPPED ghost rows:')
for fn,ln,c in d['skipped']: print('  ',c[0],repr(c[1]),repr(c[3]),c[4],c[5],'|',c[7][:100])
print('// rows:')
for (fn,ln,c),r in zip(d['raws'],d['db']):
    if '//' in c[5]: print('  ',c[0],c[1],'|',c[3],'|',c[4],'|',c[5],'| sv:',c[7][:80])
print('2-root rows:')
n=0
for (fn,ln,c),r in zip(d['raws'],d['db']):
    if len(re.findall(r'\{[HG]\d+[A-Za-z]?\}',c[4]))==2:
        n+=1
        if n<=8: print('  ',c[0],c[1],'|',c[4],'|',c[5],'| stored strongs:',r[8])
