#!/usr/bin/env python3
"""
build_crossrefs.py — Ingest OpenBible cross-references into core.db.

Usage:
    python3 scripts/build_crossrefs.py [--db data/core.db]

Inputs:
    build/sources/cross_references.txt  — OpenBible tab-separated source
    data/core.db                        — target database (modified in place)

Output:
    data/core.db gains a cross_references table + compound index
    scripts/crossref_split_report.txt   — cross-book splits for hand-audit
"""

import argparse
import os
import sqlite3
import sys

# ---------------------------------------------------------------------------
# OpenBible book token → internal book ID (1-66)
# All 66 map cleanly; no aliases needed for the OpenBible token set.
# ---------------------------------------------------------------------------
BOOK_TOKENS = {
    'Gen':   1,  'Exod':  2,  'Lev':   3,  'Num':   4,  'Deut':  5,
    'Josh':  6,  'Judg':  7,  'Ruth':  8,  '1Sam':  9,  '2Sam': 10,
    '1Kgs': 11,  '2Kgs': 12,  '1Chr': 13,  '2Chr': 14,  'Ezra': 15,
    'Neh':  16,  'Esth': 17,  'Job':  18,  'Ps':   19,  'Prov': 20,
    'Eccl': 21,  'Song': 22,  'Isa':  23,  'Jer':  24,  'Lam':  25,
    'Ezek': 26,  'Dan':  27,  'Hos':  28,  'Joel': 29,  'Amos': 30,
    'Obad': 31,  'Jonah':32,  'Mic':  33,  'Nah':  34,  'Hab':  35,
    'Zeph': 36,  'Hag':  37,  'Zech': 38,  'Mal':  39,
    'Matt': 40,  'Mark': 41,  'Luke': 42,  'John': 43,  'Acts': 44,
    'Rom':  45,  '1Cor': 46,  '2Cor': 47,  'Gal':  48,  'Eph':  49,
    'Phil': 50,  'Col':  51,  '1Thess':52, '2Thess':53, '1Tim': 54,
    '2Tim': 55,  'Titus':56,  'Phlm': 57,  'Heb':  58,  'Jas':  59,
    '1Pet': 60,  '2Pet': 61,  '1John':62,  '2John':63,  '3John':64,
    'Jude': 65,  'Rev':  66,
}

# Chapter counts per book — needed for splitting cross-chapter ranges.
# Index 0 unused; index 1 = Genesis, ..., index 66 = Revelation.
CHAPTERS = [
    0,
    50, 40, 27, 36, 34, 24, 21, 4,  31, 24,  # Gen–2Sam
    22, 25, 29, 36, 10, 13, 10, 42, 150, 31,  # 1Kgs–Prov
    12, 8,  66, 52, 5,  48, 12, 14, 3,  9,    # Eccl–Amos
    1,  4,  7,  3,  3,  3,  2,  14, 4,         # Obad–Mal
    28, 16, 24, 21, 28, 16, 16, 13, 6,  6,    # Matt–Eph
    4,  4,  5,  3,  6,  4,  3,  1,  13, 5,    # Phil–Heb
    5,  3,  5,  1,  1,  1,  22,                # Jas–Rev
]

# Verse counts per chapter, indexed as VERSE_COUNTS[book][chapter].
# Built lazily from the database when needed for split boundary clamping.
_verse_counts_cache = {}


def bbcccvvv(book: int, chapter: int, verse: int) -> int:
    return book * 1_000_000 + chapter * 1_000 + verse


def parse_ref(token: str):
    """Parse 'Book.Chapter.Verse' → (book_id, chapter, verse).
    Returns None if token is unrecognisable.
    """
    parts = token.split('.')
    if len(parts) != 3:
        return None
    book_name, chap_str, verse_str = parts
    book_id = BOOK_TOKENS.get(book_name)
    if book_id is None:
        return None
    try:
        return (book_id, int(chap_str), int(verse_str))
    except ValueError:
        return None


def get_verse_count(conn, book_id: int, chapter: int) -> int:
    """Return the number of verses in book_id:chapter (from DB verse table)."""
    key = (book_id, chapter)
    if key not in _verse_counts_cache:
        row = conn.execute(
            'SELECT MAX(verse) FROM verses WHERE book_id = ? AND chapter = ?',
            (book_id, chapter),
        ).fetchone()
        _verse_counts_cache[key] = row[0] if row and row[0] else 0
    return _verse_counts_cache[key]


