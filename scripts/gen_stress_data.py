#!/usr/bin/env python3
"""Generates user data for the longevity stress test (tests/stress.py).

Writes tests/stress-data/stress-{0,1,10,25,40}y.db (gitignored), each with a
.json sidecar of its counts and search tokens. Every file starts from base.db:
a core.db the app itself created and exported (`python3 tests/stress.py base`),
so the schema, the seeded plans and templates, and the meta row are the app's
own rather than a retyped copy of createUserTables().

Usage (from the repo root):
   python3 tests/stress.py base
   python3 scripts/gen_stress_data.py            # all profiles
   python3 scripts/gen_stress_data.py 1 10       # just these years
"""
import json, os, random, re, shutil, sqlite3, sys
from collections import Counter
from itertools import accumulate
from datetime import datetime, timedelta

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'tests', 'stress-data')
BASE_DB  = os.path.join(DATA_DIR, 'base.db')
KJV_DB   = os.path.join(ROOT, 'data', 'translations', 'kjv.db')

PROFILES = (1, 10, 25, 40)

# Growth rates — a heavy, consistent user. Change these and regenerate.
WEEKS_PER_YEAR      = 52
MONTHS_PER_YEAR     = 12
NOTES_PER_WEEK      = 15
NOTE_BODY_MIN_CHARS = 50
NOTE_BODY_MAX_CHARS = 8000
NOTE_BODY_LOG_MU    = 7.02   # lognormal, averages ~1,500 chars after clipping
NOTE_BODY_LOG_SIGMA = 0.85
ANCHOR_COUNT_CHOICES = (1, 1, 2, 2, 2, 3, 3)    # averages 2 per note
ANCHOR_RANGE_SHARE  = 0.25
ANCHOR_RANGE_MAX    = 8      # verses
TAG_VOCABULARY_AT_40_YEARS = 2000
TAG_VOCABULARY_GROWTH = 0.6  # sublinear: new tags get rarer as the vocabulary fills in
TAGS_PER_NOTE       = 3
STUDIES_PER_YEAR    = 26
STUDIES_ACTIVE_AT_ONCE = 4   # a note goes to one of the most recently begun studies
MARKUPS_PER_WEEK    = 10
MARKUP_RANGE_SHARE  = 0.2
BOOKMARKS_PER_MONTH = 2
PLANS_PER_YEAR      = 1

# Hot spots real use creates. The two made of notes scale with the profile,
# since a 2,000-note study can't exist in a 780-note year; they are part of the
# note total, not on top of it. Psalm 119's markups are constant.
HOT_VERSE_NOTES_AT_40_YEARS = 300
HOT_STUDY_NOTES_AT_40_YEARS = 2000
HOT_MIN_NOTES       = 8
HOT_VERSE_ID        = 43003016   # John 3:16
HOT_MARKUP_CHAPTER  = (19, 119)  # Psalm 119
HOT_MARKUP_SHARE    = 0.9
HOT_STUDY_NAME      = 'Stress Hot Spot Study'

MARKUP_STYLES = [('highlight', c) for c in ('yellow', 'green', 'blue', 'pink', 'orange')] \
              + [('underline', 'solid'), ('underline', 'wavy'), ('circle', 'ink')]

# Search tokens planted where a check can find them: no KJV word contains these.
PLANTED_ANYWHERE  = 'zzplantedanywhere'
PLANTED_HOT_STUDY = 'zzplantedhotstudy'
PLANTED_HOT_VERSE = 'zzplantedhotverse'

# The most common word in the corpus would be "the"; this is what a person types.
COMMON_SEARCH_WORD = 'lord'

SEED = 1611


def load_kjv():
    kjv = sqlite3.connect(f'file:{KJV_DB}?mode=ro', uri=True)
    verses = kjv.execute('SELECT book, chapter, verse, text FROM verses WHERE verse > 0 ORDER BY book, chapter, verse').fetchall()
    kjv.close()
    return verses


def verse_id(book, chapter, verse):
    return book * 1_000_000 + chapter * 1000 + verse


def timestamp(start, span_seconds, position, rng):
    """position in [0, 1) through the profile's years, so rowids stay chronological."""
    return start + timedelta(seconds=span_seconds * position + rng.randint(0, 3600))


