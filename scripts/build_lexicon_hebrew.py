#!/usr/bin/env python3
"""
build_lexicon_hebrew.py — Build data/lexicon-hebrew.db from the Open Scriptures
Hebrew Bible project's lexicon files (docs/Hebrew_Lexicon_Spec.md, Items 1, 2, 9).

Usage (run from project root):
    python3 -I scripts/build_lexicon_hebrew.py [--raw-dir DIR] [--output PATH] [--ship]

Downloads what it needs into data/lexicon-prep/raw/ (gitignored) at the pinned
commits below, refuses to build if any file's sha256 differs from the pinned
value, and writes:
    data/lexicon-prep/output/lexicon-hebrew.db   (build artifact; --output overrides)
    data/lexicon-hebrew.db                       (shipped copy, written only with --ship)

Sources:
    openscriptures/HebrewLexicon  BrownDriverBriggs.xml, HebrewStrong.xml,
                                  LexicalIndex.xml, AugIndex.xml
    openscriptures/morphhb        wlc/<book>.xml, the 39 book files. Only used to
                                  count how often each BDB entry occurs; no text
                                  from them goes into the database. wlc/VerseMap.xml
                                  has no lemmas and isn't read.

The files are CC BY 4.0 (credit: the Open Scriptures Hebrew Bible Project); the
BDB and Strong's text itself is public domain.

Rebuilding from unchanged sources with the same SQLite version gives a
byte-identical file: lexicon_meta has no build date, every table is filled in
document or sorted order, and nothing iterates over a set. SQLite writes its own
version number into the file header, so a different SQLite version can change
those bytes without changing any content.

The build stops, and does not ship, if a count moves far from
docs/Hebrew_Lexicon_Spec.md's Findings or the file exceeds 10 MB (Item 9).
After shipping, clear lexicon-hebrew.db from a dev install's OPFS and let it
re-seed.
"""

import argparse
import collections
import gzip
import hashlib
import re
import shutil
import sqlite3
import struct
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR      = PROJECT_ROOT / 'data' / 'lexicon-prep' / 'raw'
OUTPUT_DB    = PROJECT_ROOT / 'data' / 'lexicon-prep' / 'output' / 'lexicon-hebrew.db'
SHIPPED_DB   = PROJECT_ROOT / 'data' / 'lexicon-hebrew.db'

SOURCE_REPOSITORIES = {
    'HebrewLexicon': '21c9add13bc727d3a951361778e97e3ff7afd1ce',  # 2019-09-02
    'morphhb':       '3d15126fb1ef74867fc1434be1942e837932691f',  # 2024-08-27
}

LEXICON_SHA256 = {
    'AugIndex.xml':          'e7217ca8ff8ff3f21f9cf1bbe87411adf55f6aa88bcf5ed9ddc886cc6b160c5d',
    'BrownDriverBriggs.xml': '2b52658a4323d91674cda4090ab8b3ebddfff640f4f18143c28300e80b2c38f8',
    'HebrewStrong.xml':      'a628f4f89f8bdaf2483fd3faf1abc8653cc6717758dfc9f24beb7571d9bdd0c4',
    'LexicalIndex.xml':      '8f7a605c58899d2f44430149c143c00903976e1e91232476677972a69e5bc85f',
}

WLC_SHA256 = {
    '1Chr.xml':  '8b59992b6607c6ca0fc423813be8cc244f011c1da32bc8485c0c0f581a897ed4',
    '1Kgs.xml':  '832ba10f605dce34c4888ee0a795d91edc2b293391d6ae9c36c36c6350761a3e',
    '1Sam.xml':  '960432732c22286b82d80b6b25af8d10dc5f2e82a4e5e48b2e3a1b1eea17f3cb',
    '2Chr.xml':  '507294e8ca0fcf31ec25fe62fa24a7f2581f53116519bf08cfe96ff85e9c99fb',
    '2Kgs.xml':  '056db5393beaef0a1159d9bcaac7dfd865df9bab2eb240ea90e9fa3f0c0e7449',
    '2Sam.xml':  'e7793e141ed94eadbd2dfb23936abbb4062e81a7dcd41114a6e36644f50b8333',
    'Amos.xml':  '6ad94c6a18076762f1a458720c62156d354e5111ee25719b7792b70792d0084d',
    'Dan.xml':   'bc69d0fa9708dacb11ea6d587509250bf1bcc1b4343eac2d6e97f8b41518fc0d',
    'Deut.xml':  '04f8087442a1e67a631cd70f2ac4e42fe0a780ae132edb165a3a29f3f290358f',
    'Eccl.xml':  '2dfc858d19048f6479eca33b9fe781c2d7e9059e9ae3ab0b37b802d3afec02bb',
    'Esth.xml':  'f9b5b8adaf504dcac409bb6a27c9328967f47eeb4e920070cd53ef5301299019',
    'Exod.xml':  '04868367cdacb6ccdc61488e923e20f918172042e6437842a0621f63ac5b847f',
    'Ezek.xml':  '90bf8adfa66b2f6695c702263fe668755c99c6afc386202c12de4f704f5d4e46',
    'Ezra.xml':  'fb28ff697d0ee17eba5b4db47fb7261ee1870cea0d5701bfc77c9e28d4138129',
    'Gen.xml':   '0526e5c9a5fb4d907847645f954ed3d1268fa69decbd872056cedd2668d86449',
    'Hab.xml':   '2592b212d816775adc8dac46bd0c46263982c308a186dde64dfb8239c57bd2d1',
    'Hag.xml':   '26ebbae4fe491cf89ce70e1264cbcbf66a562b497cb214b677e67a9a43ad545c',
    'Hos.xml':   'f38ae44a3a97d142768bd5f4d40e77b69265184f9a5aec9e6af1b9b226e8daae',
    'Isa.xml':   '0807678de609bdef284bed5400b94ddab570d101b593c7f59ae1939015572fa2',
    'Jer.xml':   '1a7ad7bc26a2cae1d3964230e8eb73043bc1f32505cb86cd69a25261dc39f493',
    'Job.xml':   '7db3311184122f37a8fd52f3c7c0c4a6d2da7b77ee82f4fdb26bcba9171d297f',
    'Joel.xml':  'c0fefc6881afe949b023968106cdccc05a690734b8bb6e9aa48914d77e5369af',
    'Jonah.xml': '1e1afcc3aaba1399d5c884ee106894c6bfca87c8c81fa57783ab75a923eee17d',
    'Josh.xml':  'a066200ab2269c0a86a2e9ba119a3d0fce8c5f7ecc44bb53ec134b83dffc6006',
    'Judg.xml':  '3b3a909f04041dbd52dc6b7293a96ce75d94db8a90fdeda878943db7b8fac57f',
    'Lam.xml':   'be68fc6a913313367280c2596e28733ee8cf877c12a65227237733b40d0248c4',
    'Lev.xml':   'e21e70265c9ef500182f8ccb4f4e1186e5a79e1169d24cef23cc479baf07b191',
    'Mal.xml':   '1583e6a701406dce7b8c2bf85e3522ec31383756de130685fc7c2eb6df8964b2',
    'Mic.xml':   '267e111adc1b941e32444816af07aa136ecde02cb315cd42597f78b393e67a01',
    'Nah.xml':   '5993b28bdbee3c922e3e93002d343a655493e8bd45e3472f3b62d77beadcb62c',
    'Neh.xml':   'be082e95c206469122455b9849d4dd08da50c817732d8198c1beece90402801a',
    'Num.xml':   '02e4febfcc027d10b3e35e4f091eae67a40d26f37b6254faac6b4af053fe4896',
    'Obad.xml':  '1e893e552a7ed7e2e6d4048637ff5da8a2853a9e4432f4095cede80b959d850c',
    'Prov.xml':  '964f99c00239b53b854c4686c99490c8d1ac7664784a30afdfc23781a3abb161',
    'Ps.xml':    'fe55eef316a65fb0f46d833d526ca2fd722e86ff7339f1a39f0c5b7f9062ced2',
    'Ruth.xml':  'fb6a2660383c7176941cb87b2be182ef634b66d49d057635869f4d9cb1f0a11e',
    'Song.xml':  '5cd6ae36d32c059aaf794af5a5eaed914ac643486db3e412eb0b969760db82ca',
    'Zech.xml':  '2e287c8d0e0abd3bf601eb8ef9b4ee6ca3ae12cf36c0ed1612a7dcca54a2e777',
    'Zeph.xml':  'eb5bd2a745fba1ffeed31dfafd834ce7c290929c992390be1a2b9451d22dea2e',
}

