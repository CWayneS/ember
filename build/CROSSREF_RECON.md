# Cross-Reference Data — Build 2 Reconnaissance

## Source

- **File:** `build/sources/cross_references.txt`
- **Origin:** OpenBible.info cross-references, mirrored at
  `scrollmapper/bible_databases` → `sources/extras/cross_references.txt`
- **License:** CC-BY (openbible.info/labs/cross-references/)
- **Snapshot date:** 2024-11-04 (embedded in the file header)

---

## Format

Tab-separated, three meaningful columns:

```
From Verse    To Verse              Votes
Gen.1.1       Acts.14.15            62
Rom.8.28      1Pet.5.10             496
Rom.8.28      Rom.5.3-Rom.5.5       263
```

- **Verse format:** `BookName.Chapter.Verse` — full OpenBible book tokens
  (e.g. `Ps`, `1Kgs`, `1John`, `Phlm`). No abbreviation ambiguity.
- **Range format:** `BookName.Chapter.Verse-BookName.Chapter.Verse`
  — always exactly two endpoints, never a chained triple.
- The fourth column in the header is a license comment; treat it as junk.

### Book name mapping

All 66 OpenBible tokens map cleanly to our book IDs with a simple lookup
table. No aliases, no gaps, no collisions — unlike the Nave's abbreviation
problem. See `build/build_db.py` `NAVE_ABBREVS` for contrast.

---

## Scale

| Metric | Count |
|---|---:|
| Total cross-reference rows | 344,799 |
| Rows with a range as To Verse | 88,150 (25.6%) |
| Rows with a single verse as To Verse | 256,649 (74.4%) |
| Range: same chapter | 87,495 |
| Range: cross chapter (same book) | 655 |
| Range: cross book | 18 |

---

## Vote Distribution

Votes represent community up/down voting on OpenBible.info. Negative votes
are possible (someone actively disagreed with the connection).

| Range | Count | % |
|---|---:|---:|
| Negative (<0) | 1,166 | 0.3% |
| Zero | 2,248 | 0.7% |
| Low (1–10) | 309,508 | 89.8% |
| Mid (11–50) | 28,624 | 8.3% |
| High (51–100) | 2,221 | 0.6% |
| Very high (>100) | 1,032 | 0.3% |
| **Max** | **1,268** | — |

**The long tail is the core curation problem.** 90% of links are in the
1–10 vote bucket. A vote floor of ~5 cuts the dataset to roughly 35,000
links — a manageable, high-signal set. A floor of 10 gives ~22,000.
The right threshold is a product decision, not a data problem.

---

## The Range Problem

25.6% of `To Verse` entries are ranges, and the highest-voted links in the
entire dataset are ranges:

| To Verse | Votes |
|---|---:|
| Eph.1.4–Eph.1.5 | 1,268 |
| Isa.55.8–Isa.55.12 | 1,130 |
| 2Cor.12.9–2Cor.12.10 | 734 |
| 1John.4.9–1John.4.10 | 618 |
| Jer.17.7–Jer.17.8 | 587 |

Ranges cannot be discarded. Three ingestion strategies:

**Option A — Expand to individual verse links**
Expand `Rom.5.3-Rom.5.5` → three rows (Rom 5:3, 5:4, 5:5), each
inheriting the original vote count. Simple to implement; inflates row
count; loses the "this is a passage, not a verse" intent.

**Option B — Link to first verse only**
Store only the start verse, ignore the end. Loses fidelity on long
ranges (Isa 55:8–12 becomes just Isa 55:8).

**Option C — Native range support in the schema**
Add a `to_verse_end` column (nullable integer). Single-verse links have
NULL there; ranges store both endpoints. The UI can then highlight a
passage span rather than a single verse. Most faithful to the source;
requires the reader to understand passage highlighting.

**Preliminary recommendation:** Option C. The data has ranges at the top of
its quality distribution — the schema should represent them honestly.

---

## Nave's Topic Overlap as a Quality Signal

Cross-checked against our 218 visible Nave's topics for 11 verses spanning
all six genres. Key finding: **topic co-membership between source and
target verse is a strong secondary quality signal**, independent of vote
count.

Results by verse:

| Verse | Total xrefs | Topic overlap | Notes |
|---|---:|---:|---|
| Romans 8:28 | 43 | 38/43 (88%) | Very tight neighborhood |
| Isaiah 53:5 | 19 | 17/19 (89%) | ATONEMENT dominates |
| Ephesians 2:8 | 36 | 28/36 (78%) | FAITH+GRACE+SALVATION cluster |
| Proverbs 3:5 | 21 | 17/21 (81%) | Huge vote counts (714, 587…) |
| Hebrews 11:1 | 23 | 15/23 (65%) | FAITH + HOPE |
| 1 Corinthians 13:4 | 53 | 25/53 (47%) | Wide topic footprint |
| Matthew 5:3 | 51 | 29/51 (57%) | HUMILITY + POOR strong |
| Genesis 3:15 | 47 | 22/47 (47%) | SATAN + SIN + TEMPTATION |
| Psalm 23:1 | 23 | 7/23 (30%) | BLESSING + FAITH |
| Revelation 3:20 | 6 | 2/6 (33%) | Sparse neighborhood overall |
| John 1:1 | 36 | 2/36 (6%) | **Curation gap** — see below |

**Pattern:** `high votes + shared topic` is almost always a genuinely
useful link. `High votes + no shared topic` is worth investigating case
by case.

---

## Identified Curation Gap: Johannine / Christological Topics

John 1:1 has 36 cross-references and only 2 share a visible topic
(`WISDOM`, via the Prov 8:22 parallel). Its top links — Gen 1:1,
John 17:5, Rev 19:13 — are theologically rich but get no Nave's match
because the visible topic list has no chip for:

- INCARNATION
- TRINITY (visible, but John 1:1 → Rev 19:13 didn't match it)
- LOGOS / WORD OF GOD (WORD OF GOD is visible — may be a parsing miss)

This is a known gap in the Nave's curation, not a problem with the
cross-reference data. Worth revisiting before Build 2 ships topic chips
alongside cross-references.

---

## Preliminary Conclusions for Build 2

1. **Vote floor required.** Display links with votes ≥ 5 (or ≥ 10) only.
   The 1–10 bucket is too noisy for UI display; it can remain in the DB
   for programmatic use.

2. **Use native range support (Option C).** Add `to_verse_end INTEGER`
   to the cross-references table. The highest-quality links are ranges.

3. **Index on `from_verse_id`.** The query pattern is always "give me all
   references from verse X, ordered by votes desc." A single index on
   `(from_verse_id, votes DESC)` covers it.

4. **Negative votes are real.** Don't silently discard them — store them
   and let the floor filter handle it. They may be useful for identifying
   spurious links.

5. **Topic overlap is free at query time.** No extra storage needed — the
   `topic_verses` table already exists. A JOIN at display time can
   annotate which cross-references share a Nave's chip with the source
   verse, enabling a "why is this linked" tooltip or visual indicator.

6. **Revisit visible topic list before Build 2.** John 1:1's neighborhood
   exposes gaps in Christological coverage. A focused pass adding
   INCARNATION and auditing WORD OF GOD / TRINITY coverage would improve
   cross-reference relevance significantly.
