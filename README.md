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
│   ├── hebrew-lexicon.js        # Hebrew tier 3: Strong's and BDB, rendered from an allowed list of elements
│   ├── hebrew-versification.js  # Generated: Hebrew verse numbers onto English, for BDB's references
│   ├── readable-export.js       # Studies as a self-contained HTML page to read, print or share
│   ├── plans.js                 # Reading plans
│   ├── study-templates.js       # Study templates
│   ├── template-bar.js          # Template step navigation
│   ├── backup.js                # Backup / restore
│   ├── usfm.js                  # USFM import/export
│   ├── global-settings.js       # Global settings popover (incl. Data & Attribution)
│   ├── reader-settings.js, notes-settings.js, reference-settings.js
│   ├── help.js                  # Contextual help popovers
│   ├── popover-registry.js      # Shared popover open/close coordination
│   ├── dialogs.js               # Shared confirm / prompt modal dialogs
│   ├── storage-worker.js        # Web Worker for DB writes
│   └── vendor/
│       ├── sql-wasm.js          # sql.js library
│       └── sql-wasm.wasm        # SQLite WebAssembly binary
├── data/
│   ├── core.db                # Books/translations manifest, cross-references, Nave's topics, user data (notes,
│   │                           #   tags, studies, bookmarks, markups, reading-plan/template schema, app state)
│   ├── language.db            # Original-language interlinear text, Greek lexicon, Greek/Hebrew grammar,
│   │                           #   Hebrew word pieces and Ketiv (Language tab)
│   ├── lexicon-hebrew.db      # Hebrew lexicon: Strong's, Brown-Driver-Briggs, and the links between them
│   ├── translations/          # Per-translation SQLite files (kjv.db, asv.db, web.db, ylt.db, darby.db, bsb.db)
│   ├── templates/, plans/     # Bundled study templates and reading plans
│   └── translations-prep/, stepbible-prep/, lexicon-prep/  # Build-script staging dirs. The raw source downloads
│                               # and each dir's own `output/` copy of the built .db are gitignored — the shipped
│                               # copies under data/translations/, data/language.db and data/lexicon-hebrew.db
│                               # are the tracked ones
├── scripts/
│   ├── build_translation.py   # Builds each translation's .db file
│   ├── build_crossrefs.py     # Ingests OpenBible cross-references into core.db
│   ├── build_language.py      # Builds language.db from STEPBible-Data
│   ├── build_lexicon_hebrew.py # Builds lexicon-hebrew.db from Open Scriptures (pinned, sha256-checked sources)
│   ├── build_hebrew_versification.py # Generates js/hebrew-versification.js from TAHOT
│   ├── gen_stress_data.py     # Generates 1/10/25/40-year user data for tests/stress.py (output gitignored)
│   ├── analysis/              # Data investigation and checking scripts (not part of the app or build);
│   │                           #   hebrew_anatomy/ holds the Hebrew rebuild's source fetch, rebuild check, and parity tests
│   └── convert-canonical.js, convert-mcheyne.js, convert-chronological.js
│                               # One-off converters that produced the bundled reading-plan JSON in data/plans/
├── build/
│   └── build_db.py            # Builds core.db's schema, books table, and Nave's Topical Bible topics/topic_verses
│                               # (run before scripts/build_crossrefs.py, which adds cross-references to the same file)
├── tests/
│   ├── verify.py              # Live Playwright verification of the running app — see "Verifying Changes"
│   └── stress.py              # Longevity stress test measurements — see docs/STRESS_TEST_RESULTS.md
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
- **Language tab** — original-language word study: interlinear Hebrew/Greek text for any selected verse, word-by-word English glosses, grouped-word handling for multi-word phrases, and an inline word card that expands beneath the tapped word without leaving the verse — progressive disclosure from gloss/morphology/Strong's number up through lemma/transliteration/parsed morphology up to the lexicon: the full Greek entry, or Strong's and Brown-Driver-Briggs for Hebrew
- **Reading plans** — structured, progress-tracked plans through Scripture
- **Study templates** — pre-built study structures (Inductive Study, Word Study, Passage Overview) that generate a filled-in study in one step
- **Backup & restore** — full local data export/import
- **Readable export** — one study or all of them as a self-contained web page, verses quoted, to read, print or share
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