def sql_time(moment):
    return moment.strftime('%Y-%m-%d %H:%M:%S')


def note_body(texts, rng):
    """Real KJV phrases, so the FTS4 index is realistically sized."""
    target = int(rng.lognormvariate(NOTE_BODY_LOG_MU, NOTE_BODY_LOG_SIGMA))
    target = max(NOTE_BODY_MIN_CHARS, min(NOTE_BODY_MAX_CHARS, target))
    parts, length = [], 0
    while length < target:
        words = rng.choice(texts).split()
        start = rng.randrange(len(words))
        phrase = ' '.join(words[start:start + rng.randint(3, 14)])
        parts.append(phrase)
        length += len(phrase) + 1
    return ' '.join(parts)[:target]


def make_anchor(verses, index_by_id, rng):
    """A (verse_start, verse_end) pair: mostly single verses, some ranges within a chapter."""
    position = rng.randrange(len(verses))
    book, chapter, verse, _ = verses[position]
    if rng.random() >= ANCHOR_RANGE_SHARE:
        return verse_id(book, chapter, verse), None
    last = verse
    for _ in range(rng.randint(1, ANCHOR_RANGE_MAX - 1)):
        following = index_by_id.get(verse_id(book, chapter, last + 1))
        if following is None:
            break
        last += 1
    return verse_id(book, chapter, verse), (verse_id(book, chapter, last) if last > verse else None)


def clone_plan(db, source_row_id, year):
    """One finished plan a year. The schema stores progress per plan, not per run,
    so a re-read of the same plan couldn't accumulate: each year gets its own row,
    days and scripture, the most this data could cost."""
    source = db.execute('SELECT plan_id, title, description, author, language, duration_days, tags, schema_version '
                        'FROM plans WHERE id = ?', (source_row_id,)).fetchone()
    cursor = db.execute(
        'INSERT INTO plans (plan_id, title, description, author, language, duration_days, tags, schema_version, '
        "source, imported_at, current_step, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?, 'completed')",
        (f'{source[0]}-year-{year}', f'{source[1]} (Year {year})', *source[2:], 1_500_000_000 + year * 31_536_000, source[5]))
    new_id = cursor.lastrowid
    db.execute('INSERT INTO plan_days (plan_id, day_number, title, devotional_title, devotional_body, reflection_questions_json) '
               'SELECT ?, day_number, title, devotional_title, devotional_body, reflection_questions_json '
               'FROM plan_days WHERE plan_id = ?', (new_id, source_row_id))
    db.execute('INSERT INTO plan_day_scripture (plan_id, day_number, sequence, ref, display, book, chapter, verse_start, verse_end) '
               'SELECT ?, day_number, sequence, ref, display, book, chapter, verse_start, verse_end '
               'FROM plan_day_scripture WHERE plan_id = ?', (new_id, source_row_id))


def tag_vocabulary(texts, size, rng):
    words = sorted({w for text in texts for w in re.findall(r'[a-z]{4,}', text.lower())})
    rng.shuffle(words)
    return words[:size]


def finish(db):
    """Nothing left in a -wal file, and the file passes SQLite's own checks."""
    db.commit()
    db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    db.execute('PRAGMA journal_mode=DELETE')
    integrity = db.execute('PRAGMA integrity_check').fetchone()[0]
    if integrity != 'ok':
        raise SystemExit(f'integrity_check failed: {integrity}')
    db.execute("INSERT INTO notes_fts(notes_fts) VALUES('integrity-check')")
    db.commit()
    return integrity