def split_range(conn, start_book, start_chap, start_verse,
                end_book, end_chap, end_verse, votes,
                split_report_lines):
    """Split a cross-chapter or cross-book range into per-chapter rows.

    Returns a list of (target_start, target_end_or_None) tuples (BBCCCVVV).
    Cross-book splits are appended to split_report_lines.
    """
    rows = []
    cross_book = (start_book != end_book)

    # Enumerate every chapter the range touches.
    book = start_book
    chap = start_chap

    while True:
        # First verse of this chapter's segment.
        seg_start_verse = start_verse if (book == start_book and chap == start_chap) else 1

        # Last verse of this chapter's segment.
        if book == end_book and chap == end_chap:
            seg_end_verse = end_verse
        else:
            seg_end_verse = get_verse_count(conn, book, chap)
            if seg_end_verse == 0:
                seg_end_verse = 999  # fallback; shouldn't occur for canonical refs

        t_start = bbcccvvv(book, chap, seg_start_verse)
        if seg_start_verse == seg_end_verse:
            t_end = None
        else:
            t_end = bbcccvvv(book, chap, seg_end_verse)
        rows.append((t_start, t_end))

        # Done?
        if book == end_book and chap == end_chap:
            break

        # Advance to next chapter.
        chap += 1
        if chap > CHAPTERS[book]:
            if book == end_book:
                # Shouldn't happen; guard against infinite loop.
                break
            split_report_lines  # already cross-book; keep going
            book += 1
            chap = 1

    if cross_book:
        orig_start = f'{start_book:02d}.{start_chap}.{start_verse}'
        orig_end   = f'{end_book:02d}.{end_chap}.{end_verse}'
        split_report_lines.append(
            f'CROSS-BOOK  {orig_start} — {orig_end}  votes={votes}  '
            f'→ {len(rows)} rows'
        )
        for t_start, t_end in rows:
            split_report_lines.append(f'    {t_start}  {t_end}')

    return rows


def build_schema(conn):
    conn.executescript("""
        DROP TABLE IF EXISTS cross_references;

        CREATE TABLE cross_references (
            source_verse  INTEGER NOT NULL,
            target_start  INTEGER NOT NULL,
            target_end    INTEGER,
            votes         INTEGER NOT NULL DEFAULT 0,
            sources       TEXT NOT NULL DEFAULT 'ob'
        );

        CREATE INDEX idx_crossrefs_source_votes
            ON cross_references(source_verse, votes DESC);
    """)


def ingest(conn, source_path: str, split_report_path: str):
    # (source_verse, target_start, target_end) → max votes
    dedup: dict[tuple, int] = {}

    skipped   = 0
    raw_rows  = 0
    split_rows = 0
    split_report_lines = []

    with open(source_path, encoding='utf-8') as fh:
        next(fh)  # skip header

        for lineno, line in enumerate(fh, start=2):
            cols = line.rstrip('\n').split('\t')
            if len(cols) < 3:
                skipped += 1
                continue

            from_token, to_token, votes_str = cols[0], cols[1], cols[2]

            try:
                votes = int(votes_str)
            except ValueError:
                skipped += 1
                continue

            # Parse source (always a single verse).
            src = parse_ref(from_token)
            if src is None:
                skipped += 1
                continue
            source_verse = bbcccvvv(*src)

            # Parse target — may be 'Book.Ch.V' or 'Book.Ch.V-Book.Ch.V'.
            if '-' in to_token:
                halves = to_token.split('-', 1)
                t_start_ref = parse_ref(halves[0])
                t_end_ref   = parse_ref(halves[1])
                if t_start_ref is None or t_end_ref is None:
                    skipped += 1
                    continue

                sb, sc, sv = t_start_ref
                eb, ec, ev = t_end_ref

                if sb == eb and sc == ec:
                    # Same chapter — one row.
                    raw_rows += 1
                    t_start = bbcccvvv(sb, sc, sv)
                    t_end   = bbcccvvv(eb, ec, ev)
                    if t_start == t_end:
                        t_end = None
                    key = (source_verse, t_start, t_end)
                    dedup[key] = max(dedup.get(key, votes), votes)

                else:
                    # Cross-chapter or cross-book — split.
                    raw_rows += 1
                    segs = split_range(
                        conn, sb, sc, sv, eb, ec, ev, votes,
                        split_report_lines,
                    )
                    for t_start, t_end in segs:
                        split_rows += 1
                        key = (source_verse, t_start, t_end)
                        dedup[key] = max(dedup.get(key, votes), votes)

            else:
                # Single-verse target.
                raw_rows += 1
                t_ref = parse_ref(to_token)
                if t_ref is None:
                    skipped += 1
                    raw_rows -= 1
                    continue
                t_start = bbcccvvv(*t_ref)
                key = (source_verse, t_start, None)
                dedup[key] = max(dedup.get(key, votes), votes)

    # Bulk insert.
    conn.executemany(
        'INSERT INTO cross_references (source_verse, target_start, target_end, votes, sources) '
        'VALUES (?, ?, ?, ?, ?)',
        [
            (src_v, t_s, t_e, votes, 'ob')
            for (src_v, t_s, t_e), votes in dedup.items()
        ],
    )
    conn.commit()

    # Write split report.
    with open(split_report_path, 'w', encoding='utf-8') as rpt:
        rpt.write('Cross-reference split report\n')
        rpt.write('=' * 60 + '\n\n')
        if split_report_lines:
            rpt.write('\n'.join(split_report_lines))
            rpt.write('\n')
        else:
            rpt.write('(no cross-book splits)\n')

    return {
        'raw_rows':   raw_rows,
        'split_rows': split_rows,
        'dedup_rows': len(dedup),
        'skipped':    skipped,
    }


