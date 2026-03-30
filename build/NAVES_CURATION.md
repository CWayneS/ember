# Nave's Topical Bible — Curation Notes

## Source Data

- **File:** `build/sources/NavesTopicalDictionary.csv`
- **Origin:** BradyStephenson/bible-data on GitHub
- **Contents:** 5,319 topics from Nave's Topical Bible (public domain). Each row has a topic
  name, a section letter (A–Z), and a full entry block with sub-entries and verse references.
- **Reference format:** Semicolon-separated segments, e.g. `GEN 3:15; 22:18; MAT 1:21`.
  Bare continuations like `3:15; 22:18` carry forward the last-seen book abbreviation.
- **Supporting files:**
  - `build/sources/HitchcocksBibleNamesDictionary.csv` — 2,623 proper Bible names used to
    identify person/place topics
  - `build/sources/theological_keywords.txt` — 293 hand-curated theological terms

---

## Curation Rules (applied in order)

1. **Keyword match → visible (`display=1`)**
   If the topic name matches a term in `theological_keywords.txt` (case-insensitive), it is
   shown as a chip in the UI. The keyword list was built by hand and cross-checked against
   Nave's topic names to align on exact phrasing (e.g. `BACKSLIDERS` not `BACKSLIDING`,
   `GRACE OF GOD` not `GRACE`).

2. **Hitchcock match → searchable-only (`display=0`)**
   If the topic name matches a name in Hitchcock's Bible Names Dictionary, it is treated as a
   proper name and suppressed from UI chips. Covers 2,277 of 5,319 topics (42.7%).

3. **Too few references → searchable-only**
   Topics with fewer than 20 verse mappings are suppressed. These tend to be narrow
   ceremonial, geographic, or incidental entries unlikely to be useful as navigation chips.

4. **Too many references → searchable-only**
   Topics with more than 300 verse mappings are suppressed. At that scale the topic is too
   generic to be a useful chip (e.g. MINISTER, Christian: 400 refs; QUOTATIONS AND ALLUSIONS:
   560 refs). GOD and JESUS, THE CHRIST are the only exceptions — see overrides below.

5. **Everything else → searchable-only**
   Any topic not caught by rules 1–4 falls through to `display=0`. These remain in the
   database and are available for full-text topic search; they just do not appear as chips.

---

## Final Counts

| Bucket          | Count |
|-----------------|------:|
| Visible (chips) |   218 |
| Searchable-only | 5,101 |
| **Total topics**| **5,319** |
| Verse mappings  | 138,031 |

---

## Manual Overrides

After automated classification, 154 topics in the `needs_review` bucket were resolved by
hand. Notable decisions:

**Promoted to visible despite failing automated rules:**

- `GOD` (995 refs) and `JESUS, THE CHRIST` (919 refs) — exceeded the 300-ref ceiling but are
  the two most important topics in the dataset. Forced to visible.
- `ANGEL (a spirit)`, `APOSTLES`, `CHILDREN`, `FAMILY`, `WOMEN`, `WAR`, `RULERS`, `WICKED
  (PEOPLE)` — broad or narrative topics promoted because they are genuinely useful navigation
  chips for study.
- `ANGER`, `ENVY`, `FEAR`, `PRIDE`, `COVETOUSNESS`, `HYPOCRISY`, `DECEIT`, `MALICE`, etc. —
  character/sin topics that missed the keyword list but are clearly theological.
- `ISRAEL, PROPHECIES CONCERNING` and `ZEAL, RELIGIOUS` — retained despite the comma/qualifier
  in the name; too important to drop.

**Forced to searchable-only despite automated pass:**

- ~76 topics were deemed too narrow, culturally specific, or redundant with better chips
  (e.g. `ABLUTION`, `ARCHERY`, `ARMIES`, `DIPLOMACY`, `SANITATION`, `SYMBOLS AND SIMILITUDES`).

---

## Known Limitations

**Unparseable verse references (25 segments, 0.04% miss rate):**
Most are `So 7:5`-style references where "So" (Song of Solomon) appears lowercase in some
entries and does not match the uppercase-only abbreviation regex. Also a handful of bare
continuation segments that appear without a preceding book anchor. Impact is negligible.

**Topics that may need revisiting:**
- Some strong theological verses have zero visible chips (e.g. Jer 51:19 — "he is the former
  of all things" — touches CREATION and SOVEREIGNTY but fell through Nave's indexing).
  This is a Nave's coverage gap, not a curation bug.
- `HEART` appears as a chip on verses where it is incidental rather than thematic (the word
  just appears in Nave's HEART index as a cross-reference).
- The 20-ref floor may be too conservative for some short epistles — a topic with 15 refs in
  Philemon is proportionally significant but gets suppressed.

**What we punted on:**
- No sub-entry parsing. Nave's entries use a `-` prefix for sub-topics; we store the entire
  entry text as a blob and index at the topic level only.
- No deduplication of near-synonyms (e.g. `SIN` and `SINCERITY` are separate topics; so are
  `RIGHTEOUS` and `RIGHTEOUSNESS`). Both appear as chips when applicable.

---

## Re-running Curation

The classification rules live entirely in `build/build_db.py` in the `_nave_display()` and
`insert_naves()` functions. To change thresholds or add keywords, edit those files and
rebuild:

```
rm data/core.db
python3 build/build_db.py
```

The keyword list is at `build/sources/theological_keywords.txt` — one term per line,
lowercase. Add terms there to promote topics to visible without touching the build script.

The classification audit trail is preserved at `build/output/naves_classification.csv`
(all 5,319 topics with rule applied) and `build/output/naves_needs_review.csv` (the 154
topics resolved by manual review).
