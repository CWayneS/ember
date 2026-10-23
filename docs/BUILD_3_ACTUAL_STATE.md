# BUILD_3_ACTUAL_STATE.md — Ground-Truth Audit

> **⚠️ SNAPSHOT:** This document reflects the codebase as of 2026-08-28, after Build 3 (reading plans) shipped and its deferred `deleteStudy()`/`deleteNote()` fix landed.
> When this document and the actual source files disagree, **the source files are correct.**
> This document supersedes `BUILD_2_ACTUAL_STATE.md`.

_Read from source files on 2026-08-27, updated 2026-08-28 to reflect the deleteStudy()/deleteNote() fix. No spec, proposal, or guide documents consulted for content — Build_3_Spec.md was checked only to confirm scope, not copied from. Several inaccuracies in `BUILD_2_ACTUAL_STATE.md` were found and corrected here (noted inline); it had drifted from the code even before Build 3 started._

---

## 1. FILE STRUCTURE

```
ember/
├── index.html                        # App shell (single HTML page)
├── manifest.json                     # PWA manifest
├── sw.js                             # Service worker
├── CLAUDE.md                         # Claude Code project instructions
├── README.md                         # Project documentation
├── FEATURE_INVENTORY.md              # Living feature audit
├── BUILD_3_ACTUAL_STATE.md           # This document
├── BUILD_2_ACTUAL_STATE.md           # Superseded — kept for history
├── BUILD_1_ACTUAL_STATE.md           # Superseded — kept for history
├── Build_2_Spec.md / Build_3_Spec.md # Feature specs (unaudited; code is truth where they disagree)
├── Technical_Spec_Build_1.md, USER_MANUAL.md, LICENSE
├── .gitignore
│
├── css/
│   └── style.css                     # All styles (~2,680 lines)
│
├── js/
│   ├── app.js                        # Entry point
│   ├── db.js                         # Database layer: sql.js wrapper, translation handles, all queries
│   ├── usfm.js                       # NEW — USFM book-code map + ref resolution
│   ├── plans.js                      # NEW — Plans tab UI, plan detail popover, JSON/CSV import
│   ├── template-bar.js               # NEW — #template-bar: passage-level plan navigation
│   ├── reader.js                     # Scripture rendering, navigation, per-pane state
│   ├── selection.js                  # Verse selection (single + range)
│   ├── notes.js                      # Note CRUD & study document UI
│   ├── tags.js                       # Tag autocomplete
│   ├── search.js                     # Full-text search UI
│   ├── panels.js                     # Panel tabs, resize handles, layout
│   ├── reference.js                  # Reference panel tabs (Info, Tags, Related, Language)
│   ├── bookmarks.js                  # Bookmark button, prompt, dropdown
│   ├── markups.js                    # Markup button, tool strip, apply/remove logic
│   ├── help.js                       # Shared help popover system (all three panels)
│   ├── popover-registry.js           # Tiny shared registry so opening one popover closes all others
│   ├── reader-settings.js            # Reader font size popover
│   ├── notes-settings.js             # Notes font size popover
│   ├── reference-settings.js         # Default reference tab popover
│   ├── state.js                      # Reactive state scaffold — still imported by nothing, still unused
│   ├── storage-worker.js             # Web Worker: OPFS/IndexedDB persistence
│   └── vendor/
│       ├── sql-wasm.js               # sql.js runtime (plain <script>, tracked in git)
│       └── sql-wasm.wasm             # SQLite WASM binary (gitignored, ~650 KB)
│
├── data/
│   ├── core.db                       # Reference data; user tables created at runtime (see §2)
│   ├── plans/                        # NEW — bundled reading plan JSON, seeded at runtime
│   │   ├── mcheyne-1year.json
│   │   ├── bible-in-a-year-canonical.json
│   │   └── bible-in-a-year-chronological.json
│   ├── translations/                 # One SQLite file per translation
│   │   ├── kjv.db, asv.db, web.db, ylt.db, darby.db, bsb.db
│   └── translations-prep/            # Working directory for translation source data
│                                      # (largely gitignored — see .gitignore); not shipped
│
├── scripts/
│   ├── build_crossrefs.py            # Cross-reference data builder
│   ├── build_translation.py          # Translation db builder (scrollmapper source)
│   ├── convert-mcheyne.js            # NEW — one-off converters, source format → Ember plan JSON
│   ├── convert-canonical.js          # NEW — (bibleplan.org PDF text → JSON)
│   ├── convert-chronological.js      # NEW — (oneyearchronological.json → JSON)
│   └── crossref_split_report.txt     # Build-time report of cross-book reference splits
│
├── docs/
│   └── ANCHOR_QUERIES.md
│
├── icons/                            # EMPTY — .gitkeep only, no icon files exist
├── fonts/                            # EMPTY — .gitkeep only, no custom fonts
│
└── build/
    ├── build_db.py                   # Core db build script (Python 3) — builds data/core.db
    ├── classify_naves.py             # Nave topic classification utility
    ├── CROSSREF_RECON.md, NAVES_CURATION.md
    ├── sources/                      # Raw data files
    └── output/                       # Build artifacts
```

**Notable absences (unchanged since Build 1/2):**
- No PWA icon files (manifest.json references `icons/icon-192.png` / `icons/icon-512.png`, neither exists)
- No custom fonts (system fonts only)
- No test files, no `package.json`, no build tooling, no `node_modules`

