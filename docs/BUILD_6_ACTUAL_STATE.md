# BUILD_6_ACTUAL_STATE.md — Ground-Truth Audit

> **⚠️ SNAPSHOT:** This document reflects the codebase as of 2026-08-31, after Build 6 (Language tab: interlinear Hebrew/Greek word study, word detail view, STEPBible-Data import, CC BY 4.0 attribution) shipped.
> When this document and the actual source files disagree, **the source files are correct.**
> This document supersedes `BUILD_5_ACTUAL_STATE.md`.

_Read from source files on 2026-08-31. `Build_6_Spec.md` was checked only to confirm scope and to note where the shipped implementation deviates from it (see §10) — not copied from. Every claim below was also exercised against the running app in headless Chromium via Playwright before being written down; see §10 for what was specifically verified. Written before this session's changes were committed — see §1 for the exact file list, taken from `git status`, not a commit range._

---

## 1. FILE STRUCTURE

```
ember/
├── index.html                        # App shell — unchanged (Language tab plumbing already existed as a stub target)
├── manifest.json                     # PWA manifest
├── sw.js                             # Service worker — CHANGED: CACHE_NAME bumped v3→v4, +js/language.js, +fonts/SILEOT.woff
├── CLAUDE.md, README.md
├── FEATURE_INVENTORY.md              # CHANGED: item 142 replaced (was a placeholder), +item 247-250 section, +236g
├── BUILD_6_ACTUAL_STATE.md           # This document — NEW
├── BUILD_5_ACTUAL_STATE.md .. BUILD_1_ACTUAL_STATE.md   # Superseded — kept for history
├── Build_6_Spec.md, Psalm_Title_Fix_Spec.md, Build_2..5_Spec.md, Technical_Spec_Build_1.md, USER_MANUAL.md
├── .gitignore                        # CHANGED: +data/stepbible-prep/raw/
│
├── css/
│   └── style.css                     # CHANGED (~3,023 lines): +@font-face (Ezra SIL), +--font-hebrew/--font-greek, +Language tab block, +.settings-credits-list*
│
├── js/
│   ├── db.js                         # CHANGED: +getLanguageDb/loadLanguageBuffer (lazy), +getOriginalWordsForVerses/getOriginalWordsForGroup/getOriginalWord/getGreekLexiconEntry
│   ├── reference.js                  # CHANGED: renderAll() now takes the full verseIds array (was: first verse only), threads it to language.js; old renderLanguageTab() placeholder removed
│   ├── reader.js                     # CHANGED: renderPane() no longer skips an empty Psalm-title row — +populateTitleGloss() substitutes TAHOT's gloss asynchronously (Wayne's call, see §11)
│   ├── language.js                   # NEW — interlinear view + word detail view
│   ├── global-settings.js            # CHANGED: +"Data & Attribution" section
│   ├── selection.js, notes.js, tags.js, search.js, panels.js,
│   │   bookmarks.js, markups.js, help.js, popover-registry.js,
│   │   reader-settings.js, notes-settings.js, reference-settings.js,
│   │   plans.js, template-bar.js, backup.js, usfm.js, study-templates.js,
│   │   state.js, storage-worker.js  # Unchanged since Build 5
│   └── vendor/
│       ├── sql-wasm.js
│       └── sql-wasm.wasm
│
├── data/
│   ├── core.db                       # Unchanged — original_words/step_lexicon_greek deliberately NOT added here, see §2
│   ├── language.db                   # NEW — 51.3MB, original_words + step_lexicon_greek
│   ├── stepbible-prep/
│   │   ├── raw/                      # NEW, gitignored — 8 raw STEPBible-Data .txt files (~110MB)
│   │   └── output/language.db        # NEW build artifact, copied to data/language.db
│   ├── templates/, plans/, translations/, translations-prep/   # Unchanged since Build 5
│
├── scripts/
│   ├── build_language.py             # NEW — TAHOT/TAGNT/TBESG parser + language.db builder
│   ├── build_translation.py, build_crossrefs.py   # Unchanged since Psalm Title Fix
│
├── fonts/
│   └── SILEOT.woff                   # NEW — Ezra SIL 2.51, SIL OFL 1.1 + MIT/X11
│
├── docs/ANCHOR_QUERIES.md
├── icons/                            # Still empty — see §7
└── build/                            # Unchanged since Build 3
```

