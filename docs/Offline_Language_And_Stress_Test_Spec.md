# Ember Bible Study — Offline Language Data + Longevity Stress Test

**Purpose:** Close the one remaining hole in offline-first (original-language data that has never been downloaded), and measure how Ember behaves when a user's data has grown for decades, before any architecture decisions are made about it.

**Prerequisite:** Build 6.1 state (`BUILD_6.1_ACTUAL_STATE.md`), including the §11 addendum. `tests/verify.py` harness in place.

**Status:** Implemented 2026-11-04, in commit `5ec380c`. `OFFLINE_LANGUAGE_REPORT.md` records what was found and every way the code differed from this spec, and `STRESS_TEST_RESULTS.md` has the numbers. Wayne then chose fixes from those results (search index, empty-file holes in translations and `core.db`, anchor lookups, write buffers, persistent storage), which are in `72a0102`.

**Shape of this work:** Item 1 is a fix. Item 2 is **measurement only** — it produces numbers and a short results document, not code changes to the app. Item 3 is a small, separable check.

**Ground rule (as always):** codebase over documentation. If anything below disagrees with the code, the code wins — report the difference, don't force the spec.

---

## Background (what we believe is true today — verify first)

- `language.db` (~57 MB) is loaded lazily by `getLanguageDb()` → `loadLanguageBuffer()` in `db.js`: OPFS first, network fallback, copied into OPFS on first successful fetch.
- First use is triggered by opening the Language tab **or** by rendering a titled Psalm in KJV/ASV/Darby (Psalm-title gloss substitution, Build 6 §11).
- Since `94ca0fa`, `sw.js` passes every `/data/` request straight to the network and never caches it.
- Translations are different: `seedTranslations()` downloads all six at first boot, so they are on the device before the app is usable.
- **Consequence:** a user who boots once online, then goes offline before ever opening the Language tab or a titled Psalm, has no `language.db` anywhere. The Language tab cannot work. What the user actually *sees* in that case is undocumented.
- `core.db` is ~23 MB and holds both reference data (cross-references, Nave's topics, books) and all user data. Every write — every note autosave, every settings click — serializes the whole file with `db.export()` and hands it to `storage-worker.js` (`BUILD_6.1_ACTUAL_STATE.md` §10).

---

## Implementation Order

1. **Item 1a** — Reproduce and record the current offline failure (no code changes)
2. **Item 1b** — Background download of `language.db`
3. **Item 1c** — Friendly failure state in the Language tab and Psalm titles
4. **Item 1d** — `tests/verify.py offline` scenario
5. **Item 2** — Stress-test data generator, measurement harness, results document
6. **Item 3** — Persistent-storage check

Each item should be demo-able (or, for Item 2, have numbers) before moving on.

---

## Item 1a: Reproduce the Current Behavior

Before changing anything, record exactly what happens today. Using Playwright with a fresh profile, booting via `127.0.0.1` so the service worker installs (same as the `sw` scenario):

1. Boot online, wait for the app to be live. Do **not** open the Language tab or any Psalm.
2. Go offline (`context.set_offline(True)`), reload.
3. Select John 1:1, open the Language tab. Record what renders and every console message.
4. Navigate the KJV pane to Psalm 3. Record what renders for the title row and every console message.
5. Go back online **without reloading**. Select a verse again. Does the Language tab recover, or is a failed promise cached for the rest of the session?

Write the findings into the implementation report. Step 5 matters: if `getLanguageDb()` caches a *rejected* promise, the tab stays broken until reload even after the network returns, and Item 1b must fix that.

### Definition of Done (Item 1a)
- [x] Current behavior for steps 3–5 documented, with console output, before any code changes

---

## Item 1b: Background Download

**Goal:** within a minute or so of first launch, `language.db` is on the device, without slowing startup and without loading 57 MB into memory for users who never open the Language tab.

**Behavior:**
- After the app is live (loading screen hidden, reader rendered), if `language.db` is not already in OPFS and the browser reports being online, start a background download into OPFS. Use an idle callback or a short delay so it never competes with first render.
- **Download ≠ open.** The background step only puts the file on disk. It must not create a sql.js `Database` from it. `getLanguageDb()` still opens it lazily on first real use. (Opening it eagerly would cost ~57 MB+ of memory for every user, every session — the exact thing the lazy design exists to avoid.)
- **One download, never two.** If the user opens the Language tab (or a titled Psalm) while the background download is in flight, `getLanguageDb()` waits for that download rather than starting a second fetch.
- **Failures are retryable.** A failed download must not leave a rejected promise cached forever. If offline at boot or the download fails, retry once when the browser fires `online`. A later Language-tab use should also be able to try again.
- **No truncated files.** An interrupted download (tab closed, network dropped mid-transfer) must never leave a partial `language.db` in OPFS that a later boot treats as complete. Acceptable approaches, CC's choice: write to a temporary name and rename on completion; or validate on load (opens cleanly and contains `original_words`) and delete-and-refetch if it doesn't. Document which was chosen and why.
- **Memory during download:** prefer streaming the response into the OPFS writable over buffering the whole 57 MB in memory first, if it's straightforward. If not, buffering is acceptable — report the choice.
- The existing OPFS-first load path, the Psalm-title path, and everything the Language tab already does are otherwise unchanged.

**Out of scope:** browsers without OPFS. Where `language.db` lives (if anywhere) when OPFS is unavailable is a question for the separate OPFS-fallback test. Note what the code does today in the report, don't fix it here.

### Definition of Done (Item 1b)
- [x] Fresh install, online: `language.db` appears in OPFS shortly after launch without the Language tab ever being opened
- [x] Startup time to "app live" is not measurably worse than before (measure both)
- [x] No sql.js `Database` is created for `language.db` until first real use
- [x] Opening the Language tab mid-download waits for it — exactly one network request for `language.db` (assert via request log)
- [x] Offline at boot → going online later triggers the download without a reload
- [x] An interrupted download never results in a broken Language tab on a later boot

---

## Item 1c: Friendly Failure State

When `language.db` is unavailable and can't be downloaded right now:

- **Language tab** shows a calm, plain message instead of an empty panel or a console error. Suggested copy (adjust to the existing tone):
  > Original-language data downloads the first time Ember is online. Connect once and it stays on this device for good.
- If the download is **in progress** when the tab is opened, show a short "Downloading original-language data…" state instead, then render normally when it finishes.
- **Psalm titles:** if the gloss can't be loaded, the title row simply shows nothing extra. No crash, no error in the console (warnings are fine), and the rest of the chapter renders normally.
- When the data becomes available (download completes, network returns), the next selection renders normally — no reload required.

### Definition of Done (Item 1c)
- [x] Offline-and-never-downloaded: Language tab shows the message, zero console errors (one `console.warn` acceptable)
- [x] Mid-download: the "downloading" state shows, then the tab renders when the download finishes
- [x] Psalm 3 in KJV renders cleanly with or without language data
- [x] `USER_MANUAL.md` notes that original-language data downloads once in the background after first launch
- [x] `README.md` "Running Locally" sentence about first-visit loading is accurate
- [x] `FEATURE_INVENTORY.md` updated

---

## Item 1d: `tests/verify.py offline` Scenario

New scenario, fresh profile, booted via `127.0.0.1`:

1. **Happy path:** boot online; wait until `language.db` is in OPFS (poll OPFS or expose a small debug signal — CC's choice); go offline; reload; Language tab renders John 1:1 (Greek) and Genesis 1:1 (Hebrew); KJV Psalm 3 shows its gloss title.
2. **Never downloaded:** fresh profile; block `**/data/language.db` with `page.route(...).abort()`; boot; Language tab shows the Item 1c message; Psalm 3 renders; no console errors.
3. **Recovery:** continuing from 2, unblock the route and fire the online path; the next selection renders the Language tab without reload.
4. **Single download:** fresh profile; open the Language tab immediately after boot; assert exactly one request for `language.db`.

All existing scenarios (`popovers`, `smoke`, `notes`, `indicators`, `sw`) still pass. The `sw` scenario's "no `/data/` path in any cache" assertion still holds — this fix uses OPFS, not Cache Storage.

### Definition of Done (Item 1d)
- [x] `offline` scenario added and passing
- [x] All existing scenarios passing
- [x] Scenario listed in `README.md` "Verifying Changes"

---

## Item 2: Longevity Stress Test (Measurement Only)

**Question to answer:** if one person uses Ember seriously for 40 years, does it stay fast and stable? Where does it start to hurt, and why?

**Not in scope:** fixing anything found. Results go into a document; remedies are a separate decision.

### 2.1 Growth profiles

Generate user data at **1, 10, 25, and 40 years**. Put the rates as named constants at the top of the generator so they can be changed. Starting assumptions (a heavy, consistent user):

| Item | Rate | ≈ 40 years |
|---|---|---|
| Notes | 15 / week, body avg ~1,500 chars (vary 50–8,000) | ~31,000 |
| Anchors per note | avg 2 (mix of single verses and ranges) | ~62,000 |
| Tags | vocabulary grows to ~2,000; avg 3 per note | ~94,000 assignments |
| Studies | 1 every 2 weeks | ~1,000 |
| Markups | 10 / week | ~21,000 |
| Bookmarks | 2 / month | ~1,000 |
| Reading plans | 1 completed per year | 40 plans of progress |

Also include a few **hot spots** real use creates: one verse (John 3:16) with ~300 notes anchored to it, one chapter (Psalm 119) with markups on most verses, one study with ~2,000 notes.

**Note text:** build bodies from real KJV vocabulary (sampled words/phrases), not random characters, so the FTS4 index is realistically sized. Plant a few known unique tokens for search checks.

### 2.2 How to generate

Per-note generation through the live app is too slow (every write exports the whole database). Recommended approach:

- `scripts/gen_stress_data.py` copies `data/core.db`, inserts the generated rows with Python's `sqlite3` **using the exact schema the app creates** (`createUserTables()` and migrations — including `notes_fts` as FTS4, `meta`, and any triggers/side tables the app relies on), and writes `stress-1y.db`, `stress-10y.db`, etc.
- Load each one into the app **through the real Restore flow**. This also tests restore at scale.
- Before measuring, confirm the generated file looks real: `looksLikeCoreDb()` accepts it, `PRAGMA integrity_check` is `ok`, the All Studies view lists the studies, and searching a planted token finds its note.
- Generated `.db` files are gitignored.

### 2.3 What to measure

For each profile, cold boot from OPFS in a fresh tab, then:

| Measurement | How |
|---|---|
| `core.db` size on disk | file size; **plus a per-table breakdown** (reference vs. user data vs. FTS shadow tables) |
| Boot to "app live" | timestamp from navigation start to loading screen hidden |
| `db.export()` time | instrumented around the call |
| Autosave cost | type into a note to trigger ~20 autosaves; record main-thread long tasks (`PerformanceObserver('longtask')`) and time until the worker reports the write done |
| Memory | `performance.memory` (Chromium) after boot and after the autosave run |
| Notes search | FTS4 query for a common word, a rare word, a planted token |
| Scripture search | current LIKE path, unchanged — baseline only |
| Hot-spot rendering | select John 3:16 (notes panel + Info tab); render Psalm 119 (markups + indicators); open the 2,000-note study |
| All Studies view | time to render |
| Backup export | time and file size |
| Restore | time from confirm to app live again |
| Storage | `navigator.storage.estimate()` usage vs. quota |

Run each profile twice: normal speed, and with **4× CPU throttling** (Chrome DevTools Protocol `Emulation.setCPUThrottlingRate`) to stand in for a slower laptop. Record the test machine's specs in the results.

Add this as `tests/verify.py stress <profile>` or a separate `tests/stress.py` — CC's choice.

### 2.4 Proposed thresholds

These are starting points for judging the results, not hard requirements. Wayne adjusts after seeing real numbers.

| Measurement | Good | Watch | Problem |
|---|---|---|---|
| Boot to live | < 3 s | 3–8 s | > 8 s |
| Main-thread block per autosave | < 50 ms | 50–150 ms | > 150 ms (typing feels sticky) |
| Notes search | < 150 ms | 150–500 ms | > 500 ms |
| Hot-spot render | < 200 ms | 200–600 ms | > 600 ms |
| Memory after boot | < 300 MB | 300–600 MB | > 600 MB |

### 2.5 Deliverable

`STRESS_TEST_RESULTS.md`:
- The table of results, one row per profile × normal/throttled
- The per-table size breakdown — in particular, **how much of today's 23 MB that every write re-exports is reference data, not user data**
- The year at which each measurement first leaves "Good," if any
- A short list of what's causing the cost where something degrades
- **Candidate remedies, listed but not implemented** — for example: splitting user data into its own small database file so writes stop re-exporting reference data; saving less often or only on idle; a page-level storage layer such as wa-sqlite's OPFS mode (note: that would replace sql.js, a vendored-dependency change Wayne would need to weigh against the zero-dependency rule). CC should rank them by expected benefit vs. disruption, based on the numbers.

### Definition of Done (Item 2)
- [x] Generator produces 1/10/25/40-year files that pass the realism checks in 2.2
- [x] All measurements in 2.3 collected for all profiles, normal and throttled
- [x] `STRESS_TEST_RESULTS.md` written with the breakdown, the degradation points, and ranked candidate remedies
- [x] **No changes to app code** in this item (instrumentation lives in the test harness, or behind a debug flag that is off by default). The later fixes in `72a0102` are separate, by Wayne's decision.

---

## Item 3: Persistent Storage Check (Small, Separable)

Browsers can delete site data when storage runs low unless the site has been granted **persistent** storage. For an app whose job is to hold someone's notes for decades, that matters.

- Check whether Ember calls `navigator.storage.persist()` today, and what `navigator.storage.persisted()` returns in an installed PWA vs. a browser tab on Chromium.
- Report findings. **Wayne decides** whether to add a `persist()` request at first boot, and whether a lack of persistence should be shown anywhere (e.g. a line in Settings → Backup & Restore suggesting regular backups).

### Definition of Done (Item 3)
- [x] Current behavior and `persisted()` results reported (headless tab, plus one `false` from Wayne's own check, not recorded separately for the installed app and a tab)
- [x] Recommendation included in the implementation report

---

## Open Questions for Implementation

1. **Data-saver connections:** should the background download skip when `navigator.connection.saveData` is true and wait for first real use instead? Default: download anyway — it's a one-time 57 MB, and offline-first matters more. Flag if this seems wrong.
2. **Download indicator outside the Language tab:** none planned. A silent background download fits "nothing between you and the text." Revisit only if it causes confusion.
3. **Future lazily-loaded files** (a Hebrew lexicon, TFLSJ — see `claude/Hebrew_Word_Anatomy_Spec.md`, Deferred) would face the same first-run gap. If the background-download code can be written as a small general helper (file name in, OPFS file out) without extra complexity, prefer that. Don't over-generalize.

---

## Deferred / Related (not this spec)

- Full OPFS → IndexedDB fallback test, including where translations and `language.db` live without OPFS, and Safari's missing `createWritable()` on restore
- Readable export (Markdown/HTML) for long-term readability, sharing, and printing
- Any remedy the stress test recommends
