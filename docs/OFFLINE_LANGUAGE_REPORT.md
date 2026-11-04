# Offline Language Data — Implementation Report

The record for `Offline_Language_And_Stress_Test_Spec.md`, Items 1 and 3. Item 2's results are in `STRESS_TEST_RESULTS.md`.

Measured in Playwright's headless Chromium on the machine described there. Ground rule from the spec: the code wins where the two disagree. Section 4 lists every difference.

---

## 1. Item 1a: What happened before any code changed

Fresh profile, booted via `127.0.0.1` so the service worker installs, on the code at `522619a`.

| Step | What rendered | Console |
|---|---|---|
| 1. Boot online | App live | Seeding logs only, no errors |
| 2. `set_offline(True)`, reload | App live, from the service worker and OPFS | No errors (warm HTTP cache; see Finding B) |
| 3. Select John 1:1, open Language tab | "Original-language data is unavailable." | `[error] Failed to load resource: net::ERR_INTERNET_DISCONNECTED`<br>`[error] renderLanguageTab: failed to load original-language data: TypeError: Failed to fetch` |
| 4. KJV Psalm 3 | Title row gone; the 8 verses render normally | `[error] populateTitleGloss: failed to load title words: TypeError: Failed to fetch` |
| 5. Back online, no reload; select a verse, open tab | Still "Original-language data is unavailable." **0 new requests.** | `[error] renderLanguageTab: failed to load original-language data: TypeError: Failed to fetch` |

**Step 5 answers the spec's question: yes.** `getLanguageDb()` cached the rejected promise, so the tab stayed broken until a reload, with the network back and no attempt made.

### Findings the spec didn't anticipate

**A. An interrupted download left a permanently broken install.** `getFileHandle(..., { create: true })` creates an empty `language.db` immediately, and `createWritable` only swaps the data in on close. Closing the tab mid-download discards the swap file (`language.db.crswap`) and leaves a **0-byte `language.db`**. The old code treated any existing file as the database, so every later boot failed with `no such table: original_words`, and no reload could fix it.

**B. The plan and template seeders fetch on every boot.** `seedBundledPlans()` and `seedBundledTemplates()` fetch six JSON files on each boot, to find out whether each one is already installed. The `sw.js` comment said this only happened on first install. Offline with a warm HTTP cache this is invisible. With the cache cleared, an offline boot logged **6 app errors plus 6 browser errors**. Real offline users hit this once the cache expires.

**C. Any verse click loaded `language.db`.** `reference.js` `renderAll()` rendered the Language tab on every selection, whichever tab was showing. One click on Genesis 1:1 with the Info tab showing fetched the file and opened it, and renderer RSS rose about 81 MB (507→588 MB). The spec, `USER_MANUAL.md`, and `FEATURE_INVENTORY.md` all described it as waiting for the Language tab.

**D. `seedTranslations()` had the same hole as Finding A. Now fixed.** It created each file before writing and skipped any file that existed, so a tab closed during the first boot's seeding could leave an empty translation file that was never re-seeded. It now uses `isCompleteSqliteFile()`, so an empty file seeds again on the next boot. `loadTranslationBuffer()` uses the same check, so if that next boot is offline, the translation falls back to KJV rather than opening an empty database. `tests/verify.py offline` covers both.

**E. `core.db` had the same hole on a first boot. Now fixed**, more narrowly, since that file holds notes. See "Found along the way" in `STRESS_TEST_RESULTS.md`.

---

## 2. What was built

### Background download (`js/db.js`, `js/app.js`)

About 2 seconds after the loading screen hides, `startLanguageBackgroundDownload()` streams `language.db` into OPFS. It never creates a `Database`.

- **Download and open are separate.** The background step only writes to disk. Opening still waits for a real need (see below).
- **One download per tab.** `downloadToOpfs(filename, url)` keeps one in-flight promise per file, and `getLanguageDb()` joins it. It takes a filename and URL because spec open question 3 preferred a small general helper; nothing else uses it yet.
- **Failures can be retried.** The rejected promise is no longer cached, so the next use tries again. A failed background attempt, or one made while the browser reports offline, retries on the next `online` event.
- **Streaming, not buffering.** `response.body.pipeTo(writable)` was straightforward, so the 64 MB never sits in memory on its way to disk.

**Truncation: validate, with no temporary file.** The spec left the choice open. `isCompleteSqliteFile()` reads only the 100-byte SQLite header and checks the magic string, then page size × page count against the real file size. It runs in the background "already there?" check, on every load, and after every download. I chose this over a temporary name and rename because:

- It repairs installs that already have an empty or short file (Finding A). A temporary name wouldn't touch those.
- `createWritable` already discards partial data on abort or close, so the only leftover is the empty target. A rename would add a mechanism without covering a new case.
- It also catches a response that ends cleanly but short, which neither `createWritable` nor a rename would notice.
- A bad file is overwritten by the next download, so no delete step exists.