**New in Build 3:** `js/usfm.js`, `js/plans.js`, `js/template-bar.js`, `data/plans/*.json`, three `scripts/convert-*.js` one-off converters. Nothing was removed.

---

## 2. DATABASE SCHEMA

There is a single database file, `data/core.db` — no separate `user.db` exists or ever existed in the shipped code (some spec prose calls it "user.db"; that's just naming, not a second file). It holds reference data (baked in at build time by `build/build_db.py`) and user data (created idempotently at runtime by `js/db.js`'s `createUserTables()`, including the reading-plans tables added this build).

### Reference Tables — built by `build/build_db.py`, read-only at runtime

**`books`** — 66 rows. `id INTEGER PRIMARY KEY` (not AUTOINCREMENT — ids are inserted explicitly 1–66).
| Column | Type |
|--------|------|
| id | INTEGER PK |
| name | TEXT |
| abbrev | TEXT |
| testament | TEXT ('OT'/'NT') |
| genre | TEXT ('law','history','poetry','prophecy','gospel','epistle','apocalyptic') |
| chapters | INTEGER |

**`translations`** — 6 rows, manifest only (no verse text). `id INTEGER PRIMARY KEY`.
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | 1=KJV, 2=ASV, 3=WEB, 4=YLT, 5=Darby, 6=BSB |
| filename | TEXT UNIQUE | e.g. 'kjv.db' |
| name | TEXT | |
| abbreviation | TEXT | |
| year | TEXT | e.g. "1611" — **TEXT, not INTEGER** (corrects BUILD_2_ACTUAL_STATE.md) |
| license | TEXT | |
| installed_at | INTEGER | unix timestamp — **INTEGER, not TEXT** (corrects BUILD_2_ACTUAL_STATE.md) |
| is_bundled | INTEGER NOT NULL DEFAULT 0 | 1 for all 6 bundled rows |

**`cross_references`** — 345,483 rows currently (OpenBible.info ranked dataset). **Column names corrected from BUILD_2_ACTUAL_STATE.md**, which had them as `from_verse`/`to_verse_start`/`to_verse_end` — the real columns, per `build/build_db.py` and every read site in `db.js`/`reference.js`, are:
| Column | Type | Notes |
|--------|------|-------|
| source_verse | INTEGER NOT NULL | BBCCCVVV |
| target_start | INTEGER NOT NULL | BBCCCVVV |
| target_end | INTEGER | BBCCCVVV, nullable |
| votes | INTEGER NOT NULL DEFAULT 0 | |
| sources | TEXT NOT NULL DEFAULT 'ob' | |

Index: `idx_crossrefs_source_votes(source_verse, votes DESC)`. Read via `db.js:getCrossReferencesForVerse(verseId, options = {})`, where `options` is `{ floor?, limit?, showAll? }` — **not** the positional `(verseId, floor, topN)` signature BUILD_2_ACTUAL_STATE.md described.

