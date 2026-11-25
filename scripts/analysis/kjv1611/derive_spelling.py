#!/usr/bin/env python3
"""
derive_spelling.py — Derive build/context/1611-spelling.tsv, the word list that
modernizes the spelling of the 1611 chapter summaries (docs/Info_Tab_Spec.md,
Item 4, "Editorial convention").

Usage (from project root):
    python3 -I scripts/analysis/kjv1611/derive_spelling.py CHAPS_DIR

CHAPS_DIR holds lb42/KJV_1611's chaps/*.xml at the commit scripts/build_context.py
pins (its --raw-dir has them under KJV_1611/chaps after a build). Writes the list
and prints a summary. build_context.py reads the list; nothing in the app does.

The rule is "modernize spelling only; never change a word": u/v, i/j, y/i, final
and doubled letters, the printers' macron for a dropped m or n, and the like.
Each summary word gets its modern spelling from evidence, in this order:

1. aligned:   the 1611 verse text against Ember's KJV, which is the 1769 standard
              edition of the same translation in modern spelling. Verse by verse,
              words are paired where their spelling skeletons agree (see skeleton());
              a word takes the 1769 spelling it is paired with at least 90% of the
              time. A word the 1769 editors wrote two ways (doeth/doth, borne/born)
              stays as printed, and so does one they changed into another word
              (then→than: the skeletons differ, so it is never paired).
2. rule:      a word not in the verse text is rewritten by the same kinds of
              change, at most three at a time (rule_candidates()), and takes the
              first result that is a word in the 1769 KJV or, failing that, in
              modern English as Ember's other texts use it (ASV, WEB, BSB, Darby,
              STEPBible's descriptions, the Greek and Hebrew lexicons' English).
3. possessive: "Dauids" is "Davids" when "Dauid" is "David" (no apostrophe is added:
              punctuation stays as printed).
4. manual:    MANUAL below, each with its reason.
A word with none of these stays as printed and is listed as such, for review.
REJECTED removes a derived change that is wrong, with its reason.
"""

import collections
import difflib
import html
import os
import re
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
OUTPUT = PROJECT_ROOT / 'build' / 'context' / '1611-spelling.tsv'
DATA = PROJECT_ROOT / 'data'

WORD = re.compile(r"[A-Za-zÀ-ÿĀ-ſ]+")
MACRON = {'ā': 'a', 'ē': 'e', 'ī': 'i', 'ō': 'o', 'ū': 'u'}
AGREEMENT = 0.9