def generate(years, verses):
    rng = random.Random(SEED + years)
    texts = [row[3] for row in verses]
    index_by_id = {verse_id(b, c, v): i for i, (b, c, v, _) in enumerate(verses)}

    path = os.path.join(DATA_DIR, f'stress-{years}y.db')
    shutil.copy(BASE_DB, path)
    db = sqlite3.connect(path)
    db.execute('PRAGMA journal_mode=DELETE')
    db.execute('PRAGMA synchronous=OFF')

    start = datetime(2026, 1, 1) - timedelta(days=365 * years)
    span  = years * 365 * 86400

    # ---- studies
    hot_study_notes = max(HOT_MIN_NOTES, round(HOT_STUDY_NOTES_AT_40_YEARS * years / 40))
    hot_verse_notes = max(HOT_MIN_NOTES, round(HOT_VERSE_NOTES_AT_40_YEARS * years / 40))
    study_count = STUDIES_PER_YEAR * years
    study_ids = []
    for i in range(study_count):
        book = rng.choice(verses)[0]
        moment = timestamp(start, span, i / study_count, rng)
        cursor = db.execute('INSERT INTO studies (name, created_at, modified_at) VALUES (?, ?, ?)',
                            (f'Study {i + 1}: book {book}', sql_time(moment), sql_time(moment)))
        study_ids.append(cursor.lastrowid)
    hot_study_id = study_ids[0]
    db.execute('UPDATE studies SET name = ? WHERE id = ?', (HOT_STUDY_NAME, hot_study_id))

    # ---- tags
    vocabulary = tag_vocabulary(texts, round(TAG_VOCABULARY_AT_40_YEARS * (years / 40) ** TAG_VOCABULARY_GROWTH), rng)
    tag_ids = [db.execute('INSERT INTO tags (name) VALUES (?)', (name,)).lastrowid for name in vocabulary]
    tag_cumulative_weights = list(accumulate(1 / (rank + 1) for rank in range(len(tag_ids))))  # a few tags get most of the use

    # ---- notes, anchors, tag assignments, FTS index
    note_count = NOTES_PER_WEEK * WEEKS_PER_YEAR * years
    in_hot_study = set(rng.sample(range(note_count), hot_study_notes))
    on_hot_verse = set(rng.sample(range(note_count), hot_verse_notes))
    planted = {rng.randrange(note_count): PLANTED_ANYWHERE,
               rng.choice(sorted(in_hot_study)): PLANTED_HOT_STUDY,
               rng.choice(sorted(on_hot_verse)): PLANTED_HOT_VERSE}
    anchor_total = assignment_total = char_total = 0
    document_frequency = Counter()

    for i in range(note_count):
        position = i / note_count
        moment = sql_time(timestamp(start, span, position, rng))
        body = note_body(texts, rng)
        if i in planted:
            body = f'{body} {planted[i]}'
        # Never the hot study unless chosen above: its size is set exactly.
        recent = int(position * study_count) - rng.randrange(STUDIES_ACTIVE_AT_ONCE)
        study_id = hot_study_id if i in in_hot_study else study_ids[max(1, recent)]
        note_id = db.execute('INSERT INTO notes (body, created_at, modified_at, study_id) VALUES (?, ?, ?, ?)',
                             (body, moment, moment, study_id)).lastrowid
        db.execute('INSERT INTO notes_fts(rowid, body) VALUES (?, ?)', (note_id, body))
        char_total += len(body)
        document_frequency.update(set(re.findall(r'[a-z]+', body.lower())))

        anchors = [make_anchor(verses, index_by_id, rng) for _ in range(rng.choice(ANCHOR_COUNT_CHOICES))]
        if i in on_hot_verse:
            anchors[0] = (HOT_VERSE_ID, None)
        for verse_start, verse_end in anchors:
            db.execute('INSERT INTO note_anchors (note_id, verse_start, verse_end) VALUES (?, ?, ?)',
                       (note_id, verse_start, verse_end))
        anchor_total += len(anchors)

        chosen = set()
        while len(chosen) < TAGS_PER_NOTE:
            chosen.add(rng.choices(tag_ids, cum_weights=tag_cumulative_weights)[0])
        for tag_id in chosen:
            db.execute('INSERT INTO tag_assignments (tag_id, note_id) VALUES (?, ?)', (tag_id, note_id))
        assignment_total += len(chosen)

    # ---- markups, with Psalm 119 first so its share is guaranteed
    markup_count = MARKUPS_PER_WEEK * WEEKS_PER_YEAR * years
    book, chapter = HOT_MARKUP_CHAPTER
    psalm_verses = [verse_id(*row[:3]) for row in verses if row[0] == book and row[1] == chapter]
    hot_markups = rng.sample(psalm_verses, round(len(psalm_verses) * HOT_MARKUP_SHARE))
    for i in range(markup_count):
        if i < len(hot_markups):
            verse_start, verse_end = hot_markups[i], None
        else:
            verse_start, verse_end = make_anchor(verses, index_by_id, rng)
            if verse_end is not None and rng.random() >= MARKUP_RANGE_SHARE / ANCHOR_RANGE_SHARE:
                verse_end = None
        kind, color = rng.choice(MARKUP_STYLES)
        created = int(timestamp(start, span, i / markup_count, rng).timestamp() * 1000)
        db.execute('INSERT INTO markups (verse_start, verse_end, type, color, created_at) VALUES (?, ?, ?, ?, ?)',
                   (verse_start, verse_end, kind, color, created))

    # ---- bookmarks
    bookmark_count = BOOKMARKS_PER_MONTH * MONTHS_PER_YEAR * years
    for i in range(bookmark_count):
        book_id, chapter_id, verse, _ = rng.choice(verses)
        label = ' '.join(rng.choice(texts).split()[:3]) if rng.random() < 0.5 else None
        db.execute('INSERT INTO bookmarks (verse_id, label, created_at) VALUES (?, ?, ?)',
                   (verse_id(book_id, chapter_id, verse), label, sql_time(timestamp(start, span, i / bookmark_count, rng))))

    # ---- reading plans
    bundled = [row[0] for row in db.execute("SELECT id FROM plans WHERE source = 'bundled' ORDER BY id")]
    plan_count = PLANS_PER_YEAR * years
    for year in range(1, plan_count + 1):
        clone_plan(db, bundled[year % len(bundled)], year)

    integrity = finish(db)
    db.close()

    # A word in roughly 0.2% of notes, however large the profile.
    target = max(2, note_count // 500)
    rare_word = min((word for word, df in document_frequency.items() if df >= 2 and len(word) >= 6),
                    key=lambda word: (abs(document_frequency[word] - target), word))
    sidecar = {
        'years': years, 'integrity_check': integrity,
        'counts': {
            'notes': note_count, 'avg_body_chars': round(char_total / note_count), 'anchors': anchor_total,
            'tags': len(tag_ids), 'tag_assignments': assignment_total, 'studies': study_count,
            'markups': markup_count, 'bookmarks': bookmark_count, 'completed_plans': plan_count,
            'hot_verse_notes': hot_verse_notes, 'hot_study_notes': hot_study_notes, 'hot_psalm_markups': len(hot_markups),
        },
        'search': {'common': COMMON_SEARCH_WORD, 'rare': rare_word, 'rare_note_count': document_frequency[rare_word],
                   'planted': PLANTED_ANYWHERE, 'planted_hot_study': PLANTED_HOT_STUDY, 'planted_hot_verse': PLANTED_HOT_VERSE},
        'hot_study': {'id': hot_study_id, 'name': HOT_STUDY_NAME},
        'file_bytes': os.path.getsize(path),
    }
    with open(os.path.join(DATA_DIR, f'stress-{years}y.json'), 'w') as fh:
        json.dump(sidecar, fh, indent=1)
    print(f"{years:>3}y  {sidecar['file_bytes'] / 1e6:7.1f} MB  {json.dumps(sidecar['counts'])}")


def generate_control():
    """0y: the app's own database with no user data, the fixed cost every profile includes."""
    path = os.path.join(DATA_DIR, 'stress-0y.db')
    shutil.copy(BASE_DB, path)
    db = sqlite3.connect(path)
    db.execute('PRAGMA journal_mode=DELETE')
    integrity = finish(db)
    db.close()
    sidecar = {'years': 0, 'integrity_check': integrity, 'counts': {'notes': 0}, 'search': {'common': COMMON_SEARCH_WORD},
               'hot_study': None, 'file_bytes': os.path.getsize(path)}
    with open(os.path.join(DATA_DIR, 'stress-0y.json'), 'w') as fh:
        json.dump(sidecar, fh, indent=1)
    print(f"  0y  {sidecar['file_bytes'] / 1e6:7.1f} MB  (control)")


def main():
    if not os.path.exists(BASE_DB):
        raise SystemExit(f'{BASE_DB} is missing. Run `python3 tests/stress.py base` first.')
    years = [int(a) for a in sys.argv[1:]] or list(PROFILES)
    verses = load_kjv()
    generate_control()
    for profile in years:
        generate(profile, verses)


if __name__ == '__main__':
    main()