**`topics`** — 5,319 rows (Nave's Topical Bible).
| Column | Type |
|--------|------|
| id | INTEGER PK AUTOINCREMENT |
| name | TEXT |
| entry | TEXT |
| section | TEXT |
| display | INTEGER DEFAULT 0 |

**`topic_verses`** — 138,059 rows. `(topic_id, verse_id)` composite PK, FK `topic_id → topics.id ON DELETE CASCADE`. Indexes on both columns.

### User Data Tables — created idempotently by `db.js:createUserTables()`, empty until the user (or bundled seeding) writes to them

`studies`, `notes` (+ `position REAL`, added via a guarded `ALTER TABLE`), `notes_fts` (FTS4 — sql.js's WASM build has no FTS5 support, so a stale FTS5 table from an old build is detected and migrated), `note_anchors`, `tags`, `tag_assignments`, `bookmarks`, `markups`, `app_state` — all unchanged from Build 2. See `db.js:createUserTables()` for exact DDL; not repeated here since Build 3 didn't touch any of them.

### Reading Plans Tables — NEW this build, created by `db.js:migratePlanTables()`

**History, confirmed via git log/show, not assumed:** Build 1's `build/build_db.py` baked placeholder `plans`/`plan_days`/`plan_progress` tables into the shipped `core.db` (`plans(id, name, type, template_id, sharing_destination)`, `plan_days(id, plan_id, day_number, verse_start, verse_end)`, `plan_progress(plan_id, day_number, completed, completed_at)` — no `plan_id` TEXT column, nothing resembling the Build 3 shape). Commit `6ca39ba` ("Build 2 data prep: … core.db restructure") rebuilt `build_db.py` for the Build 2 schema and dropped all three from the build script — without mentioning them in the commit message. `BUILD_2_ACTUAL_STATE.md` still listed them under "Schema Tables with No Runtime Code," carried forward from `BUILD_1_ACTUAL_STATE.md` without re-verification — **a fresh Build 2 (or later) `core.db` never actually contained them.**

So `migratePlanTables()`'s legacy-shape check (a `plans` table present but missing a `plan_id` column → drop `plan_progress`/`plan_days`/`plans` and recreate) is not defensive-for-no-reason: it exists for the one real scenario where the old shape can still show up — a browser that already has a Build-1-era database persisted in OPFS/IndexedDB, upgrading straight to Build 3's code without ever having gone through a Build 2 core.db rebuild. On every install that started from Build 2 or later (including every fresh install of the current repo), there's nothing to drop and the check is a no-op before the `CREATE TABLE IF NOT EXISTS` statements just run.

**`plans`**
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | internal row id — what every plans.js/db.js function actually keys on |
| plan_id | TEXT UNIQUE NOT NULL | stable external id, e.g. `mcheyne-1year`; duplicate-import detection keys on this |
| title | TEXT NOT NULL | |
| description | TEXT | nullable |
| author | TEXT | nullable |
| language | TEXT DEFAULT 'en' | |
| duration_days | INTEGER NOT NULL | |
| tags | TEXT | JSON array, stored as a string |
| schema_version | INTEGER DEFAULT 1 | |
| source | TEXT NOT NULL | `'bundled'` or `'imported'` |
| imported_at | INTEGER NOT NULL | unix timestamp |
| current_step | INTEGER NOT NULL DEFAULT 0 | 0 = not started; otherwise the day number the plan is bookmarked at |
| status | TEXT NOT NULL DEFAULT 'not_started' | `CHECK(status IN ('not_started','active','completed'))` |

**`plan_days`** — one row per day per plan.
| Column | Type |
|--------|------|
| plan_id | INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE |
| day_number | INTEGER NOT NULL |
| title | TEXT (nullable — always NULL for the three bundled plans) |
| devotional_title | TEXT (nullable — always NULL currently; no bundled or importable plan populates it yet) |
| devotional_body | TEXT (nullable, same as above) |
| reflection_questions_json | TEXT (nullable, same as above) |

`PRIMARY KEY (plan_id, day_number)`.

**`plan_day_scripture`** — one row per passage per day (a day may have several).
| Column | Type |
|--------|------|
| plan_id | INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE |
| day_number | INTEGER NOT NULL |
| sequence | INTEGER NOT NULL — 1-indexed order within the day |
| ref | TEXT NOT NULL — the original USFM ref string, e.g. `"GEN.1.1-2.17"` |
| display | TEXT NOT NULL — human-readable, e.g. `"Genesis 1:1–2:17"` |
| book | INTEGER NOT NULL — pre-resolved, 1–66 |
| chapter | INTEGER NOT NULL — pre-resolved |
| verse_start | INTEGER NOT NULL — pre-resolved |
| verse_end | INTEGER — pre-resolved; NULL for a single verse, a whole chapter, or an approximate (chapter-range / cross-chapter) ref — see §9 |

`PRIMARY KEY (plan_id, day_number, sequence)`.

**⚠️ `ON DELETE CASCADE` here is declared but not enforced.** sql.js does not turn on `PRAGMA foreign_keys` by default (verified empirically this session — a throwaway script confirmed `PRAGMA foreign_keys` reads `0`, and a parent-row `DELETE` left child rows in place). `db.js:deletePlan()` therefore deletes `plan_day_scripture` and `plan_days` explicitly, in that order, before deleting the `plans` row — it does not rely on the schema's cascade at all.

This wasn't new to Build 3: `deleteStudy()` had the identical latent bug for `notes`/`note_anchors`/`tag_assignments` (its old comment claimed "CASCADE on notes FK handles notes deletion," which was never true under sql.js's defaults — `notes.study_id` doesn't even declare `ON DELETE CASCADE` in the schema, and the function only manually cleaned up `notes_fts`, a virtual table CASCADE could never reach anyway). It was found while building `deletePlan()`, deliberately deferred, then fixed at the end of Build 3: `deleteNote()` and `deleteStudy()` now both go through a shared `deleteNoteRows(noteId)` helper — the same explicit, dependency-ordered delete pattern as `deletePlan()` — that removes `note_anchors`, `tag_assignments`, and the `notes_fts` row before the `notes` row itself. `deleteNote()` had the identical leak for every single-note delete, not just study-wide deletes, and is fixed the same way.

### Translation DB Schema (e.g. `data/translations/kjv.db`) — unchanged, but corrected from BUILD_2_ACTUAL_STATE.md

Build script: `scripts/build_translation.py`.

**`verses`** — 31,102 rows. `(book, chapter, verse, text)`, `PRIMARY KEY (book, chapter, verse)`.

**`verses_fts`** — FTS5 virtual table, `content=verses`, `content_rowid=rowid`, column `text`.

**`books`** — **this is a different shape than core.db's `books` table.** `(id INTEGER PRIMARY KEY, name, abbreviation, testament, chapter_count)` — **no `genre` column**, and the column is `abbreviation`/`chapter_count`, not `abbrev`/`chapters` as in core.db. BUILD_2_ACTUAL_STATE.md described this table with core.db's column names, which was wrong.

**`meta`** — a plain **key/value table** (`key TEXT PRIMARY KEY, value TEXT NOT NULL`), not the `name`/`abbreviation`/`year`/`license` columns BUILD_2_ACTUAL_STATE.md described.

Verse IDs are not stored — computed inline as `book * 1000000 + chapter * 1000 + verse` wherever needed.

---

## 3. MODULE MAP

### `js/app.js` — Entry Point

**Imports:** `initDatabase` (db.js); `initReader` (reader.js); `initSelection` (selection.js); `initNotes` (notes.js); `initTags` (tags.js); `initPanels`, `togglePanelLayout` (panels.js); `initSearch` (search.js); `initReference` (reference.js); `initBookmarks` (bookmarks.js); `initHelp` (help.js); `initReaderSettings`, `initNotesSettings`, `initReferenceSettings` (their settings modules); `initMarkups` (markups.js); **`initPlans` (plans.js) — NEW**; **`initTemplateBar` (template-bar.js) — NEW**.

**Exports:** None.

**Summary:** `await initDatabase()`, then every `init*()` in a fixed order (unchanged except two new calls appended near the end, after `initMarkups()`): `initPlans()` then `initTemplateBar()`. Order matters here only in that `initPlans()` runs first — harmless, since `plans.js` only calls `template-bar.js`'s `activatePlan()` later, in response to a click, by which point `initTemplateBar()` has already wired the bar's buttons. Wires the layout toggle and dark-mode toggle, hides the loading screen, registers the service worker (skipped on `localhost`).

---

### `js/db.js` — Database Layer

**Exports (grouped; unchanged Build 1/2 exports omitted from prose beyond a list — see source for full signatures):**
- Init: `initDatabase()`
- Translation: `getTranslationDb(id)`, `getTranslations()`, `getCurrentTranslationId()`, `getCurrentTranslation()`
- Verse IDs: `makeVerseId(book, chapter, verse)`, `parseVerseId(id)`
- Scripture: `getChapter()`, `getBooks()`, `getBook()`, `getChapterVerseCount()`, `getTopicsForVerse()`, `getVersesForTopic()`, `getTopicVerseCount()`, `getUserTagsForVerse()`, `getCrossReferencesForVerse(verseId, options)`
- Notes: `saveNote()`, `updateNote()`, `deleteNote()`, `getNotesForVerse()`, `getNotesForStudy()`, `getNotesForTag()`, `getTagsForNote()`, `getAnchorsForNote()`, `addAnchorToNote()`
- Tags: `getAllTags()`, `addNoteTag()`, `removeNoteTag()`
- Markups: `createMarkup()`, `deleteMarkup()`, `getMarkupsForVerse()`, `getMarkupsForChapter()`, `getExistingMarkup()`
- Search: `search(query, translationId)`
- Studies: `createStudy()`, `getStudyName()`, `renameStudy()`, `getStudies()`, `deleteStudy()`
- Bookmarks: `getAllBookmarks()`, `getBookmarksForChapter()`, `getBookmarkForVerse()`, `addBookmark()`, `removeBookmark()`
- App state: `getState(key)`, `setState(key, value)`
- **Reading plans — NEW:** `insertPlan(meta, days, source)`, `getPlans()`, `deletePlan(planRowId)`, `getPlanDetail(planRowId)`, `setPlanProgress(planRowId, dayNumber)`, `restartPlan(planRowId)`, `getPlan(planRowId)`, `getPlanDayScripture(planRowId, dayNumber)`, `deactivatePlan(planRowId)`

**New internals (Build 3):**
- `migratePlanTables()` — private, called at the end of `createUserTables()`. See §2.
- `seedBundledPlans()` — private `async`, called from `initDatabase()` right after `createUserTables()`/`migratePlanTables()`, before `seedTranslations()`. Fetches each of the three `data/plans/*.json` files, calls `insertPlan()` for each, and swallows a `DUPLICATE_PLAN_ID` error as "already seeded" (so it's a fast no-op after first install). Logs one summary line per plan: days, approximate-range count, unresolved-ref count.
- `insertPlan(meta, days, source)` — the single insertion path shared by `seedBundledPlans()` and `plans.js`'s import flow. Derives `status` from `current_step` vs `duration_days` (0 → not_started, `>= duration_days` → completed, else active), inserts `plans` + one `plan_days` row per day + one `plan_day_scripture` row per passage (resolving each `ref` via `usfm.js:resolveUsfmRef`), and calls `saveToStorage()` once at the end. Throws `Error` with `.code = 'DUPLICATE_PLAN_ID'` if `meta.id` already exists — callers (both `seedBundledPlans()` and `plans.js`) branch on that code.

**Key internals carried over from Build 2 (spot-checked, unchanged):** `_translationDbs: Map<int, sql.js.Database>`; `getChapter()`/`getChapterVerseCount()` fall back to KJV (id 1); `search()` and `getVersesForTopic()` route around sql.js's lack of cross-database JOINs by doing two queries and stitching results in JS; `getCrossReferencesForVerse()`'s `floor`/`limit` defaults are overridable via `window.emberDebug`.

---

### `js/usfm.js` — USFM Book Codes + Ref Resolution — NEW

**Imports:** None.

**Exports:** `USFM_BOOK_CODES` (array of 66 3-letter codes, in canonical book order — index+1 = book id), `resolveUsfmRef(ref)`.

**Summary:** `resolveUsfmRef()` matches five ref shapes in order (cross-chapter verse range → chapter range → in-chapter verse range → single verse → whole chapter) and returns `{ book, chapter, verseStart, verseEnd, approximate }`, or `null` if nothing matches (including an unrecognized book code). `approximate: true` marks the two shapes where `verseEnd` can't be resolved to a real number (chapter range, cross-chapter range) — callers treat that as "log one summary count, don't warn per-ref" and lean on the plan's `display` string for those passages rather than the resolved verse range. Nahum is coded `'NAH'`, not the stricter USFM `'NAM'`, because that's what the actual bundled plan JSON uses throughout — a deliberate deviation, documented in a comment at the top of the file.

---

### `js/plans.js` — Plans Tab UI + Plan Import — NEW

**Imports:** `insertPlan`, `getPlans`, `deletePlan`, `getPlanDetail`, `restartPlan` (db.js); `activatePlan` (template-bar.js).

**Exports:** `initPlans()`, `importPlan(file)`.

**Two responsibilities in one file:**

1. **Plans tab UI** — `initPlans()` wires the Reading Plans / Study Templates sub-tab switch (`initPlansSubtabs`/`switchPlansSubtab` — independent of, and in addition to, `panels.js`'s top-level `#reference-tabs` switching), the Import button/file-input pair, and a click listener on the Plans tab button itself that re-renders the card list (`renderReadingPlansList`) every time the tab is opened — since `panels.js`'s generic tab-switch only toggles visibility classes, it has no idea the list might be stale. `buildPlanCard()` renders one card; clicking it opens `openPlanDetailPopover()`, clicking its ✕ calls `handleDeletePlan()`. The plan detail popover (`openPlanDetailPopover`) builds the header/Continue button, progress line, day-list checklist, and Restart/Delete footer entirely via `document.createElement` (see `openConfirmDialog()` below for why). Continue and each day row call `template-bar.js:activatePlan(planId, dayNumber)`, then `renderReadingPlansList()`, then close the popover.

2. **Plan import** — `importPlan(file)` is the sole exported entry point, dispatching on file extension to `importJsonPlan()` or `importCsvPlan()`. Both eventually call `insertPlanOrThrowFriendly()`, a thin wrapper that turns `insertPlan()`'s `DUPLICATE_PLAN_ID` error into the user-facing "A plan with this ID is already installed." CSV import additionally builds its own metadata (title/description/author) via `openCsvMetadataDialog()`, a `Promise`-returning modal, before it has enough to call `insertPlan()`.

**Shared UI primitive:** `openConfirmDialog({ title, lines, confirmLabel, cancelLabel, danger })` — a small reusable `Promise<boolean>` modal, built exclusively from `document.createElement` + `textContent` assignments (no `innerHTML` interpolation anywhere a plan title could land), used for both the card's delete confirmation and the popover's Restart/Delete confirmations. `openCsvMetadataDialog()` is a separate, purpose-built modal (it does use an `innerHTML` template, but only for static label markup — the three user-entered fields are read back via `.value`, never re-interpolated as HTML).

---

### `js/template-bar.js` — Template Bar (Reading Plan Navigation) — NEW

**Imports:** `getPlan`, `getPlanDayScripture`, `setPlanProgress`, `deactivatePlan`, `makeVerseId` (db.js); `navigateTo` (reader.js).

**Exports:** `initTemplateBar()`, `activatePlan(planRowId, dayNumber)`.

**State:** a single module-level `state` object (or `null` when the bar is inactive): `{ planRowId, title, durationDays, dayNumber, passages, passageIndex }`. Never persisted — see §9 for why that's correct, not an oversight.

**Summary:** `activatePlan()` is the only way the bar turns on. It calls `setPlanProgress(planRowId, dayNumber)` (writing `current_step`/`status`), fetches the plan's title/duration via `getPlan()`, loads that day's passage list via `getPlanDayScripture()`, navigates the reader to the first passage, and un-hides `#template-bar`. `handlePrev`/`handleNext` walk `passageIndex` within `state.passages`; crossing a day boundary re-fetches that day's passages. Only `handleNext`'s "last passage of the last day of the plan" and "advance to the next day" branches call `setPlanProgress()` — every other navigation (including walking backward past the bookmarked day) is local state only. `handleClose()` calls `deactivatePlan()` (status → `not_started`, `current_step` untouched) and clears `state`.

---

### `js/reader.js` — Scripture Rendering + Per-Pane State

**Imports:** `getChapter`, `getBooks`, `getBook`, `getTranslations`, `getTranslationDb`, `getNotesForVerse`, `getMarkupsForChapter`, `getBookmarksForChapter` (db.js).

**Exports:** `initReader()`, `navigateTo(bookId, chapter, highlightVerseId = null)`, `getCurrentLocation()`, `refreshMarkupClasses()`, `refreshVerseIndicators()`, `setActivePane(paneId)`, `getActivePaneId()`, `getActivePaneTranslationId()`, `getActivePaneTranslationAbbrev()`.

**Corrections from BUILD_2_ACTUAL_STATE.md:** `toggleSplit()` is **not exported** — it's a private function wired directly to `#split-toggle-btn` inside `initReader()`. The note-indicator refresh function is named `refreshVerseIndicators()`, not `refreshNoteDots()` (it refreshes both note and bookmark dots together; that rename must have happened sometime in Build 2 without the doc catching it).

**Unchanged from Build 2 otherwise:** per-pane state shape and localStorage persistence (`ember.pane.left.state` / `ember.pane.right.state`), split view, translation switching, book/chapter overlay, `pane-changed` event.

`navigateTo(bookId, chapter, highlightVerseId)` is what `template-bar.js` calls on every passage change — it's the same function search results, cross-references, and note anchors already used, so plan navigation gets the existing scroll-into-view + click-to-select behavior for free.

---

### `js/selection.js`, `js/panels.js`, `js/reference.js`, `js/notes.js`, `js/tags.js`, `js/search.js`, `js/bookmarks.js`, `js/markups.js`, `js/help.js`, `js/popover-registry.js`, `js/reader-settings.js`, `js/notes-settings.js`, `js/reference-settings.js`, `js/state.js`, `js/storage-worker.js`

**No changes this build.** Re-read in full to confirm; behavior matches BUILD_2_ACTUAL_STATE.md's descriptions with two corrections:

- **`popover-registry.js` was omitted from BUILD_2_ACTUAL_STATE.md's module map entirely**, despite being referenced by name in its prose and imported by five other modules (`help.js`, `bookmarks.js`, `reader-settings.js`, `notes-settings.js`, `reference-settings.js`). It's a two-function module: `registerPopover(closeFn)` pushes a closer into a private array; `closeAllPopovers()` calls every registered closer. That's the entire mechanism behind "opening one popover closes all others."
- `panels.js:initReferenceTabs()`'s generic `switchTab()` — matches any `.tab-btn`/`#<tab>-tab` pair under `#reference-tabs`/`#reference-panel` — is exactly what let the Plans tab (Build 3) slot in with zero changes to `panels.js`. Worth noting explicitly since it's the reason Item 4 of Build 3 needed no panels.js edits at all.

`js/state.js` remains fully implemented (`getAppState`/`setAppState`/`onStateChange`) and fully unimported — grepped every `.js` file and `index.html`; nothing references it.

---

## 4. MODULE DEPENDENCIES

```
app.js
  → db.js (no imports)
  → usfm.js (no imports)                              [NEW — imported only by db.js]
  → reader.js → db.js
  → selection.js → reader.js
  → notes.js → db.js, reader.js, panels.js, reference.js
  → tags.js → db.js
  → panels.js → db.js
  → search.js → db.js, reader.js, panels.js
  → reference.js → db.js, reader.js, selection.js, panels.js
  → bookmarks.js → db.js, selection.js, reader.js, popover-registry.js
  → markups.js → db.js, selection.js, reader.js
  → help.js → popover-registry.js
  → reader-settings.js → db.js, popover-registry.js
  → notes-settings.js → db.js, popover-registry.js
  → reference-settings.js → db.js, panels.js, popover-registry.js
  → plans.js → db.js, template-bar.js                  [NEW]
  → template-bar.js → db.js, reader.js                 [NEW]
  → state.js (no imports — unused, and nothing imports it)

db.js → usfm.js                                        [NEW]
```

No circular dependencies. `pane-changed` (reader.js → selection.js) and the `#reference-tabs`/`#template-bar` DOM (panels.js and template-bar.js touch overlapping DOM but never import each other) are the two places a cycle might otherwise have been tempting; neither exists. `plans.js` importing `template-bar.js`'s `activatePlan()` — rather than `template-bar.js` reaching back into `plans.js` to refresh the card list — is what keeps that pair one-directional: `plans.js` calls `renderReadingPlansList()` itself, right after calling `activatePlan()`, instead of `template-bar.js` needing to know the Plans tab exists at all.

**One dynamic-import wrinkle, unrelated to Build 3 but not previously documented:** `notes.js:buildTagsArea()` does `import('./tags.js').then(({ setupTagInput }) => ...)` — a runtime-only edge (`notes.js → tags.js`) that doesn't show up in a static import scan. It's how the tag-input autocomplete gets wired onto each note block without `notes.js` taking a hard static dependency on `tags.js`.

---

## 5. DATA FLOW

### Boot Sequence (`app.js` → `db.js:initDatabase()`)

1. Page loads; `sql-wasm.js` (plain `<script>`) sets `window.initSqlJs`.
2. `app.js` calls `await initDatabase()`.
3. Inside `initDatabase()`:
   a. Load the sql.js WASM module.
   b. Load `core.db`: OPFS → IndexedDB fallback (`loadFromStorage()`); if neither has it, fetch `./data/core.db` fresh and immediately persist it.
   c. `createUserTables()` — idempotent DDL for every user-data table, **ending with `migratePlanTables()`** (drops any Build-1-shaped `plans` table, creates `plans`/`plan_days`/`plan_day_scripture` if not already present).
   d. **`await seedBundledPlans()`** — fetches the three `data/plans/*.json` files and inserts each via `insertPlan()`, skipping any whose `plan_id` already exists. Runs every boot; a no-op after the first successful run.
   e. `await seedTranslations()` — fetches bundled translation files into OPFS if not already there, updating the loading-screen text.
   f. `await openTranslationHandles(SQL)` — opens a sql.js `Database` handle per bundled translation into `_translationDbs`.
4. All other `init*()` modules run synchronously, in the fixed order listed under `app.js` above — this is where `initPlans()` and `initTemplateBar()` now run.
5. `initReader()` restores per-pane state from `localStorage` and renders both panes (if split is active).
6. Loading screen hidden; app is live. Service worker registered if not on `localhost`.

**The template bar never activates during boot**, regardless of whether some plan's `status` is `'active'` from a previous session — `template-bar.js`'s `state` starts `null` and only `activatePlan()` (called from `plans.js`, called from a user click) ever sets it. This is deliberate: the plan is a bookmark, and picking a book back up is a decision the user makes from the Plans tab, not something that happens to them on load.

### Persistence on Write (User Data — including plans)

Unchanged mechanism from Build 2: every write function in `db.js` (`saveNote()`, `createMarkup()`, `insertPlan()`, `deletePlan()`, `setPlanProgress()`, `restartPlan()`, `deactivatePlan()`, etc.) calls `db.export()` synchronously, then hands the resulting `Uint8Array` to a Web Worker (`storage-worker.js`) via a zero-copy `postMessage` transfer; the worker writes it to OPFS (`core.db`) or falls back to IndexedDB. The main thread never waits on the actual disk write.

`insertPlan()` does this **once** at the end, after inserting the plan row and every day/passage row — not once per row — so seeding three plans with hundreds of days each doesn't trigger hundreds of exports.

### Per-Pane State Persistence

Unchanged from Build 2 — see `reader.js`, `localStorage` keys `ember.pane.left.state` / `ember.pane.right.state`.

### Template Bar Browsing State — deliberately *not* persisted

This is the one piece of Build 3 state that lives nowhere but memory. `template-bar.js`'s `state.dayNumber`/`state.passageIndex` — "what the bar is currently showing" — is distinct from `plans.current_step` in the database — "the day the plan is bookmarked at." The bar lets you walk backward with Prev/Prev Day to re-read earlier days without touching the bookmark; only advancing past the last passage of a day with Next Day writes `current_step` forward. Reloading the page, or navigating away and back within the same session, only restores `current_step` (via a fresh `activatePlan()` call, day 1 passage 1 of whatever day `current_step` says) — never the mid-day passage position or how far back a review session had wandered. This is intentional, not a partial implementation: Build_3_Spec.md's "no auto-activate on load" requirement and its "Prev is free review" behavior only make sense together if the browsing position is ephemeral.

---

## 6. CUSTOM EVENTS

Unchanged from Build 2 — Build 3 added no new `CustomEvent` types. The Plans tab and template bar communicate entirely through direct function calls (`plans.js` → `template-bar.js`, both → `db.js`), not events.

| Event | Emitter | Detail | Listeners |
|-------|---------|--------|-----------|
| `selection-changed` | selection.js | `{ verseIds: [...], element: verseEl\|null }` | notes.js, reference.js, bookmarks.js, reference-settings.js |
| `study-changed` | panels.js | `{ studyId }` | notes.js |
| `pane-changed` | reader.js (`setActivePane`) | `{ paneId }` | selection.js |

---

## 7. WHAT'S WIRED vs. STUBBED

### Fully Functional (Build 1 + 2, spot-checked, unchanged)

Scripture rendering (6 translations, 66 books); per-pane independent translation/navigation/scroll; book/chapter selector overlay; verse selection (single + range); notes (create/edit/delete, autosave, anchor coalescing); tags (create/autocomplete/remove); studies (create/rename/delete, All Studies view); text markups (highlight/underline/circle, multi-color, toggle/replace); full-text search (Scripture/notes/tags/studies/bookmarks, 5 prefixes); bookmarks (add/remove/browse); reference panel Info/Tags/Related tabs; panel resize + layout toggle; font size settings; help popovers; OPFS/IndexedDB persistence; service worker offline caching; dark mode.

### Fully Functional — NEW in Build 3

- **Plans tab** (Reading Plans + Study Templates sub-tabs) — slotted into the existing generic `#reference-tabs` mechanism with zero changes to `panels.js`.
- **Reading plan cards** — list, sort, status badges, progress line, delete-with-confirmation.
- **Plan detail popover** — day checklist, Continue, Restart, Delete, all working.
- **Plan import** — JSON and CSV, date-bound→sequential conversion, duplicate rejection, malformed-file handling.
- **Bundled plan seeding** — three plans, idempotent, runs every boot.
- **USFM resolution** — all 66 books, five ref shapes, resolved once at write time.
- **Template bar** — fully wired: Prev/Next/Prev Day/Next Day, progress dots, clickable passage label, close. Does not auto-activate on load (by design).
- **`deleteStudy()`/`deleteNote()`** — not a new feature, but fixed during Build 3's wrap-up: both leaked orphaned `note_anchors`/`tag_assignments` rows (sql.js doesn't enforce the schema's `ON DELETE CASCADE`, and `notes.study_id` doesn't even declare one). Both now go through a shared `deleteNoteRows()` helper — see §2. No longer listed under Partially Wired below.

### Partially Wired / Incomplete

- **Reference → Language tab**: static placeholder only, unchanged.
- **Study Templates sub-tab**: static placeholder only, by design for this build — no import button, no list, no JS renders it at all.
- **Devotional content** (`plan_days.devotional_title`/`devotional_body`/`reflection_questions_json`): columns exist and `insertPlan()`/`getPlanDetail()` read/write them, but nothing populates them — all three bundled plans and both import formats are Scripture-only. No UI renders them even if they were populated (the plan detail popover's day rows only ever show `title` and the first passage's `display` string).
- **Simultaneous "active" plans**: nothing stops more than one plan from having `status = 'active'` at once (e.g. activate plan A, leave the bar up, go activate plan B from the Plans tab — A's row is never touched). The template bar only ever shows one plan; the Plans tab list is unaffected and continues to reflect each plan's own state correctly. Not a bug exactly — just an unenforced assumption worth knowing about.
- **`sw.js`'s `PRECACHE` list is stale**, and more so after this build: it lists `app.js`, `db.js`, `reader.js`, `selection.js`, `notes.js`, `tags.js`, `search.js`, `panels.js`, `state.js`, `storage-worker.js`, and the two vendor files — but not `reference.js`, `bookmarks.js`, `markups.js`, `help.js`, `popover-registry.js`, `reader-settings.js`, `notes-settings.js`, `reference-settings.js` (all pre-existing gaps from Build 2), nor the three new Build 3 modules (`usfm.js`, `plans.js`, `template-bar.js`) or `data/plans/*.json`. This doesn't break offline use in practice — the fetch handler's cache-first-with-fallback caches anything on first successful fetch regardless of whether it was in the install-time list — but it means those files aren't guaranteed cached until the user has actually triggered a fetch for each of them at least once while online.

### Schema Tables with No Runtime Code

**Correction, not a carry-forward:** BUILD_2_ACTUAL_STATE.md listed `verse_mappings`, `original_words`, `lexicon`, `study_templates`, `template_steps`, `session_records`, `note_quotes`, `plans`, `plan_days`, `plan_progress`, `memory_verses`, `memory_reviews` here. Checked every name against the current `js/db.js`, `build/build_db.py`, and the shipped `core.db`'s own `sqlite_master`: **none of the nine non-plans names exist anywhere** — not as a `CREATE TABLE` in any script, not as a table in the shipped database. The only trace of them is a single dangling `FOREIGN KEY (template_session_id) REFERENCES session_records(id)` on the `notes` table in `db.js` (harmless — sql.js doesn't enforce it; see the FK note above) and a `template_id`/`sharing_destination` shape in Build 1's now-defunct placeholder `plans` table (see above). This looks like table names that were sketched in an early technical spec and never actually built, not tables that once existed and were later dropped. Left here only as a record that they're **not present**, not as a to-do list.

(`plans`/`plan_days`/`plan_progress` are off this list — Build 1's placeholder shape, which did really exist, was replaced with the real schema described above.)

### Other

- **`js/state.js`**: fully implemented, still unused — confirmed by grep, nothing imports it.
- **`manifest.json`** references icon files that don't exist on disk.
- **PWA install prompt**: DOM + styles present; `beforeinstallprompt` handler not implemented.

---

## 8. VERSE ID CONVENTION

Unchanged. `BBCCCVVV` integer: `book * 1_000_000 + chapter * 1_000 + verse`.

- Genesis 1:1 = `1001001`; Revelation 22:21 = `66022021`.
- Encoded/decoded by `makeVerseId()` / `parseVerseId()` in `db.js`.
- `cross_references` stores `source_verse`, `target_start`, `target_end` this way (see §2 for the corrected column names).
- **`plan_day_scripture` does not use BBCCCVVV** — it stores `book`, `chapter`, `verse_start`, `verse_end` as separate columns (matching the translation DBs' `verses` table shape, not the BBCCCVVV-integer shape). `template-bar.js` calls `makeVerseId()` itself, at navigation time, to build the id `reader.js:navigateTo()` expects.

---

## 9. READING PLANS — Schema, State Model, and What Doesn't Persist

This section exists because the plans feature has a state model that isn't obvious from the schema alone.

**Two different "current day" concepts exist, on purpose:**

1. **`plans.current_step`** (persisted) — the day the plan is bookmarked at. Only three things ever change it: `insertPlan()` at import/seed time (from `meta.current_step`, normally 0), `setPlanProgress(planRowId, dayNumber)` (called by `activatePlan()` when a plan is opened, and by the template bar's "Next Day" when a day is finished), and `restartPlan()`/`deactivatePlan()` (reset to 0, or left alone, respectively).
2. **`template-bar.js`'s in-memory `state.dayNumber`/`state.passageIndex`** (never persisted) — what the bar is currently showing. Prev/Prev Day can walk this backward past `current_step` for review, with zero effect on the database; only crossing forward past the last passage of a day (Next Day) calls `setPlanProgress()` and brings the two back in sync.

**Why this matters for anyone extending this code:** don't assume `current_step` tells you "what passage is on screen" — it only tells you "the last day the user advanced past via Next Day, or explicitly jumped to via Continue/a day row in the popover." The actual on-screen passage, mid-review, can be earlier.

**Status semantics:** `status` is derived, not independently chosen, in every code path except `deactivatePlan()`:
- `insertPlan()` / `setPlanProgress()`: `0` → `not_started`; `1..duration_days-1` → `active`; `>= duration_days` → `completed` (and `current_step` is clamped to `duration_days` in that case).
- `restartPlan()`: forces `current_step = 0`, `status = 'not_started'`.
- `deactivatePlan()` (the template bar's ✕): forces `status = 'not_started'` **without** touching `current_step` — the one place status and step can disagree (a plan can show "Not Started" in the Plans tab while `current_step` is, say, 40; Continue still resumes at day 40, because `effectiveCurrentDay()` in `plans.js` — and `activatePlan()`'s own dayNumber argument — only look at `current_step`, never `status`, to decide where to resume).

**Devotional fields exist in the schema and are read/written but never populated or rendered** — see §7. Nothing in Build 3 needs them; they're there because the schema was designed for a future date where a plan does carry devotional content, and adding the columns later would need another migration.
