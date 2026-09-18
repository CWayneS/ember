# Cross-Reference Audit Bundle

Raw extracted material only — no interpretation. Assembled from the live `main` branch (HEAD `0c9172f`) of `/home/wayne/ember`.

Note: the requester referred to the recon doc as `docs/CROSSREF_RECON.md`. Its actual path in the repo is `build/CROSSREF_RECON.md`. Content below is from that actual path.

---

## 1. Full contents of `build/CROSSREF_RECON.md`

```markdown
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
```

---

## 2. `js/db.js` — tuning constants + `getCrossReferencesForVerse`

### Constants (`js/db.js:5-6`)

```js
const CROSSREF_VOTE_FLOOR_DEFAULT = 5;
const CROSSREF_TOP_N_DEFAULT      = 25;
```

### Function (`js/db.js:1653-1689`)

```js
// Returns cross-references for a single verse (use verse_start for ranges).
// Options:
//   floor   — minimum votes to include (default: window.emberDebug.crossrefFloor ?? 5)
//   limit   — max rows to return (default: window.emberDebug.crossrefTopN ?? 25)
//   showAll — if true, ignore floor and limit entirely
// Returns [] when no results.
export function getCrossReferencesForVerse(verseId, options = {}) {
    const floor = options.showAll ? null
        : (options.floor   ?? window.emberDebug?.crossrefFloor  ?? CROSSREF_VOTE_FLOOR_DEFAULT);
    const limit = options.showAll ? null
        : (options.limit   ?? window.emberDebug?.crossrefTopN   ?? CROSSREF_TOP_N_DEFAULT);

    let stmt;
    if (options.showAll) {
        stmt = db.prepare(
            `SELECT target_start, target_end, votes
             FROM cross_references
             WHERE source_verse = ?
             ORDER BY votes DESC, target_start ASC`
        );
        stmt.bind([verseId]);
    } else {
        stmt = db.prepare(
            `SELECT target_start, target_end, votes
             FROM cross_references
             WHERE source_verse = ? AND votes >= ?
             ORDER BY votes DESC, target_start ASC
             LIMIT ?`
        );
        stmt.bind([verseId, floor, limit]);
    }

    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}
```

---

## 3. `cross_references` schema — which range option was implemented?

**Actual `CREATE TABLE`, from `scripts/build_crossrefs.py:160-174`:**

```python
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
```