def spot_check(conn):
    """Quick sanity check: John 3:16 top cross-references."""
    john_3_16 = bbcccvvv(43, 3, 16)
    rows = conn.execute(
        'SELECT target_start, target_end, votes FROM cross_references '
        'WHERE source_verse = ? ORDER BY votes DESC LIMIT 10',
        (john_3_16,),
    ).fetchall()
    print('\nSpot check — John 3:16 top cross-references:')
    if not rows:
        print('  (none found — check ingestion)')
        return
    for t_start, t_end, v in rows:
        book    = t_start // 1_000_000
        chapter = (t_start % 1_000_000) // 1_000
        verse   = t_start % 1_000
        if t_end:
            eb = t_end // 1_000_000
            ec = (t_end % 1_000_000) // 1_000
            ev = t_end % 1_000
            ref = f'{book} {chapter}:{verse}–{eb} {ec}:{ev}'
        else:
            ref = f'{book} {chapter}:{verse}'
        print(f'  votes={v:4d}  {ref}')


def main():
    parser = argparse.ArgumentParser(description='Ingest OpenBible cross-refs into core.db')
    parser.add_argument('--db',  default='data/core.db',
                        help='Path to core.db (default: data/core.db)')
    parser.add_argument('--src', default='build/sources/cross_references.txt',
                        help='Path to OpenBible cross_references.txt')
    parser.add_argument('--report', default='scripts/crossref_split_report.txt',
                        help='Output path for cross-book split report')
    args = parser.parse_args()

    # Resolve paths relative to the project root (one level up from scripts/).
    script_dir   = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    db_path     = os.path.join(project_root, args.db)
    src_path    = os.path.join(project_root, args.src)
    report_path = os.path.join(project_root, args.report)

    for path, label in [(db_path, 'core.db'), (src_path, 'cross_references.txt')]:
        if not os.path.exists(path):
            print(f'ERROR: {label} not found at {path}', file=sys.stderr)
            sys.exit(1)

    print(f'Opening database: {db_path}')
    print(f'Source file:      {src_path}')

    conn = sqlite3.connect(db_path)

    print('Building schema…')
    build_schema(conn)

    print('Ingesting cross-references…')
    stats = ingest(conn, src_path, report_path)

    total = conn.execute('SELECT COUNT(*) FROM cross_references').fetchone()[0]
    neg   = conn.execute('SELECT COUNT(*) FROM cross_references WHERE votes < 0').fetchone()[0]
    zero  = conn.execute('SELECT COUNT(*) FROM cross_references WHERE votes = 0').fetchone()[0]

    print()
    print(f'  Raw OpenBible rows read:  {stats["raw_rows"]:>8,}')
    print(f'  Rows from range splits:   {stats["split_rows"]:>8,}')
    print(f'  Rows after dedup:         {stats["dedup_rows"]:>8,}')
    print(f'  Skipped (bad tokens):     {stats["skipped"]:>8,}')
    print(f'  Negative-vote rows:       {neg:>8,}')
    print(f'  Zero-vote rows:           {zero:>8,}')
    print(f'  Total rows in DB:         {total:>8,}  (expected ~345,500)')

    if abs(total - 345_500) > 2_000:
        print(f'  WARNING: row count {total:,} is far from expected ~345,500 — check ingestion')

    spot_check(conn)

    print(f'\nSplit report written to: {report_path}')
    conn.close()
    print('Done.')


if __name__ == '__main__':
    main()
