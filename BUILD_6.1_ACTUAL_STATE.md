# BUILD_6.1_ACTUAL_STATE.md — Ground-Truth Audit

> **⚠️ SNAPSHOT:** This document reflects the codebase as of 2026-09-18, at commit `7e146b8`. It covers everything that landed after `BUILD_6_ACTUAL_STATE.md`'s 2026-08-31 snapshot: the post-Build-6 Language tab rework (inline word card, Greek grammar decode) and the September 2026 architecture-review pass (16 commits, `004fcd2`..`7e146b8`). No numbered build shipped in this window, hence "6.1".
> When this document and the actual source files disagree, **the source files are correct.**
> This document supersedes `BUILD_6_ACTUAL_STATE.md`. Sections that document unchanged territory point there rather than repeat it.

_Read from source files on 2026-09-18. Every behavioral claim in §3–§9 was exercised against the running app in headless Chromium via `tests/verify.py` (new in this window — see §8) before being written down. Line counts are from `wc -l` at `7e146b8`._

---

## 0. WHAT THIS WINDOW WAS

Two distinct bodies of work, neither a numbered build:

1. **Language tab rework** (commits `8169e14`..`2d95ad0`, early September). The Build 6 "word detail view" (a view-swap replacing the interlinear with a back button) was replaced by an inline, tiered word card that expands beneath the tapped row. Greek morphology codes are decoded into plain-English lines from a new TEGMC-derived table. Specified in `docs/Language_Panel_Word_Inspector_Spec.md` and `docs/Grammar_Decode_Spec_DRAFT.md`; itemized in `FEATURE_INVENTORY.md` 142e–142n and 251–251c. This document records the resulting module state (§3) but does not re-derive those specs.

2. **Architecture review pass** (commits `004fcd2`..`7e146b8`, 2026-09-17/18). A review of state management, cross-module duplication, copy-forward patterns, and `db.js` produced a fix list; every item on it was then done, each as its own commit. The review's one explicit non-decision — do not consolidate the four settings modules yet — is recorded in §10. Net effect on `js/`: −1 file (`state.js`), +2 files (`dialogs.js`, `tests/verify.py` outside `js/`), and roughly 700 fewer lines of duplicated code with no user-facing feature removed and three added (tag removal, anchor removal, verse-selecting bookmark navigation).

---

## 1. FILE STRUCTURE — CHANGES SINCE BUILD 6

```
ember/
├── BUILD_6.1_ACTUAL_STATE.md         # This document — NEW
├── BUILD_6_ACTUAL_STATE.md .. BUILD_1_ACTUAL_STATE.md   # Superseded — kept for history
├── README.md                          # CHANGED: "Verifying Changes" section; tests/ and dialogs.js in tree; state.js gone
├── CLAUDE.md                          # CHANGED: state.js line replaced by popover-registry.js + dialogs.js
├── FEATURE_INVENTORY.md               # CHANGED: 91a, 99a, 99b (tag/anchor removal); state.js "coming soon" entry retired
├── USER_MANUAL.md                     # CHANGED: "Removing verses from a note"; tag ✕ in "Using Tags"
├── sw.js                              # CHANGED: PRECACHE lists every js/ file; CACHE_NAME ember-v5 → ember-v8
├── docs/ANCHOR_QUERIES.md             # CHANGED: getNoteCountsForChapter added to the audited list
│
├── css/style.css                      # CHANGED (3,175 lines): +.tag-chip-editable/.tag-chip-name/.tag-chip-remove,
│                                      #   +.note-block-anchor-remove; .note-block-anchor is now inline-flex;
│                                      #   dead .tag-chip.removable rule removed
├── js/
│   ├── db.js                          # CHANGED (1,783 → 1,688): query helpers; +formatReference, +chapterExistsInTranslation,
│   │                                  #   +getNoteCountsForChapter, +removeAnchorsFromNote; 9 exports removed/unexported
│   ├── dialogs.js                     # NEW (125) — openConfirmDialog / openPromptDialog
│   ├── popover-registry.js            # CHANGED (9 → 67) — +bindPopover
│   ├── reader.js                      # CHANGED (666 → 636) — applyIndicators, applyChapterMarkups; chapter-batched note counts
│   ├── selection.js                   # CHANGED (152 → 150) — applySingle/applyRange/glow shared by click + programmatic paths
│   ├── notes.js                       # CHANGED (556 → 548) — tag ✕, anchor ✕, static tags.js import; showNoteEditor removed
│   ├── reference.js                   # CHANGED (352 → 332) — refreshReference re-renders Tags tab too; refLabel removed
│   ├── language.js                    # CHANGED (503 → 498) — inline word card (rework); formatReference for headings
│   ├── grammar-decode.js              # NEW in the rework window (327) — Greek morph-code decode + authored phrase tables
│   ├── search.js, bookmarks.js        # CHANGED — formatReference; bookmark clicks select the verse
│   ├── tags.js                        # CHANGED (120 → 117) — initTags() removed; chips read data-tag
│   ├── plans.js, backup.js, study-templates.js   # CHANGED — use dialogs.js
│   ├── help.js, global-settings.js, reader-settings.js, notes-settings.js, reference-settings.js
│   │                                  # CHANGED — use bindPopover (each ~40 lines shorter)
│   ├── app.js                         # CHANGED — initTags import/call removed
│   ├── state.js                       # DELETED
│   └── markups.js, panels.js, template-bar.js, usfm.js, storage-worker.js, vendor/   # Unchanged
│
├── tests/
│   └── verify.py                      # NEW (531) — live Playwright verification, see §8
│
└── data/, scripts/, build/, fonts/    # Unchanged this window (language.db gained step_morphology_greek in the rework —
                                       #   see FEATURE_INVENTORY 251; core.db untouched)
```