**Confirmed via `git status --short`** (uncommitted at time of writing — see note above): `M css/style.css`, `M FEATURE_INVENTORY.md`, `M .gitignore`, `M js/db.js`, `M js/global-settings.js`, `M js/reference.js`, `M js/reader.js`, `M sw.js`, `M Build_6_Spec.md`, `M Psalm_Title_Fix_Spec.md`; `?? data/language.db`, `?? data/stepbible-prep/`, `?? fonts/SILEOT.woff`, `?? js/language.js`, `?? scripts/build_language.py`, `?? BUILD_6_ACTUAL_STATE.md`. Nothing else in `js/` was touched — `notes.js`, `panels.js`, `plans.js`, `study-templates.js`, `template-bar.js`, `backup.js`, `usfm.js`, etc. — confirmed by the status output itself.

---

## 2. DATABASE SCHEMA

**`original_words` and `step_lexicon_greek` live in a new, separate file, `data/language.db` — NOT `core.db`.** This is a deliberate deviation from a literal reading of `Build_6_Spec.md` Item 2, which gives the `CREATE TABLE` statements without saying which file. `core.db` is the single sql.js database eagerly loaded fully into memory at startup, and every write in the app (`saveToStorage(db.export())`) re-serializes and persists all of it — dozens of call sites, on every note/tag/bookmark edit. `original_words` alone is 447,734 rows; putting it in `core.db` would mean re-exporting a several-hundred-thousand-row blob on every note save. `data/language.db` follows the pattern the app already uses for translations (separate file, OPFS-seeded, network-fallback) but — unlike translations, which all open eagerly at startup — is lazy-loaded (see §5).

### `original_words` — NEW this build, in `data/language.db`

```sql
CREATE TABLE original_words (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id            INTEGER NOT NULL,
    word_position       INTEGER NOT NULL,
    language            TEXT NOT NULL,
    surface_text        TEXT NOT NULL,
    transliteration     TEXT,
    lemma               TEXT,
    gloss_contextual    TEXT,
    gloss_dictionary    TEXT,
    strongs_number      TEXT,
    morph_code          TEXT,
    group_id            INTEGER
);
CREATE INDEX idx_original_words_verse ON original_words(verse_id);
CREATE INDEX idx_original_words_strongs ON original_words(strongs_number);
```

**`lemma` is not in `Build_6_Spec.md`'s literal schema.** Added during implementation: Item 4 requires a Lemma field in the word detail view, and the data was already being parsed and then discarded — Hebrew's TAHOT col 12 middle segment (the word's dictionary/root form, e.g. `רֵאשִׁית`, distinct from `surface_text`'s inflected/pointed/prefix-attached printed form, e.g. `בְּ/רֵאשִׁ֖ית`) and Greek's TAGNT col 5 lemma segment (already being computed for `gloss_dictionary`'s split, just not stored). Populated for both languages; null for exactly 1 of 305,638 Hebrew rows (a source-data edge case), 0 of 142,096 Greek rows.

447,734 rows total: 305,638 Hebrew (TAHOT) + 142,096 Greek (TAGNT). 14 fewer than the raw per-line count of the 6 source files (447,748) — 14 Hebrew rows are Ketiv-only "ghost" words (empty Qere reading) skipped at import, see §10.

### `step_lexicon_greek` — NEW this build, in `data/language.db`

```sql
CREATE TABLE step_lexicon_greek (
    strongs_number  TEXT PRIMARY KEY,
    lemma           TEXT,
    transliteration TEXT,
    morph           TEXT,
    gloss           TEXT,
    meaning         TEXT
);
```