SQLite's page-count field is only meaningful when header offsets 24 and 92 match. If they ever differ, the file counts as whole rather than being re-downloaded on every boot. The shipped file passes the real check, and `verify.py offline` asserts that so a future build can't silently fall into that branch.

**Storage failures** (quota, or a browser without `createWritable`) still fall back to an in-memory fetch for the session, as before. Network failures reject, since a second fetch wouldn't help.

**Without OPFS** (out of scope per the spec, so unchanged): the background step does nothing, and `loadLanguageBuffer()` fetches `language.db` into memory on each session's first use, so the data isn't available offline.

**Known limit:** two tabs on a first run can each download. Both end with a whole file, so nothing corrupts; it just costs a second 64 MB.

### Language tab (`js/language.js`, `js/panels.js`, `js/reference.js`)

Per your decision on Finding C, `language.db` now opens only when the tab is showing.

- A selection made on another tab is recorded and costs nothing. Old rows are cleared so nothing stale can show.
- Switching to the tab renders the selected verse at once, with no second click. This also covers the "default reference tab" setting.
- A selection already rendered is left alone, so an open word card survives switching away and back.
- A failed render stays pending, so returning to the tab retries.

Two new states:
- "Downloading original-language data…" while a download is in flight, then it renders by itself.
- "Original-language data downloads the first time Ember is online. Connect once and it stays on this device for good." when it can't be loaded. If a download starts while this shows, the tab moves to the downloading state and renders by itself; otherwise the next selection recovers.

Titled Psalms in KJV/ASV/Darby still open `language.db` when rendered, because their title row needs it.

### Other changes

- **`js/reader.js`:** Psalm titles warn instead of logging an error. Removing the row on failure already matched the spec.
- **`warnLanguageUnavailable()`:** one `console.warn` per session, however many selections and titles hit it.
- **Seeders (`js/db.js`):** return early when `navigator.onLine === false`, and a network rejection is a warning. A bad HTTP status or unparseable file stays `console.error`, because that's a packaging bug `verify.py` should keep catching. Online boots still fetch all six files, so a newly bundled plan reaches existing users.
- **`sw.js`:** `CACHE_NAME` is `ember-v13` after the follow-up fixes; the comments are corrected.

### Open questions from the spec

1. **Data-saver connections:** downloads anyway, the spec's default.
2. **Indicator outside the Language tab:** none, as planned.
3. **General helper:** done, as `downloadToOpfs()`.

---

## 3. Verification

**`tests/verify.py offline`:** 62 checks, 0 failures, each part on a fresh profile. It covers the spec's four cases and also:

- both orderings of the single-request case (tab opened before the background timer, and after)
- offline at boot, then online later
- a tab really closed mid-download under network throttling
- an existing 0-byte file
- a response that ends cleanly but short
- a tab showing the message rendering by itself once a download starts, and retry on returning to the tab
- tab-switch behaviour
- an emptied translation file, online and offline

**`tests/verify.py storage`** (new, with the follow-up fixes): 34 checks, 0 failures, covering the search index after edits and its one-time repair, anchor lookups compared with a plain scan on random anchors of every shape, the worker returning buffers, empty and damaged `core.db` files, the `persist()` request and the Backup & Restore line. The `notes` scenario gained long-anchor checks, including both sides of the `LONG_ANCHOR_SPAN` limit.

Every existing scenario passes: `popovers`, `smoke`, `notes`, `indicators`, `sw`, `hebrew`.

**Do the new checks fail when they should?** Yes. Passing on the first run proves little, so I broke the new code one piece at a time in a scratch copy and re-ran the scenario. All 10 breaks were caught:

| Deliberate break | Caught by |
|---|---|
| Rejected promise stays cached | Next selection never renders (timeout) |
| No header check | "Tab closed mid-download: the next boot re-downloads it" |
| Download doesn't join one in flight | "Exactly one request" (saw 2) |
| No retry on `online` | "Recovery: the online path downloads the file" |
| Background step never runs | "`language.db` reaches OPFS without the Language tab being opened" |
| Seeders log errors again | "Offline boot, cold HTTP cache: no app console errors" |
| Hidden tab loads anyway | "A verse click on the info tab does not open it either" |
| No render on tab switch | Rows never appear (timeout) |
| Tab switch always re-renders | "Clearing the selection while hidden shows the empty state" |
| No downloading state | Message never appears (timeout) |

The follow-up fixes got the same treatment, and all 15 breaks were caught:

