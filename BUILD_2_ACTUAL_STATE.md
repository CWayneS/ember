# BUILD_2_ACTUAL_STATE.md — Ground-Truth Audit

> **⚠️ SNAPSHOT:** This document reflects the codebase as of 2026-04-24, after Build 2 shipped.
> When this document and the actual source files disagree, **the source files are correct.**

_Read from source files on 2026-04-24. No spec, proposal, or guide documents consulted._

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
├── BUILD_2_ACTUAL_STATE.md           # This document
├── Build_2_Spec.md                   # Build 2 feature spec (unaudited)
├── .gitignore
│
├── css/
│   └── style.css                     # All styles
│
├── js/
│   ├── app.js                        # Entry point
│   ├── db.js                         # Database layer (sql.js wrapper + translation handles)
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
│   ├── reader-settings.js            # Reader font size popover
│   ├── notes-settings.js             # Notes font size popover
│   ├── reference-settings.js         # Default reference tab popover
│   ├── state.js                      # Reactive state (imported but unused)
│   ├── storage-worker.js             # Web Worker: OPFS/IndexedDB persistence
│   └── vendor/
│       ├── sql-wasm.js               # sql.js runtime (plain <script>, tracked in git)
│       └── sql-wasm.wasm             # SQLite WASM binary (gitignored, ~1.5 MB)
│
├── data/
│   ├── core.db                       # Reference + user data (no verse text)
│   └── translations/                 # One SQLite file per translation
│       ├── kjv.db
│       ├── asv.db
│       ├── web.db
│       ├── ylt.db
│       ├── darby.db
│       └── bsb.db
│
├── scripts/
│   ├── build_crossrefs.py            # Cross-reference data builder
│   └── build_translation.py         # Translation db builder (scrollmapper source)
│
├── icons/
│   └── .gitkeep                      # EMPTY — no icon files exist
│
├── fonts/
│   └── .gitkeep                      # EMPTY — no custom fonts
│
└── build/
    ├── build_db.py                   # Core db build script (Python 3)
    ├── classify_naves.py             # Nave topic classification utility
    ├── CROSSREF_RECON.md
    ├── NAVES_CURATION.md
    ├── sources/                      # Raw data files
    └── output/                       # Build artifacts