# Changes no evidence finds, each a spelling the 1611 printers used for a
# word still in use. (printed, modern, reason)
MANUAL = [
    ('shalbe', 'shall be', 'the printers joined "shall be" into one word'),
    ('iland', 'island', 'the s is a later spelling; no rule adds a letter'),
    ('yere', 'year', 'the rules read the y as an i and then a j'),
    ('yeres', 'years', 'as yere'),
    ('restauration', 'restoration', 'au for o; too rare a change to make a rule of'),
    ('drunkennes', 'drunkenness', 'one s for two'),
    ('iury', 'jewry', 'Iury is Jewry (Judea), as the 1769 KJV spells it; "jury" would read as another word'),
    # Old spellings the evidence and rules don't reach; each is the same word.
    ('charet', 'chariot', 'old spelling'), ('charets', 'chariots', 'old spelling'),
    ('creeple', 'cripple', 'old spelling'), ('morgage', 'mortgage', 'old spelling'),
    ('kinred', 'kindred', 'old spelling'), ('murthering', 'murdering', 'old spelling'),
    ('murtherers', 'murderers', 'old spelling'), ('gardian', 'guardian', 'old spelling'),
    ('pedegree', 'pedigree', 'old spelling'), ('carkeis', 'carcass', 'old spelling'),
    ('carkeises', 'carcasses', 'old spelling'), ('councellour', 'counsellor', 'old spelling'),
    ('cowardize', 'cowardice', 'old spelling'), ('speach', 'speech', 'old spelling'),
    ('chuse', 'choose', 'old spelling'), ('chuseth', 'chooseth', 'old spelling'),
    ('counsaile', 'counsel', 'old spelling'), ('counsaileth', 'counselleth', 'old spelling'),
    ('accompt', 'account', 'old spelling'), ('approcheth', 'approacheth', 'old spelling'),
    ('doung', 'dung', 'old spelling'), ('morter', 'mortar', 'old spelling'),
    ('renued', 'renewed', 'old spelling'), ('renueth', 'reneweth', 'old spelling'),
    ('striken', 'stricken', 'old spelling'), ('stubburne', 'stubborn', 'old spelling'),
    ('spight', 'spite', 'old spelling'), ('spightfulnesse', 'spitefulness', 'old spelling'),
    ('marueile', 'marvel', 'old spelling'), ('marueilous', 'marvellous', 'old spelling'),
    ('trecherie', 'treachery', 'old spelling'), ('trecherously', 'treacherously', 'old spelling'),
    ('villenously', 'villainously', 'old spelling'), ('villanously', 'villainously', 'old spelling'),
    ('asswage', 'assuage', 'old spelling'), ('disswadeth', 'dissuadeth', 'old spelling'),
    ('disswading', 'dissuading', 'old spelling'), ('disswaded', 'dissuaded', 'old spelling'),
    ('dissention', 'dissension', 'old spelling'), ('dissentions', 'dissensions', 'old spelling'),
    ('raigne', 'reign', 'old spelling'), ('raigning', 'reigning', 'old spelling'),
    ('surprize', 'surprise', 'old spelling'), ('wholely', 'wholly', 'old spelling'),
    ('vprore', 'uproar', 'old spelling'), ('intisings', 'enticings', 'old spelling'),
    ('imbraced', 'embraced', 'old spelling'), ('imbroidered', 'embroidered', 'old spelling'),
    ('lengthned', 'lengthened', 'old spelling'), ('hindreth', 'hindereth', 'old spelling'),
    ('desperatly', 'desperately', 'old spelling'), ('scandall', 'scandal', 'old spelling'),
    ('publikely', 'publicly', 'old spelling'), ('propheticall', 'prophetical', 'old spelling'),
    ('prodigall', 'prodigal', 'old spelling'), ('lunatike', 'lunatic', 'old spelling'),
    ('wrongfull', 'wrongful', 'old spelling'), ('reprochfull', 'reproachful', 'old spelling'),
    ('reproches', 'reproaches', 'old spelling'), ('shipwracke', 'shipwreck', 'old spelling'),
    ('stratageme', 'stratagem', 'old spelling'), ('therto', 'thereto', 'old spelling'),
    ('sencible', 'sensible', 'old spelling'), ('renowmed', 'renowned', 'old spelling'),
    ('roume', 'room', 'old spelling'), ('rowle', 'roll', 'old spelling'), ('roule', 'roll', 'old spelling'),
    ('receit', 'receipt', 'old spelling'), ('receite', 'receipt', 'old spelling'),
    ('extreame', 'extreme', 'old spelling'), ('chalenge', 'challenge', 'old spelling'),
    ('chalengeth', 'challengeth', 'old spelling'), ('clensing', 'cleansing', 'old spelling'),
    ('clenseth', 'cleanseth', 'old spelling'), ('conueigheth', 'conveyeth', 'old spelling'),
    ('inconuenience', 'inconvenience', 'old spelling'), ('inueyeth', 'inveigheth', 'old spelling'),
    ('adioine', 'adjoin', 'old spelling'), ('vnaduised', 'unadvised', 'old spelling'),
    ('aduancement', 'advancement', 'old spelling'), ('solliciteth', 'soliciteth', 'old spelling'),
    ('fift', 'fifth', 'old spelling'), ('sixt', 'sixth', 'old spelling'),
    ('leuen', 'leaven', 'old spelling'), ('yeerely', 'yearly', 'old spelling'),
    ('souldiers', 'soldiers', 'old spelling'), ('gratious', 'gracious', 'old spelling'),
    ('ielousie', 'jealousy', 'old spelling'), ('folishnesse', 'foolishness', 'old spelling'),
    ('sickenes', 'sickness', 'old spelling'), ('thankefulnesse', 'thankfulness', 'old spelling'),
    ('vnthankefulnesse', 'unthankfulness', 'old spelling'), ('vntollerable', 'untolerable', 'old spelling'),
    ('vnfained', 'unfeigned', 'old spelling'), ('faining', 'feigning', 'old spelling'),
    ('commaundements', 'commandments', 'old spelling'), ('goareth', 'goreth', 'old spelling'),
    ('sheepeshearing', 'sheepshearing', 'old spelling'), ('scornefully', 'scornfully', 'old spelling'),
    ('seruaunt', 'servant', 'old spelling'), ('sowre', 'sour', 'old spelling'),
    ('imbecillity', 'imbecility', 'old spelling'),
    # Slips in the transcription or the print (docs/DATA_QUIRKS.md): the 1611 spelling view keeps them.
    ('miraracles', 'miracles', 'a slip: a doubled syllable'),
    ('canstlesticks', 'candlesticks', 'a slip: st for d'),
    ('triumpheh', 'triumpheth', 'a slip: a dropped t'),
    ('iudement', 'judgement', 'a slip: a dropped g'),
]
# Derived changes that are wrong. (printed, reason)
REJECTED = [
    ('humane', 'a different word now; glossed instead (1611-glosses.tsv)'),
    ('fulfill', "already today's spelling; the 1769 edition changed it to fulfil"),
    ('scepter', "already today's spelling; the 1769 edition changed it to sceptre"),
    ('kiriath', "already today's spelling; the 1769 edition changed it to Kirjath"),
]


