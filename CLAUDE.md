# Scripture Study — Bible Study PWA

## What This Is
A desktop-first Progressive Web App for serious Bible study. Offline-first, zero-dependency, vanilla JavaScript. SQLite via sql.js (WebAssembly). No framework, no build step, no bundler.

## Architecture
- Single HTML page (index.html) with ES modules
- SQLite database (data/core.db) accessed via sql.js
- OPFS for persistent storage, IndexedDB as fallback
- Service worker for offline caching
- CSS custom properties for theming (light + dark)

## Project Structure
- index.html — App shell
- manifest.json — PWA manifest
- sw.js — Service worker
- css/style.css — All styles
- js/app.js — Entry point, initializes everything
- js/db.js — Database init, queries, helpers
- js/reader.js — Scripture rendering, chapter navigation
- js/selection.js — Verse selection, contextual toolbar
- js/notes.js — Note CRUD, side panel display
- js/tags.js — Tag autocomplete
- js/sidepanel.js — Side panel tabs and management
- js/search.js — Full-text search UI and queries
- js/state.js — Simple reactive state
- js/vendor/ — sql-wasm.js and sql-wasm.wasm (local, no CDN)
- data/core.db — KJV Bible text + empty future tables
- build/ — Database build script

## Code Style
- Vanilla JavaScript, ES modules (import/export)
- No frameworks, no build tools, no bundlers
- Functions over classes where practical
- Descriptive variable names, no abbreviations
- CSS custom properties for all colors and key dimensions

## Key Technical Details
- Verse IDs use BBCCCVVV format (e.g., 01001001 = Genesis 1:1)
- Database persisted via OPFS with IndexedDB fallback
- FTS5 virtual tables for full-text search
- db.export() + saveToStorage() after every write operation

## Build 1 Scope
Scripture rendering (KJV only), book/chapter navigation, verse selection + contextual toolbar, basic notes, basic tags, side panel, full-text search, PWA with offline support.

## Reference Documents
See the project knowledge files for the full design proposal and technical specification.
