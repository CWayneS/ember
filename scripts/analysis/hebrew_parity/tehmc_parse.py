#!/usr/bin/env python3
"""Parse TEHMC full-section records; report code count, key domain, format issues.
Usage: tehmc_parse.py <TEHMC.txt> <out tehmc_codes.json>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys, re, collections, json
path = sys.argv[1]
text = open(path, encoding='utf-8-sig').read()
start = text.index('FULL MORPHOLOGY CODES:')
full = text[start:]
lines = full.split('\n')
# chunk on lines that are exactly "$"
chunks=[]; cur=[]; lineno=text[:start].count('\n')+1
starts=[]
cs=lineno
for i,l in enumerate(lines):
    if l.strip()=='$':
        chunks.append((cs,cur)); cur=[]; cs=lineno+i+1
    else: cur.append(l)
chunks.append((cs,cur))
print('chunks', len(chunks), '(first is section preamble)')
codes=collections.OrderedDict(); issues=collections.defaultdict(list)
keys=collections.Counter(); keyvals=collections.defaultdict(collections.Counter)
code_re=re.compile(r'^[HA][A-Za-z0-9]+$')
for idx,(ln,ch) in enumerate(chunks[1:],1):
    nb=[l for l in ch if l.strip()]
    if not nb: issues['empty chunk'].append(ln); continue
    first=nb[0]
    if '\t' not in first:
        issues['first line no tab'].append((ln, first[:80])); continue
    code,kv=first.split('\t',1)
    code=code.strip()
    if not code_re.match(code): issues['odd code shape'].append((ln,code))
    if len(nb)!=4: issues['non-4-line record'].append((ln,code,len(nb)))
    if any(not l.startswith('\t') for l in nb[1:]): issues['continuation line not tab-indented'].append((ln,code))
    if code in codes: issues['duplicate code'].append((ln,code))
    # hence-aware parse
    hence=re.findall(r'\(hence ([^)]*)\)', kv)
    base=re.sub(r'\s*\(hence [^)]*\)', '', kv)
    parts=[p.strip() for p in base.split(';') if p.strip()]
    pairs=[]
    for p in parts:
        if '=' not in p: issues['part without =' ].append((ln,code,p)); continue
        k,v=p.split('=',1); pairs.append((k.strip(),v.strip(),'main'))
    for h in hence:
        for p in h.split(';'):
            p=p.strip()
            if not p: continue
            if '=' not in p: issues['hence part without ='].append((ln,code,p)); continue
            k,v=p.split('=',1); pairs.append((k.strip(),v.strip(),'derived'))
    if '(' in base or ')' in base: issues['unbalanced/other parens'].append((ln,code,kv[:120]))
    if re.search(r';\s*$', kv.rstrip()): issues['trailing semicolon'].append(code)
    if kv!=kv.rstrip(): issues['trailing whitespace'].append(code)
    ks=[k for k,_,_ in pairs]
    if len(ks)!=len(set(ks)): issues['repeated key in record'].append((code,ks))
    # naive TEGMC-style split check
    naive=[p.strip() for p in kv.split(';') if p.strip()]
    if any('=' not in p for p in naive): issues['naive ;-split breaks (part w/o =)'].append(code)
    for k,v,src in pairs:
        keys[(k,src)]+=1; keyvals[k][v]+=1
    codes[code]=pairs
print('codes', len(codes), 'H:',sum(c[0]=='H' for c in codes),'A:',sum(c[0]=='A' for c in codes))
print('KEYS:'); 
for (k,s),n in sorted(keys.items()): print(f'  {k!r} [{s}] {n}')
print('VALUES:')
for k,c in keyvals.items(): print(' ',k, dict(c.most_common()))
print('ISSUES:')
for k,v in issues.items(): print(' ',k,len(v), v[:12])
json.dump({c:[[k,v,s] for k,v,s in p] for c,p in codes.items()}, open(sys.argv[2],'w'))