```

**Notable absences:**
- No PWA icon files (manifest.json references icons that don't exist on disk)
- No custom fonts (system fonts only)
- No test files
- No node_modules (no package.json; no build tooling)

---

## 2. DATABASE SCHEMA

### `data/core.db` — Reference data + user data. No verse text.

Build script: `build/build_db.py` and `scripts/build_crossrefs.py`.

#### Scripture Reference Tables — Read-Only

**`books`** — 66 rows
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | 1–66 |
| name | TEXT | "Genesis", "Matthew", etc. |
| abbrev | TEXT | "Gen", "Mat", etc. |
| testament | TEXT | 'OT' or 'NT' |
| genre | TEXT | 'law', 'history', 'poetry', 'prophecy', 'gospel', 'epistle', 'apocalyptic' |
| chapters | INTEGER | Chapter count per book |

**`translations`** — 6 rows (manifest only; no verse text)
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | 1 = KJV, 2 = ASV, 3 = WEB, 4 = YLT, 5 = Darby, 6 = BSB |
| filename | TEXT | e.g. 'kjv.db' |
| name | TEXT | e.g. 'King James Version' |
| abbreviation | TEXT | e.g. 'KJV' |
| year | INTEGER | |
| license | TEXT | |
| installed_at | TEXT | |
| is_bundled | INTEGER | 1 for all 6 |

**`topics`** — Nave's Topical Bible
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT | Topic name |
| entry | TEXT | Full entry text |
| section | TEXT | |
| display | INTEGER DEFAULT 0 | 1 = shown as chip |

**`topic_verses`** — Nave's verse mappings
| Column | Type |
|--------|------|
| topic_id | INTEGER PK, FK → topics.id |
| verse_id | INTEGER PK (BBCCCVVV integer) |

Indexes: `idx_topic_verses_topic`, `idx_topic_verses_verse`

**`cross_references`** — OpenBible.info cross-reference data (~340K pairs)
| Column | Type | Notes |
|--------|------|-------|
| from_verse | INTEGER | BBCCCVVV |
| to_verse_start | INTEGER | BBCCCVVV |
| to_verse_end | INTEGER | BBCCCVVV, nullable |
| votes | INTEGER | Vote score (crowd-sourced confidence) |

Index: `idx_crossref_from`

#### User Data Tables — Empty Until User Creates Data

**`studies`**
| Column | Type | Default |
|--------|------|---------|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT | 'Untitled Study' |
| created_at | TEXT | datetime('now') |
| modified_at | TEXT | datetime('now') |
| status | TEXT | 'active' |

**`notes`**
| Column | Type | Default |
|--------|------|---------|
| id | INTEGER PK AUTOINCREMENT | |
| body | TEXT | '' |
| created_at | TEXT | datetime('now') |
| modified_at | TEXT | datetime('now') |
| visibility | TEXT | 'private' |
| parent_note_id | INTEGER | FK → notes.id ON DELETE CASCADE |
| template_session_id | INTEGER | |
| study_id | INTEGER | FK → studies.id |
| position | REAL | NULL (future drag-reorder) |

**`notes_fts`** — FTS4 virtual table, content="notes", column: body

**`note_anchors`**
| Column | Type |
|--------|------|
| id | INTEGER PK AUTOINCREMENT |
| note_id | INTEGER FK → notes.id ON DELETE CASCADE |
| verse_start | INTEGER | BBCCCVVV |
| verse_end | INTEGER | BBCCCVVV, nullable |
| word_position | INTEGER | |
| strongs_number | TEXT | |

Indexes: `idx_anchors_note`, `idx_anchors_verse`

**`tags`** / **`tag_assignments`** — unchanged from Build 1

**`bookmarks`**
| Column | Type |
|--------|------|
| id | INTEGER PK AUTOINCREMENT |
| verse_id | INTEGER |
| label | TEXT |
| created_at | TEXT |

**`markups`**
| Column | Type |
|--------|------|
| id | INTEGER PK |
| verse_start | INTEGER | BBCCCVVV |
| verse_end | INTEGER | BBCCCVVV, nullable |
| type | TEXT | 'highlight' or 'underline' |
| color | TEXT | color key (e.g. 'yellow', 'green', 'blue') |
| created_at | INTEGER | |

Index: `idx_markups_verse`

**`app_state`** — key/value; used for font sizes and default reference tab only.
Reading position is now in `localStorage` (not `app_state`).

### Translation DB Schema (e.g. `data/translations/kjv.db`)

Build script: `scripts/build_translation.py` (source: scrollmapper OpenScriptures CSV).

**`verses`** — 31,102 rows
| Column | Type | Notes |
|--------|------|-------|
| book | INTEGER | 1–66 |
| chapter | INTEGER | |
| verse | INTEGER | |
| text | TEXT | Verse text |
| PRIMARY KEY | (book, chapter, verse) | |

**`verses_fts`** — FTS5 virtual table, content=verses, content_rowid=rowid, column: text

**`books`** — book metadata (name, abbrev, testament, genre, chapters)

**`meta`** — translation metadata (name, abbreviation, year, license)

Verse IDs not stored — computed inline as `book * 1000000 + chapter * 1000 + verse`.

---

## 3. MODULE MAP

### `js/app.js` — Entry Point

**Imports:** `initDatabase` from db.js; `initReader` from reader.js; `initSelection` from selection.js; `initNotes` from notes.js; `initTags` from tags.js; `initPanels`, `togglePanelLayout` from panels.js; `initSearch` from search.js; `initReference` from reference.js; `initBookmarks` from bookmarks.js; `initHelp` from help.js; `initReaderSettings` from reader-settings.js; `initNotesSettings` from notes-settings.js; `initReferenceSettings` from reference-settings.js; `initMarkups` from markups.js

**Exports:** None

**Summary:** Bootstraps the app — `await initDatabase()` (loads core.db, seeds and opens all translation handles), initializes all modules, wires layout toggle and dark mode toggle, hides loading screen, registers service worker (skipped on localhost). No longer restores reading position — reader.js handles that from localStorage.

---

### `js/db.js` — Database Layer

**Exports:**
- Init: `initDatabase()`
- Translation: `getTranslationDb(id)`, `getTranslations()`, `getCurrentTranslationId()`
- Verse IDs: `makeVerseId(book, chapter, verse)`, `parseVerseId(id)`
- Scripture reads: `getChapter(translationId, bookId, chapter)`, `getBooks()`, `getBook(bookId)`, `getChapterVerseCount(bookId, chapter)`, `getTopicsForVerse(verseId)`, `getUserTagsForVerse(verseId)`, `getCrossReferencesForVerse(verseId, floor, topN)`
- Note writes: `saveNote(body, anchors, tagNames, studyId)`, `updateNote(noteId, body)`, `deleteNote(noteId)`
- Note reads: `getNotesForVerse(verseId)`, `getNotesForStudy(studyId)`, `getTagsForNote(noteId)`, `getAnchorsForNote(noteId)`
- Tags: `getAllTags()`, `addNoteTag(noteId, tagName)`, `removeNoteTag(noteId, tagName)`
- Markups: `createMarkup(verseStart, verseEnd, type, color)`, `deleteMarkup(id)`, `getMarkupsForChapter(translationId, bookId, chapter)`, `getExistingMarkup(verseStart, verseEnd, type)`
- Search: `search(query, translationId)`
- Studies: `createStudy(name)`, `getStudies()`, `deleteStudy(studyId)`, `renameStudy(studyId, name)`
- Bookmarks: `getBookmarkForVerse(verseId)`, `addBookmark(verseId, label)`, `removeBookmark(id)`, `getAllBookmarks()`
- App state: `getState(key)`, `setState(key, value)`

**Key internals:**
- `_translationDbs: Map<integer, sql.js.Database>` — keyed by translation ID (1–6)
- `getChapter()` falls back to KJV (id=1) if the requested translation handle is missing
- `getChapterVerseCount()` always uses KJV (reference count)
- `search()` routes verse FTS to the specified translation db; lookups for `book_name` use `getBook()`, not a SQL JOIN (cross-db queries are not possible with sql.js)
- `getVersesForTopic()` is two-step: verse IDs from core.db `topic_verses`, then IN-clause query to translation db
- `getCrossReferencesForVerse()` reads `cross_references` in core.db; `floor` and `topN` have defaults (`CROSSREF_VOTE_FLOOR_DEFAULT = 5`, `CROSSREF_TOP_N_DEFAULT = 25`); both are overridable via `window.emberDebug` at runtime

---

### `js/reader.js` — Scripture Rendering + Per-Pane State

**Imports:** `getChapter`, `getBooks`, `getBook`, `getChapterVerseCount`, `getNotesForVerse`, `getMarkupsForChapter`, `getTranslations` from db.js

**Exports:** `initReader()`, `navigateTo(bookId, chapter, highlightVerseId)`, `getCurrentLocation()`, `refreshNoteDots()`, `refreshMarkupClasses()`, `toggleSplit()`, `setActivePane(paneId)`, `getActivePaneId()`, `getActivePaneTranslationId()`, `getActivePaneTranslationAbbrev()`

**Per-pane state:**
```
PANE_KEYS = { a: 'ember.pane.left.state', b: 'ember.pane.right.state' }
panes = { a: { translationId, bookId, chapter, verse, scrollPosition }, b: { ... } }
```
State shape validated on load; defaults to `{ translationId: 1, bookId: 1, chapter: 1, verse: 1, scrollPosition: 0 }` for any missing or invalid field.

**Key functions:**
- `loadPaneState(paneId)` / `savePaneState(paneId)` — JSON to/from localStorage
- `renderPane(paneId, bookId, chapter, highlightVerseId)` — renders chapter, resets scrollPosition to 0, saves state, updates translation label, applies markup classes
- `switchPaneTranslation(paneId, translationId)` — calls `findValidReference()` to ensure chapter exists in target, updates pane state, re-renders
- `renderTranslationRow(paneId)` — populates `#translation-row` in `#book-overlay` with one button per translation; active translation gets `.active` class
- `updateTranslationLabel(paneId)` — sets `.translation-label` text in pane nav
- `initSplitResize()` — draggable handle between panes, min 200px per pane
- Throttled scroll save: `200ms` debounce on `scroll` event of `.pane-content`
- Scroll restore on initial load: `requestAnimationFrame` after `renderPane` restores `savedScrollA/B`

