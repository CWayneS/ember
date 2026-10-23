# Ember Bible Study — Build 2 Specification

**Purpose:** Add the four features that turn Ember from a single-translation reading and note-taking app into a study environment where Scripture is in conversation with itself: range selection, text markups, cross-references, and multi-translation support.

**Prerequisite:** Build 1.5 complete. Every visible button wired, feature inventory accurate, codebase ready for new architecture.

**Estimated effort:** 5–8 focused days, depending on how cleanly the translation refactor lands.

---

## Design Principle: The Physical Study Metaphor

The application mirrors a physical Bible study setup. Build 2 extends each surface with features that belong there:

| Surface | Physical equivalent | Build 2 additions |
|---|---|---|
| Reader pane | Your Bible | Range selection (drag a ribbon across multiple verses), text markups (highlighters, pens, circles) |
| Notes panel | Your notebook | Note anchors display as ranges ("Genesis 1:4-7") instead of lists |
| Reference panel | Your reference shelf | Related tab (cross-references — the concordance shelf) |
| Book picker | The back wall of your library | Translation row above books (choose which Bible you're pulling off the shelf) |
| Each reader pane | A Bible open on the desk | Its own translation, its own place, remembered across reload |

**Design rule unchanged:** When deciding where a feature belongs, ask *in a physical study setup, where does this thing live?*

**Note on "the text is never obscured":** Build 2 introduces the markup tool strip, which expands into the reader header. This does not obscure Scripture — it lives in the header, not over the text. The clean-book mode (markup button collapsed) ensures the reader can always be returned to a pristine state with one click.

---

## Scope

Four items. All new features. Each item has meaningful architectural or data implications, and item ordering matters because later items depend on earlier ones.

### In Scope

1. **Range Selection + Anchor Coalescing** — shift-click to select multiple contiguous verses in a chapter. Existing `note_anchors` query pattern already supports ranges; this item is the UI work plus display coalescing.
2. **Text Markups** — whole-verse highlight, underline, and circle markups with a fixed palette. Delivered via a single markup button in the reader header that expands into a tool strip and toggles the highlights layer.
3. **Cross-References (Related Tab)** — OpenBible.info ranked cross-reference dataset in the Related tab of the reference panel. Click a reference to navigate and select its range in the active pane.
4. **Multi-Translation** — file-per-translation storage model, six bundled public-domain translations, per-pane translation state, book picker translation row.

### Out of Scope (Explicit)

- Reading plans (moved to Build 3)
- Data export/import (Build 3)
- Schema meta table (Build 3, deferred until backup ships)
- Lexicon and language tools
- Study templates and session lifecycle
- Nested notes
- PWA install prompt
- Memory verses
- Home screen / dashboard
- Context toolbar (cut permanently)
- Full help panel (deferred)
- User-added translations beyond the bundled shortlist (future conversation)
- Cross-translation search
- Character-level markups
- Versification mismatch handling (all launch translations share English versification)
- Click-to-preview cross-references (click navigates + selects, no in-place preview)
- TSK (Treasury of Scripture Knowledge) cross-references — deferred; OpenBible alone provides Build 2's curation needs. May be added later as augmentation via the `sources` field already in the schema.
- Topic overlap annotation on cross-references (visual indicator + tooltip) — deferred to a polish pass after Build 2 ships
- Topic-aware sorting for cross-references (boost shared-topic refs above pure votes-DESC) — deferred to the same polish pass as topic overlap annotation

---

## Implementation Order

The four items must ship in this order:

1. **Range selection first** because it's foundational for markups (which operate on ranges) and for cross-reference navigation (which selects a range on click). Building markups on single-verse selection would force a refactor later.
2. **Markups second** because they're a natural extension of the new selection model, they live entirely in the reader with no cross-panel coordination, and they validate the range anchor pattern end-to-end before cross-references and multi-translation introduce new complexity.
3. **Cross-references third** because Related is a self-contained read-only tab with a well-understood data shape. It exercises the reference panel's update-on-selection flow before multi-translation starts changing what "selection" even means across panes with different translations.
4. **Multi-translation fourth (and last)** because it touches every Scripture read site in the codebase. Doing it last means you're threading translation-awareness through code that's otherwise stable, rather than refactoring Build 2 features mid-build.

Each item should ship as its own commit cluster and should be demo-able before moving on.

---

## Item 1: Range Selection + Anchor Coalescing

### What

Extend the existing click-to-select model so users can select a contiguous range of verses within a chapter via shift-click. Update note anchor display to coalesce contiguous anchors into ranges at render time.

### Gesture

- **Plain click:** creates a new single-verse selection and sets this verse as the anchor. Replaces any existing selection. (Unchanged from Build 1.)
- **Shift-click:** extends selection from the anchor to the clicked verse, inclusive. If the user shift-clicks a verse above the anchor, the range extends upward. If they shift-click past a previous shift-click, the range grows or shrinks from the anchor. The anchor itself is not moved by shift-click.
- **New plain click:** clears the range, creates a new single selection, and sets a new anchor.

The anchor is the first click. Shift-click always measures from the anchor. This matches text editor and file manager conventions and requires no tutorial.

### Click Target

Current behavior: clicks on `.scripture-text` (the verse text) are caught. Margins don't catch clicks at all — there's no way to deliberately put the ribbon down without making a different selection.

New behavior: two click listeners with bubbling.

- **`.verse` listener** handles selection: plain click selects the verse and sets the anchor; shift-click extends the range from the anchor. The handler calls `event.stopPropagation()` so the click does not bubble further.
- **`.pane-content` listener** handles deselect: any click that reaches it (i.e., did not land on a verse) clears the current selection, clears the anchor, and fires `selection-changed` with an empty selection so dependent panels update to their idle state.

Margin click as the deselect gesture matches the physical metaphor: closing your finger and taking it off the page. Without it, there is no clean way to put the selection down without making a new one. Clicks outside `.pane-content` entirely (header, panel chrome, settings popovers) never reach either listener and do not affect the selection state.

**Shift-click in the margin:** the `.pane-content` handler treats shift+click and plain click identically — both clear. There is nothing to extend a range to in the margin, so the gesture has no other meaning.

### Selection Scope

- Contiguous verses within a single chapter only.
- Chapter navigation clears the selection.
- Plain click in the margin (inside `.pane-content`, not on a verse) clears the current selection, clears the anchor, and clears dependent panel state (Info, Tags, Related, notes anchor highlights). Shift+margin click clears identically.
- Shift-clicking across a chapter boundary is not supported in Build 2 — the selection clamps to the current chapter. (If this becomes a real user need, revisit later.)

### Storage

Range selections create a single `note_anchors` row:

- **Single verse:** `verse_start = X, verse_end = NULL` (existing convention, unchanged)
- **Multi-verse range:** `verse_start = X, verse_end = Y` where Y > X

The existing convention of `verse_end = NULL` for single verses must be preserved. Queries already handle both cases via the `COALESCE` pattern.

### Display Coalescing

Contiguous note anchors for the same note merge at render time into ranges:

- Stored: three rows for Gen 1:4, Gen 1:5, Gen 1:6 → Displayed: "Genesis 1:4-6"
- Stored: one row for Gen 1:4-7 → Displayed: "Genesis 1:4-7"
- Stored: rows for Gen 1:4 and Gen 1:7 → Displayed: "Genesis 1:4, Genesis 1:7" (non-contiguous, shown separately)

The coalescer runs in the anchor bar rendering code (notes.js or wherever anchor chips are generated). Storage is unchanged — each attach action creates a row, the coalescer merges for display only.

**Coalescing rule:** Two anchors are contiguous if they refer to the same book and chapter and their verse ranges touch or overlap. `[4,5] + [6,7] → [4,7]`. `[4,5] + [7,8] → two separate chips`.

### Query Pattern (Documentation)

All existing `note_anchors` queries use range-aware lookups confirmed during the Build 1.5 audit:

```sql
WHERE verse_start <= ? AND COALESCE(verse_end, verse_start) >= ?
```

This pattern correctly handles both single-verse anchors (NULL coalesces to verse_start, reducing to equality) and multi-verse ranges. **Every new query touching `note_anchors` must follow this pattern.** No migration required.

### Files Touched

- `js/selection.js` — shift-click logic, anchor tracking, new click target
- `js/reader.js` — verse rendering with new click handling via `.pane-content`
- `js/notes.js` (or wherever anchor chips render) — coalescing logic for display
- `css/style.css` — range selection visual state (all selected verses get the glow treatment)

### Definition of Done (Item 1)

- [ ] Plain click creates a single-verse selection and sets the anchor
- [ ] Shift-click extends selection from anchor to clicked verse, inclusive, in either direction
- [ ] Range selection visually highlights all selected verses
- [ ] Range selection does not cross chapter boundaries
- [ ] Plain click on the margin (inside `.pane-content`, not on a verse) clears the current selection and anchor
- [ ] Plain click on the margin clears Info, Tags, and Related tabs to their idle state
- [ ] Plain click on the margin while a range is selected clears the entire range
- [ ] Shift-click on the margin clears (treated identically to plain margin click)
- [ ] Verse clicks call `stopPropagation()` so they do not also trigger the deselect handler
- [ ] Creating a note with a multi-verse selection stores one row with `verse_start` and `verse_end` set
- [ ] Anchor bar displays contiguous anchors as ranges ("Genesis 1:4-7"), non-contiguous as separate chips
- [ ] Single-verse note-taking continues to work exactly as it did in Build 1.5
- [ ] All existing `note_anchors` queries still return correct results for both single-verse and range anchors

---

## Item 2: Text Markups

### What

Add the ability to visually mark up Scripture verses with highlights, underlines, and circles. Delivered via a single markup button in the reader header that expands into a tool strip.

### Schema

New `markups` table in the user database:

```sql
CREATE TABLE IF NOT EXISTS markups (
  id INTEGER PRIMARY KEY,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_markups_verse ON markups(verse_start);
```

**Fields:**
- `verse_start` / `verse_end` — same BBCCCVVV convention as `note_anchors`. Single-verse markups use `verse_end = NULL`.
- `type` — `"highlight"`, `"underline"`, or `"circle"`.
- `color` — palette identifier. For highlights: `"yellow" | "green" | "blue" | "pink" | "orange"`. For underlines: `"solid" | "wavy"` (stored in `color` for convenience even though it's a style). For circles: `"ink"` (single option).
- `created_at` — unix timestamp.

Added to `createUserTables()` in `js/db.js` alongside the existing user tables.

**Queries:** Follow the range-aware pattern:
```sql
SELECT * FROM markups
WHERE verse_start <= ? AND COALESCE(verse_end, verse_start) >= ?
ORDER BY created_at DESC;
```

### Scope Limitation: Whole-Verse Only

Markups apply to whole verses only. Character-level markups (highlight a phrase within a verse) are deferred indefinitely — they require a different storage model (offset ranges within verse text) and are a separate project. This is a firm Build 2 boundary.

### Palette

Fixed, small, readable.

**Highlights (5 colors):**
- Yellow (default)
- Green
- Blue
- Pink
- Orange

Classic physical highlighter set. Default is yellow because yellow is what most users reach for first.

**Underlines (2 styles):**
- Solid
- Wavy

Both in ink color. Underlines are structural, not thematic — they don't need to be colorful.

**Circle (1 style):**
- Ink color, single thickness.

Circles mark a verse or range for emphasis. One style is enough.

**Total: 8 markup options.** Small enough to learn in ten seconds, varied enough to mean something.

**Palette storage:** All colors are CSS custom properties so dark mode gets its own tuned versions. New variables in `:root` and `.theme-dark`:

```css
:root {
  --markup-yellow: #fff2a8;
  --markup-green: #c8e6c0;
  --markup-blue: #c0d8ec;
  --markup-pink: #f0c8d8;
  --markup-orange: #ffd8a0;
  --markup-ink: var(--ink);
}

.theme-dark {
  --markup-yellow: #6a5a1a;
  --markup-green: #3a5c3a;
  --markup-blue: #2a4a6a;
  --markup-pink: #5a3a48;
  --markup-orange: #6a4a20;
  --markup-ink: var(--ink);
}
```

Exact color values to be tuned during implementation — the principle is "muted enough not to distract, saturated enough to be legible."

### The Markup Button (Single Control)

The markup button lives in the reader header, grouped with the bookmark button as the "Bible actions" cluster. (This fulfills the Build 1.5 punch list note about regrouping bookmark + markup controls.)

**Two states:**

- **Collapsed (default):** the button shows a pencil or highlighter icon. The highlights layer is hidden — verses in the reader render cleanly, no color, no underlines, no circles. The tool strip is not shown.
- **Expanded:** the button expands into a tool strip showing all 8 palette options inline. The highlights layer becomes visible — existing markups render on the verses they anchor to.

**Clicking the button toggles between states.** One control, two states, no separate "Show highlights" setting in the reader settings popover.

**Metaphor:** Reach for your highlighter kit, it's open on the desk. Tuck it away, the page goes clean. The button *is* the toggle.

### Marking-Up Interaction

When the markup button is expanded and a verse (or range) is selected:

- Clicking a highlight color applies that highlight to the selected range, creating a row in `markups`.
- Clicking an underline style applies that underline to the selected range.
- Clicking the circle tool applies a circle to the selected range.
- Clicking the same tool again on the same selection *removes* that markup (toggle). This is how users erase.
- A single verse or range can carry multiple markup types (e.g., highlighted yellow AND underlined) — markups stack. The same type cannot stack with itself (you can't have both yellow and green highlight on the same verse; applying a second highlight replaces the first).

### Order of Operations

Both orders work:

- **Expand first, then select:** user taps markup button, tool strip appears, user shift-selects a range, taps a color, range is marked.
- **Select first, then expand:** user shift-selects a range, taps markup button, tool strip appears with range still selected, taps a color, range is marked.

The tool strip acts on the *current selection*, whatever that is when a tool is tapped.

### When Collapsed

When the markup button is collapsed (clean-book mode):

- The highlights layer is hidden. Verses render with no markup visuals.
- Selection still works normally — click and shift-click still select verses.
- Notes and tags work normally on the selected range.
- **No markup UI appears on selection.** There is no way to create or edit a markup without first expanding the button. This is the point: clean-book mode is genuinely clean.

### Persistence

The markup button's state (collapsed or expanded) persists across reload. If you left the tools out when you closed the app, they come back out when you reopen. Stored in localStorage under a key like `ember.markup_button.expanded`.

Matches the "walked away from your desk, came back" principle.

### Split-View Behavior

Shared state across both reader panes. The markup button lives in the reader header, not in a per-pane header. One button controls both panes.

When expanded, marking up works in whichever pane the user clicks. Selection in one pane is independent of the other; the tool strip acts on whichever pane has the active selection.

Rationale: marking up is a *mode* the user is in, not a per-pane property. If you're marking up, you're marking up in whichever pane you click.

### Files Touched

- `js/db.js` — `markups` table in `createUserTables()`, query functions (getMarkupsForVerse, createMarkup, deleteMarkup)
- `js/reader.js` — render markups over verses when markup button is expanded
- `js/markups.js` (new file) — markup button state, tool strip UI, create/delete logic
- `js/app.js` — wire in markups module
- `css/style.css` — palette variables, markup visual styles, tool strip layout, button expand/collapse animation
- `index.html` — markup button element in reader header

### Definition of Done (Item 2)

- [ ] `markups` table created in `createUserTables()`
- [ ] Markup button in reader header, grouped with bookmark button as "Bible actions" cluster
- [ ] Clicking the button toggles between collapsed and expanded states
- [ ] Expanded state shows 5 highlight colors, 2 underline styles, and 1 circle tool inline
- [ ] Applying a markup creates a row in `markups` with the correct verse_start, verse_end, type, and color
- [ ] Applying the same markup twice removes it (toggle)
- [ ] Highlights, underlines, and circles stack on the same verse (different types only)
- [ ] Collapsed state hides the highlights layer — verses render cleanly
- [ ] Collapsed state provides no way to create or edit markups
- [ ] Button state persists across reload
- [ ] Markup button controls both split-view panes (shared state)
- [ ] Dark mode uses tuned markup colors via CSS custom properties
- [ ] Markups apply to multi-verse ranges, not just single verses

---

## Item 3: Cross-References (Related Tab)

### What

Populate the existing Related tab in the reference panel with cross-reference data from OpenBible.info's ranked cross-reference dataset. When a verse is selected, the Related tab shows relevant cross-references — top 25 by community vote count by default, with a "Show all" button revealing the long tail grouped by target book.

### Dataset

**Source:** OpenBible.info ranked cross-references, already present in the project at `build/sources/cross_references.txt`. License is CC-BY (OpenBible.info/labs/cross-references/). Snapshot date is embedded in the file header.

**Format:** Tab-separated, three meaningful columns: `From Verse`, `To Verse`, `Votes`. Verse format is `BookName.Chapter.Verse` using full OpenBible book tokens (e.g. `Ps`, `1Kgs`, `1John`, `Phlm`) — no abbreviation ambiguity. Range targets use the format `BookName.Chapter.Verse-BookName.Chapter.Verse`. The fourth column in the header is a license comment and is treated as junk.

**Scale:** 344,799 rows. 25.6% of `To Verse` entries are ranges. Cross-checked book tokens map cleanly to internal book IDs with a single static lookup table. See `CROSSREF_RECON.md` in the project files for the full reconnaissance.

**No TSK in Build 2.** The Treasury of Scripture Knowledge was considered as a complementary dataset but dropped from Build 2 scope. OpenBible's vote-ranked data already provides the curation Build 2 needs, and adding TSK would multiply data prep complexity (book abbreviation normalization, merge logic, dedup) without changing the headline experience. TSK may be added as an augmentation in a future build if the long tail becomes a felt need; the schema below leaves room for it via the `sources` field.

**Vote distribution and curation:** ~90% of OpenBible rows have votes in the 1-10 bucket — this is the long tail. The high-signal subset (votes ≥ 5) is roughly 35,000 rows and is what the default Related tab view draws from. Negative votes exist (someone actively disagreed with a connection); they are stored honestly and filtered out at display time by the same vote floor. See "Display in the Related Tab" below for the floor mechanic.

### Storage

**Table:** `cross_references` in `core.db` (not a separate file — this is app data, not content, and does not need to be addable/removable like translations).

```sql
CREATE TABLE cross_references (
  source_verse INTEGER NOT NULL,
  target_start INTEGER NOT NULL,
  target_end INTEGER,
  votes INTEGER NOT NULL DEFAULT 0,
  sources TEXT NOT NULL DEFAULT 'ob'
);

CREATE INDEX idx_crossrefs_source_votes ON cross_references(source_verse, votes DESC);
```

**Fields:**
- `source_verse` — BBCCCVVV of the verse the reference originates from
- `target_start` / `target_end` — BBCCCVVV range of the target. Single-verse targets use `target_end = NULL`, matching the `note_anchors` and `markups` convention. Consistent pattern across the app.
- `votes` — OpenBible vote count. Stored verbatim, including negative values. The display layer applies a floor; storage holds everything.
- `sources` — string like `"ob"` for OpenBible, with room for `"tsk"` or `"ob,tsk"` if TSK is added later. Build 2 ships with `"ob"` everywhere.

**Compound index** on `(source_verse, votes DESC)` covers the canonical query pattern: "give me all references from verse X, ordered by votes desc." The sort is free.

**No primary key.** Rows are unique by (source_verse, target_start, target_end) but the schema doesn't enforce it — the data prep script dedupes during ingestion.

**Nothing is discarded.** All 344,799 rows go into the table, including negative votes and the long tail. The vote floor lives in the query layer, not in storage. This means tuning the floor never requires a database rebuild.

### Cross-Chapter and Cross-Book Range Splitting

The OpenBible source includes 655 same-book cross-chapter ranges and 18 cross-book ranges. These cannot be displayed cleanly as single entries because the reader shows one chapter at a time. The data prep script splits them at chapter and book boundaries:

- **Same-chapter range** (e.g., `Eph.1.4-Eph.1.5`): stored as one row with `target_start` and `target_end` set. No splitting.
- **Same-book cross-chapter range** (e.g., a hypothetical `Rom.5.20-Rom.6.4`): split into two rows, one per chapter. Both inherit the original vote count and sources. The user sees two separate Related tab entries that each navigate cleanly.
- **Cross-book range** (e.g., a hypothetical `Rom.16.27-1Cor.1.3`): split at the book boundary. Same inheritance. 18 such rows total — the data prep script writes them to a report file for hand-audit before commit.

This approach is honest about the data shape, eliminates special cases in the reader, and keeps click-to-navigate uniform. Vote-counts stay accurate (a high-signal cross-chapter passage produces two high-signal Related entries that travel together visually because they share the same source verse).

### Query

Get cross-references for a verse, applying the display vote floor:

```sql
SELECT target_start, target_end, votes
FROM cross_references
WHERE source_verse = ? AND votes >= ?
ORDER BY votes DESC, target_start ASC;
```

The vote floor is passed as a parameter, not hardcoded. A constant `CROSSREF_VOTE_FLOOR = 5` lives in `js/db.js` as the default. The "Show all" view passes `0` (or the lowest stored value if you prefer), bypassing the floor and showing every cross-reference for the verse.

For a multi-verse selection, the Related tab shows refs for the *first* verse of the selection (same as the current single-verse behavior for other tabs). Aggregating across a range is out of scope for Build 2.

**Dev tuning hook:** During Build 2 development, expose the floor on a debug object so it can be tuned from the browser console without reloading. Suggested pattern: `window.emberDebug = window.emberDebug || {}; window.emberDebug.crossrefFloor = 5;` and have `getCrossReferencesForVerse` read from `window.emberDebug.crossrefFloor` when present, falling back to the constant. After picking a value you like, update the constant. This hook can stay in the shipped code — it does nothing if `window.emberDebug` is never touched.

### Scale

344,799 rows from OpenBible, plus a small number of additional rows from cross-chapter/cross-book splits (estimate: 344,799 + ~700 splits = ~345,500). Compound index on `(source_verse, votes DESC)`. Adds approximately 12-18MB to `core.db`. Smaller than the prior TSK+OpenBible estimate because TSK is gone.

### Display in the Related Tab

When a verse is selected:

- **Header:** "Related to [reference]" (e.g., "Related to Genesis 1:1")
- **Default view:** Top 25 cross-references with `votes >= CROSSREF_VOTE_FLOOR` (default 5), sorted by vote count descending. Shown as a flat list with the target reference (human-readable) and a small vote indicator (optional — could be a subtle dot density or omitted entirely in favor of just ordering).
- **"Show all" button:** Expands to show *every* cross-reference for the verse — bypasses both the 25-row cap and the vote floor — grouped by target book in canonical order. Each book group is a collapsible section with a count (e.g., "Psalms (23)"). Negative-vote refs and the long-tail 1-4 vote refs all appear here for users who want to dig.
- **Empty state:** "No cross-references for this verse" when the selected verse has none above the floor. (This will be rare with a floor of 5.)
- **"Show all" with empty default:** If the default view shows zero refs but "Show all" would reveal some, the empty state can include a hint: "No high-signal cross-references; tap Show all to see the long tail."

**Book grouping:** Uses the standard 66-book canonical order. Groups are shown only in the "Show all" expanded view, not in the default top-25 view.

**Tunable defaults:** `CROSSREF_VOTE_FLOOR` and the top-N count (25) live as constants in `js/db.js` (or wherever the cross-reference helper lives). Both can be tuned via the dev hook (`window.emberDebug.crossrefFloor`, `window.emberDebug.crossrefTopN`) without a database rebuild. Expect to adjust these once during Build 2 testing based on how the Related tab feels in actual use.

### Interaction

Clicking a cross-reference in the list:

- **Navigates the active reader pane** to the target verse.
- **Selects the range** — if the target is "Romans 8:28-30", the reader scrolls to verse 28 and visually selects verses 28 through 30 using the Build 2 range selection system.

This is where range selection earns its keep visually. Cross-references often point to ranges, and clicking one should feel like a natural act of *following the reference*, which means landing on the passage with it already selected for further action (take a note, mark it up, follow another cross-reference).

**Alternative interactions (cut from Build 2):** In-place preview in the reference panel, opening the target in the other split-view pane, showing the target text inline. All defensible, all deferred.

### Data Preparation

OpenBible data is already in the project at `build/sources/cross_references.txt`. The data prep script for Build 2 ingests it directly — no merge with another source, no normalization across formats.

Steps:

1. Read `build/sources/cross_references.txt`. Skip the header row and the license-comment column.
2. Parse each row: `From Verse`, `To Verse`, `Votes`. Both verse fields use `BookName.Chapter.Verse` format; `To Verse` may contain a range with two endpoints joined by `-`.
3. Convert OpenBible book tokens to internal book IDs using a static lookup table (all 66 tokens map cleanly — see `CROSSREF_RECON.md`).
4. For each row, normalize to BBCCCVVV integers. Single-verse targets produce one row with `target_end = NULL`. Same-chapter range targets produce one row with `target_start` and `target_end` set.
5. Cross-chapter and cross-book ranges are split: one row per chapter the range touches, each inheriting the original vote count. Cross-book splits are written to a report file (`crossref_split_report.txt`) for hand-audit before commit.
6. Dedup on `(source_verse, target_start, target_end)`. If duplicates exist (rare), keep the highest vote count.
7. Insert into the `cross_references` table in `core.db`. All 344,799 rows (plus a few hundred from splits) go in. No vote-floor filtering at this stage.
8. Verify the row count, spot-check a well-known verse (Romans 8:28 should have ~43 high-vote refs at the top), and review the cross-book split report.

The script lives in `scripts/` or `tools/`, not in the app's `js/` directory. It runs once per data update and the resulting `core.db` is committed.

**Note:** This is also the moment when `core.db` loses its Scripture text (moves to `translations/kjv.db`) and gains the cross-references table. See Item 4 for the full `core.db` restructure.

### Files Touched

- `core.db` — new `cross_references` table populated at data prep time
- `js/db.js` — new query function `getCrossReferencesForVerse(verseId)`
- `js/reference.js` (or wherever the reference tabs update) — Related tab rendering and "Show all" toggle
- `css/style.css` — list styling, book group collapsibles

### Definition of Done (Item 3)

- [ ] `cross_references` table exists in `core.db` and is populated with all 344,799 OpenBible rows plus split rows
- [ ] Compound index `idx_crossrefs_source_votes` exists on `(source_verse, votes DESC)`
- [ ] `CROSSREF_VOTE_FLOOR` constant exists in `js/db.js` with default value 5
- [ ] `getCrossReferencesForVerse(verseId, floor, limit)` query function reads the floor from the dev hook if present, otherwise from the constant
- [ ] Selecting a verse populates the Related tab with top 25 cross-references at vote floor 5, sorted by votes DESC
- [ ] "Show all" button expands the view to bypass both the row cap and the vote floor, showing every ref grouped by target book in canonical order
- [ ] Book groups are collapsible and show a count
- [ ] Empty state shows when a verse has no cross-references above the floor
- [ ] Empty state hints at "Show all" if any sub-floor refs exist
- [ ] Cross-chapter ranges in the source are split into per-chapter rows during data prep
- [ ] Cross-book splits (18 expected) are written to a report file and audited before commit
- [ ] Clicking a cross-reference navigates the active reader pane to the target
- [ ] Clicking a cross-reference with a range target selects the range in the reader
- [ ] The Related tab updates when the selection changes, same as other reference tabs
- [ ] The query uses the range-aware pattern on target_start/target_end
- [ ] `window.emberDebug.crossrefFloor` and `window.emberDebug.crossrefTopN` work as live tuning hooks
- [ ] Nave's Christological coverage audit complete: INCARNATION added as a visible topic, WORD OF GOD parsing verified, John 1:1 spot-checked

---

## Item 4: Multi-Translation

### What

Add support for multiple Bible translations in Ember. Ship with six bundled public-domain translations, each as its own SQLite file. Provide a translation selection row above books in the book picker. Each split-view pane holds its own translation state. Per-pane state persists across reload.

This is the largest item in Build 2 and the one with the most architectural weight.

### Storage Model: One SQLite File Per Translation

**The core decision:** Each translation is a separate `.db` file in OPFS under a `translations/` directory. `core.db` no longer contains Scripture text.

**Layout after Build 2:**

```
OPFS root
├── core.db                     # app data: cross-references, Nave's topics, translation manifest, book metadata
├── user.db                     # user data: notes, bookmarks, studies, tags, markups, settings
└── translations/
    ├── kjv.db                  # KJV Scripture + FTS
    ├── asv.db                  # ASV Scripture + FTS
    ├── web.db                  # WEB Scripture + FTS
    ├── ylt.db                  # YLT Scripture + FTS
    ├── darby.db                # Darby Scripture + FTS
    └── bsb.db                  # BSB Scripture + FTS
```

**Rationale:** This model optimizes for a future "user adds/removes translations from external files" workflow. In that workflow, adding a translation is just copying a file into `translations/` and registering it in the manifest. Removing is delete + deregister. No surgery on a shared database, no corruption risk from malformed third-party files, and the bundled file format is identical to the imported file format.

The alternative (one monolithic database with a composite key on `verses`) would require a runtime import tool that rewrites every row with a new translation_id, and removal would mean `DELETE WHERE translation_id=?` across millions of rows. File-per-translation is dramatically simpler for the add/remove use case.

### Schema Inside Each Translation File

Each translation `.db` has a minimal, self-contained schema:

```sql
CREATE TABLE verses (
  book INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (book, chapter, verse)
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  testament TEXT NOT NULL,
  chapter_count INTEGER NOT NULL
);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Meta rows:
-- ('name', 'King James Version')
-- ('abbreviation', 'KJV')
-- ('year', '1611')
-- ('license', 'Public Domain')
-- ('versification', 'english-standard')
-- ('schema_version', '1')

CREATE VIRTUAL TABLE verses_fts USING fts5(
  text,
  content=verses,
  content_rowid=rowid
);
```

Books are duplicated across translation files. This is a deliberate tradeoff: it costs a few KB per file but makes each file fully self-contained. A user who only has one translation installed can still render the book picker without reading `core.db`'s book table.

The `meta` table is what the manifest reads when you register a new translation file. It's also where a future "About this translation" screen would pull its data from.

### Manifest Table in `core.db`

The manifest lives in `core.db` (not a translation file) because it describes *which* translations are available and is shared state.

```sql
CREATE TABLE translations (
  id INTEGER PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  year TEXT,
  license TEXT,
  installed_at INTEGER NOT NULL,
  is_bundled INTEGER NOT NULL DEFAULT 0
);
```

Populated at install time with the six bundled translations. Future user-added translations would append rows here.

On app start, the app:
1. Reads the `translations` table from `core.db`
2. For each row, opens a handle to `translations/{filename}` via sql.js
3. Caches the handles in a map keyed by translation ID

### Query Layer Refactor

Every Scripture-reading function currently reads from `core.db`. After Build 2, Scripture reads come from translation files.

**Refactor pattern:**

Before:
```javascript
function getChapter(book, chapter) {
  return db.exec('SELECT * FROM verses WHERE book=? AND chapter=?', [book, chapter]);
}
```

After:
```javascript
function getChapter(translationId, book, chapter) {
  const tdb = getTranslationDb(translationId);
  return tdb.exec('SELECT * FROM verses WHERE book=? AND chapter=?', [book, chapter]);
}

function getTranslationDb(id) {
  return translationHandles.get(id);
}
```

**Functions to refactor:**
- `getChapter(book, chapter)` → `getChapter(translationId, book, chapter)`
- `getVerse(verseId)` → `getVerse(translationId, verseId)`
- `searchScripture(query)` → `searchScripture(translationId, query)`
- Any other function in `js/db.js` that reads from the `verses` table

**Call sites to update:**
- `js/reader.js` — passes the pane's current translation when rendering a chapter
- `js/search.js` — passes the active pane's translation when searching
- Anywhere else that calls these query functions

The refactor touches every Scripture read site, which is notable but not huge — probably 15-25 call sites across the codebase. It's mechanical work, but all of it.

### Search Scope

Search is **per-translation.** When the user searches, the search runs against the FTS table of the translation in the currently active pane. Results show verses from that translation only.

Cross-translation search ("find this word in any translation I have installed") is out of scope for Build 2. It's a defensible future feature but adds complexity without matching a demonstrated user need.

### Bundled Shortlist (6 Translations)

| Translation | Abbreviation | Year | License | Notes |
|---|---|---|---|---|
| King James Version | KJV | 1611 | Public Domain | Already bundled; moves to `translations/kjv.db` |
| American Standard Version | ASV | 1901 | Public Domain | KJV lineage, slightly modernized, scholarly |
| World English Bible | WEB | 2000+ | Public Domain | Modern English, actively maintained |
| Young's Literal Translation | YLT | 1862 | Public Domain | Hyper-literal, word study |
| Darby Translation | Darby | 1890 | Public Domain | 19th century, literal-leaning |
| Berean Standard Bible | BSB | 2023 | Public Domain (April 30, 2023) | Modern, maintained verbatim |

**BSB licensing note:** Dedicated to the public domain April 30, 2023. All uses freely permitted. Attribution and linking appreciated but not required. The Berean name may be used because Ember maintains verbatim text. Optional attribution can appear in a future About screen. Not a Build 2 UI concern.

### Translation Selection UI

**In the book picker:**

The book picker (the overlay that appears when the user taps the book button to navigate) gains a **translation row** at the top, above the book grid.

- The row is a horizontal list of translation abbreviations (KJV, ASV, WEB, YLT, Darby, BSB).
- The active translation for the current pane is visually distinguished (bold, underlined, or color-accented — pick one during implementation).
- Tapping a translation switches the current pane to that translation. The book picker stays open so the user can then pick a book.
- If the user only wants to switch translation (not book), they tap the translation and then dismiss the book picker. Current book/chapter is preserved.

**Per-pane translation button:**

Each split-view pane has its own translation button, already present in Build 1 as a placeholder. In Build 2, this button becomes functional:

- Shows the current translation abbreviation (e.g., "KJV")
- Tapping it opens the book picker scoped to that pane

In single-pane view, the reader has one translation button. In split view, each pane has its own.

### Switching Translations: Reference Preservation

When the user switches translation in a pane:

- The current reference (book, chapter, verse) is preserved. Gen 1:1 in KJV → Gen 1:1 in ASV.
- If the target translation does not contain the current verse (shouldn't happen among the six bundled translations since they share English versification, but the logic should exist), fall back to the nearest preceding verse in the same chapter. Gen 1:1 → Gen 1:1 if present, else Gen 1:2 → Gen 1:1, etc. If the chapter itself is missing, fall back to chapter 1 verse 1 of the same book.
- Versification mismatch handling is not required in Build 2 because all six bundled translations use English-standard versification. The fallback logic is insurance against future translations that diverge.

### Per-Pane State Persistence

Each reader pane remembers its own state across reload:

```javascript
{
  translationId: 1,
  book: 1,
  chapter: 1,
  verse: 1,
  scrollPosition: 0
}
```

Stored in localStorage under keys like `ember.pane.left.state` and `ember.pane.right.state`. In single-pane view, only `left` is used.

**Walked away from your desk, came back** — open Ember and find exactly what you had open last time. Split-view with KJV in the left pane and ASV in the right? Still like that. Both panes scrolled to specific verses? Still there.

### Loading Strategy

All six bundled translations are **seeded into OPFS at install time**, during the same bootstrap that currently seeds `core.db`. No lazy loading, no "please wait while we download ASV" moments after install.

The install bootstrap extends to:

1. Seed `core.db` (now containing cross-references, Nave's topics, translation manifest, book metadata — but no Scripture text)
2. Seed `translations/kjv.db`
3. Seed `translations/asv.db`
4. Seed `translations/web.db`
5. Seed `translations/ylt.db`
6. Seed `translations/darby.db`
7. Seed `translations/bsb.db`

Total install size grows by roughly 5x for Scripture data (six translations instead of one). Each English translation is ~4-5 MB compressed, so the full bundle is probably in the 25-40 MB range. Acceptable for a one-time install of a serious study app.

### Core.db Restructure

As a byproduct of Build 2, `core.db` loses its KJV Scripture text and gains cross-references.

**`core.db` contents after Build 2:**
- `translations` (manifest)
- `cross_references` (from Item 3)
- `topics` + `topic_verses` (Nave's Topical Bible — existing from Build 1)
- `books` (canonical book metadata — for screens that don't want to open a translation file just to get book names; duplicated into each translation file for self-containment)

**`core.db` contents *before* Build 2 (for reference):**
- `verses` (KJV Scripture — moves to `translations/kjv.db`)
- `books` (stays)
- `topics` + `topic_verses` (stays)

The data prep script for `core.db` needs to be rebuilt. It was previously "KJV + Nave's"; it becomes "cross-references + Nave's + translation manifest + book metadata."

### Files Touched

- `core.db` — fully regenerated; removes verses, adds cross_references, adds translations manifest
- `translations/*.db` — six new files, each with verses + books + meta + FTS
- `js/db.js` — translation handle cache, `getTranslationDb()`, refactored query functions
- `js/app.js` — install bootstrap extended to seed translation files, restore pane state on load
- `js/reader.js` — pane state includes translationId, rendering calls pass translationId
- `js/search.js` — search passes active pane's translationId
- `js/panels.js` (or wherever the book picker lives) — translation row in book picker
- `js/state.js` — pane state persistence (if state.js is in use; otherwise inline in app.js)
- `index.html` — translation button markup for each pane (placeholders already exist)
- `css/style.css` — translation row styling, active-translation visual treatment

### Data Prep

Before writing code for Item 4, prepare the six translation files. For each translation:

1. Obtain the source data (existing sources like scrollmapper/bible_databases have KJV; BSB and others are distributed by their maintainers).
2. Normalize to the `(book, chapter, verse, text)` shape using Ember's BBCCCVVV book numbering.
3. Build the `verses`, `books`, `meta`, and `verses_fts` tables.
4. Populate and save as `{abbreviation}.db`.
5. Verify: random verse lookups match published text, FTS returns sensible results, book count is 66, meta fields are populated.

Like Item 3's data prep, this is a build-time pipeline. Script it, run it once per data update, commit the output.

### Definition of Done (Item 4)

- [ ] `core.db` restructured: no more `verses` table, `cross_references` added (from Item 3), `translations` manifest added
- [ ] Six translation files exist in `translations/` and contain verses, books, meta, and FTS data
- [ ] Install bootstrap seeds `core.db` and all six translation files into OPFS
- [ ] App reads the `translations` manifest on start and opens handles to all files
- [ ] Every Scripture-reading function in `js/db.js` takes a `translationId` parameter
- [ ] All call sites pass the correct `translationId` from pane state
- [ ] Book picker shows a translation row above the books
- [ ] Active translation is visually distinguished in the row
- [ ] Tapping a translation in the book picker switches the current pane's translation
- [ ] Each split-view pane has its own translation button showing the current abbreviation
- [ ] Switching translation preserves the current reference (book, chapter, verse)
- [ ] Fallback logic exists for verses missing in the target translation (nearest preceding)
- [ ] Search runs against the active pane's translation FTS table
- [ ] Pane state (translation, book, chapter, verse, scroll) persists across reload
- [ ] Split-view pane translations persist independently
- [ ] Dark mode, font size, and other display settings work in all translations
- [ ] BSB's optional attribution is not surfaced in Build 2 (deferred to future About screen)

---

## Definition of Done (Build 2 Overall)

- [ ] All four items above are complete with their individual Definition of Done checklists
- [ ] Range selection works via shift-click across the app
- [ ] Note anchors display as coalesced ranges ("Genesis 1:4-7") when contiguous
- [ ] Text markups can be created, displayed, removed, and stacked on verses and ranges
- [ ] Markup button is the single control for both tools and visual layer
- [ ] Related tab shows cross-references when a verse is selected
- [ ] Clicking a cross-reference navigates and selects the target range
- [ ] Six translations are installed and switchable via the book picker
- [ ] Each pane remembers its own translation, book, chapter, verse, and scroll across reload
- [ ] Every Scripture-reading call site passes a `translationId`
- [ ] `core.db` no longer contains Scripture text
- [ ] `FEATURE_INVENTORY.md` updated to reflect all Build 2 additions
- [ ] `BUILD_1_ACTUAL_STATE.md` updated or superseded to reflect the new architecture
- [ ] The app can be demoed end-to-end with all four features in natural use

---

## What Comes Next: Build 3 Preview

Build 2 delivers the study environment. Build 3 focuses on durability and breadth:

**Planned Build 3 scope:**

1. **Reading plans** — Plans tab (bookshelf) + Current Plan tab, one active plan at a time, `#template-bar` for the active step. Data model already specified in the punch list. Bundled plans TBD during Build 3 planning.
2. **Data export/import** — Full user data backup and restore. Destructive restore only for initial implementation. Import logic tolerates pre-meta legacy databases.
3. **Schema meta table** — `meta` table in the user database (`schema_version`, `created_at`, `app_name`). Deferred until backup ships so it can be introduced alongside the import tolerance logic.

**Beyond Build 3 (longer horizon):**

- Nested notes
- Study templates and session lifecycle
- Recently-deleted notes recovery
- Full help panel
- PWA install prompt and update notifications
- User-added translations from external files
- Memory verses / spaced repetition
- Character-level markups
- Cross-translation search