LEXICON_NAMESPACE = 'http://openscriptures.github.com/morphhb/namespace'
NS       = f'{{{LEXICON_NAMESPACE}}}'
XML_LANG = '{http://www.w3.org/XML/1998/namespace}lang'

# Elements the renderer knows (Item 6), and the two the import removes (Item 1).
ALLOWED_ELEMENTS = ('w', 'def', 'sense', 'pos', 'stem', 'asp', 'em', 'ref', 'foreign',
                    'source', 'meaning', 'usage', 'note')
REMOVED_ELEMENTS = ('status', 'page')

ASCII_WHITESPACE = ' \t\r\n'

MAX_SIZE_BYTES = 10 * 1024 * 1024  # Item 9

# Exact because the sources are pinned: a difference means this script changed.
EXACT_COUNTS = {
    'Strong\'s entries': 8674,
    'BDB entries': 11845,
    'BDB status base': 6395,
    'BDB status ref': 2312,
    'BDB status done': 560,
    'BDB status made': 2123,
    'BDB status new': 453,
    'BDB status added': 2,
    'letter-valued strong attributes': 8,
    'lemma pieces counted': 300808,
    'homonym sets': 532,
}
# "About" in the spec's Findings; further off than this is "far" (Item 2).
APPROXIMATE_COUNTS = {
    'lemma pieces unmapped': 825,
    'sets where the first entry changes': 242,
    'sets tied for first place': 60,
}
APPROXIMATE_TOLERANCE = 0.10

# Language names that stand in for untranscribed script (Open Question 1).
PLACEHOLDER_WORDS = ('arabic', 'aramaic', 'assyrian', 'ethiopic', 'greek', 'hebrew', 'latin',
                     'persian', 'phoenician', 'sabean', 'syriac')

# The spec's report lists.
SAMPLE_STRONGS  = (7307, 2617, 1254, 426, 2124)
ORDERED_STRONGS = (5921, 5869, 2617, 1254, 1121, 7451, 859, 3651)


def local_name(tag):
    return tag.rpartition('}')[2]


# ---- Sources -----------------------------------------------------------------

def source_files(raw_dir):
    """Every pinned file as (repository, path in the repository, local path, sha256)."""
    files = [('HebrewLexicon', name, raw_dir / 'HebrewLexicon' / name, digest)
             for name, digest in LEXICON_SHA256.items()]
    files += [('morphhb', f'wlc/{name}', raw_dir / 'morphhb' / 'wlc' / name, digest)
              for name, digest in WLC_SHA256.items()]
    return files


def fetch_and_verify_sources(raw_dir):
    """Downloads missing files at the pinned commits and refuses any file whose
    sha256 isn't the pinned value, including one already on disk."""
    mismatches = []
    fetched = 0
    for repository, path, local_path, expected in source_files(raw_dir):
        if not local_path.exists():
            url = (f'https://raw.githubusercontent.com/openscriptures/{repository}/'
                   f'{SOURCE_REPOSITORIES[repository]}/{path}')
            local_path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(url, timeout=120) as response:
                local_path.write_bytes(response.read())
            fetched += 1
        actual = hashlib.sha256(local_path.read_bytes()).hexdigest()
        if actual != expected:
            mismatches.append(f'{repository}/{path}: expected {expected}, got {actual}')
    if mismatches:
        sys.exit('sha256 mismatch, not building:\n  ' + '\n  '.join(mismatches))
    print(f'{len(LEXICON_SHA256) + len(WLC_SHA256)} source files match their pinned sha256 ({fetched} downloaded)')


def report_upstream_position():
    """The sources are pinned, so a moved repository doesn't change this build,
    but the spec's counts are verified only at these commits (Item 1)."""
    for repository, commit in SOURCE_REPOSITORIES.items():
        url = f'https://github.com/openscriptures/{repository}.git'
        try:
            output = subprocess.run(['git', 'ls-remote', url, 'HEAD'], capture_output=True,
                                    text=True, timeout=30, check=True).stdout
        except (OSError, subprocess.SubprocessError) as error:
            print(f'  {repository}: could not check upstream ({error})')
            continue
        head = output.split()[0] if output.split() else 'unknown'
        state = 'at the pin' if head == commit else f'MOVED, upstream is at {head}: diff the files before relying on this'
        print(f'  {repository}: pinned {commit[:7]}, {state}')


# ---- Markup ------------------------------------------------------------------