**Finding:** This is structurally **Option C** (native range support — a nullable end column, single verses get NULL) — but the recon doc's proposed column name was `to_verse_end`; the implemented column is named **`target_end`** (paired with `target_start`, not `from_verse_id`/`to_verse_id` as the doc's prose used either — implementation uses `source_verse` / `target_start` / `target_end`). Single-verse rows store `target_end = NULL` (confirmed in `scripts/build_crossrefs.py:227-228` and `:253`, where `t_end` is explicitly set to `None` when start equals end or when there's no range in the source token). The index is also on `(source_verse, votes DESC)` — matching recon conclusion #3's intent, but on the actually-named `source_verse` column, not `from_verse_id`.

---

## 4. `js/reference.js` — Related tab rendering, grouping, navigate-to-crossref

Full block, `js/reference.js:189-333`:

```js
// ============================================================
// Related tab — cross-references
// ============================================================

function renderRelatedTab(verseId, book, parsed) {
    const container = document.getElementById('related-tab');
    container.innerHTML = '';

    const label = `${book.name} ${parsed.chapter}:${parsed.verse}`;

    const header = document.createElement('div');
    header.className   = 'ref-related-header';
    header.textContent = `Related to ${label}`;
    container.appendChild(header);

    const topRefs = getCrossReferencesForVerse(verseId);

    if (topRefs.length === 0) {
        const msg = document.createElement('p');
        msg.className   = 'ref-placeholder';
        msg.textContent = 'No high-signal cross-references for this verse.';
        container.appendChild(msg);

        // Check for sub-floor refs and show hint + button if any exist.
        const anyRefs = getCrossReferencesForVerse(verseId, { showAll: true });
        if (anyRefs.length > 0) {
            const hint = document.createElement('p');
            hint.className   = 'ref-placeholder';
            hint.textContent = 'Tap Show all to see the long tail.';
            container.appendChild(hint);
            container.appendChild(makeShowAllBtn(() =>
                renderRelatedShowAll(container, verseId, book, parsed)
            ));
        }
        return;
    }

    container.appendChild(renderRefList(topRefs));
    container.appendChild(makeShowAllBtn(() =>
        renderRelatedShowAll(container, verseId, book, parsed)
    ));
}

function renderRelatedShowAll(container, verseId, book, parsed) {
    container.innerHTML = '';

    const label = `${book.name} ${parsed.chapter}:${parsed.verse}`;

    const header = document.createElement('div');
    header.className   = 'ref-related-header';
    header.textContent = `Related to ${label}`;
    container.appendChild(header);

    const allRefs = getCrossReferencesForVerse(verseId, { showAll: true });

    // Group by target book in canonical (book ID) order.
    const groups = new Map();
    for (const ref of allRefs) {
        const bookId = Math.floor(ref.target_start / 1_000_000);
        if (!groups.has(bookId)) {
            const b = getBook(bookId);
            groups.set(bookId, { name: b ? b.name : `Book ${bookId}`, refs: [] });
        }
        groups.get(bookId).refs.push(ref);
    }

    for (const [, { name, refs }] of [...groups].sort(([a], [b]) => a - b)) {
        const details = document.createElement('details');
        details.className = 'ref-crossref-group';
        details.open      = true;

        const summary = document.createElement('summary');
        summary.className   = 'ref-crossref-group-header';
        summary.textContent = `${name} (${refs.length})`;
        details.appendChild(summary);
        details.appendChild(renderRefList(refs));
        container.appendChild(details);
    }

    const showTopBtn = document.createElement('button');
    showTopBtn.className   = 'ref-show-all-btn';
    showTopBtn.textContent = 'Show top 25';
    showTopBtn.addEventListener('click', () => renderRelatedTab(verseId, book, parsed));
    container.appendChild(showTopBtn);
}

// Builds an <ul> of cross-reference buttons with click-to-navigate.
function renderRefList(refs) {
    const list = document.createElement('ul');
    list.className = 'ref-crossref-list';
    for (const ref of refs) {
        const li  = document.createElement('li');
        li.className = 'ref-crossref-item';
        const btn = document.createElement('button');
        btn.className   = 'ref-crossref-btn';
        btn.textContent = refLabel(ref.target_start, ref.target_end);
        btn.addEventListener('click', () =>
            navigateToCrossRef(ref.target_start, ref.target_end || null)
        );
        li.appendChild(btn);
        list.appendChild(li);
    }
    return list;
}

// Navigate active pane to a cross-reference target and select the range.
// Skips re-render when already on the target chapter.
function navigateToCrossRef(startId, endId) {
    const s = parseVerseId(startId);
    const { book: curBook, chapter: curChapter } = getCurrentLocation();

    if (curBook !== s.book || curChapter !== s.chapter) {
        navigateTo(s.book, s.chapter);
    }

    selectVerseRange(startId, endId);
}

function makeShowAllBtn(onClick) {
    const btn = document.createElement('button');
    btn.className   = 'ref-show-all-btn';
    btn.textContent = 'Show all';
    btn.addEventListener('click', onClick);
    return btn;
}
```

Supporting label helper, `js/reference.js:316-333` (used by `renderRefList` above):

```js
function refLabel(startId, endId) {
    const s     = parseVerseId(startId);
    const sBook = getBook(s.book);
    const name  = sBook ? sBook.name : `Book ${s.book}`;

    if (!endId) return `${name} ${s.chapter}:${s.verse}`;

    const e = parseVerseId(endId);
    if (s.book === e.book && s.chapter === e.chapter) {
        return `${name} ${s.chapter}:${s.verse}–${e.verse}`;
    }
    if (s.book === e.book) {
        return `${name} ${s.chapter}:${s.verse}–${e.chapter}:${e.verse}`;
    }
    const eBook = getBook(e.book);
    const eName = eBook ? eBook.name : `Book ${e.book}`;
    return `${name} ${s.chapter}:${s.verse}–${eName} ${e.chapter}:${e.verse}`;
}
```

---

## 5. `css/style.css` — `.ref-crossref-*` rules

`css/style.css:2019-2113`:

```css
    Related tab — cross-references
    ============================================================ */

.ref-related-header {
    font-family: var(--font-display);
    font-size: var(--size-small);
    font-weight: 600;
    color: var(--text-secondary);
    padding: 10px 16px 6px;
    border-bottom: 1px solid var(--border-light);
}

.ref-crossref-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.ref-crossref-item {
    border-bottom: 1px solid var(--border-light);
}

.ref-crossref-item:last-child {
    border-bottom: none;
}

.ref-crossref-btn {
    display: block;
    width: 100%;
    text-align: left;
    padding: 7px 16px;
    font-size: var(--size-small);
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
}

.ref-crossref-btn:hover {
    background: var(--bg-secondary);
}

/* Show all / Show top 25 button */
.ref-show-all-btn {
    display: block;
    width: 100%;
    padding: 10px 16px;
    font-size: var(--size-xs);
    color: var(--text-muted);
    background: none;
    border: none;
    border-top: 1px solid var(--border-light);
    cursor: pointer;
    text-align: center;
}

.ref-show-all-btn:hover {
    color: var(--text-secondary);
    background: var(--bg-secondary);
}

/* Show-all grouped view */
.ref-crossref-group {
    border-bottom: 1px solid var(--border-light);
}

.ref-crossref-group:last-of-type {
    border-bottom: none;
}

.ref-crossref-group-header {
    font-family: var(--font-display);
    font-size: var(--size-xs);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 8px 16px;
    cursor: pointer;
    user-select: none;
    list-style: none;
}

.ref-crossref-group-header::-webkit-details-marker { display: none; }

.ref-crossref-group-header::before {
    content: '▾ ';
    font-size: 0.75em;
    opacity: 0.6;
}

details.ref-crossref-group:not([open]) .ref-crossref-group-header::before {
    content: '▸ ';
}
```

(Note: `.ref-show-all-btn` and `.ref-crossref-group*` rules also appear under the "Related tab — cross-references" section header even though the button class name itself doesn't contain "crossref" — included here since they style the same feature and sit in the same CSS block, lines 2019-2113.)

---

## 6. Topic-overlap JOIN against `topic_verses` — is recon conclusion #5 implemented?

**NOT FOUND / NOT IMPLEMENTED.**

- `getCrossReferencesForVerse` in `js/db.js:1659-1689` (full text above) queries only the `cross_references` table — no JOIN, no reference to `topic_verses` or `topics` anywhere in that function.
- `js/reference.js`'s Related-tab rendering code (full text above, lines 189-333) contains no `topic_verses` reference and no "why is this linked" indicator.
- Repo-wide grep for `topic_verses` (`js/*.js`, `scripts/*.py`) turns up matches only in `js/db.js` at lines 1023, 1031, 1033, 1067 — these are inside a *separate* function unrelated to cross-references (a topic/tag-lookup query path), not joined with or called from the cross-reference code path.

Conclusion: recon doc's conclusion #5 ("Topic overlap is free at query time... A JOIN at display time can annotate which cross-references share a Nave's chip") was never built. No "why is this linked" signal exists in the current implementation.

---

## 7. Negative votes — stored and passed through, or filtered?

**Stored and passed through; not filtered at ingestion.**

From `scripts/build_crossrefs.py` (ingestion, `build_schema`/`ingest` functions, excerpted above and below): votes are parsed with `int(votes_str)` (`:198`) and inserted as-is via `INSERT INTO cross_references (... votes ...)` (`:257-264`) with no sign check or floor applied during ingestion. The script even has an explicit reporting step that counts negative rows post-ingestion:

```python
# scripts/build_crossrefs.py:345-347
total = conn.execute('SELECT COUNT(*) FROM cross_references').fetchone()[0]
neg   = conn.execute('SELECT COUNT(*) FROM cross_references WHERE votes < 0').fetchone()[0]
zero  = conn.execute('SELECT COUNT(*) FROM cross_references WHERE votes = 0').fetchone()[0]
```

At query time, `getCrossReferencesForVerse` (full text above) only excludes rows below the floor when `options.showAll` is falsy — `WHERE source_verse = ? AND votes >= ?` with `floor` defaulting to `5` (`CROSSREF_VOTE_FLOOR_DEFAULT`). Negative-vote rows are therefore excluded from the default (floor=5) result set by the same mechanism that excludes any low-vote row — not filtered/discarded specially — and are retrievable via `{ showAll: true }`, which drops the floor entirely (`WHERE source_verse = ?` only, no vote condition). This matches recon conclusion #4 ("store them and let the floor filter handle it").

---

## 8. Known stale string — `index.html`

`index.html:227`, inside the Reference-panel help popover (`js/help.js`-driven `#reference-help-popover`):

```html
            <li><strong>Related</strong> — cross-references connecting this verse to the rest of Scripture <em>(coming soon)</em></li>
```

Surrounding context, `index.html:222-230`:

```html
    <div id="reference-help-popover" class="help-popover hidden" role="dialog" aria-label="Reference help">
        <p class="help-popover-lead"><strong>Your reference shelf.</strong> Background material and cross-references appear here based on what you're reading.</p>
        <ul>
            <li><strong>Info</strong> — book context, chapter details, and any notes you've written about the selected verse</li>
            <li><strong>Tags</strong> — topics from Nave's Topical Bible and your own tags for this verse</li>
            <li><strong>Related</strong> — cross-references connecting this verse to the rest of Scripture <em>(coming soon)</em></li>
        </ul>
        <a href="#" class="help-more-link">Need more? A full help guide is on its way. For now, try clicking around — Ember is designed to teach itself through use.</a>
    </div>
```

Flagged as stale: the "(coming soon)" qualifier is inconsistent with the shipped, functioning Related-tab implementation documented in sections 2-5 above.