# ---- Reading -------------------------------------------------------------------

def clean(markup):
    """Text of a TEI fragment: notes dropped, tags removed, entities decoded."""
    text = re.sub(r'<note>.*?</note>', '', markup, flags=re.S)
    text = html.unescape(re.sub(r'<[^>]+>', '', text))
    return re.sub(r'\s+', ' ', text).strip()


def book_ids():
    con = sqlite3.connect(f'file:{DATA / "core.db"}?mode=ro', uri=True)
    try:
        return {name: (book_id, chapters) for book_id, name, chapters in con.execute('SELECT id, name, chapters FROM books')}
    finally:
        con.close()


def read_chapters(chaps_dir):
    """{(book, chapter): (summary or None, {verse: text})} for the 66 books."""
    books = book_ids()
    chapters = {}
    for path in sorted(chaps_dir.glob('*.xml')):
        stem, _, number = path.stem.rpartition('_')
        book = books.get(stem.replace('-', ' '))
        if not book or int(number) > book[1]:
            continue   # the Apocrypha, and Esther 11-16 (the Additions)
        text = path.read_text(encoding='utf-8')
        heads = [clean(head) for head in re.findall(r'<head>(.*?)</head>', text, re.S)]
        verses = {int(n): clean(verse) for n, verse in re.findall(r'<ab n="(\d+)">(.*?)</ab>', text, re.S)}
        chapters[(book[0], int(number))] = (heads[1] if len(heads) > 1 else None, verses)
    return chapters


def words_of(texts):
    counts = collections.Counter()
    for text in texts:
        counts.update(word.lower() for word in WORD.findall(text))
    return counts


# ---- Evidence --------------------------------------------------------------------

def skeleton(word, printed=False):
    """What spelling changes can't alter: lower case, þ as th, u/v, i/j and y/i
    merged, doubled letters single, no e. In a 1611 word a macron vowel keeps a
    "~" mark for the m or n it stands for."""
    word = word.lower().replace('þ', 'th').replace('æ', 'ae')
    if printed:
        word = ''.join(MACRON[letter] + '~' if letter in MACRON else letter for letter in word)
    word = word.replace('v', 'u').replace('j', 'i').replace('y', 'i')
    return re.sub(r'(.)\1+', r'\1', word).replace('e', '')


def same_word(printed, modern):
    old, new = skeleton(printed, printed=True), skeleton(modern)
    return re.fullmatch('[mn]?'.join(re.escape(part) for part in old.split('~')), new) is not None