| Deliberate break | Caught by |
|---|---|
| `updateNote()` back to the old order | "Edited note: its old word no longer finds it" |
| No index repair | "Repair: integrity_check is ok after the next boot" |
| Repair not marked done | "Repair: marked done, so it only runs once" |
| Worker keeps its buffer | Returned buffers never arrive (timeout) |
| `persist()` with no notes | "Not requested at first boot, with no notes yet" |
| `persist()` on every call | "A second note does not ask again" |
| `persist()` even when persisted | "Never asks once already persisted" |
| Settings line never updates | "Backup & Restore line when persisted" |
| Anchor window one short | "Anchor exactly at the long-anchor limit" |
| Long anchors not searched | "Whole-Bible anchor found from first, middle and last verse" |
| Overlap misses the lower bound | "Anchor one past the long-anchor limit" |
| Translation seed trusts any file | "Empty translation file: seeded again on the next boot" |
| Translation load trusts any file | `no such table: verses` |
| Empty `core.db` trusted | App never comes up (timeout) |
| Damaged `core.db` treated as missing | It gets replaced, so "Failed to load" never shows (timeout) |

**Startup time to "app live"**, warm boot, 5 boots, median:

| | Median | Samples |
|---|---|---|
| Before (`522619a`) | 422 ms | 430, 421, 420, 422, 436 |
| After Item 1 | 421 ms | 397, 428, 424, 419, 421 |

No measurable difference. The download starts after this point, by design.

`python3 tests/verify.py boots` now takes this measurement. After the follow-up fixes I alternated 4 runs of 5 boots each against `522619a`, to keep machine noise from favouring either side. Medians were 416, 423, 392, 424 ms before and 421, 428, 425, 422 ms now. Those ranges overlap, so there's no clear difference, though a few milliseconds' cost from the extra header reads can't be ruled out.

**`dbsnapshot` / `dbcompare`** (re-run against the original snapshot after the follow-up fixes too)**:** the only two keys that differ are `created_at` timestamps on seeded rows (`bookmarkForVerse`, `search.notes[0]`), which the tool's docstring says will differ between runs. Query results are unchanged.

**Changed test, `sw`:** its "no `/data/` in any cache" check could have started passing without testing anything, because the background download may finish before the worker takes control. It now confirms the worker is in control and fetches from `/data/` through it before checking.

---

## 4. Where the spec and the code differ

| Spec | Code | What I did |
|---|---|---|
| `language.db` ~57 MB | 64,413,696 bytes (61.4 MiB), since the Hebrew anatomy rebuild | Corrected comments in `db.js` and `sw.js` |
| First use is the Language tab or a titled Psalm | Any verse click (Finding C) | Fixed, per your decision |
| Offline: "zero console errors" | The seeders broke this too (Finding B), and the browser's own `Failed to load resource` line can't be suppressed from JS | Seeders quieted. `verify.py offline` allows that one browser line, only for URLs under `/data/`; every app-originated error still fails |
| Test the offline state with `navigator.onLine` semantics | After a reload under `set_offline(True)`, `navigator.onLine` reads `true` in this harness, though it toggles correctly on a live page | The code treats only `false` as reliable: it attempts, then catches. The scenario dispatches `online` itself where needed, which spec step 3 allows |
| Poll until `language.db` is in OPFS | An empty file sits at the real name for the whole download | The test polls for the full size |
| Existing scenarios: `popovers`, `smoke`, `notes`, `indicators`, `sw` | `hebrew` also exists | Ran it too |
| `claude/Hebrew_Word_Anatomy_Spec.md` | The file is in `docs/` | Noted only |
| Generator copies `data/core.db` | It has no user tables, and its header says WAL | See `STRESS_TEST_RESULTS.md` |
| Memory via `performance.memory` | It doesn't track process memory (131 MB when RSS was 507 MB; 351 MB against 331 MB RSS at 40 years) | Both reported, thresholds judged against RSS; see `STRESS_TEST_RESULTS.md` |
| "Time until the worker reports the write done" | `storage-worker.js` reports nothing | See `STRESS_TEST_RESULTS.md` |

---

## 5. Item 3: Persistent storage

**Before this work:** Ember never called `navigator.storage.persist()`.

| Context | `persisted()` | `persist()` |
|---|---|---|
| Headless Chromium tab, fresh profile | `false` | `false` (not granted) |
| Your own check | `false` | not run |

You reported `false` from the console command, without separate results for the installed app and the tab, so I haven't recorded them separately.

**Your decision: added.**

- **The request:** `requestPersistentStorageIfDue()` asks at boot and on saving a note, once at least one note exists, and at most every 30 days while not granted. Firefox shows a prompt, which is why it waits for a first note and doesn't repeat often. Chromium decides silently and its answer can change later, for example after installing the app, which is why it asks again at all.
- **The line in Settings → Backup & Restore:** when not persisted, "Your browser may clear Ember's data if this device runs low on storage. Export a backup regularly to keep your notes safe." When persisted, it says the browser has agreed to keep the data, and that a backup still protects against a lost or failed device. It's read again each time the popover opens.
- **What to expect:** on your install, Chromium may keep answering `false` for a while. It decides by its own signals, such as installation and how much the site is used, so the request doesn't guarantee a grant. I couldn't test a real grant here, because headless Chromium always declines; the `storage` scenario simulates one to check the granted path.
