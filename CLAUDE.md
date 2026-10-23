# Scripture Study — Bible Study PWA

## What This Is
A desktop-first Progressive Web App for serious Bible study. Offline-first, zero-dependency, vanilla JavaScript. SQLite via sql.js (WebAssembly). No framework, no build step, no bundler.

## Architecture
- Single HTML page (index.html) with ES modules
- SQLite databases accessed via sql.js:
  - data/core.db — books, cross-references, Nave's topics; on first run it's copied to OPFS and the user-data tables (notes, tags, bookmarks, markups, plans) are added there
  - data/translations/*.db — one per translation (KJV, ASV, Darby, WEB, YLT, BSB)
  - data/language.db — original-language words, Greek lexicon (TBESG), Greek morphology (TEGMC); read-only, lazy-loaded
- OPFS for persistent storage, IndexedDB as fallback; writes go through a storage worker
- Service worker for offline caching
- CSS custom properties for theming (light + dark)

## Project Structure
- index.html — App shell
- manifest.json — PWA manifest
- sw.js — Service worker (PRECACHE must list every js/ module; bump CACHE_NAME when it changes)
- css/style.css — All styles
- js/app.js — Entry point, initializes everything
- js/db.js — Database init, queries, persistence
- js/storage-worker.js — Off-thread OPFS / IndexedDB writes
- js/reader.js — Scripture rendering, chapter navigation
- js/selection.js — Verse selection
- js/notes.js — Study documents with inline note editing
- js/tags.js — Tag autocomplete for note blocks
- js/bookmarks.js — Bookmarks
- js/markups.js — Verse markup tools
- js/panels.js — Study panel tabs, views, resize handles
- js/reference.js — Reference panel: Info, Tags, Related, Language tabs
- js/language.js — Language tab: interlinear view + inline word card
- js/grammar-decode.js — Greek morphology-code decode
- js/search.js — Full-text search UI
- js/plans.js — Reading plan import and Plans tab
- js/template-bar.js — Reading plan template bar
- js/study-templates.js — Built-in study templates
- js/backup.js — Restore-from-backup flow
- js/usfm.js — USFM book codes and reference resolution
- js/help.js — Contextual help popovers
- js/global-settings.js, reader-settings.js, notes-settings.js, reference-settings.js — Settings popovers
- js/popover-registry.js — Shared popover open/close behavior
- js/dialogs.js — Shared confirm / prompt modal dialogs
- js/vendor/ — sql-wasm.js and sql-wasm.wasm (local, no CDN)
- data/plans/, data/templates/ — Bundled reading plans and study templates (JSON)
- build/ — core.db build script and its source data
- scripts/ — Translation, language.db, cross-reference, and plan conversion scripts
- tests/verify.py — Playwright browser verification (`python3 tests/verify.py smoke`, etc.)
- docs/ — Build specs, standalone feature specs, BUILD_N_ACTUAL_STATE records

## Code Style
- Vanilla JavaScript, ES modules (import/export)
- No frameworks, no build tools, no bundlers
- Functions over classes where practical
- Descriptive variable names, no abbreviations
- CSS custom properties for all colors and key dimensions

## Key Technical Details
- Verse IDs use BBCCCVVV format, stored as integers (e.g., 1001001 = Genesis 1:1; 43001001 = John 1:1). Psalm titles are verse 0.
- db.export() + saveToStorage() after every write operation to core.db
- sql.js does not enforce ON DELETE CASCADE — delete child rows explicitly
- sql.js has no FTS5 module: Scripture search falls back to LIKE; notes_fts is FTS4
- Note anchors use range-aware queries — see docs/ANCHOR_QUERIES.md

## Reference Documents
- README.md — overview, data sources and attribution, documentation index
- FEATURE_INVENTORY.md — every working feature, traced to live code
- USER_MANUAL.md — end-user documentation
- docs/ — specs per build and per feature; the latest BUILD_N_ACTUAL_STATE.md is the ground-truth audit of shipped code
