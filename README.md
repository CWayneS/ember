# Ember Bible Study

A focused, offline-first Bible study application built for serious, long-term Scripture study.

---

## What It Is

Ember is a study environment built around the reading experience. The biblical text is always the center — every tool radiates outward from it. Select a verse, and study tools appear contextually. Write a note, tag it, and it's anchored to that passage forever. Over time, your notes, tags, and connections form a searchable personal knowledge base tied directly to Scripture.

No account required. No server. No internet connection after the first load. Your data stays on your device.

## Design Philosophy

- **Text-centered.** You never navigate "to a feature." You select text, and tools appear.
- **Accumulative.** Everything you create is timestamped and anchored to Scripture. The app gets more valuable the longer you use it.
- **Progressive disclosure.** Day one, it's a clean reading surface. Depth reveals itself through interaction.
- **Offline-first.** All data lives locally. The app works fully without a network connection.
- **Zero dependency.** Vanilla JavaScript, no frameworks, no build step, no bundler.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES modules), HTML, CSS |
| Database | SQLite via [sql.js](https://github.com/sql-js/sql.js/) (WebAssembly) |
| Storage | OPFS with IndexedDB fallback |
| Platform | Progressive Web App (installable, offline-capable) |
| Bible Text | KJV from [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) |

No React. No Vue. No webpack. No npm dependencies at runtime. One HTML file, one CSS file, a handful of JS modules, and a SQLite database.

## Project Structure

```
scripture-study/
├── index.html              # Single-page app shell
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline support)
├── css/
│   └── style.css           # All styles, CSS custom properties for theming
├── js/
│   ├── app.js              # Entry point
│   ├── db.js               # Database init, queries, persistence
│   ├── reader.js           # Scripture rendering, chapter navigation
│   ├── selection.js        # Verse selection, contextual toolbar
│   ├── notes.js            # Note creation, editing, display
│   ├── tags.js             # Tag autocomplete
│   ├── sidepanel.js        # Side panel management
│   ├── search.js           # Full-text search
│   ├── state.js            # Simple reactive state
│   └── vendor/
│       ├── sql-wasm.js     # sql.js library
│       └── sql-wasm.wasm   # SQLite WebAssembly binary
├── data/
│   └── core.db             # KJV text + full schema
├── build/
│   └── build_db.py         # Script to generate core.db
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Build 1 — Features

Build 1 is the minimum functional version that proves the core architecture:

- **Scripture reading** — Full KJV text, rendered in a clean single-column layout
- **Navigation** — Book/chapter selector overlay, previous/next chapter arrows, wrapping across book boundaries
- **Verse selection** — Click a verse to highlight it and open a contextual toolbar
- **Notes** — Create, edit, and delete notes anchored to specific verses
- **Tags** — Tag notes with user-defined labels, with autocomplete from existing tags
- **Note indicators** — Gold dots on verses that have notes attached
- **Full-text search** — Search across Scripture text, notes, and tags in one unified interface
- **Side panel** — Contextual panel for notes and future tools
- **Persistence** — All data survives browser restarts via OPFS/IndexedDB
- **PWA** — Installable as a standalone app, fully functional offline
- **Theming** — Light and dark themes via CSS custom properties

## Building the Database

The KJV text database is built from the [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) project:

```bash
cd build
python build_db.py
```

This produces `data/core.db` containing all 31,102 KJV verses, 66 books with metadata, full-text search indexes, and empty tables for future features.

Verse IDs use the `BBCCCVVV` format: two-digit book + three-digit chapter + three-digit verse. Genesis 1:1 = `01001001`. Revelation 22:21 = `66022021`.

## Running Locally

Serve the project root with any static file server:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a Chromium-based browser. The database loads on first visit and is cached locally for all subsequent launches.

To install as a PWA, use your browser's install option (usually in the address bar or menu). The app will open in its own window without browser chrome.

## Roadmap

### Build 2
- BSB and WEB translations with parallel view
- Cross-references (merged TSK + OpenBible dataset)
- Text markups (highlight, underline, circle)
- Reading plans with progress tracking
- Bookmarks

### Build 3
- Study templates (built-in + custom template creator)
- Nested notes
- Tag palette with drag-and-drop
- Session summaries and continuity
- Data export (JSON, Markdown, SQL)

### Future
- Original language tools (Strong's, morphology, interlinear)
- Commentary integration
- Theological concept mapping
- Spaced repetition memorization
- Multi-device sync

All builds are additive. Nothing in later builds requires reworking earlier code.

## Documentation

| Document | Description |
|---|---|
| `Bible_Study_Software_Proposal_v4-1.md` | Full design proposal — philosophy, features, data architecture |
| `Technical_Spec_Build_1.md` | Build 1 technical specification — schema, module specs, code |
| `Build_1_Prompt_Walkthrough.md` | Step-by-step build guide using Claude Code |

## License

Scripture text: KJV (public domain). Application code: [choose your license].