def aligned_pairs(chapters):
    """{1611 word: Counter of the 1769 spellings it's paired with}."""
    con = sqlite3.connect(f'file:{DATA / "translations" / "kjv.db"}?mode=ro', uri=True)
    pairs = collections.defaultdict(collections.Counter)
    for (book, chapter), (_summary, verses) in chapters.items():
        modern = dict(con.execute('SELECT verse, text FROM verses WHERE book = ? AND chapter = ? AND verse > 0', (book, chapter)))
        for verse, text in verses.items():
            old_words, new_words = WORD.findall(text), WORD.findall(modern.get(verse, ''))
            matcher = difflib.SequenceMatcher(None, [skeleton(word, True) for word in old_words],
                                              [skeleton(word) for word in new_words], autojunk=False)
            for tag, i1, i2, j1, j2 in matcher.get_opcodes():
                if tag == 'equal' or (tag == 'replace' and i2 - i1 == j2 - j1):
                    for old, new in zip(old_words[i1:i2], new_words[j1:j2]):
                        if same_word(old, new):
                            pairs[old.lower()][new.lower()] += 1
    con.close()
    return pairs


def vocabularies():
    """(the 1769 KJV's words, modern English words from Ember's other texts)."""
    def texts(path, query):
        con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        try:
            return [re.sub(r'<[^>]+>', ' ', row[0] or '') for row in con.execute(query)]
        finally:
            con.close()
    kjv = words_of(texts(DATA / 'translations' / 'kjv.db', 'SELECT text FROM verses'))
    modern = collections.Counter()
    for name in ('asv', 'web', 'bsb', 'darby'):
        path = DATA / 'translations' / f'{name}.db'
        if path.exists():
            modern += words_of(texts(path, 'SELECT text FROM verses'))
    modern += words_of(texts(DATA / 'context.db', 'SELECT summary FROM context_names'))
    modern += words_of(texts(DATA / 'language.db', 'SELECT meaning FROM step_lexicon_greek'))
    modern += words_of(texts(DATA / 'lexicon-hebrew.db', 'SELECT body_markup FROM lexicon_bdb_hebrew'))
    return kjv, modern


# The kinds of change the 1611 spelling makes, as rewrites of the printed word,
# each only where it happens: (pattern, replacement). A first draft that let an
# "e" go anywhere, or an m or n follow any vowel, turned Esay (Isaiah) into "say"
# and iland into "inland"; these are the narrowed forms.
REWRITES = [
    ('v', 'u'), ('u', 'v'),                      # vnto, loue
    ('i(?=[aeiou])', 'j'),                       # Iacob, reiection
    ('y', 'i'), ('(?<=[a-z])i', 'y'),            # complayning; ciuill
    ('ie$', 'y'), ('ie(?=s$)', 'ie'),            # impietie
    ('ee', 'ie'), ('ee', 'ea'), ('ee', 'e'),     # beleeue, yeere, neere
    ('oo', 'o'), ('ou', 'ow'),                   # reprooue, foules
    ('ise$', 'ice'),                             # thrise, twise
    ('^ca', 'cha'), ('^hie', 'je'),              # Caldeans, Hierusalem
    ('(?<=.)e$', ''), ('(?<=it)e(?=s$)', ''),    # himselfe, benefites
    ('ee(?=r?e?s$)', 'ea'), ('(?<=[aeiou][b-df-hj-np-rtv-z])e(?=s$)', ''),  # yeeres, foules (not mistresses)
    ('^in', 'en'),                               # incourageth, inlargement
    ('(?<=s)w', 'u'),                            # perswadeth
    ('^yo', 'you'),                              # yong
    ('our(?=s?$)', 'or'),                        # errour, gouernour (as the 1769 KJV has them)
    ('^proph(?=an)', 'prof'),                    # prophane
    ('ike$', 'ic'),                              # publike
    ('ce$', 'se'),                               # sence
    ('ei', 'ai'),                                # obteineth
    ('ti(?=an)', 'ci'),                          # magitians
    ('(?<=h)ea(?=rd)', 'e'),                     # shepheard
    ('(?<=v)e(?=r)', 'i'), ('(?<=u)e(?=r)', 'i'),  # vertue
    ('dge$', 'ge'),                              # sacriledge, priuiledge
    ('aund', 'and'),                             # commaunded
    ('ou(?=[rl])', 'o'), ('(?<=f)ou', 'o'),      # souldiers, fourtie
] + [(letter * 2, letter) for letter in 'bcdfgklmnprst']   # ciuill, festiuall
MIN_RULE_LENGTH = 4   # hy, hie and the like are left alone