Untracked working-copy files not part of any commit: `crossref_audit_bundle.md`, `grammar_decode_audit_bundle.md`, `tegmc_value_domain.md` (analysis scratch from the rework window).

---

## 2. DATABASE SCHEMA

**`core.db`: no schema change in this window.** No migration was added to `createUserTables()`; every user table, index, and the `meta` row are exactly as `BUILD_6_ACTUAL_STATE.md` §2 / `BUILD_5_ACTUAL_STATE.md` §2 describe. An existing install boots with no DDL executed beyond the idempotent `CREATE ... IF NOT EXISTS` statements that were already there.

**`language.db`** gained `step_morphology_greek` (TEGMC, 9,214 rows across 1,644 codes) during the rework window — `FEATURE_INVENTORY.md` 251–251c has the DDL rationale and the parser's handling of the two malformed source records. Read by exactly one query, `getGreekMorphCategories(code)`.

Two new *write* paths against existing tables, both in `db.js`:
- `removeAnchorsFromNote(noteId, verseStart, verseEnd)` — `DELETE FROM note_anchors WHERE note_id = ? AND verse_start >= ? AND COALESCE(verse_end, verse_start) <= ?`. Containment, not overlap: the notes panel shows anchors coalesced into display ranges (`notes.js:coalesceAnchors`), so one chip can stand for several rows, and this deletes exactly the rows within the chip's range.
- `removeNoteTag()` existed since Build 1 and is now actually reachable from the UI (§3, notes.js).

---

## 3. MODULE MAP — CHANGED MODULES

### `js/db.js` — Database Layer

**Query helpers (private, top of file):** `queryAll(database, sql, params)`, `queryOne(...)`, `queryValue(database, sql, params, fallback)`, `lastInsertRowId()`. They take the database handle explicitly, so the core `db`, each translation handle, and the lazily-opened `language.db` share one path. Rows come back as objects keyed by column name (aliases apply), so a query's SELECT list is its result shape. These replaced 21 hand-written `prepare/bind/step/free` loops and 29 `exec()[0]?.values` unwraps with positional mappings. **No query text, ordering, or fallback semantics changed** — verified by snapshotting the results of 36 `db.js` calls before and after (§8, `dbsnapshot`/`dbcompare`); every result was identical apart from run timestamps.

Other private helpers introduced: `ensureTag(name)` (normalize + `INSERT OR IGNORE` + id lookup, previously written out in both `saveNote()` and `addNoteTag()`); `attachTagsAndAnchors(notes)` (the per-note fill-in four list queries each repeated); `bookName(bookId)`; column-list constants `ORIGINAL_WORD_COLUMNS`, `MARKUP_COLUMNS`.