**Events emitted:** `pane-changed` (CustomEvent on `document`) — `{ detail: { paneId } }` — dispatched by `setActivePane` when the active pane changes

---

### `js/selection.js` — Verse Selection

**Imports:** `setActivePane`, `getActivePaneId` from reader.js

**Exports:** `initSelection()`, `getSelectedVerses()`, `selectVerseRange(startId, endId)`

**State:** `selectedVerses[]`, `anchorVerseId`, `anchorPaneId`

**Events emitted:** `selection-changed` — `{ verseIds: [...], element: verseEl|null }`

**Events listened:**
- `.scripture-text` click → `handleVerseClick`
- `.pane-content` click → `clearSelection` (bubbles up when click doesn't hit a verse)
- `document` `pane-changed` → clear selection if anchor is in the outgoing pane

**Selection modes:**
- Plain click: `selectSingle()` — sets new anchor, glow animation
- Shift-click (same pane as anchor): `selectRange()` — selects min…max verse IDs within pane
- Shift-click (cross-pane or no anchor): falls back to plain-click
- `selectVerseRange(startId, endId)`: programmatic selection for cross-reference navigation; mirrors `selectSingle`/`selectRange` behavior, scrolls into view

---

### `js/notes.js` — Study Document

**Imports:** `saveNote`, `updateNote`, `deleteNote`, `getNotesForStudy`, `getStudies`, `parseVerseId`, `getBooks`, `createStudy`, `deleteStudy`, `renameStudy`, `addNoteTag`, `removeNoteTag`, `getAnchorsForNote`, `getTagsForNote` from db.js; `refreshNoteDots` from reader.js; `openStudy`, `closeStudy`, `getActiveStudyId` from panels.js; `refreshReference` from reference.js; `getActivePaneTranslationId` from reader.js; `getVersesForTopic` from db.js

**Exports:** `initNotes()`, `showNoteEditor(verseIds, options)`

**Key additions vs. Build 1:**
- `coalesceAnchors(anchors)` at line 510 — merges adjacent single-verse anchors into a range anchor before saving. Called in `saveNote` path.
- Tag view uses `getActivePaneTranslationId()` (not `getCurrentTranslationId()`) when calling `getVersesForTopic`

---

### `js/markups.js` — Text Markups

**Imports:** `getExistingMarkup`, `createMarkup`, `deleteMarkup` from db.js; `getSelectedVerses` from selection.js; `refreshMarkupClasses` from reader.js

**Exports:** `initMarkups()`

**State:** `expanded: boolean` — persisted to `localStorage` key `ember.markup_button.expanded`

**Logic:**
- `applyState()` — toggles `markup-mode-on` on `<body>` and updates `#markup-btn` appearance
- `handleToolClick(type, color)` — reads `getSelectedVerses()`; if existing markup of same type on same range: same color → toggle off, different color → replace; else create new
- Works with single verse or range selection

---

### `js/help.js` — Shared Help Popover System

**Imports:** None

**Exports:** `initHelp()`

**Summary:** Wires all three `?` buttons (reader, notes, reference headers) to open contextual help popovers using the shared `.help-popover` CSS component. Opening one closes all others. Closes on outside click or Escape. "More help" link is a non-functional placeholder.

---

### `js/reader-settings.js` — Reader Font Size

**Imports:** `getState`, `setState` from db.js

**Exports:** `initReaderSettings()`

**Summary:** A− / A+ buttons adjust `--scripture-font-size` CSS variable on `#reader-body` (scope: `.verse-text`, `.verse-number` only). Range: 12px–28px, default 18px. Persisted in `app_state` key `scripture_font_size`.

---

### `js/notes-settings.js` — Notes Font Size

**Imports:** `getState`, `setState` from db.js

**Exports:** `initNotesSettings()`

**Summary:** A− / A+ buttons adjust `--notes-font-size` CSS variable on `#notes-panel`. Range: 12px–28px, default 18px. Persisted in `app_state` key `notes_font_size`.

---

### `js/reference-settings.js` — Default Reference Tab

**Imports:** `getState`, `setState` from db.js

**Exports:** `initReferenceSettings()`

**Summary:** Three-button toggle (Info / Tags / Related) sets the default tab to activate when `selection-changed` fires. Persisted in `app_state` key `default_reference_tab`.

---

### `js/reference.js` — Reference Panel

**Imports:** `getBook`, `parseVerseId`, `getChapterVerseCount`, `getTopicsForVerse`, `getUserTagsForVerse`, `getNotesForVerse`, `getCrossReferencesForVerse` from db.js; `openStudy` from panels.js; `navigateTo` from reader.js; `selectVerseRange` from selection.js

**Exports:** `initReference()`, `refreshReference(verseId)`

**Related tab (Build 2 addition):**
- `renderRelatedTab(verseId, book, parsed)` — calls `getCrossReferencesForVerse(verseId, floor, topN)` with defaults from `window.emberDebug` or constants
- Results grouped by target book; rendered as clickable buttons
- Vote filter toggle: "Show all" reveals references below the vote floor; "Show fewer" reverts
- Click handler: `navigateTo` to target chapter, then `selectVerseRange(to_verse_start, to_verse_end)`
- Empty state: "No high-signal cross-references for this verse."

---

### `js/search.js` — Full-Text Search

**Imports:** `search`, `parseVerseId`, `getBooks`, `getAllBookmarks` from db.js; `navigateTo`, `getActivePaneTranslationId`, `getActivePaneTranslationAbbrev` from reader.js; `openTagView`, `openStudy` from panels.js

**Key change vs. Build 1:** Scripture search runs against the active pane's translation (`getActivePaneTranslationId()`); results section header is `"Scripture · ${translationAbbrev}"`.

---

### Other modules (unchanged from Build 1)

- **`js/panels.js`** — no significant changes
- **`js/tags.js`** — no changes
- **`js/bookmarks.js`** — no changes
- **`js/state.js`** — still unused
- **`js/storage-worker.js`** — no changes

---

## 4. MODULE DEPENDENCIES

```
app.js
  → db.js (no imports)
  → reader.js → db.js
  → selection.js → reader.js
  → notes.js → db.js, reader.js, panels.js, reference.js
  → tags.js → db.js
  → panels.js → db.js
  → search.js → db.js, reader.js, panels.js
  → reference.js → db.js, panels.js, reader.js, selection.js
  → bookmarks.js → db.js, selection.js, reader.js
  → markups.js → db.js, selection.js, reader.js
  → help.js (no imports)
  → reader-settings.js → db.js
  → notes-settings.js → db.js
  → reference-settings.js → db.js
  → state.js (no imports — unused)
```

No circular dependencies. `pane-changed` CustomEvent breaks the reader↔selection cycle: reader.js dispatches, selection.js listens (selection cannot import from reader because reader imports from selection).

---

## 5. DATA FLOW

### Boot Sequence (`app.js`)

1. Page loads, `sql-wasm.js` sets `window.initSqlJs`
2. `app.js` calls `await initDatabase()`
3. `initDatabase()` in db.js:
   a. Loads sql.js WASM
   b. Loads `core.db` from OPFS → IndexedDB → network fetch fallback
   c. Calls `createUserTables()` — idempotent DDL for all user data tables
   d. Calls `seedTranslations()` — fetches each bundled translation from network and writes to OPFS `translations/` if not already there; updates loading message `"Installing translations… N of 6"`
   e. Calls `openTranslationHandles(SQL)` — opens a sql.js Database for each translation from OPFS (or network fallback); stores in `_translationDbs` Map
4. All `init*()` modules run (synchronous, attach event listeners)
5. `initReader()` loads per-pane state from localStorage, renders both panes, restores scroll positions via `requestAnimationFrame`
6. Loading screen hidden; app is live
7. Service worker registered (if not localhost)

**No `navigateTo()` call in app.js.** Reader renders itself from localStorage state.

### Per-Pane State Persistence

- Saved to `localStorage` key `ember.pane.left.state` (pane A) and `ember.pane.right.state` (pane B)
- State shape: `{ translationId: integer, bookId: integer, chapter: integer, verse: integer, scrollPosition: integer }`
- Saved on: every `renderPane()` call (scroll reset to 0), every translation switch, every scroll event (throttled 200ms)
- Restored on: `initReader()` — captures saved scroll before `renderPane`, then restores via `requestAnimationFrame` after render

### Persistence on Write (User Data)

1. db.js write function (e.g. `saveNote()`, `createMarkup()`) executes SQL against in-memory sql.js DB
2. `saveToStorage()` called: `db.export()` (synchronous WASM serialize) → `postMessage` to storage worker (zero-copy ArrayBuffer transfer)
3. Worker writes to OPFS `core.db` or IndexedDB `ember-db` store
4. Main thread continues without waiting

---

## 6. CUSTOM EVENTS

| Event | Emitter | Detail | Listeners |
|-------|---------|--------|-----------|
| `selection-changed` | selection.js | `{ verseIds: [...], element: verseEl\|null }` | notes.js, reference.js, bookmarks.js, reference-settings.js |
| `study-changed` | panels.js | `{ studyId }` | notes.js |
| `pane-changed` | reader.js (`setActivePane`) | `{ paneId }` | selection.js |

---

## 7. WHAT'S WIRED vs. STUBBED

### Fully Functional

- Scripture rendering — 6 translations, all 66 books
- Per-pane independent translation, book/chapter navigation, scroll position
- Translation selection row in book picker overlay
- Translation label in pane nav updates dynamically
- Chapter navigation (prev/next, boundary clamping)
- Book/chapter selector overlay (books → chapters two-level)
- Verse selection — single (click) and range (shift-click)
- Note creation, editing (autosave 800ms), deletion
- Anchor coalescing on save
- Tag creation, autocomplete, removal
- Study creation and tab management
- All Studies view
- Text markups (highlight, underline, multiple colors, toggle/replace)
- Markup button with expandable tool strip; state persists in localStorage
- Full-text search — Scripture (active pane translation), notes, tags, bookmarks; all 5 prefixes
- Search results header shows translation abbreviation (`Scripture · KJV`)
- Bookmarks (add with optional label, remove, browse dropdown, navigate)
- Reference panel — Info tab, Tags tab (Nave's + user tags), Related tab (cross-references with vote filtering)
- Reference panel — Language tab placeholder only
- Reference panel settings (default tab, persists in app_state)
- Panel resize handles (notes↔reference, workspace horizontal)
- Layout toggle (stacked vs. side-by-side)
- Font size settings for scripture and notes (independent, persist in app_state)
- Help popovers for all three panels
- OPFS persistence with IndexedDB fallback
- Service worker offline caching
- Dark mode (localStorage preference)

### Partially Wired / Incomplete

- **Reference → Language tab**: static placeholder "Original language tools will be available in a future build."
- **`#template-bar`**: DOM element present (hidden); no logic
- **`deleteStudy()`**: implemented in db.js and wired in the All Studies view; renaming is also wired

### Schema Tables with No Runtime Code

`verse_mappings`, `original_words`, `lexicon`, `study_templates`, `template_steps`, `session_records`, `note_quotes`, `plans`, `plan_days`, `plan_progress`, `memory_verses`, `memory_reviews`

### Other

- **`js/state.js`**: fully implemented but effectively unused — state lives in db.js (`app_state`), localStorage (reader pane state), and module-level variables
- **`manifest.json`** references `icons/icon-192.png` and `icons/icon-512.png`; neither file exists on disk
- **PWA install prompt**: `#install-overlay` DOM + styles present; `beforeinstallprompt` handler not implemented

---

## 8. VERSE ID CONVENTION

`BBCCCVVV` integer: `book * 1_000_000 + chapter * 1_000 + verse`

- Genesis 1:1 = `1001001`
- Revelation 22:21 = `66022021`
- Encoded/decoded by `makeVerseId()` / `parseVerseId()` in db.js
- Translation dbs store `book`, `chapter`, `verse` columns separately; ID computed inline as `book * 1000000 + chapter * 1000 + verse AS id` in queries
- `cross_references` stores `from_verse`, `to_verse_start`, `to_verse_end` as BBCCCVVV integers
