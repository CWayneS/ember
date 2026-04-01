# BUILD_1_ACTUAL_STATE.md — Ground-Truth Audit

> **⚠️ SNAPSHOT:** This document reflects the codebase as of 2026-04-01, immediately before
> the polish phase. It may not reflect subsequent changes. When this document and the actual
> source files disagree, **the source files are correct.**

_Read from source files on 2026-04-01. No spec, proposal, or guide documents consulted._

---

## 1. FILE STRUCTURE

```
ember/
├── index.html                        # App shell (single HTML page)
├── manifest.json                     # PWA manifest
├── sw.js                             # Service worker
├── CLAUDE.md                         # Claude Code project instructions
├── README.md                         # Project documentation
├── Technical_Spec_Build_1.md         # Technical spec (not audited)
├── .gitignore                        # Ignores: node_modules/, js/vendor/sql-wasm.wasm, .DS_Store, *.swp/swo
│
├── css/
│   └── style.css                     # All styles (~1322 lines)
│
├── js/
│   ├── app.js                        # Entry point
│   ├── db.js                         # Database layer (sql.js wrapper)
│   ├── reader.js                     # Scripture rendering & navigation
│   ├── selection.js                  # Verse selection & context toolbar
│   ├── notes.js                      # Note CRUD & study document UI
│   ├── tags.js                       # Tag autocomplete
│   ├── search.js                     # Full-text search UI
│   ├── panels.js                     # Panel tabs, resize handles, layout
│   ├── reference.js                  # Reference panel tabs
│   ├── state.js                      # Reactive state (imported but unused)
│   ├── storage-worker.js             # Web Worker: OPFS/IndexedDB persistence
│   └── vendor/
│       ├── sql-wasm.js               # sql.js runtime (plain <script>, tracked in git)
│       └── sql-wasm.wasm             # SQLite WASM binary (gitignored, ~1.5 MB)
│
├── data/
│   └── core.db                       # SQLite database (20 MB, tracked in git)
│
├── icons/
│   └── .gitkeep                      # EMPTY — no icon files exist
│
├── fonts/
│   └── .gitkeep                      # EMPTY — no custom fonts
│
└── build/
    ├── build_db.py                   # Main DB build script (Python 3)
    ├── classify_naves.py             # Nave topic classification utility
    ├── CROSSREF_RECON.md             # Cross-reference data notes
    ├── NAVES_CURATION.md             # Nave curation notes
    ├── sources/
    │   ├── NavesTopicalDictionary.csv
    │   ├── HitchcocksBibleNamesDictionary.csv
    │   ├── theological_keywords.txt
    │   └── cross_references.txt
    └── output/
        ├── naves_classification.csv
        └── naves_needs_review.csv
```