11,035 rows (matches `Build_6_Spec.md`'s stated TBESG entry count exactly). **Keyed on TBESG's `dStrong` column, not `eStrong`** — a real bug caught during import, not assumed correct from the spec's column list: `original_words.strongs_number` is TAGNT's own disambiguated form (e.g. `G0040G` vs `G0040H` are different lexicon senses under one base `eStrong` "G0040"); keying on `eStrong` silently collapsed up to 9 distinct entries onto one row via `INSERT OR REPLACE` (109 `eStrong` codes affected, caught by comparing the parsed row count — 11,035 — against the stored row count before the fix — 10,847).

### No `strongs` table exists anywhere in the repo

`Build_6_Spec.md`'s schema comment says a bare Strong's lexicon "already exists per Build 2-era bundling; confirm rather than recreate." **Checked every `.db` file in the repo — no `strongs` table exists in any of them, including `core.db`.** This is a stale assumption in the spec, not a fact about this codebase. Nothing in Build 6 depends on it (`step_lexicon_greek` is self-contained), so this blocks nothing — but no Strong's-bare-lexicon import was built to satisfy an assumption that turned out not to hold.

### `books`, `translations`, `cross_references`, `topics`, `topic_verses`, all user tables — unchanged from Build 5

See `BUILD_5_ACTUAL_STATE.md` §2 for full DDL; Build 6 touched none of it.

---

## 3. MODULE MAP

### `js/db.js` — Database Layer (CHANGED)

**New exports:**
- `getLanguageDb()` — async, returns a cached sql.js `Database` handle for `language.db`. First call triggers `loadLanguageBuffer()`; every call after that (including concurrent in-flight calls) resolves the same cached promise/handle. Never called during `initDatabase()` — no boot-sequence changes this build (see §5).
- `loadLanguageBuffer()` (private) — OPFS-first, network-fallback, mirroring `loadTranslationBuffer()`'s pattern exactly, with one difference: seeding into OPFS happens lazily here (on first use) rather than eagerly at init via `seedTranslations()`.
- `getOriginalWordsForVerses(verseIds)` — all `original_words` rows for a set of verse ids, ordered `verse_id, word_position`. Returns `[]` for an empty input without touching `language.db` at all.
- `getOriginalWordsForGroup(groupId)` — all rows sharing a `group_id`, ordered by `word_position`. Unused by `language.js` in the shipped UI (which derives group membership from the already-fetched verse's row set instead — see below) but exported as a general-purpose query.
- `getOriginalWord(id)` — single row by primary key.
- `getGreekLexiconEntry(strongsNumber)` — single `step_lexicon_greek` row, or `null` if none matches (including for Hebrew callers, which pass no useful `strongsNumber`, and for the ~0.2% of Greek codes with no TBESG match — see §10).

**Everything else in db.js (Build 1–5 exports, `_translationDbs`, `getChapter()`, `search()`, all the reading-plans/study-templates functions, backup/restore, `meta`, etc.) — unchanged.** Re-checked against `BUILD_5_ACTUAL_STATE.md`'s module map; still accurate.

---

### `js/language.js` — Language Tab: Interlinear + Word Detail — NEW

**Imports:** `parseVerseId`, `getBook`, `getOriginalWordsForVerses`, `getGreekLexiconEntry` (db.js).

**Exports:** `renderLanguageTab(verseIds)` — the only export; called by `reference.js`'s `renderAll()` on every `selection-changed` event with a non-empty selection.

**Summary:** `renderLanguageTab()` fetches all words for the given verse ids (awaiting the lazy `getLanguageDb()` the first time it's called in a session), guards against a stale render if the selection changes again before the fetch resolves (module-level `currentVerseIds` reference-equality check), then groups the results by `verse_id` and renders one `renderVerseBlock()` per verse.

`renderVerseBlock(verseId, verseWords)` builds: a heading (book/chapter:verse), a decorative running verse line (`join(' ')` of `surface_text` in word order, `dir="rtl"` + right-aligned for Hebrew), and a gloss list. The gloss list walks `verseWords` once, collapsing consecutive/repeated `group_id`s into a single `renderWordRow()` call per group (members located by filtering the same already-fetched array — no extra query).

`renderWordRow(members, isHebrew)` — a flex row, original-language cell fixed left (own `dir` per language, per `Build_6_Spec.md`'s "row layout is fixed LTR regardless of language" rule), gloss cell fixed right (member `gloss_contextual` values joined with a space). Click or Enter/Space opens the word detail view for that row's member(s).

`openWordDetail(members)` / `renderWordDetail()` — swaps `#language-tab`'s content in place (matching the spec's "view-swap within a tab" pattern), rendering a back button plus one `renderWordSection()` per member. **A grouped row's detail view shows one stacked section per member word, not an arbitrary single pick** — a design decision made during implementation (the spec left this layout open); avoids guessing which word in "ho logos" is "the" word to show. Back restores the cached `lastInterlinearWords` render and the scroll position captured when the row was tapped.

`renderWordSection(word)` — verse ref, original text (large, own `dir`), then Lemma/Transliteration/Strong's/Morphology/Contextual gloss/Dictionary gloss as label-value rows (fields with no value are simply omitted, not shown empty). For Greek words with a `strongs_number`, awaits `getGreekLexiconEntry()` and, if a `meaning` comes back, renders it via `sanitizeLexiconMeaning()`.

`sanitizeLexiconMeaning(raw)` — TBESG's `meaning` field carries a small known set of formatting tags (`<b>`, `<i>`, `<BR/>`/`<br>`, `<ref='Bk.C.V'>label</ref>`, `<re>`, `<author>`, `<greek>`, `<note>`, `<lb/>` — the full vocabulary found by scanning 2,000 real entries). The whole raw string is HTML-escaped first, so nothing in the source data can ever produce a live tag; only the specific escaped patterns above are then selectively converted back (`<b>`→`<strong>`, `<BR/>`→`<br>`, `<ref='...'>...</ref>`→ the label text with tags dropped, etc.) before the result is set via `innerHTML`. Verified live against G3056 (λόγος) and G3588 (ὁ) — clean bold/line-break formatting, no visible broken markup or escaped-tag text.

---

### `js/reference.js` — Reference Panel (CHANGED)

`initReference()`'s `selection-changed` listener now passes the **full `verseIds` array** to `renderAll()`, not just `verseIds[0]`. `renderAll(verseIds)` derives `verseId = verseIds[0]` internally for Info/Tags/Related (unchanged single-verse behavior for those three tabs) but passes the full array through to `language.js`'s `renderLanguageTab(verseIds)` — the only tab that needs the whole range, since an interlinear naturally extends across a multi-verse selection the way a single "current verse" concept doesn't. `refreshReference(verseId)` (called by notes.js after a note edit, only touches the Info tab) is unchanged.

The old placeholder `renderLanguageTab()` function ("Original language tools will be available in a future build.") is removed; `clearAll()` is unchanged (already included `language-tab` in its target list from the Build 3-era stub).

---

### `js/global-settings.js` — Global Settings Popover (CHANGED)

New `SECTIONS` entry, "Data & Attribution", following the existing array-driven pattern exactly (matching "Backup & Restore"'s structure). Credits STEPBible-Data and OpenBible.info, both CC BY 4.0, each as a linked name plus a one-line note of what they power in the app. **Audited for other CC-licensed bundled data before writing this, not assumed complete from Item 1 alone** — found that OpenBible.info's cross-reference data (already bundled and powering the Related tab since an earlier build) is also CC BY 4.0 and had never been credited anywhere in the app; added alongside STEPBible-Data rather than shipped as a partial STEPBible-only credit. Confirmed BSB and Nave's Topical Bible are genuinely public domain (checked their own stated terms directly, not assumed) and need no attribution.

---

### `sw.js` — Service Worker (CHANGED)

`CACHE_NAME` bumped `ember-v3` → `ember-v4`. `PRECACHE` gains `./js/language.js` (always loaded — statically imported by `reference.js`, which is part of the app's core module graph regardless of whether the Language tab is ever opened) and `./fonts/SILEOT.woff`. **`data/language.db` is deliberately NOT added to `PRECACHE`** — same reasoning as `core.db` and the translation `.db` files: large, OPFS-managed after first load, and the generic cache-first-with-network-fallback fetch handler already covers it once `getLanguageDb()` fetches it for the first time. No changes to the fetch handler itself.

---

### `css/style.css` — CHANGED

New `@font-face` for Ezra SIL (`fonts/SILEOT.woff`, `font-display: swap`), plus `--font-hebrew`/`--font-greek` custom properties alongside the existing `--font-display`/`--font-reading`/`--font-mono`. New "Language tab" block (~170 lines): verse block/heading/line, word list/row (plain-text rows with a bottom-divider + hover background, matching the existing `.ref-crossref-btn` idiom — explicitly not a card/box treatment, per the spec's Sefaria-inspired direction), word detail view (back button, per-word sections, label/value field rows, lexicon block). New `.settings-credits-list`/`.settings-credit-item`/`.settings-credit-link`/`.settings-credit-note` for the attribution section, matching `.settings-section-desc`'s existing sizing/color conventions.

---

### `scripts/build_language.py` — NEW

Standalone script (run manually, not part of any build-on-boot path): parses all 4 TAHOT files + 2 TAGNT files + TBESG from `data/stepbible-prep/raw/` (gitignored, re-downloadable — mirrors `data/translations-prep/`'s existing raw-source-staging convention) into `data/stepbible-prep/output/language.db`, then copies it to the shipped `data/language.db`. See §10 for the parsing decisions and bugs caught during implementation. Runtime: ~8 seconds for the full 447,748-line parse + import + VACUUM.

---

### `js/reader.js` — Scripture Rendering (CHANGED)

`renderPane()` no longer skips an empty Psalm-title (`verse=0`) row outright for KJV/ASV/Darby. It renders the row (initially empty) and fires `populateTitleGloss(el, textSpan, verseId)` — async, fire-and-forget — which fetches `getOriginalWordsForVerses([verseId])`, joins the returned `gloss_contextual` values, strips STEPBible's `/` prefix/root-boundary markers, and sets the text once resolved; the row removes itself if no gloss comes back. This is the Psalm-title gloss decision `Psalm_Title_Fix_Spec.md` left open — see §11 for the full rationale, including the real consequence (this is now a second, earlier trigger for `language.db`'s first load, beyond the Language tab).

---

### Every other module (`selection.js`, `notes.js`, `tags.js`, `search.js`, `panels.js`, `bookmarks.js`, `markups.js`, `popover-registry.js`, `reader-settings.js`, `notes-settings.js`, `reference-settings.js`, `state.js`, `storage-worker.js`, `usfm.js`, `plans.js`, `template-bar.js`, `backup.js`, `help.js`, `study-templates.js`)

**No changes this build** — confirmed via `git status --short` (§1). Behavior matches `BUILD_5_ACTUAL_STATE.md`'s descriptions exactly. `index.html` is also unchanged — the `#language-tab` div and its `Language` tab button already existed (Build 3-era stub), and `js/language.js` populates it in place with no markup changes needed.

---

## 4. MODULE DEPENDENCIES

```
app.js
  → db.js (no imports except usfm.js)
  → ...(all Build 1–5 dependencies, unchanged — see BUILD_5_ACTUAL_STATE.md §4)
  → reference.js → db.js, reader.js, selection.js, panels.js, language.js   [language.js import is NEW]

language.js → db.js                                                        [NEW]
reader.js   → db.js (adds getOriginalWordsForVerses to its existing import)  [CHANGED]

db.js → usfm.js                                                            [unchanged]
```

**No circular dependencies.** `language.js` sits at the same layer `tags.js`/`notes.js` occupy — imported by `reference.js`, imports only from `db.js`. `db.js` has no knowledge of `language.js` or `reader.js`; `getLanguageDb()`/the four `getOriginalWords*`/`getGreekLexiconEntry` functions are generic data-layer exports like any other query function in the file. `reader.js`'s only new dependency is one additional named import from `db.js`, which it already imported from — no new module edge.

---

## 5. DATA FLOW

### Boot Sequence — UNCHANGED this build

Unlike every prior build with a new bundled-data source (translations, plans, templates), **Build 6 adds no step to `initDatabase()`'s boot sequence.** `language.db` is not seeded into OPFS and not opened at startup — see §2's storage rationale and the `getLanguageDb()` description in §3. This is a deliberate architectural choice, not an oversight: `data/language.db` is 51.3MB, materially larger than any single bundled translation.

Two independent triggers can now cause its first load in a given session/install — the Language tab (below) and, per §11's later decision, rendering a titled Psalm chapter in a KJV/ASV/Darby pane. Both go through the same `getLanguageDb()`/OPFS-seed-then-cache path; whichever fires first pays the one-time cost.

### Language Tab Render (new flow)

`selection-changed` fires (selection.js, unchanged) → `reference.js`'s listener calls `renderAll(verseIds)` with the full array → `renderAll()` calls `language.js`'s `renderLanguageTab(verseIds)` → first call in a session: `getOriginalWordsForVerses()` (db.js) calls `getLanguageDb()`, which fetches+opens `language.db` (OPFS if already seeded from a prior session, else network — and seeds OPFS for next time) → subsequent calls in the same session reuse the cached handle, no re-fetch. Query results render as interlinear blocks (§3). Tapping a word row swaps to the word detail view in place; the back button restores the cached interlinear render + scroll position without re-querying.

### Psalm-Title Gloss Render (new flow, §11)

`renderPane()` renders a chapter synchronously as always; for an empty verse=0 row it also fires `populateTitleGloss()` (async, not awaited — chapter rendering never blocks on it). That function's first call in a session triggers the same `getLanguageDb()` path as the Language tab. The row's text is patched in once the query resolves; if the pane has since navigated away, the (now-detached) DOM nodes are harmlessly mutated with no visible effect.

### Persistence — UNCHANGED, and `language.db` is explicitly outside it

The Build 2–5 mechanism (`db.export()` → `saveToStorage()` → Web Worker → OPFS or IndexedDB fallback) applies only to `core.db`. `language.db` is read-only reference data — no function in `language.js` or the new `db.js` exports ever calls `saveToStorage()` or touches `db.export()`.

---

## 6. CUSTOM EVENTS

Unchanged from Build 5 — Build 6 added no new `CustomEvent` types and no new listeners for existing ones (beyond `reference.js`'s existing `selection-changed` listener now passing more data to `renderAll()`, which is not a new listener).

| Event | Emitter | Detail | Listeners |
|-------|---------|--------|-----------|
| `selection-changed` | selection.js | `{ verseIds: [...], element: verseEl\|null }` | notes.js, reference.js, bookmarks.js, reference-settings.js |
| `study-changed` | panels.js | `{ studyId }` | notes.js |
| `pane-changed` | reader.js (`setActivePane`) | `{ paneId }` | selection.js |

---

## 7. WHAT'S WIRED vs. STUBBED

### Fully Functional — NEW in Build 6

- **`original_words`/`step_lexicon_greek` schema + import** — built from real STEPBible-Data source files (not samples), 447,734 word rows + 11,035 lexicon entries, verified via hard assertions against the built database (Php.1.16/17, Acts.19.40-41, Mal.4.1, all 116 Psalm titles present, Gen.4.22/Jhn.1.1 grouping, zero duplicate `(verse_id, word_position)` pairs, zero orphaned groups) before any UI code was written.
- **Language tab interlinear view** — renders for any selected verse or multi-verse range, any active translation; grouped words collapse correctly; RTL Hebrew verified both as the running verse line (right-aligned block) and within word rows (own `dir`, fixed-left column position per the spec's layout rule).
- **Word detail view** — full field set for both languages; TBESG lexicon for Greek, sanitized before rendering; back navigation restores prior scroll position.
- **Ezra SIL font** — confirmed genuinely loaded at runtime (`document.fonts` entry status `"loaded"` after Hebrew text renders, not silently falling back), not just linked in CSS.
- **Data & Attribution section** — both STEPBible-Data and OpenBible.info credited, each linked to its source.
- **Lazy `language.db` loading** — confirmed no boot-sequence cost; confirmed the handle is fetched and cached correctly on first Language-tab use in a live session.
- **Psalm-title gloss substitution** (§11 — resolves `Psalm_Title_Fix_Spec.md`'s last open item) — KJV/ASV/Darby's empty verse=0 title rows now show TAHOT's joined, `/`-cleaned contextual gloss as a substitute title, fetched asynchronously and patched in without blocking chapter render; verified live on Psalm 3 (titled) and Psalm 1 (untitled, confirmed no stray row).

### Fully Functional — Build 1–5 (unchanged, not re-audited line-by-line here)

See `BUILD_5_ACTUAL_STATE.md` §7 — nothing in that list was touched by Build 6, **except** the "Reference → Language tab" line, which is now removed from "Partially Wired" below since it's fully implemented.

### Partially Wired / Incomplete — carried forward from Build 5, minus the Language tab

- **Devotional content columns**, **simultaneous "active" plans**, **reader-settings.js/notes-settings.js/reference-settings.js not migrated into the global settings popover** — all unchanged from Build 5; see `BUILD_5_ACTUAL_STATE.md` §7.
- **`sw.js`'s `PRECACHE` list is still stale relative to the full module graph** — Build 6 added `js/language.js` and `fonts/SILEOT.woff` to it, but it was already missing several Build 3–5 files before this build (`reference.js`, `plans.js`, `study-templates.js`, `global-settings.js`, `template-bar.js`, `backup.js`, `bookmarks.js`, `markups.js`, `help.js`, `popover-registry.js`, `reader-settings.js`, `notes-settings.js`, `reference-settings.js`, `usfm.js`). Not fixed in this build — pre-existing, out of scope for Build 6's own DoD, and the generic cache-first-with-fallback fetch handler still covers all of them after first successful fetch, so this is a "not available before first online visit" gap, not a broken-offline gap for a returning user.
- **A small number of Greek words (5 distinct Strong's codes, 317 of 142,096 occurrences, 0.22%) have no TBESG lexicon match** — a disambiguation-suffix mismatch between TAGNT and TBESG in STEPBible's own source data (e.g. TAGNT emits bare `G3700`, TBESG only has `G3700G`/`G3700H`). Accepted as-is — those word detail pages simply show no lexicon section, the same graceful degradation Hebrew already has by design (§2's TBESH exclusion). No fallback-matching logic was added; a fuzzy match risks showing the wrong sense.

### Schema Tables/Columns with No Runtime Code

See `BUILD_5_ACTUAL_STATE.md` §7 for the pre-existing list. Build 6 added no dead schema of its own — `original_words` and `step_lexicon_greek` are both fully exercised by `language.js`.

### Other

- **`js/state.js`** — still fully implemented, still unused. Unchanged.
- **`manifest.json`** — still references icon files that don't exist on disk. Unchanged.
- **PWA install prompt** — still DOM+styles only, no `beforeinstallprompt` handler. Unchanged.
- **STEPBible heads-up** — `Build_6_Spec.md` Item 5's last DoD line ("send STEPBible a heads-up per their stated interest, once Ember is available") is a manual action for Wayne to take once Ember ships publicly, not something implemented in code. Not done as part of this build; not applicable to do from inside the codebase.

---

## 8. VERSE ID CONVENTION

Unchanged — `original_words.verse_id` uses the same `BBCCCVVV` convention as `verses.verse_id`/`bookmarks` etc. (`book*1_000_000 + chapter*1_000 + verse`). Psalm titles use `verse=0` exactly as `Psalm_Title_Fix_Spec.md` established — confirmed live: all 116 titled psalms have TAHOT word data importable under their `verse_id`s ending in `000`. See `BUILD_5_ACTUAL_STATE.md` §8 for the base convention.

---

## 9. ORIGINAL-LANGUAGE DATA — PARSING DECISIONS (documented because several aren't obvious from the schema or spec alone)

**Group membership (`group_id`) is a global counter, not per-verse.** Rows from two different verses never share a `group_id` by construction — necessary because a single render can span a multi-verse selection, and the UI groups purely by `group_id` equality within its already-fetched result set.

**`word_position` is reassigned, not copied from the source.** Both TAHOT and TAGNT's own `#NN` numbering restarts at some verse boundaries in a way that doesn't match Ember's target verse boundaries (source-verse-group merges — §10). `word_position` is therefore always a running index over the final per-target-verse row order, computed at import time, never the literal source file number.

**Two languages, two independent grouping mechanisms, unified into one `group_id` column.** Hebrew's `+` is a single-direction forward-chain marker found inline in the `dStrongs` field; Greek's `»`/`«` are a bidirectional cross-reference found in a dedicated word-position field. The import script normalizes both into the same flat "shared integer, NULL if ungrouped" shape so `language.js` never needs to know which language it's rendering when deciding how to collapse rows.

---

## 10. DEVIATIONS FROM Build_6_Spec.md, AND WHAT WAS ACTUALLY VERIFIED

Per this document's own ground rule (code is truth over spec), the shipped implementation diverges from a literal reading of the spec in several places — all found by verifying against real STEPBible-Data files rather than trusting the spec's prose:

1. **Storage location for `original_words`/`step_lexicon_greek` is not specified in the spec at all.** Resolved as a separate `data/language.db`, not `core.db` — see §2.
2. **`lemma` column added**, not in the spec's literal schema — see §2.
3. **`step_lexicon_greek` keyed on `dStrong`, not `eStrong`** — the spec's schema comment lists both columns but doesn't say which is the join key; `eStrong` seemed like the more obvious/simpler choice but is wrong — see §2.
4. **No `strongs` table exists** — the spec's assumption that one exists "per Build 2-era bundling" doesn't hold in this codebase — see §2.
5. **TAGNT's KJV-bracket versification doesn't require the separate `Versification/TVTMS` file at parse time**, contrary to the spec's explicit instruction to use it "rather than re-deriving it by scanning for brackets." The bracket (`Php.1.16[1.17]`, etc.) is embedded directly in each affected row's own Ref field — reading it per-row is not "re-deriving by scanning," it's reading the field STEPBible defined for exactly this purpose. `TVTMS.txt` was downloaded and is available in `data/stepbible-prep/raw/` but the import script does not read it.
6. **The spec only documents Greek's `»` (forward) conjoin marker.** Real data also has `«` (backward), not rare — 6,796 occurrences vs. 13,584 of `»` in one TAGNT file alone. Both are handled via a union-find, not just `»`.
7. **34 NT + 14 OT verses receive words from more than one independent source-verse group** (documented in STEPBible's own field-description text, e.g. the KJV/NA boundary list; not called out in `Build_6_Spec.md`'s versification section). Required the `word_position`-reassignment design in §9.
8. **Hebrew's `+` marker is not always the field's last character** — a trailing punctuation-link segment can follow it. The spec's own description ("a Strong's tag ending in `+`") is literally true of the tag itself but not of the whole field, which caused an initial bug (Gen.4.22's second "Tubal-cain" not grouping) — caught and fixed via the `}+ ` pattern match instead of `endswith('+')`.
9. **14 Ketiv-only "ghost" words and 1 internal Ketiv/Qere doubled-brace anomaly** (Num.7.59 "Pedah-zur") — neither documented in the spec, both handled (skip empty rows; null any orphaned single-member `group_id`) — see §2/§9.

**What was actually exercised against the running app** (headless Chromium via Playwright throughout — none of this was taken on faith from reading the code):

- Full interlinear flow: selected Gen.1.1 (Hebrew, 7 words, no grouping) → Language tab shows verse heading, RTL running verse line, 7 gloss rows → tapped a row → word detail view shows Lemma/Transliteration/Strong's/Morphology/both glosses correctly, back button restores the interlinear view.
- Confirmed the Ezra SIL `@font-face` genuinely loads at runtime (`document.fonts` entry, `status: "loaded"` after the Hebrew verse line renders), not a silent fallback to the CSS stack's next font.
- Selected Jhn.1.1 (Greek) → verified all three "ho logos"→"the Word"/"the Word,"/"the Word." groupings and one "the God" grouping render as single collapsed rows with correctly-combined glosses, exactly matching the spec's own John 1:1 mockup; opened the grouped detail view and confirmed two stacked sections (ὁ, then λόγος) with the ὁ (G3588) TBESG lexicon entry rendering with clean bold/paragraph formatting, no visible broken HTML.
- Selected a 3-verse range (Gen.1.1–1.3) → confirmed 3 separate verse blocks, each with its own correct heading, in one interlinear render.
- Cleared selection (clicked empty reader margin) → confirmed the Language tab shows the same generic placeholder every other reference tab shows, and the previously-rendered interlinear content is gone.
- Selected Psa.3.1 (a titled psalm's first ordinary verse) → confirmed no crash and correct word rendering; the verse=0 title row itself was not separately selected in this pass (KJV's own title row is still an empty-text placeholder per `Psalm_Title_Fix_Spec.md` — see that spec's still-open sub-decision, not resolved in this build, described below).
- Opened the global settings popover → confirmed both "STEPBible-Data" and "OpenBible.info" credit links render in the Data & Attribution section.
- Zero console errors across every scenario above, except one pre-existing, unrelated one (same one documented in `BUILD_5_ACTUAL_STATE.md` §10): scripture search falling back from FTS5 to LIKE, because sql.js's WASM build doesn't support FTS5. Not a Build 6 regression.

---

## 11. THE PSALM-TITLE GLOSS DECISION — RESOLVED THIS BUILD

`Psalm_Title_Fix_Spec.md`'s last open Definition-of-Done item — whether KJV/ASV/Darby's empty verse=0 title placeholder rows should now display TAHOT's English gloss as a substitute title, once TAHOT data exists for them — was raised with Wayne once TAHOT data for all 116 titled psalms was confirmed live in `data/language.db` (real gloss text in hand, not a hypothetical — e.g. Psalm 3: "a psalm of David when fled he from before Absalom his son"). **Decided: show it.**

**`js/reader.js` is touched by this decision** — a deliberate, explicit exception to Item 3's "no reader changes" design principle (which is about not adding *word-level selection* to the reader; this is the reader substituting text for an otherwise-empty verse, a different kind of change, and one Wayne approved with the trade-off below made explicit first).

Implementation: `renderPane()` no longer skips an empty verse=0 row outright. It renders the row (initially empty) and fires `populateTitleGloss(el, textSpan, verseId)` (fire-and-forget, async) — which calls `getOriginalWordsForVerses()`, joins the returned `gloss_contextual` values, strips STEPBible's `/` prefix/root-boundary markers (meaningful in the Language tab's per-word context, just visual noise in a title line — "of/ David" → "of David"), and sets the text once resolved. If no gloss comes back, the row removes itself — the row is never left as a stray empty clickable line, matching the prior behavior's spirit.

**Real consequence, stated plainly:** this means `data/language.db` (51.3MB) is no longer load-bearing only for the Language tab. Any KJV/ASV/Darby-pane view of a chapter containing one of the 116 titled psalms now triggers `getLanguageDb()` on first occurrence — likely *earlier* in a typical session than a deliberate Language-tab open, since Psalms is commonly read and KJV is the default translation/pane. This is a one-time cost per install, not per session: `loadLanguageBuffer()`'s OPFS-seed-on-first-fetch means every load after the first (whether triggered by a Psalm title or the Language tab) reads from OPFS, not network. Not a regression of the lazy-load design's intent (avoid unconditionally paying the cost at app boot for everyone) — just an earlier, more likely trigger than originally scoped for in §5's design rationale.

Verified live: Psalm 3 (titled) renders the substitute title, correctly cleaned of `/` markers, in a KJV pane; Psalm 1 (untitled) renders zero `.verse-title` rows, confirming the feature doesn't fire where there's no data to show. Zero console errors.

**Not further polished in this pass:** a few of the 116 titles carry STEPBible markers beyond the `/` split — `<obj.>`-style bracketed untranslated-word tags, and at least one interrogative marker rendered as a bare `¿` (Psalm 54's title) — that read a little rough as reader-visible text. Left as-is; the `/`-strip was the single highest-value, lowest-risk cleanup identified, not an exhaustive polish pass.