def escape_text(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def escape_attribute(value):
    return escape_text(value).replace('"', '&quot;')


def attribute_name(name):
    if name == XML_LANG:
        return 'xml:lang'
    if name.startswith('{'):
        raise ValueError(f'unexpected namespaced attribute {name}')
    return name


def markup_tokens(element, tokens):
    """element's content as ('text', str) and ('tag', str) tokens. A removed
    element disappears but the text after it stays, and joins the text before it,
    so collapsing whitespace afterwards can't leave two spaces where it was."""
    if element.text:
        tokens.append(('text', element.text))
    for child in element:
        name = local_name(child.tag)
        if name not in REMOVED_ELEMENTS:
            attributes = ''.join(f' {attribute_name(key)}="{escape_attribute(value)}"'
                                 for key, value in child.attrib.items())
            tokens.append(('tag', f'<{name}{attributes}>'))
            markup_tokens(child, tokens)
            tokens.append(('tag', f'</{name}>'))
        if child.tail:
            tokens.append(('text', child.tail))


def inner_markup(element):
    """element's inner markup: no namespace declarations, <status> and <page>
    removed, whitespace runs collapsed to one space in text (never in attribute
    values, and not across other tags). Serialized here because ET.tostring would
    write ns0: prefixes."""
    tokens = []
    markup_tokens(element, tokens)
    parts = []
    index = 0
    while index < len(tokens):
        kind, value = tokens[index]
        if kind == 'tag':
            parts.append(value)
            index += 1
            continue
        run = []
        while index < len(tokens) and tokens[index][0] == 'text':
            run.append(tokens[index][1])
            index += 1
        parts.append(escape_text(re.sub(r'[ \t\r\n]+', ' ', ''.join(run))))
    # Not a bare strip(): that would also take the no-break spaces the source has.
    return ''.join(parts).strip(ASCII_WHITESPACE)


def visible_text(element):
    """All text inside element except <status>/<page>, with no whitespace at all:
    what a check can compare between the source and the stored markup."""
    pieces = [element.text or '']
    for child in element:
        if local_name(child.tag) not in REMOVED_ELEMENTS:
            pieces.append(visible_text(child))
        pieces.append(child.tail or '')
    return re.sub(r'[ \t\r\n]+', '', ''.join(pieces))


class SourceAudit:
    """Everything the report says about the markup as it was read."""

    def __init__(self):
        self.element_counts = collections.Counter()    # (file, element)
        self.attribute_counts = collections.Counter()  # (file, element, attribute)
        self.problems = []
        self.foreign = collections.Counter()           # (xml:lang, text)
        self.placeholder_entries = []                  # bdb ids, in document order
        self.foreign_with_no_text = 0

    def record_elements(self, file_label, entry):
        for element in entry.iter():
            if element is entry:
                continue
            name = local_name(element.tag)
            self.element_counts[(file_label, name)] += 1
            for attribute in element.attrib:
                self.attribute_counts[(file_label, name, attribute_name(attribute))] += 1


def is_placeholder(text):
    return text.strip().lower() in PLACEHOLDER_WORDS


# ---- Parsing -----------------------------------------------------------------

def parse_strongs(path, audit):
    """HebrewStrong.xml -> rows in numeric order."""
    rows = []
    seen_ids = {}
    multiple_elements = collections.Counter()
    nested_notes = 0
    for entry in ET.parse(path).getroot().iter(f'{NS}entry'):
        entry_id = entry.get('id')
        match = re.fullmatch(r'H(\d+)', entry_id or '')
        if not match:
            audit.problems.append(f"Strong's entry with unexpected id {entry_id!r}")
            continue
        strongs_base = int(match.group(1))
        if strongs_base in seen_ids:
            audit.problems.append(f"duplicate Strong's entry {entry_id}")
        seen_ids[strongs_base] = True
        audit.record_elements('HebrewStrong.xml', entry)

        fields = {'source': [], 'meaning': [], 'usage': [], 'note': []}
        headword_element = None
        if (entry.text or '').strip():
            audit.problems.append(f'{entry_id}: text directly inside <entry>: {entry.text.strip()!r}')
        for child in entry:
            name = local_name(child.tag)
            if (child.tail or '').strip():
                audit.problems.append(f'{entry_id}: text directly inside <entry>: {child.tail.strip()!r}')
            if name == 'w' and headword_element is None:
                headword_element = child
            elif name in fields:
                fields[name].append(inner_markup(child))
            else:
                audit.problems.append(f'{entry_id}: unexpected top-level <{name}>')
        for name, values in fields.items():
            if len(values) > 1:
                multiple_elements[name] += 1
        nested_notes += sum(1 for child in entry if local_name(child.tag) != 'note'
                            for element in child.iter(f'{NS}note'))
        if headword_element is None:
            audit.problems.append(f'{entry_id}: no <w>')
            continue
        rows.append({
            'strongs_base':   strongs_base,
            'headword':       ''.join(headword_element.itertext()).strip(ASCII_WHITESPACE),
            'transliteration': headword_element.get('xlit'),
            'pronunciation':  headword_element.get('pron'),
            'part_of_speech': headword_element.get('pos'),
            # As transcribed: 'heb', 'arc' or 'x-pn'. x-pn doesn't mean "not Aramaic"
            # (H0426 is x-pn with a source of "(Aramaic) corresponding to..."), so
            # the app can't read Aramaic from this column alone.
            'language':       headword_element.get(XML_LANG),
            'source_markup':  ' '.join(fields['source']) or None,
            'meaning_markup': ' '.join(fields['meaning']) or None,
            'usage_markup':   ' '.join(fields['usage']) or None,
            'note_markup':    ' '.join(fields['note']) or None,
            '_source_text':   ''.join(visible_text(child) for child in entry if local_name(child.tag) != 'w'),
            '_top_level_notes': len(fields['note']),
        })
    rows.sort(key=lambda row: row['strongs_base'])
    audit.strongs_multiple_elements = multiple_elements
    audit.strongs_nested_notes = nested_notes
    return rows


def parse_bdb(path, audit):
    """BrownDriverBriggs.xml -> rows in document order."""
    rows = []
    for part in ET.parse(path).getroot().iter(f'{NS}part'):
        language = part.get(XML_LANG)
        for entry in part.iter(f'{NS}entry'):
            entry_id = entry.get('id')
            audit.record_elements('BrownDriverBriggs.xml', entry)
            for attribute in entry.attrib:
                audit.attribute_counts[('BrownDriverBriggs.xml', 'entry', attribute)] += 1
            statuses = list(entry.iter(f'{NS}status'))
            if len(statuses) != 1:
                audit.problems.append(f'{entry_id}: {len(statuses)} <status> elements')
                continue
            status = statuses[0]
            page = status.get('p')
            if page is not None and not page.isdigit():
                audit.problems.append(f'{entry_id}: <status p={page!r}> is not a page number')
                page = None
            headword_element = next(entry.iter(f'{NS}w'), None)
            for foreign in entry.iter(f'{NS}foreign'):
                text = ''.join(foreign.itertext())
                foreign_language = foreign.get(XML_LANG)
                audit.foreign[(foreign_language, text)] += 1
                if not text.strip():
                    audit.foreign_with_no_text += 1
                if is_placeholder(text):
                    if entry_id not in audit.placeholder_entries:
                        audit.placeholder_entries.append(entry_id)
            rows.append({
                'bdb_id':      entry_id,
                'headword':    ''.join(headword_element.itertext()).strip(ASCII_WHITESPACE) if headword_element is not None else None,
                'language':    language,
                'status':      (status.text or '').strip(ASCII_WHITESPACE),
                'bdb_page':    int(page) if page is not None else None,
                'body_markup': inner_markup(entry),
                '_source_text': visible_text(entry),
            })
    return rows


def parse_lexical_index(path, audit):
    """LexicalIndex.xml -> (index entry id -> BDB id, Strong's number -> BDB ids in
    document order, with repeats removed)."""
    bdb_by_index_entry = {}
    links = {}
    letter_values = []
    duplicate_pairs = 0
    entries_without_xref = 0
    entries_with_several_xrefs = 0
    entries_with_several_bdb = 0
    for entry in ET.parse(path).getroot().iter(f'{NS}entry'):
        xrefs = entry.findall(f'{NS}xref')
        if not xrefs:
            entries_without_xref += 1
        if len(xrefs) > 1:
            entries_with_several_xrefs += 1
        bdb_ids = []
        for xref in xrefs:
            bdb_id = xref.get('bdb')
            if bdb_id and bdb_id not in bdb_ids:
                bdb_ids.append(bdb_id)
            strong = xref.get('strong')
            if not strong:
                continue
            if not strong.isdigit():
                if strong.isalpha() and len(strong) == 1:
                    letter_values.append(strong)
                else:
                    audit.problems.append(f'LexicalIndex entry {entry.get("id")}: strong={strong!r}')
                continue
            if not bdb_id:
                audit.problems.append(f'LexicalIndex entry {entry.get("id")}: strong={strong} with no bdb')
                continue
            strongs_base = int(strong)
            targets = links.setdefault(strongs_base, [])
            if bdb_id in targets:
                duplicate_pairs += 1
            else:
                targets.append(bdb_id)
        if len(bdb_ids) > 1:
            entries_with_several_bdb += 1
        if bdb_ids:
            bdb_by_index_entry[entry.get('id')] = bdb_ids[0]
    audit.letter_values = letter_values
    audit.duplicate_pairs = duplicate_pairs
    audit.entries_without_xref = entries_without_xref
    audit.entries_with_several_xrefs = entries_with_several_xrefs
    audit.entries_with_several_bdb = entries_with_several_bdb
    return bdb_by_index_entry, links


def parse_aug_index(path):
    """AugIndex.xml -> augmented Strong's ('1254a') -> LexicalIndex entry id."""
    return {w.get('aug'): (w.text or '').strip()
            for w in ET.parse(path).getroot().iter(f'{NS}w')}


# ---- Homonym ordering (Item 2) -------------------------------------------------

def count_bdb_occurrences(wlc_dir, aug_index, bdb_by_index_entry):
    """How often each BDB entry occurs in the OSHB text. Nothing from these files
    is kept but the counts."""
    occurrences = collections.Counter()
    unmapped = collections.Counter()
    unmapped_reason = {}
    pieces_counted = 0
    for name in sorted(WLC_SHA256):
        for _event, element in ET.iterparse(wlc_dir / name):
            lemma = element.get('lemma')
            if lemma:
                for piece in lemma.split('/'):
                    piece = piece.replace(' ', '')
                    if not piece[:1].isdigit():
                        continue
                    pieces_counted += 1
                    index_entry = aug_index.get(piece)
                    bdb_id = bdb_by_index_entry.get(index_entry) if index_entry else None
                    if bdb_id:
                        occurrences[bdb_id] += 1
                    else:
                        unmapped[piece] += 1
                        unmapped_reason[piece] = ('not in AugIndex' if not index_entry
                                                  else f'index entry {index_entry} has no BDB link')
            element.clear()
    return occurrences, pieces_counted, unmapped, unmapped_reason


def rank_links(links, occurrences):
    """(strongs_base, bdb_id, display_rank, oshb_occurrences) rows, ordered by
    Strong's number then rank: most frequent first, LexicalIndex order on a tie
    (Python's sort is stable, so index order survives equal counts)."""
    rows = []
    for strongs_base in sorted(links):
        ranked = sorted(links[strongs_base], key=lambda bdb_id: -occurrences[bdb_id])
        for display_rank, bdb_id in enumerate(ranked):
            rows.append((strongs_base, bdb_id, display_rank, occurrences[bdb_id]))
    return rows


def homonym_statistics(links, occurrences):
    sets = {strongs: targets for strongs, targets in links.items() if len(targets) > 1}
    first_changes = 0
    any_order_changes = 0
    tied_for_first = 0
    all_zero = 0
    for targets in sets.values():
        ranked = sorted(targets, key=lambda bdb_id: -occurrences[bdb_id])
        counts = [occurrences[bdb_id] for bdb_id in ranked]
        if ranked[0] != targets[0]:
            first_changes += 1
        if ranked != targets:
            any_order_changes += 1
        if counts[0] == counts[1]:
            tied_for_first += 1
        if counts[0] == 0:
            all_zero += 1
    return {'sets': len(sets), 'first_changes': first_changes, 'any_order_changes': any_order_changes,
            'tied_for_first': tied_for_first, 'all_zero': all_zero}


# ---- Writing -----------------------------------------------------------------

SCHEMA = """
CREATE TABLE lexicon_strongs_hebrew (
    strongs_base     INTEGER PRIMARY KEY,
    headword         TEXT NOT NULL,
    transliteration  TEXT,
    pronunciation    TEXT,
    part_of_speech   TEXT,
    language         TEXT NOT NULL,
    source_markup    TEXT,
    meaning_markup   TEXT,
    usage_markup     TEXT,
    note_markup      TEXT
);
CREATE TABLE lexicon_bdb_hebrew (
    bdb_id       TEXT PRIMARY KEY,
    headword     TEXT,
    language     TEXT NOT NULL,
    status       TEXT NOT NULL,
    bdb_page     INTEGER,
    body_markup  TEXT NOT NULL
);
CREATE TABLE lexicon_hebrew_links (
    strongs_base      INTEGER NOT NULL,
    bdb_id            TEXT NOT NULL,
    display_rank      INTEGER NOT NULL,
    oshb_occurrences  INTEGER NOT NULL,
    PRIMARY KEY (strongs_base, bdb_id)
) WITHOUT ROWID;
CREATE TABLE lexicon_meta (key TEXT PRIMARY KEY, value TEXT);
"""


def meta_rows():
    """Commits and per-file sha256 values, and deliberately no build date."""
    rows = [('hebrewlexicon_commit', SOURCE_REPOSITORIES['HebrewLexicon']),
            ('morphhb_commit', SOURCE_REPOSITORIES['morphhb'])]
    rows += [(f'sha256:{name}', digest) for name, digest in LEXICON_SHA256.items()]
    rows += [(f'sha256:wlc/{name}', digest) for name, digest in WLC_SHA256.items()]
    return sorted(rows)


def write_database(path, strongs_rows, bdb_rows, link_rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    con = sqlite3.connect(path)
    con.execute('PRAGMA page_size = 4096')
    con.execute('PRAGMA journal_mode = DELETE')
    con.executescript(SCHEMA)
    con.executemany(
        """INSERT INTO lexicon_strongs_hebrew
           (strongs_base, headword, transliteration, pronunciation, part_of_speech, language,
            source_markup, meaning_markup, usage_markup, note_markup)
           VALUES (:strongs_base, :headword, :transliteration, :pronunciation, :part_of_speech, :language,
                   :source_markup, :meaning_markup, :usage_markup, :note_markup)""", strongs_rows)
    con.executemany(
        """INSERT INTO lexicon_bdb_hebrew (bdb_id, headword, language, status, bdb_page, body_markup)
           VALUES (:bdb_id, :headword, :language, :status, :bdb_page, :body_markup)""", bdb_rows)
    con.executemany('INSERT INTO lexicon_hebrew_links VALUES (?, ?, ?, ?)', link_rows)
    con.executemany('INSERT INTO lexicon_meta VALUES (?, ?)', meta_rows())
    con.commit()
    con.execute('VACUUM')
    con.close()


# ---- Checks ------------------------------------------------------------------

def check_stored_markup(con):
    """Every stored markup string re-parses, keeps all of its source's text, and
    contains no element outside the allowed list."""
    unknown = collections.Counter()
    failures = []
    columns = [('lexicon_strongs_hebrew', 'strongs_base', 'source_markup'),
               ('lexicon_strongs_hebrew', 'strongs_base', 'meaning_markup'),
               ('lexicon_strongs_hebrew', 'strongs_base', 'usage_markup'),
               ('lexicon_strongs_hebrew', 'strongs_base', 'note_markup'),
               ('lexicon_bdb_hebrew', 'bdb_id', 'body_markup')]
    parsed_count = 0
    for table, key, column in columns:
        for row_key, markup in con.execute(f'SELECT {key}, {column} FROM {table} WHERE {column} IS NOT NULL'):
            try:
                root = ET.fromstring(f'<root>{markup}</root>')
            except ET.ParseError as error:
                failures.append(f'{table}.{column} {row_key}: {error}')
                continue
            parsed_count += 1
            for element in root.iter():
                if element is root:
                    continue
                name = local_name(element.tag)
                if name not in ALLOWED_ELEMENTS:
                    unknown[name] += 1
    return parsed_count, unknown, failures


def check_text_preserved(con, strongs_rows, bdb_rows):
    losses = []
    for row in strongs_rows:
        stored = con.execute(
            """SELECT source_markup, meaning_markup, usage_markup, note_markup
               FROM lexicon_strongs_hebrew WHERE strongs_base = ?""", (row['strongs_base'],)).fetchone()
        text = ''.join(visible_text(ET.fromstring(f'<root>{markup}</root>')) for markup in stored if markup)
        if sorted(text) != sorted(row['_source_text']):
            losses.append(f"Strong's {row['strongs_base']}")
    for row in bdb_rows:
        stored = con.execute('SELECT body_markup FROM lexicon_bdb_hebrew WHERE bdb_id = ?',
                             (row['bdb_id'],)).fetchone()[0]
        if visible_text(ET.fromstring(f'<root>{stored}</root>')) != row['_source_text']:
            losses.append(f"BDB {row['bdb_id']}")
    return losses


def sqlite_header_check(path):
    """The rule js/db.js:isCompleteSqliteFile() applies to a downloaded file."""
    header = path.read_bytes()[:100]
    magic_ok = header[:16] == b'SQLite format 3\0'
    page_size = struct.unpack('>H', header[16:18])[0]
    change_counter, page_count = struct.unpack('>II', header[24:32])
    version_valid_for = struct.unpack('>I', header[92:96])[0]
    return (magic_ok and change_counter == version_valid_for
            and page_size * page_count == path.stat().st_size,
            page_size, page_count, change_counter, version_valid_for)


def first_def_text(markup):
    element = next(ET.fromstring(f'<root>{markup}</root>').iter('def'), None)
    return ''.join(element.itertext()) if element is not None else None


def top_level_sense_numbers(markup):
    return [sense.get('n') for sense in ET.fromstring(f'<root>{markup}</root>').findall('sense')]


def linked_entries(con, strongs_base):
    return con.execute(
        """SELECT b.bdb_id, b.headword, b.language, b.status, b.body_markup, l.oshb_occurrences
           FROM lexicon_hebrew_links l JOIN lexicon_bdb_hebrew b USING (bdb_id)
           WHERE l.strongs_base = ? ORDER BY l.display_rank""", (strongs_base,)).fetchall()


def spot_checks(con):
    """What docs/Hebrew_Lexicon_Spec.md Item 8 expects of the data, checked here so
    a problem shows up before any UI exists. Returns (description, passed)."""
    def strongs(strongs_base, column):
        return con.execute(f'SELECT {column} FROM lexicon_strongs_hebrew WHERE strongs_base = ?',
                           (strongs_base,)).fetchone()[0]

    def has_def(markup, wanted):
        return any(''.join(d.itertext()) == wanted for d in ET.fromstring(f'<root>{markup}</root>').iter('def'))

    h1254 = linked_entries(con, 1254)
    h7307 = linked_entries(con, 7307)
    h2617 = linked_entries(con, 2617)
    h0776 = linked_entries(con, 776)
    h0426 = linked_entries(con, 426)
    h0024 = linked_entries(con, 24)
    return [
        ("H1254 Strong's meaning includes 'create'", 'create' in strongs(1254, 'meaning_markup')),
        ('H1254 has 2 BDB entries', len(h1254) == 2),
        ("H1254 first entry has defs 'shape' and 'create'", has_def(h1254[0][4], 'shape') and has_def(h1254[0][4], 'create')),
        ("H1254 second entry has def 'be fat'", has_def(h1254[1][4], 'be fat')),
        ('H7307 has one BDB entry', len(h7307) == 1),
        ('H7307 top-level senses are 1-9', top_level_sense_numbers(h7307[0][4]) == list('123456789')),
        ('H2617 has 2 BDB entries, kindness first', len(h2617) == 2 and 'kindness' in h2617[0][4]
         and 'reproach' in h2617[1][4]),
        ("H0776 has a Strong's usage (KJV renderings)", bool(strongs(776, 'usage_markup'))),
        ('H0776 has a BDB entry', bool(h0776)),
        ("H0426 Strong's source says (Aramaic), though its language is x-pn",
         strongs(426, 'source_markup').startswith('(Aramaic)') and strongs(426, 'language') == 'x-pn'),
        ('H0426 BDB entries are arc', bool(h0426) and all(row[2] == 'arc' for row in h0426)),
        ("H0426 BDB has 'god'", 'god' in h0426[0][4].lower()),
        ('H0024 BDB entries are all done', bool(h0024) and all(row[3] == 'done' for row in h0024)),
        ("H2007 has a Strong's entry and no BDB link", bool(strongs(2007, 'headword')) and not linked_entries(con, 2007)),
        ('no link points at a missing BDB entry', con.execute(
            """SELECT COUNT(*) FROM lexicon_hebrew_links l LEFT JOIN lexicon_bdb_hebrew b USING (bdb_id)
               WHERE b.bdb_id IS NULL""").fetchone()[0] == 0),
        ("no link points at a missing Strong's entry", con.execute(
            """SELECT COUNT(*) FROM lexicon_hebrew_links l LEFT JOIN lexicon_strongs_hebrew s USING (strongs_base)
               WHERE s.strongs_base IS NULL""").fetchone()[0] == 0),
    ]


# ---- Report ------------------------------------------------------------------

def heading(text):
    print(f'\n=== {text}')


def raw_entry_xml(file_text, entry_id):
    """An entry as it appears in the source file, for display only."""
    start = file_text.find(f'<entry id="{entry_id}"')
    return file_text[start:file_text.find('</entry>', start) + len('</entry>')] if start >= 0 else '(not found)'


def report_samples(con, raw_dir):
    strong_text = (raw_dir / 'HebrewLexicon' / 'HebrewStrong.xml').read_text(encoding='utf-8-sig')
    bdb_text = (raw_dir / 'HebrewLexicon' / 'BrownDriverBriggs.xml').read_text(encoding='utf-8-sig')
    for strongs_base in SAMPLE_STRONGS:
        print(f'\n--- H{strongs_base:04d}')
        print(f'source XML:\n{raw_entry_xml(strong_text, f"H{strongs_base}")}')
        row = con.execute(
            """SELECT strongs_base, headword, transliteration, pronunciation, part_of_speech, language,
                      source_markup, meaning_markup, usage_markup, note_markup
               FROM lexicon_strongs_hebrew WHERE strongs_base = ?""", (strongs_base,)).fetchone()
        print('stored lexicon_strongs_hebrew:')
        for name, value in zip(('strongs_base', 'headword', 'transliteration', 'pronunciation', 'part_of_speech',
                                'language', 'source_markup', 'meaning_markup', 'usage_markup', 'note_markup'), row):
            print(f'  {name}: {value}')
        for bdb_id, rank, count in con.execute(
                """SELECT bdb_id, display_rank, oshb_occurrences FROM lexicon_hebrew_links
                   WHERE strongs_base = ? ORDER BY display_rank""", (strongs_base,)).fetchall():
            print(f'link: rank {rank}, {count} occurrences -> {bdb_id}')
            print(f'  source XML:\n{raw_entry_xml(bdb_text, bdb_id)}')
            stored = con.execute(
                """SELECT headword, language, status, bdb_page, body_markup FROM lexicon_bdb_hebrew
                   WHERE bdb_id = ?""", (bdb_id,)).fetchone()
            print('  stored lexicon_bdb_hebrew: headword={} language={} status={} bdb_page={}'.format(*stored[:4]))
            print(f'  body_markup: {stored[4]}')


def report_foreign(con, audit):
    heading('<foreign> placeholders (Open Question 1)')
    total = sum(audit.foreign.values())
    placeholder_counts = collections.Counter()
    for (language, text), count in audit.foreign.items():
        if is_placeholder(text):
            placeholder_counts[(language, text.strip())] += count
    placeholder_total = sum(placeholder_counts.values())
    print(f'<foreign> elements: {total}; holding a language name instead of the script: {placeholder_total}; '
          f'empty: {audit.foreign_with_no_text}')
    for (language, text), count in sorted(placeholder_counts.items(), key=lambda item: (-item[1], item[0])):
        print(f'  {language}: {text!r} x{count}')
    by_language = collections.Counter()
    for (language, _text), count in audit.foreign.items():
        by_language[language] += count
    print('all <foreign> by xml:lang: ' + ', '.join(
        f'{language} {count}' for language, count in sorted(by_language.items(), key=lambda item: (-item[1], str(item[0])))))
    affected = audit.placeholder_entries
    print(f'entries with at least one placeholder: {len(affected)}')
    statuses = collections.Counter()
    reachable = 0
    for bdb_id in affected:
        statuses[con.execute('SELECT status FROM lexicon_bdb_hebrew WHERE bdb_id = ?', (bdb_id,)).fetchone()[0]] += 1
        if con.execute('SELECT 1 FROM lexicon_hebrew_links WHERE bdb_id = ?', (bdb_id,)).fetchone():
            reachable += 1
    linked_occurrences = con.execute(
        f"""SELECT SUM(oshb_occurrences) FROM lexicon_hebrew_links
            WHERE bdb_id IN ({','.join('?' * len(affected))})""", affected).fetchone()[0]
    print(f'  by status: {dict(sorted(statuses.items()))}')
    print(f"  linked from a Strong's number, so a reader can reach them: {reachable} entries, {linked_occurrences} OSHB occurrences")
    print('  most-read entries with a placeholder (entry, OSHB occurrences, text around the placeholder):')
    frequent = con.execute(
        f"""SELECT l.bdb_id, MAX(l.oshb_occurrences) AS occurrences, b.body_markup
            FROM lexicon_hebrew_links l JOIN lexicon_bdb_hebrew b USING (bdb_id)
            WHERE l.bdb_id IN ({','.join('?' * len(affected))})
            GROUP BY l.bdb_id ORDER BY occurrences DESC, l.bdb_id LIMIT 6""", affected).fetchall()
    for bdb_id, occurrences, body in frequent:
        match = re.search(r'.{0,50}<foreign xml:lang="\w+">(?:Arabic|Syriac|Ethiopic|Persian)</foreign>.{0,50}', body)
        print(f'    {bdb_id} ({occurrences}x): {match.group(0) if match else "(placeholder in another word)"}')


def build(raw_dir, output, ship):
    report_upstream_position()
    fetch_and_verify_sources(raw_dir)
    print(f'SQLite {sqlite3.sqlite_version}')

    hebrew_lexicon = raw_dir / 'HebrewLexicon'
    audit = SourceAudit()
    strongs_rows = parse_strongs(hebrew_lexicon / 'HebrewStrong.xml', audit)
    bdb_rows = parse_bdb(hebrew_lexicon / 'BrownDriverBriggs.xml', audit)
    bdb_by_index_entry, links = parse_lexical_index(hebrew_lexicon / 'LexicalIndex.xml', audit)
    aug_index = parse_aug_index(hebrew_lexicon / 'AugIndex.xml')
    occurrences, pieces_counted, unmapped, unmapped_reason = count_bdb_occurrences(
        raw_dir / 'morphhb' / 'wlc', aug_index, bdb_by_index_entry)
    link_rows = rank_links(links, occurrences)

    write_database(output, strongs_rows, bdb_rows, link_rows)
    con = sqlite3.connect(f'file:{output}?mode=ro&immutable=1', uri=True)

    problems = list(audit.problems)

    heading('Row counts')
    for table in ('lexicon_strongs_hebrew', 'lexicon_bdb_hebrew', 'lexicon_hebrew_links', 'lexicon_meta'):
        print(f'{table}: {con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]}')

    heading("Strong's numbers by BDB link count")
    all_strongs = [row['strongs_base'] for row in strongs_rows]
    no_links = [number for number in all_strongs if number not in links]
    one_link = sum(1 for number in all_strongs if len(links.get(number, [])) == 1)
    several = sum(1 for number in all_strongs if len(links.get(number, [])) > 1)
    print(f'0 links: {len(no_links)} {[f"H{number}" for number in no_links]}')
    print(f'1 link: {one_link}')
    print(f'2+ links: {several}')
    sizes = collections.Counter(len(targets) for targets in links.values() if len(targets) > 1)
    print('homonym set sizes: ' + ', '.join(f'{size} entries: {count}' for size, count in sorted(sizes.items())))
    stub_only = [number for number in sorted(links)
                 if all(row[3] in ('made', 'new', 'added') for row in linked_entries(con, number))]
    print(f'linked only to stubs (made/new/added): {[f"H{number}" for number in stub_only]}')
    print(f'letter-valued strong attributes skipped: {len(audit.letter_values)} {sorted(audit.letter_values)}')
    print(f'repeated (strong, bdb) pairs removed: {audit.duplicate_pairs}')
    print(f'LexicalIndex entries with no xref: {audit.entries_without_xref}; with 2+ xrefs: '
          f'{audit.entries_with_several_xrefs}; with 2+ different BDB ids: {audit.entries_with_several_bdb}')

    heading('BDB status and language')
    status_counts = dict(con.execute('SELECT status, COUNT(*) FROM lexicon_bdb_hebrew GROUP BY status').fetchall())
    print('status: ' + ', '.join(f'{status} {status_counts[status]}' for status in sorted(status_counts)))
    print('language: ' + ', '.join(f'{language} {count}' for language, count in con.execute(
        'SELECT language, COUNT(*) FROM lexicon_bdb_hebrew GROUP BY language ORDER BY language')))
    print('linked from a Strong\'s number, by status: ' + ', '.join(f'{status} {count}' for status, count in con.execute(
        """SELECT status, COUNT(*) FROM lexicon_bdb_hebrew WHERE bdb_id IN (SELECT bdb_id FROM lexicon_hebrew_links)
           GROUP BY status ORDER BY status""")))
    print('not linked from any Strong\'s number, by status: ' + ', '.join(f'{status} {count}' for status, count in con.execute(
        """SELECT status, COUNT(*) FROM lexicon_bdb_hebrew WHERE bdb_id NOT IN (SELECT bdb_id FROM lexicon_hebrew_links)
           GROUP BY status ORDER BY status""")))
    print('entries with no <w>: ' + str(con.execute(
        'SELECT COUNT(*) FROM lexicon_bdb_hebrew WHERE headword IS NULL').fetchone()[0]))
    print('entries with no bdb_page: ' + str(con.execute(
        'SELECT COUNT(*) FROM lexicon_bdb_hebrew WHERE bdb_page IS NULL').fetchone()[0]))

    heading("Strong's fields")
    print('language: ' + ', '.join(f'{language} {count}' for language, count in con.execute(
        'SELECT language, COUNT(*) FROM lexicon_strongs_hebrew GROUP BY language ORDER BY language')))
    print('source begins "(Aramaic)", by language: ' + ', '.join(f'{language} {count}' for language, count in con.execute(
        """SELECT language, COUNT(*) FROM lexicon_strongs_hebrew WHERE source_markup LIKE '(Aramaic)%'
           GROUP BY language ORDER BY language""")))
    for number, in con.execute("""SELECT strongs_base FROM lexicon_strongs_hebrew
                                 WHERE language = 'arc' AND (source_markup IS NULL OR source_markup NOT LIKE '(Aramaic)%')
                                 ORDER BY strongs_base"""):
        print(f'  arc without a leading "(Aramaic)": H{number}')
    print('no source_markup: ' + ', '.join(f'H{number}' for number, in con.execute(
        'SELECT strongs_base FROM lexicon_strongs_hebrew WHERE source_markup IS NULL ORDER BY strongs_base')))
    print('no usage_markup: ' + ', '.join(f'H{number}' for number, in con.execute(
        'SELECT strongs_base FROM lexicon_strongs_hebrew WHERE usage_markup IS NULL ORDER BY strongs_base')))
    for column in ('transliteration', 'pronunciation', 'part_of_speech', 'source_markup', 'meaning_markup',
                   'usage_markup', 'note_markup'):
        print(f'{column}: {con.execute(f"SELECT COUNT({column}) FROM lexicon_strongs_hebrew").fetchone()[0]} non-empty')
    print(f"entries with more than one top-level element of a kind: {dict(sorted(audit.strongs_multiple_elements.items()))}")
    print(f'<note> elements total: {audit.element_counts[("HebrewStrong.xml", "note")]}; '
          f'nested inside source/meaning/usage (stay inline in that field): {audit.strongs_nested_notes}')

    heading('Elements and attributes in the source entries')
    unknown_in_source = []
    for (file_label, name), count in sorted(audit.element_counts.items()):
        known = name in ALLOWED_ELEMENTS or name in REMOVED_ELEMENTS
        print(f'{file_label} <{name}>: {count}{"" if known else "  NOT IN THE ALLOWED LIST"}')
        if not known:
            unknown_in_source.append(name)
    attributes_by_element = collections.defaultdict(list)
    for (file_label, name, attribute), count in sorted(audit.attribute_counts.items()):
        attributes_by_element[(file_label, name)].append(f'{attribute} {count}')
    for (file_label, name), attributes in attributes_by_element.items():
        print(f'{file_label} <{name}> attributes: {", ".join(attributes)}')
    print(f'unknown elements: {sorted(set(unknown_in_source)) or "none"}')

    heading('Stored markup checks')
    parsed_count, unknown_stored, parse_failures = check_stored_markup(con)
    print(f'{parsed_count} markup strings re-parsed, {len(parse_failures)} failed; '
          f'elements outside the allowed list: {dict(sorted(unknown_stored.items())) or "none"}')
    losses = check_text_preserved(con, strongs_rows, bdb_rows)
    print(f'source text missing from stored markup: {len(losses)} entries {losses[:5]}')
    problems += parse_failures
    problems += [f'text changed in {loss}' for loss in losses]

    heading('Homonym ordering (Item 2)')
    statistics = homonym_statistics(links, occurrences)
    print(f'lemma pieces counted: {pieces_counted}')
    print(f'pieces unmapped: {sum(unmapped.values())} ({len(unmapped)} distinct)')
    print('top 10 unmapped: ' + ', '.join(
        f'{piece} x{count} ({unmapped_reason[piece]})'
        for piece, count in sorted(unmapped.items(), key=lambda item: (-item[1], item[0]))[:10]))
    plus_suffixed = sum(count for piece, count in unmapped.items() if piece.endswith('+'))
    print(f'of the unmapped, ending in "+": {plus_suffixed}')
    print(f'homonym sets: {statistics["sets"]}')
    print(f'sets where the first entry changes: {statistics["first_changes"]} (spec: about 242)')
    print(f'sets where any of the order changes: {statistics["any_order_changes"]}')
    print(f'sets tied for first place: {statistics["tied_for_first"]} (spec: about 60)')
    print(f'sets with all-zero counts: {statistics["all_zero"]} (spec: 0)')
    print('final order:')
    for strongs_base in ORDERED_STRONGS:
        print(f'  H{strongs_base:04d}:')
        for bdb_id, headword, _language, status, body, count in linked_entries(con, strongs_base):
            print(f'    {count:>6}x  {bdb_id:<12} {status:<5} {headword}  {first_def_text(body) or "(no <def>)"}')

    report_foreign(con, audit)

    heading('Item 8 data checks')
    for description, passed in spot_checks(con):
        print(f'{"ok  " if passed else "FAIL"} {description}')
        if not passed:
            problems.append(f'spot check failed: {description}')

    heading('Five samples')
    report_samples(con, raw_dir)

    heading('Size (Item 9)')
    size = output.stat().st_size
    gzipped = len(gzip.compress(output.read_bytes(), compresslevel=9, mtime=0))
    print(f'raw: {size} bytes ({size / 1024 / 1024:.2f} MiB), limit {MAX_SIZE_BYTES / 1024 / 1024:.0f} MiB')
    print(f'gzipped (level 9): {gzipped} bytes ({gzipped / 1024 / 1024:.2f} MiB)')
    con.close()
    con = sqlite3.connect(output)  # dbstat needs a normal handle; it writes nothing
    for name, used in con.execute('SELECT name, SUM(pgsize) FROM dbstat GROUP BY name ORDER BY SUM(pgsize) DESC'):
        print(f'  {name}: {used} bytes')
    con.close()
    ok, page_size, page_count, change_counter, valid_for = sqlite_header_check(output)
    print(f'header: page size {page_size}, pages {page_count}, change counter {change_counter}, '
          f'version-valid-for {valid_for}; isCompleteSqliteFile real check: {"pass" if ok else "FAIL"}')
    if not ok:
        problems.append('file fails the isCompleteSqliteFile header check')
    print(f'sha256: {hashlib.sha256(output.read_bytes()).hexdigest()}')

    heading('Expected counts')
    measured = {
        "Strong's entries": len(strongs_rows),
        'BDB entries': len(bdb_rows),
        'BDB status base': status_counts.get('base', 0),
        'BDB status ref': status_counts.get('ref', 0),
        'BDB status done': status_counts.get('done', 0),
        'BDB status made': status_counts.get('made', 0),
        'BDB status new': status_counts.get('new', 0),
        'BDB status added': status_counts.get('added', 0),
        'letter-valued strong attributes': len(audit.letter_values),
        'lemma pieces counted': pieces_counted,
        'homonym sets': statistics['sets'],
        'lemma pieces unmapped': sum(unmapped.values()),
        'sets where the first entry changes': statistics['first_changes'],
        'sets tied for first place': statistics['tied_for_first'],
    }
    for label, expected in EXACT_COUNTS.items():
        passed = measured[label] == expected
        print(f'{"ok  " if passed else "FAR "} {label}: {measured[label]} (expected exactly {expected})')
        if not passed:
            problems.append(f'{label}: {measured[label]}, expected {expected}')
    for label, expected in APPROXIMATE_COUNTS.items():
        passed = abs(measured[label] - expected) <= expected * APPROXIMATE_TOLERANCE
        print(f'{"ok  " if passed else "FAR "} {label}: {measured[label]} (expected about {expected})')
        if not passed:
            problems.append(f'{label}: {measured[label]}, expected about {expected}')
    if statistics['all_zero']:
        problems.append(f'{statistics["all_zero"]} homonym sets have all-zero counts')
    if unknown_in_source or unknown_stored:
        problems.append('elements outside the allowed list')
    if size > MAX_SIZE_BYTES:
        problems.append(f'file is {size} bytes, over the {MAX_SIZE_BYTES} byte limit')

    if problems:
        heading('STOPPED: not shipping')
        for problem in problems:
            print(f'  {problem}')
        sys.exit(1)

    if ship:
        shutil.copyfile(output, SHIPPED_DB)
        print(f'\nShipped to {SHIPPED_DB}')
    else:
        print(f'\nBuilt {output}; rerun with --ship to copy it to {SHIPPED_DB}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build data/lexicon-hebrew.db from openscriptures/HebrewLexicon and morphhb.')
    parser.add_argument('--raw-dir', type=Path, default=RAW_DIR,
                        help=f'directory for the downloaded source files (default: {RAW_DIR})')
    parser.add_argument('--output', type=Path, default=OUTPUT_DB,
                        help=f'build artifact path (default: {OUTPUT_DB})')
    parser.add_argument('--ship', action='store_true', help=f'copy the finished build to {SHIPPED_DB}')
    args = parser.parse_args()
    build(raw_dir=args.raw_dir.resolve(), output=args.output.resolve(), ship=args.ship)
