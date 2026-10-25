#!/usr/bin/env python3
"""Per-piece (/) preservation: what import keeps vs drops from TAHOT for each Hebrew row.
Usage: tahot_segments.py <joined.pkl>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys
import pickle, re, collections
d=pickle.load(open(sys.argv[1],'rb'))
C=collections.Counter()
def segs_dstr(s):  # split dStrongs into '/' pieces and '\' punctuation
    main=s.split('\\')[0]; return [p for p in main.split('/')]
ex=collections.defaultdict(list)
for (fn,ln,c),r in zip(d['raws'],d['db']):
    _,vid,wp,surf,tr,lem,gc,gd,sn,mc,gid=r
    C['rows']+=1
    C['surface==col1']+= surf==c[1]
    C['translit==col2']+= (tr or '')==c[2]
    C['gloss_ctx==col3']+= (gc or '')==c[3]
    C['morph==col5']+= (mc or '')==c[5]
    ms=mc.split('/') if mc else []
    ds=segs_dstr(c[4])
    if len(ms)>1: C['multi-piece morph']+=1
    if '/' in surf: C['surface has /']+=1
    if '\\' in surf: C['surface has \\ (punct)']+=1
    if '/' in (gc or ''): C['gloss_ctx has /']+=1
    if len(ds)>1: C['multi-piece dStrongs']+=1
    if len(ds)==len(ms): C['dStrong pieces == morph pieces']+=1
    else: ex['dstr!=morph'].append((c[0],c[4],c[5]))
    sp=surf.split('\\')[0].split('/')
    if len(sp)==len(ms): C['surface pieces == morph pieces']+=1
    else: ex['surf!=morph'].append((c[0],surf,c[5]))
    gp=(c[3]).split('/')
    if len(gp)==len(ms): C['col3 pieces == morph pieces']+=1
    else: ex['col3!=morph'].append((c[0],c[3],c[5]))
    e=c[11].split('\\')[0].split('/')
    if len(e)==len(ms): C['col12 pieces == morph pieces']+=1
    else: ex['col12!=morph'].append((c[0],c[11][:80],c[5]))
    nonroot=[p for p in ds if not p.startswith('{')]
    C['non-root strongs pieces (dropped)']+=len(nonroot)
    if nonroot: C['rows w/ >=1 dropped prefix/suffix strongs']+=1
    pun=re.findall(r'\\(H\d+)',c[4]); C['punct strongs pieces (\\Hxxxx)']+=len(pun)
    roots=re.findall(r'\{[HG]\d+[A-Za-z]?\}',c[4])
    C[f'root tags {len(roots)}']+=1
    if sn and sn not in c[4]: C['strongs not from col5?']+=1
for k,v in C.items(): print(f'{k}: {v}')
for k,v in ex.items(): print(k,len(v),v[:5])