**Notable absences:**
- No PWA icon files (icons/ is empty; manifest.json references icons that don't exist on disk)
- No custom fonts (fonts/ is empty; stylesheet uses system fonts only)
- No test files
- No node_modules (no package.json; no build tooling)

---

## 2. DATABASE SCHEMA

All tables in `data/core.db`. Build script: `build/build_db.py`.

### Scripture Tables — Populated, Read-Only

**`books`** — 66 rows
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | 1–66 |
| name | TEXT | "Genesis", "Matthew", etc. |
| abbrev | TEXT | "Gen", "Mat", etc. |
| testament | TEXT | 'OT' or 'NT' |
| genre | TEXT | 'law', 'history', 'poetry', 'prophecy', 'gospel', 'epistle', 'apocalyptic' |
| chapters | INTEGER | Chapter count per book |

**`translations`** — 1 row (KJV)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | 'KJV' |
| name | TEXT | 'King James Version' |
| abbrev | TEXT | 'KJV' |
| language | TEXT | 'en' |
| license | TEXT | 'Public domain' |

**`verses`** — 31,102 rows
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | BBCCCVVV encoding (book×1000000 + chapter×1000 + verse) |
| book_id | INTEGER | FK → books.id |
| chapter | INTEGER | |
| verse | INTEGER | |
| translation_id | TEXT | FK → translations.id |
| text | TEXT | Verse text |

Indexes: `idx_verses_location(book_id, chapter, verse, translation_id)`, `idx_verses_translation(translation_id, book_id, chapter)`

**`verses_fts`** — FTS4 virtual table, content="verses", column: text

**`topics`** — Populated (Nave's Topical Bible)
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT | Topic name |
| entry | TEXT | Full entry text with verse references |
| section | TEXT | |
| display | INTEGER DEFAULT 0 | 1 = shown as chip, 0 = searchable-only |

**`topic_verses`** — Populated (Nave's verse mappings)
| Column | Type |
|--------|------|
| topic_id | INTEGER PK, FK → topics.id |
| verse_id | INTEGER PK, FK → verses.id |

Indexes: `idx_topic_verses_topic`, `idx_topic_verses_verse`

### User Data Tables — Empty Until User Creates Data

**`studies`**
| Column | Type | Default |
|--------|------|---------|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT | 'Untitled Study' |
| created_at | TEXT | datetime('now') |
| modified_at | TEXT | datetime('now') |
| status | TEXT | 'active' |

Indexes: `idx_studies_status`, `idx_studies_modified`

**`notes`**
| Column | Type | Default |
|--------|------|---------|
| id | INTEGER PK AUTOINCREMENT | |
| body | TEXT | '' |
| created_at | TEXT | datetime('now') |
| modified_at | TEXT | datetime('now') |
| visibility | TEXT | 'private' |
| parent_note_id | INTEGER | FK → notes.id ON DELETE CASCADE |
| template_session_id | INTEGER | FK → session_records.id |
| study_id | INTEGER | FK → studies.id |

Indexes: `idx_notes_parent`, `idx_notes_study`

**`notes_fts`** — FTS4 virtual table, content="notes", column: body

**`note_anchors`**
| Column | Type |
|--------|------|
| id | INTEGER PK AUTOINCREMENT |
| note_id | INTEGER FK → notes.id ON DELETE CASCADE |
| verse_start | INTEGER |
| verse_end | INTEGER |
| word_position | INTEGER |
| strongs_number | TEXT |

Indexes: `idx_anchors_note`, `idx_anchors_verse`

**`tags`**
| Column | Type |
|--------|------|
| id | INTEGER PK AUTOINCREMENT |
| name | TEXT UNIQUE |
| type | TEXT DEFAULT 'tag' |

**`tag_assignments`**
| Column | Type |
|--------|------|
| tag_id | INTEGER PK, FK → tags.id ON DELETE CASCADE |
| note_id | INTEGER PK, FK → notes.id ON DELETE CASCADE |

Index: `idx_tagassign_note`

**`app_state`**
| Column | Type |
|--------|------|
| key | TEXT PK |
| value | TEXT |

### Empty Future-Use Tables

| Table | Purpose |
|-------|---------|
| `verse_mappings` | Cross-translation verse mapping |
| `cross_references` | Scripture cross-references |
| `original_words` | Greek/Hebrew word data per verse |
| `lexicon` | Strong's lexicon definitions |
| `study_templates` | Guided study template definitions |
| `template_steps` | Steps within a template |
| `session_records` | Template session tracking |
| `note_quotes` | Quoted verses within notes |
| `text_markups` | Verse highlighting/underlining |
| `bookmarks` | User bookmarks |
| `plans` | Reading plans |
| `plan_days` | Days within a reading plan |
| `plan_progress` | Progress tracking for plans |
| `memory_verses` | Spaced-repetition verse memorization |
| `memory_reviews` | Memorization review history |

---

## 3. MODULE MAP

### `js/app.js` — Entry Point

**Imports:** `initDatabase`, `getState` from db.js; `initReader`, `navigateTo` from reader.js; `initSelection` from selection.js; `initNotes` from notes.js; `initTags` from tags.js; `initPanels`, `togglePanelLayout` from panels.js; `initSearch` from search.js; `initReference` from reference.js

**Exports:** None

**Events emitted:** None

**Events listened:** `#layout-toggle-btn` click → `togglePanelLayout()`

**Summary:** Bootstraps the app — runs `initDatabase()`, then initializes all modules in sequence, restores last reading position (or defaults to Genesis 1), hides loading screen, and registers the service worker (skipped on localhost).

---

### `js/db.js` — Database Layer

**Imports:** None

**Exports:**
- Init: `initDatabase()`
- App state: `getState(key)`, `setState(key, value)`
- Translation: `getCurrentTranslation()`
- Verse IDs: `makeVerseId(book, chapter, verse)`, `parseVerseId(id)`
- Scripture reads: `getChapter(bookId, chapter, translationId)`, `getBooks()`, `getBook(bookId)`, `getChapterVerseCount(bookId, chapter)`, `getTopicsForVerse(verseId)`, `getUserTagsForVerse(verseId)`
- Note writes: `saveNote(body, anchors, tagNames, studyId)`, `updateNote(noteId, body)`, `deleteNote(noteId)`
- Note reads: `getNotesForVerse(verseId)`, `getNotesForStudy(studyId)`, `getTagsForNote(noteId)`, `getAnchorsForNote(noteId)`
- Tags: `getAllTags()`, `addNoteTag(noteId, tagName)`, `removeNoteTag(noteId, tagName)`
- Search: `search(query)`
- Studies: `createStudy(name)`, `getStudies()`, `deleteStudy(studyId)`

**Events emitted:** None

**Events listened:** None

**Summary:** Singleton wrapping sql.js WASM. Handles DB init (load from OPFS → IndexedDB → network fetch fallback), all read queries, all write operations, FTS search, app state persistence. Offloads storage I/O to `storage-worker.js` after every write.

---

### `js/reader.js` — Scripture Rendering

**Imports:** `getChapter`, `getBooks`, `getBook`, `setState`, `getNotesForVerse` from db.js

**Exports:** `initReader()`, `navigateTo(bookId, chapter)`, `getCurrentLocation()`, `refreshNoteDots()`

**Events emitted:** None

**Events listened:**
- `#prev-chapter` click → previous chapter
- `#next-chapter` click → next chapter
- `#book-selector-btn` click → toggle book overlay
- `document` click → close overlay if click is outside

**Summary:** Renders KJV chapter text as `.verse` elements with `.verse-number`, `.verse-text`, and optional `.note-indicator` children. Handles book/chapter navigation with boundary clamping (Genesis 1 minimum, Revelation 22 maximum). Provides `refreshNoteDots()` to update indicators without full re-render.

---

### `js/selection.js` — Verse Selection

**Imports:** None

**Exports:** `initSelection()`, `getSelectedVerses()`

**Events emitted:**
- `selection-changed` (CustomEvent on `document`) — detail: `{ verseIds: [...], element: verseEl|null }`

**Events listened:**
- `#scripture-text` click → `handleVerseClick()`
- `document` click → clear selection if outside scripture-text, notes-panel, reference-panel

**Summary:** Single-verse selection. Clicking a verse adds `.selected` class and plays a CSS glow animation; clicking elsewhere clears selection. Dispatches `selection-changed` to notify notes.js and reference.js. Only one verse can be selected at a time.

---

### `js/notes.js` — Study Document

**Imports:** `saveNote`, `updateNote`, `deleteNote`, `getNotesForStudy`, `getStudies`, `parseVerseId`, `getBooks`, `createStudy`, `deleteStudy`, `addNoteTag`, `removeNoteTag` from db.js; `refreshNoteDots` from reader.js; `openStudy`, `closeStudy`, `getActiveStudyId` from panels.js; `refreshReference` from reference.js

**Exports:** `initNotes()`, `showNoteEditor(verseIds, options)`

**Events emitted:** None

**Events listened:**
- `document` `selection-changed` → update `currentVerseIds`
- `document` `study-changed` → render active study view or all-studies view

**Summary:** Renders the notes panel as a study document. Each note is a block with a verse anchor label, contenteditable body, tag chips, and a delete button. Autosaves on 800ms debounce. Provides `showNoteEditor()` as the entry point for search results navigating to notes.

---

### `js/tags.js` — Tag Autocomplete

**Imports:** `getAllTags` from db.js

**Exports:** `initTags()` (no-op), `setupTagInput(inputEl, noteId, chipsEl, suggestionsEl)`

**Events emitted:** None

**Events listened:** (set up per note block by `setupTagInput`)
- tag input `input` → filter and show suggestions
- tag input `keydown` → arrow keys, Enter, Escape navigation
- tag input `blur` → hide suggestions
- suggestion item `mousedown` → prevent blur, select tag

**Summary:** Wires tag autocomplete to a specific note's input element. Lazy-loads all existing tags on first keystroke. Filters by partial match, excludes tags already on the note, shows max 8 suggestions with keyboard navigation.

---

### `js/search.js` — Full-Text Search

**Imports:** `search`, `parseVerseId`, `getBooks` from db.js; `navigateTo` from reader.js; `showNoteEditor` from notes.js

**Exports:** `initSearch()`

**Events emitted:** None

**Events listened:**
- `#search-input` input → 200ms debounce → `search()` if query ≥ 2 chars
- `#search-input` keydown Escape → hide overlay, blur input
- `document` click → hide overlay if outside search bar and results

**Summary:** Runs FTS query and renders results in a floating dropdown with three sections: Verses (≤50), Notes (≤50), Tags (≤20). Clicking a verse navigates there; clicking a note navigates and opens the note editor; clicking a tag opens the note editor with tag focus.

---

### `js/panels.js` — Panel Management

**Imports:** `createStudy` from db.js

**Exports:** `initPanels()`, `openStudy(studyId, studyName)`, `closeStudy(studyId)`, `switchToStudy(studyId)`, `getActiveStudyId()`, `togglePanelLayout()`, `switchReferenceTab(tabName)`

**Events emitted:**
- `study-changed` (CustomEvent on `document`) — detail: `{ studyId }`

**Events listened:**
- `#notes-tab[data-study-id="all"]` click → switch to all-studies view
- `#notes-tab-add` click → create new study and open it
- `.notes-tab` click (dynamic) → switch to that study
- `.notes-tab-close` click (dynamic) → close that study tab
- `#reference-tabs .tab-btn` click → switch reference tab
- `#panel-resize-handle` mousedown/mousemove/mouseup → resize notes vs. reference
- `#workspace-resize-handle` mousedown/mousemove/mouseup → resize study-panels vs. reader

**Summary:** Manages the browser-tab model for studies ("All Studies" is permanent, others are dynamic). Dispatches `study-changed` on tab switches. Handles two independent draggable resize handles (vertical within study-panels, horizontal workspace split). Provides `togglePanelLayout()` to switch notes/reference from stacked (column) to side-by-side (row).

---

### `js/reference.js` — Reference Panel

**Imports:** `getBook`, `parseVerseId`, `getChapterVerseCount`, `getTopicsForVerse`, `getUserTagsForVerse`, `getNotesForVerse` from db.js; `openStudy` from panels.js

**Exports:** `initReference()`, `refreshReference(verseId)`

**Events emitted:** None

**Events listened:**
- `document` `selection-changed` → render all tabs for selected verse, or clear all

**Summary:** Populates four tabs in the reference panel when a verse is selected. Info tab shows book/chapter metadata and linked notes. Tags tab shows Nave's topics and user tags as read-only chips. Related and Language tabs are stubs.

---

### `js/state.js` — Reactive State (Unused)

**Imports:** None

**Exports:** `getAppState(key)`, `setAppState(key, value)`, `onStateChange(key, callback)`

**Events emitted:** None

**Events listened:** None

**Summary:** In-memory reactive state with callback listeners. Imported by app.js but no module reads from or writes to it during normal operation. App state is stored in `app_state` DB table (via db.js) and module-level variables (in panels.js) instead.

---

### `js/storage-worker.js` — Storage Worker

**Imports:** None (Web Worker — not an ES module)

**Exports:** None

**Events emitted:** None

**Events listened:**
- `message` → receive `{ buffer: ArrayBuffer }`, write to OPFS `core.db`, fall back to IndexedDB on error

**Summary:** Off-main-thread persistence. Receives a transferred ArrayBuffer of the serialized SQLite DB, writes it to OPFS (or IndexedDB as fallback). Zero-copy transfer via `postMessage` with transferable. Main thread does not wait for response.

---

## 4. UI LAYOUT

From `index.html`:

```
<body>
  #global-header (44px, full width, sticky)
    #search-bar
      #search-input (type="text", placeholder="Search Scripture and notes…")

  #template-bar (40px — hidden by default via .hidden)

  #workspace (calc(100vh - 44px), flex row)
    #study-panels (flex column, default ~50% width, resizable)
      #notes-panel (flex 1)
        .panel-header
          #notes-tabs
            .notes-tab[data-study-id="all"] "All Studies"
            [dynamic study tabs inserted here]
            #notes-tab-add "+"
          .panel-header-actions
            #layout-toggle-btn "⇅"
            .panel-help-btn "?"
            .panel-settings-btn "⚙"
        #notes-active-view
        #notes-all-studies-view.hidden

      #panel-resize-handle (4px drag separator)

      #reference-panel (flex 1)
        .panel-header
          #reference-tabs
            .tab-btn[data-tab="info"] "Info"  ← active by default
            .tab-btn[data-tab="tags"] "Tags"
            .tab-btn[data-tab="related"] "Related"
            .tab-btn[data-tab="language"] "Language"
          .panel-header-actions
            .panel-help-btn "?"
            .panel-settings-btn "⚙"
        #info-tab.tab-content (active)
        #tags-tab.tab-content.hidden
        #related-tab.tab-content.hidden
        #language-tab.tab-content.hidden

    #workspace-resize-handle (4px drag separator)

    #reader (flex 1)
      #reader-header (44px)
        #book-selector-btn
        #current-location
        #prev-chapter "‹"
        #next-chapter "›"
        .reader-header-spacer
        #translation-label "KJV"
        #bookmark-btn "◯"
        #reader-help-btn "?"
        #reader-settings-btn "⚙"
      #reader-content
        #scripture-text
          [.verse elements rendered here]

  #book-overlay.hidden (full-screen, z-index 200)
    #book-list (grid of book abbreviation buttons)
    #chapter-grid.hidden (grid of chapter number buttons)

  #search-results.hidden (floating dropdown, z-index 150)

  #context-toolbar (fixed, z-index 100, dark bg — injected by selection.js)

  #install-overlay.hidden (bottom-right PWA prompt, z-index 300)
    #install-prompt
      <p> install message
      #install-accept-btn
      #install-dismiss-btn

  #loading (fixed fullscreen, z-index 999 — hidden after DB init)
```

**Default visibility on load:**
- Visible: global header, workspace (all panels), reader
- Hidden: template-bar, book overlay, chapter grid, search results, install overlay
- Removed after init: loading overlay

---

## 5. DATA FLOW

### Boot Sequence (`app.js`)

1. Page loads, `sql-wasm.js` sets `window.initSqlJs`
2. `app.js` module executes; calls `await initDatabase()`
3. `initDatabase()` in db.js:
   a. Calls `window.initSqlJs({ locateFile: () => 'js/vendor/sql-wasm.wasm' })`
   b. Attempts OPFS read of `core.db`
   c. Falls back to IndexedDB if OPFS fails
   d. Falls back to network fetch of `data/core.db` if both fail
   e. Initializes sql.js `Database` object from the loaded bytes
   f. Instantiates `storage-worker.js` Web Worker
4. `initReader()`, `initSelection()`, `initNotes()`, `initTags()`, `initPanels()`, `initSearch()`, `initReference()` — all synchronous, attach event listeners
5. Restore location: `getState('currentBook')` + `getState('currentChapter')` from `app_state` table; default to book 1, chapter 1
6. `navigateTo(book, chapter)` — renders first chapter
7. `#loading` hidden; app is live
8. Service worker registered (if not localhost)

### Persistence on Write

1. Any note/tag/study write calls a db.js function (e.g., `saveNote()`)
2. db.js executes SQL against the in-memory sql.js DB
3. db.js calls `saveToStorage()` which:
   a. Calls `db.export()` — synchronous WASM serialization to Uint8Array
   b. Posts `{ buffer }` to storage worker with `transfer: [buffer.buffer]` (zero-copy)
4. Worker writes buffer to OPFS `core.db` or IndexedDB `ember-db` store
5. Main thread continues without waiting for I/O completion

### Navigation State Persistence

- `navigateTo(book, chapter)` calls `setState('currentBook', book)` and `setState('currentChapter', chapter)`
- These write to `app_state` table and trigger `saveToStorage()`
- On next boot, `getState()` restores these values

---

## 6. INTERACTION MODEL

### Verse Selection

1. User clicks a `.verse` element in `#scripture-text`
2. `selection.js` removes previous `.selected` class, adds `.selected` + `.glow` to clicked verse
3. `.glow` class removed on `animationend` (allows re-trigger)
4. `selection-changed` CustomEvent dispatched on `document` with `{ verseIds: [id], element: verseEl }`
5. `notes.js` stores `currentVerseIds`
6. `reference.js` populates Info, Tags tabs for the verse
7. Clicking outside clears selection; `selection-changed` dispatched with empty `verseIds`

### Creating a Note

1. User selects a verse (step above)
2. User clicks "Add Note" in context toolbar (rendered by `selection.js`)
   — or search result click calls `showNoteEditor(verseIds)`
3. If no active study: `notes.js` calls `createStudy(name)`, then `openStudy(studyId, name)` (panels.js), which emits `study-changed`
4. `notes.js` receives `study-changed`, calls `getNotesForStudy(studyId)`, renders note blocks
5. `saveNote(body, anchors, tagNames, studyId)` is called on first input (after 800ms debounce)
6. `refreshNoteDots()` called after save to update indicator dots in reader
7. `refreshReference(verseId)` called after save to update the Info tab note list

### Note Editing

- Note body: contenteditable `div` inside `.note-block`
- Autosave fires 800ms after last `input` event
- `updateNote(noteId, body)` saves the body text
- On save: `refreshNoteDots()` and `refreshReference()` called

### Deleting a Note

1. User clicks delete button on a note block
2. `deleteNote(noteId)` called immediately (no confirmation)
3. Note block removed from DOM
4. `refreshNoteDots()` and `refreshReference()` called

### Tags

1. User types in the tag input field on a note block
2. `setupTagInput()` (tags.js) shows filtered suggestions from existing tags
3. Selecting a suggestion or pressing Enter calls `addNoteTag(noteId, tagName)`
4. Tag rendered as a chip; clicking chip's "×" calls `removeNoteTag(noteId, tagName)`
5. Tags are normalized lowercase; stored in `tags` table; linked via `tag_assignments`

### Studies

- "All Studies" tab is always present; shows list of all studies with note counts
- "+" tab creates a new study via `createStudy()` and opens it
- Study tabs can be closed (X button); closing the active tab switches to nearest tab or "All Studies"
- Studies cannot be renamed from the UI currently (name set at creation time)
- `deleteStudy()` exists in db.js but is not exposed in the UI

### Search

1. User types ≥2 chars in `#search-input`
2. After 200ms debounce, `search(query)` runs FTS across verses, notes, tags
3. Results displayed in floating `#search-results` dropdown
4. Clicking a verse: `navigateTo()`, close overlay
5. Clicking a note: `navigateTo()` then `showNoteEditor(verseIds)`, close overlay
6. Clicking a tag: `showNoteEditor(verseIds)` with focus on tag input, close overlay
7. Pressing Escape or clicking outside closes overlay

---

## 7. KNOWN CONVENTIONS

### Naming

- **Element IDs**: kebab-case (`#scripture-text`, `#notes-tab-add`, `#workspace-resize-handle`)
- **CSS classes**: kebab-case (`.verse-number`, `.note-block`, `.tab-content`)
- **JS functions**: camelCase (`navigateTo`, `initNotes`, `showNoteEditor`)
- **Custom events**: kebab-case strings (`'selection-changed'`, `'study-changed'`)
- **DB keys in app_state**: camelCase strings (`'currentBook'`, `'currentChapter'`)

### Event Pattern

All cross-module communication uses CustomEvents dispatched on `document`:
- Emitter dispatches; listeners register via `document.addEventListener()`
- Event details are plain objects: `{ verseIds: [...] }`, `{ studyId }`
- No event bus or pub/sub library

### Verse ID Convention

`BBCCCVVV` integer: `book * 1_000_000 + chapter * 1_000 + verse`
- Genesis 1:1 = `1001001`
- Revelation 22:21 = `66022021`
- Encoded/decoded by `makeVerseId()` / `parseVerseId()` in db.js

### CSS Variables

All colors and key dimensions defined as CSS custom properties on `:root`. Dark theme overrides under `.theme-dark`. No hardcoded color values in component rules — always `var(--name)`.

Key variable groups: `--bg-*`, `--text-*`, `--border-*`, `--accent*`, `--tag-*`, `--font-*`, `--size-*`, `--line-height`, layout dimensions.

### Module Dependencies (Direction)

```
app.js
  → db.js (no imports)
  → reader.js → db.js
  → selection.js (no imports)
  → notes.js → db.js, reader.js, panels.js, reference.js
  → tags.js → db.js
  → panels.js → db.js
  → search.js → db.js, reader.js, notes.js
  → reference.js → db.js, panels.js
  → state.js (no imports — unused)
```

No circular dependencies.

### Persistence Pattern

After every write operation: `db.export()` → transfer buffer → `storage-worker.js` → OPFS or IndexedDB. This pattern is applied consistently in db.js; callers do not handle persistence directly.

---

## 8. WHAT'S WIRED vs. STUBBED

### Fully Functional

- KJV scripture rendering (all 31,102 verses, all 66 books)
- Chapter navigation (prev/next buttons, boundary clamping)
- Book/chapter selector overlay (two-level: books → chapters)
- Verse selection with glow animation
- Note creation anchored to verse
- Note body editing with autosave (800ms debounce)
- Note deletion
- Tag creation, autocomplete, removal
- Study creation and tab management
- All Studies view (note counts, last-modified date)
- Full-text search (verses + notes + tags)
- Reference panel Info tab (book metadata, chapter info, notes list)
- Reference panel Tags tab (Nave's topics + user tags)
- Panel resize handles (notes↔reference vertical, workspace horizontal)
- Layout toggle (notes/reference stacked vs. side-by-side)
- OPFS persistence with IndexedDB fallback
- Service worker offline caching (cache-first for all assets)
- PWA install prompt (shown on `beforeinstallprompt` event)
- Dark mode CSS (`.theme-dark` class — styles complete; UI toggle not wired)

### Partially Wired / Incomplete

- **`#bookmark-btn`**: Rendered in reader header; click handler not wired; `bookmarks` table is empty
- **`.panel-help-btn` / `.panel-settings-btn`**: Rendered in both panel headers; no handlers
- **`#reader-help-btn` / `#reader-settings-btn`**: Rendered in reader header; no handlers
- **`#translation-label`**: Shows "KJV"; no translation switching UI
- **`#template-bar`**: Exists in DOM as hidden; no logic connected
- **Dark mode toggle**: CSS is complete; no button or toggle in UI to activate it
- **`deleteStudy()`**: Implemented in db.js; not exposed in UI
- **Study renaming**: Not implemented in UI

### Explicitly Stubbed (Placeholder Content)

- **Reference → Related tab**: Static text "Cross-references — coming in Build 2"
- **Reference → Language tab**: Static text "Original language tools — planned for a future build"

### Schema Tables with No Runtime Code

The following tables exist in the schema and are unpopulated; no JS code reads or writes to them:
`verse_mappings`, `cross_references`, `original_words`, `lexicon`, `study_templates`, `template_steps`, `session_records`, `note_quotes`, `text_markups`, `bookmarks`, `plans`, `plan_days`, `plan_progress`, `memory_verses`, `memory_reviews`

### Other

- **`js/state.js`**: Fully implemented but effectively unused — all state lives in db.js (`app_state` table) and module-level variables
- **`manifest.json`** references `icons/icon-192.png` and `icons/icon-512.png`; neither file exists on disk
- **Service worker precache list** includes `./js/panels.js` and `./js/storage-worker.js` but is missing `./js/reference.js`
