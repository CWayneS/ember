#!/usr/bin/env python3
"""Raw TAHOT vs stored row for a handful of sample words; Ketiv/Qere column accounting.
Usage: tahot_examples.py <joined.pkl>

Read-only investigation script for the Hebrew parity spec (see README.md here)."""
import sys
import pickle, re, collections
d=pickle.load(open(sys.argv[1],'rb'))
want={'Gen.1.1#01=L','Gen.1.1#07=L','Gen.1.3#01=L','Gen.2.2#05=L','Gen.9.21#07=Q(K)'}
cols=['id','verse_id','word_position','surface_text','transliteration','lemma','gloss_contextual','gloss_dictionary','strongs_number','morph_code','group_id']
for (fn,ln,c),r in zip(d['raws'],d['db']):
    if c[0] in want:
        print('='*20,c[0],f'({fn} line {ln})')
        print(' RAW col1 Hebrew :',c[1]); print(' RAW col2 translit:',c[2]); print(' RAW col3 English :',c[3]); print(' RAW col4 dStrongs:',c[4]); print(' RAW col5 Grammar :',c[5]); print(' RAW col7/8 var   :',repr(c[6][:150]),repr(c[7][:100])); print(' RAW col12 Expanded:',c[11])
        print(' STORED:',dict(zip(cols,r)))
# K/Q accounting
C=collections.Counter()
for fn,ln,c in d['all']:
    t=c[0].split('=',1)[1]
    if t.startswith('Q'):
        C[t+' rows']+=1
        if 'K=' in c[6]: C[t+' K= in MeaningVariant']+=1
        if 'K=' in c[7]: C[t+' K= in SpellingVariant']+=1
        if 'L=' in c[7]: C[t+' L= in SpellingVariant']+=1
        if not c[1].strip(): C[t+' empty Hebrew (ghost)']+=1
    if c[6].strip(): C['any MeaningVariant']+=1
    if c[7].strip(): C['any SpellingVariant']+=1
    if t!='L': C['non-plain-L type']+=1
print(dict(C))
# Gen.2.2 check
