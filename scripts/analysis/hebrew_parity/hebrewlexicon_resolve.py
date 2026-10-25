#!/usr/bin/env python3
"""Classify BDB entries (def / prose / stub) and resolve distinct Hebrew strongs_number values via AugIndex -> LexicalIndex -> BDB.
Usage: hebrewlexicon_resolve.py <openscriptures/HebrewLexicon checkout>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys, re, sqlite3, collections, xml.etree.ElementTree as ET
ROOT = __import__('pathlib').Path(__file__).resolve().parents[3]  # project root
HL=sys.argv[1]; NS='{http://openscriptures.github.com/morphhb/namespace}'
def txt(e): return ''.join(e.itertext())
bdb={}
for e in ET.parse(f'{HL}/BrownDriverBriggs.xml').getroot().iter(NS+'entry'):
    s=e.find(NS+'status'); status=s.text if s is not None else None
    defs=[d for d in e.iter(NS+'def')]
    # text minus <w> headwords and status
    parts=[]
    def walk(x,skip=False):
        if x.text and not skip: parts.append(x.text)
        for c in x:
            walk(c, skip=c.tag in (NS+'w',NS+'status'))
            if c.tail: parts.append(c.tail)
    walk(e)
    rest=re.sub(r'\s+',' ',''.join(parts)).strip()
    xref_only=bool(re.fullmatch(r"[\[\]\(\)\s,.;:IV]*(v\.|q\.v\.|see|sub\.?|cf\.)?.*",rest)) and status=='made'
    if status=='made': k='STUB: made (cross-ref "v. X")'
    elif defs: k='DEF: has <def>'
    elif len(re.sub(r'[\W\d_]','',rest))>=8: k='PROSE: no <def> but descriptive text'
    else: k='STUB: headword only / near-empty'
    bdb[e.get('id')]=dict(status=status,kind=k,rest=rest)
C=collections.Counter(v['kind'] for v in bdb.values()); print('BDB',len(bdb),dict(C))
for k in C:
    exs=[(i,v['status'],v['rest'][:90]) for i,v in bdb.items() if v['kind']==k][:3]; print('  ',k,exs)
print('PROSE by status',collections.Counter(v['status'] for v in bdb.values() if v['kind'].startswith('PROSE')))
print('headword-only by status',collections.Counter(v['status'] for v in bdb.values() if 'headword' in v['kind']))
li={}
for part in ET.parse(f'{HL}/LexicalIndex.xml').getroot().iter(NS+'part'):
    for e in part.iter(NS+'entry'):
        x=e.find(NS+'xref'); d=e.find(NS+'def')
        li[e.get('id')]=dict(bdb=x.get('bdb') if x is not None else None,defn=txt(d).strip() if d is not None else None)
aug={w.get('aug'):w.text for w in ET.parse(f'{HL}/AugIndex.xml').getroot().iter(NS+'w')}
con=sqlite3.connect(f'file:{ROOT}/data/language.db?mode=ro&immutable=1',uri=True)
rows=con.execute("select strongs_number,count(*),max(gloss_dictionary) from original_words where language='hebrew' group by 1").fetchall()
R=collections.Counter(); W=collections.Counter(); D=collections.Counter(); DW=collections.Counter(); unk=[]
for sn,n,gl in rows:
    m=re.match(r'^H(\d+)([A-Za-z]?)$',sn); num=str(int(m.group(1))); L=m.group(2)
    if int(num)>=9000: route='H9xxx STEP-only'; key=None
    else:
        has_letters=any(re.fullmatch(num+r'[a-z]',k) for k in aug)
        if L and (num+L.lower()) in aug: route='STEP letter == OSHB aug letter'; key=num+L.lower()
        elif L and num in aug: route='STEP letter -> OSHB bare (aug has no letters)'; key=num
        elif L: route='STEP letter, OSHB has letters but not this one'; key=None
        elif num in aug: route='STEP bare -> OSHB bare'; key=num
        elif has_letters: route='STEP bare, OSHB only lettered (ambiguous)'; key=None
        else: route='not in AugIndex'; key=None
    R[route]+=1; W[route]+=n
    if key:
        e=li[aug[key]]; b=bdb.get(e['bdb']) if e['bdb'] else None
        res=b['kind'].split(':')[0] if b else 'LI entry w/o BDB'
        if res!='DEF' and res!='PROSE' and e['defn']: res+=' (LI <def> gloss available)'
    else: res='no mapping'
    D[(route,res)]+=1; DW[(route,res)]+=n
    if route=='STEP letter, OSHB has letters but not this one' and len(unk)<8: unk.append((sn,gl,{k:li[aug[k]]['defn'] for k in aug if re.fullmatch(num+r'[a-z]',k)}))
tot=len(rows)-13; totw=sum(n for s,n,_ in rows if int(s[1:5] if s[1:5].isdigit() else 0)<9000)
print('distinct',len(rows),'(excl H9xxx:',tot,') occurrences excl H9xxx',totw)
for k in R: print(f'  {k}: {R[k]} distinct / {W[k]} occ')
print('RESOLUTION:')
for k in sorted(D): print(f'  {k}: {D[k]} / {DW[k]}')
for res in ('DEF','PROSE'):
    pass
dd=sum(v for (r,s),v in D.items() if s=='DEF'); dp=sum(v for (r,s),v in D.items() if s=='PROSE')
wd=sum(v for (r,s),v in DW.items() if s=='DEF'); wp=sum(v for (r,s),v in DW.items() if s=='PROSE')
print(f'DEF: {dd}/{tot} = {100*dd/tot:.1f}% distinct, {100*wd/totw:.1f}% occ; DEF+PROSE: {dd+dp} = {100*(dd+dp)/tot:.1f}% distinct, {100*(wd+wp)/totw:.1f}% occ')
print('samples letter-not-in-OSHB:'); [print('  ',u) for u in unk]
for s in ['H0834A','H1121G','H0408','H6213H','H1004M','H0430G','H7225G','H1254A','H0776G']:
    m=re.match(r'^H(\d+)([A-Za-z]?)$',s); num=str(int(m.group(1)))
    ks=[k for k in aug if re.fullmatch(num+r'[a-z]?',k)]
    print(' ',s,[(k,aug[k],li[aug[k]]['defn'],li[aug[k]]['bdb'],bdb.get(li[aug[k]]['bdb'],{}).get('kind'),bdb.get(li[aug[k]]['bdb'],{}).get('rest','')[:60]) for k in ks])