# Language tab data (original-language text, Strong's, morphology, Greek lexicon).
# Builds into data/stepbible-prep/output/; --ship also copies it to data/language.db
python scripts/build_language.py --ship

# Hebrew lexicon (Strong's and Brown-Driver-Briggs) from Open Scriptures, at pinned commits.
# Builds into data/lexicon-prep/output/; --ship also copies it to data/lexicon-hebrew.db.
# The same sources always give a byte-identical file.
python scripts/build_lexicon_hebrew.py --ship

# Hebrew-to-English verse numbering for BDB's scripture references, from the same
# pinned TAHOT files as language.db. Writes js/hebrew-versification.js.
python scripts/build_hebrew_versification.py
```

Verse IDs use the `BBCCCVVV` format: two-digit book + three-digit chapter + three-digit verse. Genesis 1:1 = `01001001`. Revelation 22:21 = `66022021`.

## Running Locally

Serve the project root with any static file server:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a Chromium-based browser. On first visit, the core database and translations load before the app starts, and `language.db` and `lexicon-hebrew.db` follow in the background just after. All of them are kept locally (OPFS) for later launches.

To install as a PWA, use your browser's install option (usually in the address bar or menu). The app will open in its own window without browser chrome.

## Verifying Changes

There is no unit test suite; the app is exercised live instead. `tests/verify.py` serves the repo, boots Ember in headless Chromium with a fresh profile, drives it with Playwright, and prints one pass/fail line per check plus any console errors (the known FTS5-to-LIKE fallback message is filtered out).

```bash
pip install playwright && playwright install chromium

python3 tests/verify.py popovers     # every help/settings popover, bookmark prompt + dropdown
python3 tests/verify.py smoke        # notes, tags, bookmarks, markups, reference tabs, search,
                                     #   plans, template bar, study templates, split view
python3 tests/verify.py indicators   # note/bookmark dots on a titled Psalm (verse=0 row)
python3 tests/verify.py notes        # removing tags and verse anchors from a note, long anchors,
                                     #   a 300-note study: scrolling, find, autocomplete, in-place edits
python3 tests/verify.py sw           # service worker installs and precaches every js/ file
python3 tests/verify.py hebrew       # Hebrew word anatomy: TEHMC decode, pieces, affixes, Ketiv
python3 tests/verify.py lexicon      # Hebrew lexicon: the spec's test words, safe rendering, every stored
                                     #   entry rendered, lazy open, offline message, single download
python3 tests/verify.py offline      # language.db background download, offline use, failure and
                                     #   recovery states, single request, interrupted downloads
python3 tests/verify.py storage      # search index after edits and its one-time repair, anchor lookups
                                     #   against a plain scan, empty and damaged core.db, persistent
                                     #   storage request and settings line
