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
| Scripture Text | KJV, ASV, WEB, YLT, Darby, BSB — see [Data & Attribution](#data--attribution) |

No React. No Vue. No webpack. No npm dependencies at runtime. One HTML file, one CSS file, a set of JS modules, and a handful of SQLite databases.

## Project Structure

```
ember/
├── index.html                # Single-page app shell
├── manifest.json             # PWA manifest
├── sw.js                     # Service worker (offline support)
├── css/
│   └── style.css             # All styles, CSS custom properties for theming
├── fonts/
│   └── SILEOT.woff           # Ezra SIL (Hebrew, with niqqud)
├── js/
│   ├── app.js                 # Entry point
│   ├── db.js                  # Database init, queries, persistence
│   ├── reader.js               # Scripture rendering, chapter navigation
│   ├── selection.js            # Verse selection, contextual toolbar
│   ├── notes.js                # Note creation, editing, display
│   ├── tags.js                 # Tag autocomplete
│   ├── panels.js                # Panel layout, resizing
│   ├── search.js                # Full-text search
│   ├── bookmarks.js             # Bookmarks
│   ├── markups.js               # Highlight/underline text markups
│   ├── reference.js             # Reference panel (Info / Tags / Related / Language / Plans)
│   ├── language.js              # Language tab — interlinear word study
│   ├── plans.js                 # Reading plans
│   ├── study-templates.js       # Study templates
│   ├── template-bar.js          # Template step navigation
│   ├── backup.js                # Backup / restore
│   ├── usfm.js                  # USFM import/export
│   ├── global-settings.js       # Global settings popover (incl. Data & Attribution)
│   ├── reader-settings.js, notes-settings.js, reference-settings.js
│   ├── help.js                  # Contextual help popovers
│   ├── popover-registry.js      # Shared popover open/close coordination
│   ├── state.js                 # Reactive state manager (scaffolded, not yet wired in)
│   ├── storage-worker.js        # Web Worker for DB writes
│   └── vendor/
│       ├── sql-wasm.js          # sql.js library
│       └── sql-wasm.wasm        # SQLite WebAssembly binary
├── data/
│   ├── core.db                # Books/translations manifest, cross-references, Nave's topics, user data (notes,
│   │                           #   tags, studies, bookmarks, markups, reading-plan/template schema, app state)
│   ├── language.db            # Original-language interlinear text + Greek lexicon (Language tab)
│   ├── translations/          # Per-translation SQLite files (kjv.db, asv.db, web.db, ylt.db, darby.db, bsb.db)
│   ├── templates/, plans/     # Bundled study templates and reading plans
│   └── translations-prep/, stepbible-prep/  # Build-script staging dirs — the raw source downloads inside them
│                               # are gitignored and re-downloadable, but each dir's own `output/` copy of the
│                               # built .db is currently committed alongside the shipped copy under data/
├── scripts/
│   ├── build_translation.py   # Builds each translation's .db file
│   ├── build_crossrefs.py     # Ingests OpenBible cross-references into core.db
│   ├── build_language.py      # Builds language.db from STEPBible-Data
│   └── convert-canonical.js, convert-mcheyne.js, convert-chronological.js
│                               # One-off converters that produced the bundled reading-plan JSON in data/plans/
├── build/
│   └── build_db.py            # Builds core.db's schema, books table, and Nave's Topical Bible topics/topic_verses
│                               # (run before scripts/build_crossrefs.py, which adds cross-references to the same file)
└── icons/                     # icon-192.png / icon-512.png referenced by manifest.json — not currently present
                                # in the repo; PWA install currently falls back to no custom icon
```

## Features

Ember has shipped through **Build 6**. Current functionality:

- **Scripture reading** — 6 bundled translations (KJV, ASV, WEB, YLT, Darby, BSB), all 66 books, with split-pane side-by-side reading
- **Verse selection** — single verse or range selection, driving every contextual study tool
- **Notes** — create, edit, and delete notes anchored to specific verses or ranges, with tagging and autocomplete
- **Bookmarks** — save and label specific verses for quick return
- **Text markups** — highlight and underline verses in multiple colors
- **Reference panel** — Info, Tags, Related (cross-references), and Language tabs, contextual to the current selection, plus a fifth Plans tab (reading plans and study templates) in the same tab bar
- **Language tab** — original-language word study: interlinear Hebrew/Greek text for any selected verse, word-by-word English glosses, grouped-word handling for multi-word phrases, and a full word detail view (lemma, transliteration, Strong's number, morphology, and lexicon entry for Greek)
- **Reading plans** — structured, progress-tracked plans through Scripture
- **Study templates** — pre-built study structures (Inductive Study, Word Study, Passage Overview) that generate a filled-in study in one step
- **Backup & restore** — full local data export/import
- **Full-text search** — across Scripture, notes, tags, and studies in one unified interface, with prefix shortcuts (`b:`, `n:`, `s:`, `t:`, `k:`)
- **Offline-first persistence** — all data stored locally via OPFS (falling back to IndexedDB), no account or server required
- **PWA** — installable, fully functional offline after first load
- **Light and dark themes**

## Building the Data

Ember's bundled data is built from source with scripts in `build/` and `scripts/`:

```bash
# Core schema, books, and Nave's Topical Bible topics (data/core.db)
python build/build_db.py

# Cross-references, added into the same core.db
python scripts/build_crossrefs.py

# Translations — run once per translation, each with its own source and name
python scripts/build_translation.py KJV data/translations-prep/data/translations-prep/scrollmapper/formats/sqlite/KJV.db --name "King James Version" --year 1611
# ...repeat for ASV, YLT, Darby (scrollmapper), BSB (TSV file), and WEB (chapter-file directory)

# Language tab data (original-language text, Strong's, morphology, Greek lexicon)
python scripts/build_language.py
```

Verse IDs use the `BBCCCVVV` format: two-digit book + three-digit chapter + three-digit verse. Genesis 1:1 = `01001001`. Revelation 22:21 = `66022021`.

## Running Locally

Serve the project root with any static file server:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a Chromium-based browser. Databases load on first visit and are cached locally (OPFS) for all subsequent launches.

To install as a PWA, use your browser's install option (usually in the address bar or menu). The app will open in its own window without browser chrome.

## Roadmap

Builds are additive — nothing in a later build requires reworking earlier code.

### Shipped
Build 1 (core reading + notes) → Build 1.5 (polish) → Build 2 (cross-references, markups, multi-translation) → Build 3 (reading plans) → Build 4 (backup/restore) → Build 5 (study templates) → Build 6 (Language tab — original-language word study)

### Future
- Nested notes
- In-app template creator, with template sharing
- Dictionary lookup (Webster's 1913)
- "Other occurrences of this word" — cross-reference index for the Language tab
- Full LSJ Greek lexicon (TFLSJ) as an expandable detail, pending bundle-size headroom
- Version-aware translation/data reseeding for existing installs
- Landing page and public distribution

## Data & Attribution

Ember bundles data from several sources. The same information is shown in-app under **Settings → Data & Attribution**; the table below mirrors it exactly.

The six bundled translations (KJV, ASV, WEB, YLT, Darby, BSB) and Nave's Topical Bible are public domain and don't require attribution.

| Source | License | Powers |
|---|---|---|
| [STEPBible-Data](https://www.stepbible.org) | CC BY 4.0 | Language tab — original-language word data (Hebrew/Greek text, glosses, and lexicon entries), from Tyndale House, Cambridge |
| [OpenBible.info](https://www.openbible.info) | CC BY 4.0 | Related tab — cross-reference data |

STEPBible-Data's license permits inclusion in software without requesting permission; per their own stated interest, Ember will notify STEPBible once it's publicly available, rather than seeking permission upfront (see `Build_6_Spec.md`).

## Documentation

| Document | Description |
|---|---|
| `Technical_Spec_Build_1.md` | Build 1 technical specification — schema, module specs, code |
| `Build_N_Spec.md` (per build, plus `Psalm_Title_Fix_Spec.md`) | Per-build specifications |
| `BUILD_N_ACTUAL_STATE.md` (per build) | Ground-truth audit of each build's shipped code, derived from source, not planning docs |
| `FEATURE_INVENTORY.md` | Full working-feature audit, traced to live code |
| `USER_MANUAL.md` | End-user documentation |
| `docs/ANCHOR_QUERIES.md` | SQL query convention for range-aware verse-anchor lookups |

## License

Application code: Apache License 2.0, © Ember Bible Study 2026. Scripture text and third-party data: see [Data & Attribution](#data--attribution) above for per-source licensing.