def rule_candidates(word, depth=3):
    """Spellings reachable by up to `depth` rewrites, nearest first."""
    # A macron vowel is the vowel followed by m or n.
    starts = {''.join(MACRON.get(letter, letter) for letter in word)}
    if any(letter in MACRON for letter in word):
        for consonant in 'mn':
            starts.add(''.join(MACRON[letter] + consonant if letter in MACRON else letter for letter in word))
    frontier, seen = sorted(starts), set(starts)
    yield sorted(starts - {word})   # a macron spelled out may already be the word
    for _ in range(depth):
        following = []
        for current in frontier:
            for pattern, new in REWRITES:
                for match in re.finditer(pattern, current):
                    candidate = current[:match.start()] + new + current[match.end():]
                    if candidate not in seen:
                        seen.add(candidate)
                        following.append(candidate)
        yield sorted(following)
        frontier = following


def by_rule(word, kjv, modern):
    """The nearest rewrite that is a 1769 KJV word, else a common modern word (at
    least twice in Ember's other texts), with the basis; None if there's none."""
    if word in modern or word in kjv or len(word) < MIN_RULE_LENGTH:
        return None
    for level in rule_candidates(word):
        in_kjv = [candidate for candidate in level if candidate in kjv]
        if in_kjv:
            best = max(in_kjv, key=lambda candidate: kjv[candidate])
            return best, f'rule; a 1769 KJV word ({kjv[best]}x)'
        in_modern = [candidate for candidate in level if modern[candidate] >= 2]
        if in_modern:
            best = max(in_modern, key=lambda candidate: modern[candidate])
            return best, f'rule; modern English ({modern[best]}x in Ember\'s other texts)'
    return None


# The 1611 printers' own conventions, which hold without exception in these
# summaries: u and v were one letter, written v at the start of a word and u
# inside it, so an initial v before a consonant is the vowel and a u between
# vowels is the consonant (not after q or g: quiet, guide); I was also J, so an
# initial I before a vowel is J; final -ie after a consonant is -y; -nesse,
# -lesse and -nes are -ness and -less. Used last, for words nothing else
# resolves, since they make no word a different one; the result may still be
# partly old ("marueilous" → "marveilous").
CONVENTIONS = [
    (r'^v(?=[^aeiou])', 'u'),
    (r'(?<=[aeiou])(?<![qg]u)u(?=[aeiou])', 'v'),
    (r'^i(?=[aeiou])', 'j'),
    (r'(?<=[^aeiou])ie$', 'y'),
    (r'nesse$', 'ness'), (r'lesse$', 'less'), (r'nes$', 'ness'),
]


def by_convention(word):
    if len(word) < MIN_RULE_LENGTH:
        return None   # hie (hasten) stays
    changed = word
    for pattern, replacement in CONVENTIONS:
        changed = re.sub(pattern, replacement, changed)
    return (changed, "the printers' conventions") if changed != word else None


# Endings put back unchanged after the stem is modernized (-nesse and -lesse
# lose their e, as the stem's own rules would).
ENDINGS = (('nesse', 'ness'), ('lesse', 'less'), ('eth', 'eth'), ('ing', 'ing'), ('ed', 'ed'), ('s', 's'))


# ---- The list ---------------------------------------------------------------------

