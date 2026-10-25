#!/usr/bin/env python3
"""Re-read TAHOT with build_language.py's own skip rules and zip against stored Hebrew rows (id order).
Use the TAHOT files from the build commit (faf6a35), not master, or rows won't line up.
Usage: tahot_join.py <dir with the 4 TAHOT files> <out joined.pkl>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys, re, sqlite3, pickle, glob
ROOT = __import__('pathlib').Path(__file__).resolve().parents[3]  # project root
sys.path.insert(0,str(ROOT/'scripts'))
import build_language as bl
RAW=sys.argv[1]
files=[f"{RAW}/TAHOT {n} - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt" for n in ['Gen-Deu','Jos-Est','Job-Sng','Isa-Mal']]
raws=[]; skipped=[]; allrows=[]
for f in files:
    for ln,line in enumerate(open(f,encoding='utf-8'),1):
        cols=line.rstrip('\n').split('\t')
        if len(cols)<12: continue
        m=bl.TAHOT_REF_RE.match(cols[0])
        if not m or m.group(1) not in bl.BOOK_ID: continue
        allrows.append((f.split('/')[-1][:13],ln,cols))
        if not cols[1].strip(): skipped.append((f.split('/')[-1][:13],ln,cols)); continue
        raws.append((f.split('/')[-1][:13],ln,cols))
con=sqlite3.connect(f'file:{ROOT}/data/language.db?mode=ro&immutable=1',uri=True)
db=con.execute("select id,verse_id,word_position,surface_text,transliteration,lemma,gloss_contextual,gloss_dictionary,strongs_number,morph_code,group_id from original_words where language='hebrew' order by id").fetchall()
print('raw data rows',len(allrows),'kept',len(raws),'skipped',len(skipped),'db',len(db))
mism=0
for (fn,ln,c),r in zip(raws,db):
    if c[1]!=r[3] or (c[5] or None)!=r[9]: mism+=1
print('surface/morph mismatches',mism)
pickle.dump({'raws':raws,'db':db,'skipped':skipped,'all':allrows},open(sys.argv[2],'wb'))