**New exports:**
- `formatReference(startId, endId = null)` — next to `parseVerseId()`. `"Genesis 1:1"`, `"Genesis 1:1–3"`, `"Genesis 1:30–2:5"`, `"Genesis 50:26–Exodus 1:1"`; unknown book id → `"Book N"`. **The one place reference labels are formatted** — replaced eleven inline sites across five modules, two of which were range formatters that disagreed (notes.js's could not render a cross-chapter range; reference.js's could). Uses the cached `getBooks()` list, not a query.
- `chapterExistsInTranslation(translationId, bookId, chapter)` — moved in from `reader.js`, which was the only feature module running raw SQL (through a since-removed `getTranslationDb()` handle accessor). **No module outside db.js touches a sql.js handle now.**
- `getNoteCountsForChapter(bookId, chapter)` → `Map<verseId, distinctNoteCount>` from one range-aware query (`docs/ANCHOR_QUERIES.md`): anchors overlapping the chapter are fetched once and expanded in JS to every verse they cover, clamped to the chapter, with a per-verse `Set` so a note with several anchors on one verse counts once (matches `getNotesForVerse()`'s `DISTINCT`). Range starts at verse 0 so Psalm-title notes count. The reader's dots need only counts, and `getNotesForVerse()` runs three statements per call — a Psalm 119 render was 528 statements, repeated for both panes on every autosave tick. Now one per chapter, matching what `getBookmarksForChapter()` and `getMarkupsForChapter()` already did.
- `removeAnchorsFromNote()` — §2.

**Removed exports (nine, none had a caller outside db.js):** `getLanguageDb`, `insertTemplate`, `getTagsForNote`, `getAnchorsForNote` are now module-private (still used internally). `getCurrentTranslation`/`getCurrentTranslationId` (read an `app_state` `'translation'` key nothing has written since per-pane translation moved to localStorage in Build 2), `getMarkupsForVerse`, `getOriginalWordsForGroup`, `getOriginalWord` (the inline card derives group membership from the verse's already-fetched rows) are deleted. `getTranslationDb` is deleted (above).

**Unchanged:** boot sequence, seeding, persistence (`saveToStorage(db.export())` after every write, 23 sites), backup/restore, `getLanguageDb()`'s lazy OPFS-seed-then-cache path.

---

### `js/popover-registry.js` — Popover coordination (9 → 67 lines)

Two layers now. `registerPopover(closeFn)`/`closeAllPopovers()` are unchanged — any module with something popover-like (including `bookmarks.js`'s prompt and dropdown, which position and dismiss differently) registers a closer so opening one closes the rest.

**New: `bindPopover(btn, popover)` → `{ open, close }`.** The standard button-anchored popover: toggle on button click, position below the button's right edge (`top = rect.bottom + 6`, `right = innerWidth − rect.right`), stop propagation inside, close on outside click and Escape. Used by all four help popovers and all four settings popovers. Previously each of five modules carried an identical copy, each registering its own document-level `click` and `keydown` listener (ten listeners); now there is one pair, installed on first bind. **Outside-click/Escape sweep only popovers bound this way**, not every registered closer — `bookmarks.js`'s prompt keeps itself open on inside clicks without stopping propagation and must not be swept by a blanket document click.

Consumers: `help.js` (33 lines, was 68), `global-settings.js`, `reader-settings.js`, `notes-settings.js`, `reference-settings.js`. `reference-settings.js` additionally now reads its own in-memory `currentTab` on `selection-changed` instead of re-querying `app_state` each time.

---

### `js/dialogs.js` — Modal dialogs — NEW

`openConfirmDialog({ title, lines, confirmLabel, cancelLabel, danger })` → `Promise<boolean>` and `openPromptDialog({ title, label, defaultValue, confirmLabel, cancelLabel })` → `Promise<string|null>` on one private `buildDialog()`. DOM nodes and `textContent` only, never `innerHTML` — the copy includes plan titles and study names. Reuses the `.plan-metadata-*` styles, which are the app's dialog styles in all but name.

Replaced: `plans.js`'s parameterized `openConfirmDialog()` (now imported), `backup.js`'s `openRestoreConfirmDialog()` and `study-templates.js`'s `openStudyNameDialog()` (both hand-built copies of the same ~60-line skeleton). `plans.js`'s CSV-metadata dialog (three fields, static `innerHTML` markup) is deliberately not migrated — it is a form, not a confirm.

**Behavior fix that fell out:** every copy registered a document `keydown` listener for Escape, and so does the plan detail popover that opens the Restart/Delete confirms — so Escape on the confirm also closed the popover beneath it. The shared dialog listens in the **capture phase** and calls `stopPropagation()`, so Escape is owned by the topmost modal. Verified: Escape on the Restart confirm leaves the plan detail popover open.

---

### `js/reader.js` — Scripture rendering (666 → 636)

- **`applyIndicators(verseEl, noteCount, bookmark)`** — private; the single builder of note/bookmark indicator dots and the `.verse-bookmarked` class, used by both `renderPane()` and `refreshVerseIndicators()`. Anchors to the `.verse-number` span when present, else the row itself (Psalm-title rows have no bubble). **This fixed a crash** (§9). Takes a count, not a note list — all it ever read was `.length`.
- **`applyChapterMarkups(paneId)`** — private; strips every `markup-*` class from the pane's verses and re-applies from `getMarkupsForChapter()`. Used by `renderPane()` and `refreshMarkupClasses()`, which previously each carried the loop.
- `renderPane()` now issues **three chapter-batched queries** (bookmarks, note counts, markups) plus `getChapter()` — no per-verse query of any kind.
- `findValidReference()` calls `chapterExistsInTranslation()`; no SQL here.

### `js/selection.js` — Verse selection (152 → 150)

`applySingle(verseEl, verseId)` and `applyRange(paneEl, idA, idB)` are the one implementation of "make this the selection" (clear `.selected`, mark, update `selectedVerses`, dispatch `selection-changed`); `glow(verseEl)` owns the animation-restart reflow. `handleVerseClick()` sets the anchor and calls one; `selectVerseRange()` (cross-reference navigation) sets the anchor, calls one, and scrolls the first selected element into view. Previously `selectVerseRange()` carried its own copies with comments saying it "mirrors" the click path. Exports unchanged: `initSelection`, `getSelectedVerses`, `selectVerseRange`.

### `js/notes.js` — Study document (556 → 548)

- **Tag chips in the study view are editable**: `makeTagChip(name, noteId)` builds `.tag-chip.tag-chip-editable` with a `.tag-chip-name` span (click → tag view) and a `.tag-chip-remove` ✕ button (click → `removeNoteTag()`, chip removed, `refreshAfterWrite()`). The chip carries the bare name in `data-tag` because its text now includes the ✕ — `tags.js`'s autocomplete reads that to exclude applied tags. Chips in the tag view, Info tab, and search results are plain read-only `.tag-chip` as before.
- **Anchor chips have a ✕** (`.note-block-anchor-remove`) → `removeAnchorsFromNote(note.id, anchor.verse_start, anchor.verse_end)` with the chip's *coalesced* range, then re-render + `refreshAfterWrite()`. The chip's text is a `.note-block-anchor-link` span (navigate). A note can be left with no anchors.
- Adding a tag with **Enter now calls `refreshAfterWrite()`** — it never did before, so the Tags tab went stale until re-selecting the verse.
- `setupTagInput` is a **static import** from `tags.js`; the Build 1 `import('./tags.js').catch(...)` hedge is gone.
- **Removed:** `showNoteEditor()` (exported "for search.js", which never called it; it also overwrote the module's cached selection without telling `selection.js`) and its `autoCreateStudy()` helper. `formatAnchor()` is now a one-liner over `formatReference()`.

### `js/reference.js` (352 → 332)

`refreshReference(verseId)` re-renders **both Info and Tags** tabs (the two whose content derives from the user's own notes); it previously re-rendered Info only. `refLabel()` removed in favor of `formatReference()`; Related-tab headers and cross-ref buttons use it. Book grouping in "Show all" uses `parseVerseId()` instead of inline `/ 1_000_000`.

### `js/language.js` (rework window; 498 lines)

Single export `renderLanguageTab(verseIds)`, unchanged signature. The Build 6 `openWordDetail/renderWordDetail` view-swap is gone. Module state: `openCardKey` (which row's card is open), `openTier2Ids`/`openTier3Ids` (per-member expansion sets, cleared whenever `openCardKey` changes), `lastInterlinearWords` (cached render input), `renderGeneration` (staleness guard). Every tap re-runs `renderInterlinear()` parameterized by that state — no manual DOM patching; the card is inserted as the next list item after its row, so later rows shift as normal flow. Tier 1: original word, contextual gloss, Strong's, morph code. Tier 2 ("Click for more", per member): lemma, transliteration, **parsed morphology** (`grammar-decode.js`, unfolded directly, no accordion), dictionary gloss, and for Greek a Show/Hide Lexicon button. Tier 3: TBESG entry via `sanitizeLexiconMeaning()` (allow-list, whole string escaped first), or "No lexicon entry available." `decodeMorphCode()` is called for both languages; it returns `[]` for Hebrew (TEHMC is a documented follow-up), so Hebrew tier 2 shows the raw code only. Verse headings use `formatReference()`.

### `js/grammar-decode.js` (rework window) — NEW, pure functions, no DOM

`splitMorphCode(morphCode)` splits `" + "`-joined compounds and strips a `G\d+=` Strong's prefix into `{ code, strongsNumber }`. `decodeMorphCode(morphCode)` → `[{ code, strongsNumber, lines }]` per piece, from `getGreekMorphCategories()`, deduping repeated category values, ordering categories by a fixed reading order, and phrasing each `(category, value)` through authored tables: `TEGMC_VALUE_PHRASES` (~102 pairs), `TENSE_WITH_TIME_PHRASES` (Indicative only), `TENSE_ASPECT_ONLY_PHRASES` (every other mood/form), `CATEGORY_EMPTY_VALUE_PHRASES`. Lines render glossary-style: `"Singular - Just one"`. **The phrase tables are git-tracked authored content**, deliberately not in `language.db` (which is rebuilt from gitignored raw sources).

### `sw.js`

`PRECACHE` lists every file under `js/` plus the shell, fonts, and manifest. Before this window 14 of 26 modules were missing (`reference`, `plans`, `study-templates`, `template-bar`, `global-settings`, `backup`, `bookmarks`, `markups`, `help`, `popover-registry`, `usfm`, and the three per-panel settings modules) — a documented gap since Build 3 that meant a fresh install taken offline before an online visit had fetched each module could not boot. `CACHE_NAME` went v5 → v6 (list completed) → v7 (`dialogs.js`) → v8 (`state.js` removed). The header comment states the rule: add to `js/`, add here, bump the name; the `sw` test scenario (§8) enforces it.

### `js/state.js` — DELETED

Never imported by anything since Build 1. The app's actual cross-module state model is in §6.

### Unchanged this window

`markups.js`, `panels.js`, `template-bar.js`, `usfm.js`, `storage-worker.js`, `vendor/`, `index.html`, `manifest.json`.

---

## 4. MODULE DEPENDENCIES

```
app.js → db.js, reader.js, selection.js, notes.js, panels.js, search.js, reference.js,
         bookmarks.js, help.js, reader-settings.js, notes-settings.js, reference-settings.js,
         markups.js, plans.js, study-templates.js, template-bar.js, global-settings.js
         (tags.js no longer imported here — its only export is setupTagInput, used by notes.js)

db.js → usfm.js                                                    [unchanged; still imports nothing else]

popover-registry.js ← bookmarks.js, help.js, global-settings.js,
                      reader-settings.js, notes-settings.js, reference-settings.js   [bindPopover consumers + bookmarks' registerPopover]
dialogs.js          ← plans.js, backup.js, study-templates.js                        [NEW module, NEW edges]
                      (dialogs.js imports nothing)

notes.js     → db.js, reader.js, panels.js, reference.js, tags.js  [tags.js edge is now static, was dynamic]
reference.js → db.js, reader.js, selection.js, panels.js, language.js
language.js  → db.js, grammar-decode.js
grammar-decode.js → db.js
reader.js    → db.js only                                          [no longer receives a translation handle]
```

**No circular dependencies.** `dialogs.js` and `popover-registry.js` are leaf modules (import nothing), which is what lets any feature module use them. `state.js` had no edges to remove.

---

## 5. DATA FLOW — CHANGES

**Chapter render** (`renderPane`): `getChapter()` + `getBookmarksForChapter()` + `getNoteCountsForChapter()` + `getMarkupsForChapter()` — four statements regardless of verse count, then `applyIndicators()` and `applyChapterMarkups()` per verse from those maps. Previously `getNotesForVerse()` ran per verse (three statements each).

**Note write** (`notes.js:refreshAfterWrite`, after add/edit/delete note, add/remove tag, add/remove anchor): `refreshVerseIndicators()` (both panes, chapter-batched) → `refreshReference(firstSelectedVerse)` → Info **and Tags** tabs re-render. Tag add via Enter is now on this path.

**Tag/anchor removal** (new): chip ✕ → `removeNoteTag()` / `removeAnchorsFromNote()` → `saveToStorage(db.export())` → study re-render (anchors) or chip removal (tags) → `refreshAfterWrite()`.

**Bookmark navigation** (dropdown row, search result): `navigateTo(book, chapter, verseId)` — the verse id is now passed, so the bookmarked verse is selected and centered (previously chapter only).

**Modal Escape**: a `dialogs.js` dialog captures Escape before any bubbling listener sees it.

**Popover close**: one document `click` + one `keydown` listener in `popover-registry.js` close all bound popovers; `bookmarks.js` keeps its own two listeners with target checks, as before.

Unchanged: boot sequence, persistence, `language.db` lazy load, Psalm-title gloss, Language-tab render flow (the card re-render is internal to `language.js`).

---

## 6. STATE MODEL AND CUSTOM EVENTS

There is no central store, and after this window no vestige of one. The model the app actually uses, consistently:

1. **Module-level variables with exported getters** — `selection.js` (`selectedVerses`, anchor), `reader.js` (`panes`, `activePaneId`, split state), `panels.js` (`openStudies`, `activeStudyId`), `template-bar.js` (`state`), `markups.js` (`expanded`), `language.js` (card/tier state).
2. **Three custom events** for cross-module notification (table below).
3. **Two persisted preference stores**: `app_state` table via `getState/setState` (font sizes, default reference tab — in backups) and `localStorage` (theme, per-pane position/translation/scroll, split on/off, markup strip — not in backups). This split is unchanged and is the real reason a settings consolidation, when it happens, is a product decision (§10).

| Event | Emitter | Detail | Listeners |
|-------|---------|--------|-----------|
| `selection-changed` | selection.js | `{ verseIds: [...], element: verseEl\|null }` | notes.js, reference.js, bookmarks.js, reference-settings.js |
| `study-changed` | panels.js | `{ studyId }` | notes.js |
| `pane-changed` | reader.js (`setActivePane`) | `{ paneId }` | selection.js |

Unchanged from Build 6. One divergence path was closed: `notes.js` caches `verseIds` from the event, and the deleted `showNoteEditor()` was the only code that could overwrite that cache without going through `selection.js`.

---

## 7. WHAT'S WIRED vs. STUBBED

### Newly functional this window
- **Remove a tag from a note** (✕ on chip, study view) — `notes.js:makeTagChip`, `db.js:removeNoteTag`. The tag row is kept for reuse.
- **Remove a verse/range anchor from a note** (✕ on anchor chip) — `notes.js:buildNoteBlock`, `db.js:removeAnchorsFromNote`. Before this there was no removal path in the database layer or the UI.
- **Tags tab refreshes after tag writes** — `reference.js:refreshReference`.
- **Offline on a fresh install** — every module precached (`sw.js`).
- **Bookmark navigation selects the verse** — `bookmarks.js`, `search.js`.
- **Escape on a nested confirm leaves the parent popover open** — `dialogs.js`.
- **Language tab inline word card + Greek grammar decode** — rework window; `FEATURE_INVENTORY.md` 142e–142n.

### Fixed
- **Crash on titled Psalms** — §9.

### Still partially wired / incomplete (carried forward, unchanged)
- `reader-settings.js` / `notes-settings.js` / `reference-settings.js` not migrated into the global settings popover — **deliberately** (§10).
- Help popover copy is stale (`FEATURE_INVENTORY.md` 67a, 148a: "⬤ button", "Related (coming soon)", no Language/Plans mention) — left for the upcoming Help build.
- `manifest.json` references icon files that do not exist in `icons/`.
- PWA install prompt is DOM + styles only; no `beforeinstallprompt` handler.
- Hebrew morphology decode (TEHMC) — no source file, no code; Hebrew tier 2 shows the raw code.
- Devotional plan-day columns and the "more than one plan can be `active`" quirk — see `BUILD_5_ACTUAL_STATE.md` §7.

### Schema with no runtime code
Unchanged from `BUILD_5_ACTUAL_STATE.md` §7 (`notes.parent_note_id`, `template_session_id`, `position`, `note_anchors.word_position`/`strongs_number`, `plan_days` devotional columns).

---

## 8. VERIFICATION — `tests/verify.py` (NEW)

The app has no unit tests; its modules assume a live DOM and sql.js. This window added a Playwright harness that serves the repo root on a local port, boots Ember in headless Chromium with a fresh profile (fresh OPFS, so first run seeds `core.db` and all six translations), drives it, and prints one pass/fail line per check plus every console error except the documented FTS5→LIKE fallback message. **Every commit in this window was gated on it.** Requires `pip install playwright && playwright install chromium`.

| Scenario | What it proves |
|---|---|
| `popovers` (42 checks) | Each of the 8 help/settings popovers opens alone, is positioned, stays open on inside click, toggles closed, closes on outside click and Escape; opening one closes another; settings controls work inside; bookmark prompt/dropdown coexist correctly |
| `smoke` (~40 checks) | Seeds a study/note/tag/bookmark/markup, then walks: indicators, markup apply/re-render/toggle, shift-click and programmatic range selection, all five reference tabs incl. Language tiers 1–3, tag view, All Studies, search + `k:` prefix, plans list/detail/Restart-Escape/Delete-Cancel, template bar, study templates prompt, translation switch, split view, global settings, restore confirm (feeds the real `core.db` through the file chooser, cancels via backdrop), study delete |
| `notes` (18 checks) | `formatReference()`'s six shapes; Enter-key tag add reaches the Tags tab; autocomplete excludes applied tags; tag ✕ clears chip/Tags tab/assignment row; anchor ✕ removes one of two and moves the reader dot; two contiguous attaches coalesce to one chip whose ✕ deletes both rows |
| `indicators` (9 checks) | Psalm 3 (titled): bookmark and note dots on ordinary verses and on the title row, surviving autosave refresh; Info tab refreshed; a 3-verse range note dots all three; stacked counts read "2 notes"; batched chapter counts equal `getNotesForVerse().length` for every rendered verse |
| `sw` (9 checks) | Boots via `127.0.0.1` (app.js skips SW only for `localhost`) so the worker installs for real; exactly one cache; every `.js`/`.wasm` under `js/` plus shell files cached (install is all-or-nothing, so this proves no listed path 404s); `PRECACHE` matches `js/` on disk in both directions |
| `dbsnapshot <out>` / `dbcompare <a> <b>` | Results of ~36 `db.js` calls as JSON, for before/after a db.js change; used to prove the query-helper refactor changed no result |

Known harness behavior: each scenario is a cold boot (translations re-seed into a fresh profile, ~1–2 min); after plan navigation the reference panel auto-switches to Info, so the `smoke` scenario re-clicks the Plans tab before the Study Templates sub-tab.

---

## 9. BUG FIXED, AND DECISIONS TAKEN

### The Psalm-title indicator crash (`a086daf`)
Adding or editing a note, or saving/removing a bookmark, while a titled Psalm (KJV/ASV/Darby, verse=0 row) was displayed in either pane threw `Cannot read properties of null (reading 'querySelector')` from `refreshVerseIndicators()`. The Psalm-title change (Build 6 window) had taught `renderPane()` to anchor indicators to the row when there is no verse-number bubble, but the post-write refresh still assumed every `.verse` had one. The exception aborted the refresh for both panes and, for note writes, skipped the Info-tab refresh that runs after it. Reproduced in the harness before the fix (four page errors, stale dots, stale Info tab); fixed by the shared `applyIndicators()`. Found by reading, during the architecture review, as an instance of "right fix applied to one of two copies."

### Decisions
- **`db.js` query helpers take the handle explicitly** rather than closing over `db`, so translation and language queries use the same code. Result rows keyed by column name; `queryValue()` returns `Object.values(row)[0]`, which is why aggregate/scalar queries need no alias.
- **`getNoteCountsForChapter()` expands ranges in JS**, not SQL — a recursive CTE would work but the anchor count per chapter is tiny and the JS is readable.
- **Anchor removal is by containment** (§2), so a coalesced chip removes exactly its own rows.
- **`formatReference()`'s unknown-book fallback is `"Book N"`** everywhere; two sites previously used `''` or `'Note'`. Only reachable with an invalid id.
- **Escape is owned by the topmost modal** (capture-phase listener in `dialogs.js`). Popover-registry's Escape still fires for bound popovers underneath a dialog, which is harmless.
- **CSV metadata dialog left on `innerHTML`** — static markup, no user text interpolated; a form, not a confirm.
- **Nine dead exports removed rather than kept "for the future"** — `getOriginalWordsForGroup`/`getOriginalWord` are still listed in `docs/Language_Panel_Word_Inspector_Spec.md`'s expected-API line; that spec documents the design at the time and was not edited.
- **`BUILD_6_ACTUAL_STATE.md` not edited** — superseded, per convention.

---

## 10. THE ARCHITECTURE REVIEW — WHAT WAS CONCLUDED AND NOT DONE

The review (2026-09-17) was asked four questions. Its findings and where each landed:

| Question | Finding | Outcome |
|---|---|---|
| Did ad-hoc state patterns grow because `state.js` was never adopted? | Three consistent mechanisms (§6). One real divergence path (`showNoteEditor`). | `state.js` deleted; `showNoteEditor` deleted. No store introduced. |
| Duplication across panels/settings | The duplication in the four settings modules was the popover skeleton, not the settings logic. Also: confirm dialog ×3, reference labels ×11, indicator builder ×2, markup loop ×2, selection apply ×2. | All extracted (`bindPopover`, `dialogs.js`, `formatReference`, `applyIndicators`, `applyChapterMarkups`, `applySingle/applyRange`). |
| Quick fixes that became the dominant pattern | Indicator rendering (title-row fix applied to one copy → crash); notes never got the chapter-batched query bookmarks/markups had; dynamic `tags.js` import hedge; unused-export accumulation. | All fixed. |
| `db.js` duplication / bypasses | 21 + 29 boilerplate copies; tag upsert ×2; column lists ×3; one bypass in `reader.js`; nine dead exports. | All fixed. |

**Explicitly not done, with reasoning that still holds:**

- **The four settings modules were not consolidated into `global-settings.js`.** After `bindPopover`, the three per-panel modules are 47–55 lines each of genuinely different behavior (two font-size controls scoped to different containers; one default-tab toggle that also listens to selection). `global-settings.js`'s `SECTIONS` array would accept them, but doing so is a product decision about where the ⚙ buttons live — and the moment to make it is when the two persisted-preference stores (§6) are unified, since a consolidated popover would expose that split to the user. Neither the upcoming Hebrew-decode work (lands in `grammar-decode.js` + `build_language.py` + one attribution line) nor the Help-copy work (lands in `index.html` + `help.js`) touches settings. **Recommendation carried forward: consolidate when a genuinely global preference is added or when the per-panel ⚙ is removed for UX reasons, not before.**
- **Whole-database export on every settings write** (each font-size click serializes the 23 MB `core.db` to the worker) — correct as designed since Build 1; revisit only if a slider-style setting appears.
- **Resize handles (×3), tab switchers (×2), placeholder helpers (×2)** — judged fine as repetition; small, stable since Build 1, and different enough in axis/clamp/orientation that sharing would obscure more than it saved.
- **Stale help copy, missing icons, install prompt** — §7, deferred to their own builds.