def derive(chaps_dir):
    chapters = read_chapters(chaps_dir)
    summary_words = words_of(summary for summary, _ in chapters.values() if summary)
    pairs = aligned_pairs(chapters)
    kjv, modern = vocabularies()
    rejected = dict(REJECTED)
    changes, kept, unresolved = {}, collections.Counter(), []

    def resolve(word):
        evidence = pairs.get(word)
        if evidence:
            best, count = evidence.most_common(1)[0]
            total = sum(evidence.values())
            if count / total >= AGREEMENT:
                others = ', '.join(f'{other} {n}' for other, n in evidence.most_common()[1:3])
                return (best, f'aligned {count}/{total}' + (f' (also {others})' if others else '')), 'agreed'
            return None, 'written both ways in 1769'
        found = by_rule(word, kjv, modern)
        if found:
            return found, 'rule'
        return None, 'known' if word in kjv or word in modern else 'unknown'

    def by_stem(word):
        """perswadeth → persuade + eth; Dauids → David + s. The stem must change by
        the evidence or a direct rule; the ending is never invented."""
        for ending, modern_ending in ENDINGS:
            if not word.endswith(ending) or len(word) - len(ending) < 3:
                continue
            stem = word[:-len(ending)]
            for printed_stem, added_e in ((stem, False), (stem + 'e', True)):
                found, _ = resolve(printed_stem)
                if found and found[0] != printed_stem:
                    modern_stem = found[0]
                    # A change only in the stem's last two letters is the ending's
                    # business: applie+th, beginn+eth and witche+s are right as printed.
                    if len(os.path.commonprefix([printed_stem, modern_stem])) >= len(printed_stem) - 2:
                        continue
                    # duetie → duty inside the word, but -ie stays before an ending: duties.
                    if printed_stem.endswith('ie') and modern_stem.endswith('y'):
                        modern_stem = modern_stem[:-1] + 'ie'
                    if added_e and modern_stem.endswith('e') and modern_ending[0] in 'aeiou':
                        modern_stem = modern_stem[:-1]
                    elif added_e and not modern_stem.endswith('e') and not modern_ending[0] in 'aeiou':
                        continue   # the e was the stem's own, and the rules dropped it
                    return (modern_stem + modern_ending, f'stem {printed_stem} → {found[0]}, ending kept')
        return None

    for word in sorted(summary_words):
        result, how = resolve(word)
        if result is None and how == 'unknown':
            result = by_stem(word)
            how = 'stem' if result else how
        if result is None and how == 'unknown':
            result = by_convention(word)
            how = 'convention' if result else how
        if result and result[0] != word and word not in rejected:
            changes[word] = result
        elif how == 'unknown':
            unresolved.append(word)
        else:
            kept[how] += 1
    for printed, modern_form, reason in MANUAL:
        changes[printed] = (modern_form, f'manual: {reason}')
    return changes, unresolved, kept, summary_words, rejected


def write(changes, unresolved, summary_words, rejected):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        '# 1611 chapter summaries: spelling modernized by this list, and only this list.',
        '# Generated by scripts/analysis/kjv1611/derive_spelling.py, which says how each change was found;',
        '# change MANUAL or REJECTED there and rerun it rather than editing this file.',
        '# A change is spelling only (u/v, i/j, y/i, e, doubled letters, macrons); words, word order and',
        '# punctuation stay as printed. Case follows the printed word.',
        '# Columns: printed (lower case), modern, uses in the summaries, basis.',
    ]
    for word in sorted(changes):
        modern_form, basis = changes[word]
        lines.append(f'{word}\t{modern_form}\t{summary_words.get(word, 0)}\t{basis}')
    lines.append('#')
    lines.append(f'# Left as printed, no evidence or rule found ({len(unresolved)}): review these.')
    for word in unresolved:
        lines.append(f'#\t{word}\t{summary_words[word]}')
    lines.append(f'# Rejected changes ({len(rejected)}):')
    for word, reason in sorted(rejected.items()):
        lines.append(f'#\t{word}\t{reason}')
    OUTPUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    changes, unresolved, kept, summary_words, rejected = derive(Path(sys.argv[1]))
    write(changes, unresolved, summary_words, rejected)
    bases = collections.Counter('convention' if basis.startswith('the printers') else basis.split(' ')[0].rstrip(';:')
                                for _modern, basis in changes.values())
    print(f'{len(summary_words)} distinct words in the summaries')
    print(f'  changed: {len(changes)} ({dict(bases)})')
    print(f'  unchanged: {dict(kept)}')
    print(f'  left as printed, unresolved: {len(unresolved)}')
    print(f'Wrote {OUTPUT.relative_to(PROJECT_ROOT)}')


if __name__ == '__main__':
    main()