python3 tests/verify.py boots        # warm-boot time to "app live": prints samples and the median
```

For changes to `js/db.js`, snapshot the results of its query functions before and after and compare:

```bash
python3 tests/verify.py dbsnapshot /tmp/before.json   # on the old code
python3 tests/verify.py dbsnapshot /tmp/after.json    # on the new code
python3 tests/verify.py dbcompare /tmp/before.json /tmp/after.json
```

Every key should report identical except creation timestamps on the seeded user rows, which differ between runs. Each scenario takes a few minutes on first run while translations seed into OPFS.

To see how Ember behaves with decades of user data, run the stress test (about 20 minutes; results and method in `docs/STRESS_TEST_RESULTS.md`):

```bash
python3 tests/stress.py base
python3 scripts/gen_stress_data.py
python3 tests/stress.py all
python3 tests/stress.py report
```

## Roadmap

Builds are additive — nothing in a later build requires reworking earlier code.

### Shipped
Build 1 (core reading + notes) → Build 1.5 (polish) → Build 2 (cross-references, markups, multi-translation) → Build 3 (reading plans) → Build 4 (backup/restore) → Build 5 (study templates) → Build 6 (Language tab — original-language word study) → offline language data and stress-test fixes → Hebrew lexicon (Strong's and Brown-Driver-Briggs)

### Future
- Nested notes
- In-app template creator, with template sharing
- Dictionary lookup (Webster's 1913)
- Full LSJ Greek lexicon (TFLSJ) as an expandable detail, pending bundle-size headroom
- Version-aware translation/data reseeding for existing installs
- Landing page and public distribution

## Data & Attribution

Ember bundles data from several sources. The same information is shown in-app under **Settings → Data & Attribution**; the table below mirrors it exactly.

The six bundled translations (KJV, ASV, WEB, YLT, Darby, BSB), Nave's Topical Bible, and the Brown-Driver-Briggs (1906) and Strong's (1890) Hebrew dictionaries are public domain and don't require attribution.

| Source | License | Powers |
|---|---|---|
| [STEPBible-Data](https://www.stepbible.org) | CC BY 4.0 | Language tab — original-language word data (Hebrew/Greek text, glosses, lexicon entries, and Greek and Hebrew grammar decoding: the TAHOT, TAGNT, TBESG, TEGMC and TEHMC datasets), from Tyndale House, Cambridge |
| [OpenBible.info](https://www.openbible.info) | CC BY 4.0 | Related tab — cross-reference data |
| [Open Scriptures Hebrew Bible Project](https://hb.openscriptures.org) | CC BY 4.0 | Hebrew lexicon (Brown-Driver-Briggs and Strong's Hebrew Dictionary) powering the Language tab's Lexicon for Hebrew words. When a word has several BDB entries, their order comes from word frequencies in the OSHB text |

The Open Scriptures credit covers both of its repositories Ember draws on, which ask for the same attribution: `openscriptures/HebrewLexicon` (the transcription and markup of BDB and Strong's) and `openscriptures/morphhb` (the Hebrew text whose word counts set the BDB order). The dictionaries themselves are public domain.

STEPBible-Data's license permits inclusion in software without requesting permission; per their own stated interest, Ember will notify STEPBible once it's publicly available, rather than seeking permission upfront (see `docs/Build_6_Spec.md`).

## Documentation

| Document | Description |
|---|---|
| `FEATURE_INVENTORY.md` | Full working-feature audit, traced to live code |
| `USER_MANUAL.md` | End-user documentation |
| `docs/Technical_Spec_Build_1.md` | Build 1 technical specification — schema, module specs, code |
| `docs/Build_N_Spec.md` (per build) | Per-build specifications |
| `docs/Psalm_Title_Fix_Spec.md`, `docs/Grammar_Decode_Spec_DRAFT.md`, `docs/Language_Panel_Word_Inspector_Spec.md`, `docs/Hebrew_Word_Anatomy_Spec.md` | Standalone feature specs between numbered builds |
| `docs/Hebrew_Lexicon_Spec.md`, `docs/HEBREW_LEXICON_REPORT.md` | The Hebrew lexicon's spec, and the build's record: data checks, sizes, and every decision that changed the spec |
| `docs/HEBREW_ANATOMY_DATA_REPORT.md` | The Hebrew Word Anatomy build's record: the language.db rebuild (sources, checks, sizes) and every decision that changed the spec |
| `docs/BUILD_N_ACTUAL_STATE.md` (per build) | Ground-truth audit of each build's shipped code, derived from source, not planning docs. Latest: `docs/BUILD_6.1_ACTUAL_STATE.md` (post-Build-6 Language tab rework + September 2026 architecture-review pass; its §12–13 addenda cover the November 2026 offline, stress-test and long-list work, §14 the Hebrew lexicon) |
| `docs/Offline_Language_And_Stress_Test_Spec.md`, `docs/OFFLINE_LANGUAGE_REPORT.md` | Spec for offline language data and the stress test, and the record of what was found and decided |
| `docs/STRESS_TEST_RESULTS.md` | Longevity stress test: results at 1/10/25/40 years of use, what drives the cost, ranked candidate remedies |
| `docs/crossref_audit_bundle.md`, `docs/grammar_decode_audit_bundle.md`, `docs/tegmc_value_domain.md` | Raw extracted material and query output, assembled for earlier audits and content authoring; no interpretation |
| `docs/ANCHOR_QUERIES.md` | SQL query convention for range-aware verse-anchor lookups |
| `docs/TODO.md` | Everything known to be open, with links to where the detail lives |

## License

Application code: Apache License 2.0, © Ember Bible Study 2026. Scripture text and third-party data: see [Data & Attribution](#data--attribution) above for per-source licensing.
