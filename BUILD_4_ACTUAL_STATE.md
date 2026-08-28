# BUILD_4_ACTUAL_STATE.md — Ground-Truth Audit

> **⚠️ SNAPSHOT:** This document reflects the codebase as of 2026-08-28, after Build 4 (meta table, backup/restore, global header, global settings popover shell) shipped.
> When this document and the actual source files disagree, **the source files are correct.**
> This document supersedes `BUILD_3_ACTUAL_STATE.md`.

_Read from source files on 2026-08-28. Build_4_Spec.md was checked only to confirm scope and to note where the shipped implementation deviates from it (see §10) — not copied from. Every claim below was also exercised against the running app in headless Chromium (and, for the OPFS write path, real Firefox) before being written down; see §10 for what was specifically verified._

---

## 1. FILE STRUCTURE

```
ember/
├── index.html                        # App shell (single HTML page) — CHANGED: global ⚙/? buttons + 2 popovers
├── manifest.json                     # PWA manifest
├── sw.js                             # Service worker (unchanged; still stale — see §7)
├── CLAUDE.md                         # Claude Code project instructions
├── README.md                         # Project documentation
├── FEATURE_INVENTORY.md              # Living feature audit — CHANGED: Build 4 entries appended
├── BUILD_4_ACTUAL_STATE.md           # This document
├── BUILD_3_ACTUAL_STATE.md           # Superseded — kept for history
├── BUILD_2_ACTUAL_STATE.md           # Superseded — kept for history
├── BUILD_1_ACTUAL_STATE.md           # Superseded — kept for history
├── Build_2_Spec.md / Build_3_Spec.md / Build_4_Spec.md
├── Technical_Spec_Build_1.md, USER_MANUAL.md, LICENSE
├── .gitignore
│
├── css/
│   └── style.css                     # All styles (~2,768 lines) — CHANGED: new Global settings popover block
│
├── js/
│   ├── app.js                        # Entry point — CHANGED: +initGlobalSettings() call
│   ├── db.js                         # Database layer — CHANGED: +meta table, +exportBackup/looksLikeCoreDb/restoreCoreDb
│   ├── backup.js                     # NEW — restore-from-backup flow: file picker, validation, confirm dialog
│   ├── global-settings.js            # NEW — global settings popover: open/close + data-driven content
│   ├── usfm.js, plans.js, template-bar.js   # Unchanged since Build 3
│   ├── reader.js, selection.js, notes.js, tags.js, search.js, panels.js,
│   │   reference.js, bookmarks.js, markups.js, help.js (CHANGED: +1 entry),
│   │   popover-registry.js, reader-settings.js, notes-settings.js,
│   │   reference-settings.js, state.js, storage-worker.js  # otherwise unchanged
│   └── vendor/
│       ├── sql-wasm.js
│       └── sql-wasm.wasm
│
├── data/
│   ├── core.db                       # Reference data; user tables (incl. meta) created at runtime
│   ├── plans/                        # Unchanged since Build 3
│   ├── translations/                 # Unchanged since Build 3
│   └── translations-prep/
│
├── scripts/                          # Unchanged since Build 3
├── docs/ANCHOR_QUERIES.md
├── icons/, fonts/                    # Still empty — see §7
└── build/                            # Unchanged since Build 3
```

**Confirmed via `git diff --stat` across every Build 4 commit (`d95f33a..de7f389`):** exactly 7 files touched — `css/style.css`, `index.html`, `js/app.js`, `js/backup.js` (new), `js/db.js`, `js/global-settings.js` (new), `js/help.js`. Nothing else in `js/` — `reader.js`, `notes.js`, `panels.js`, `reference.js`, `plans.js`, `template-bar.js`, etc. — was touched. `reader-settings.js`/`notes-settings.js`/`reference-settings.js` were deliberately left alone, per Build 4's explicit out-of-scope list (no migration into the global popover yet).

**New in Build 4:** `js/backup.js`, `js/global-settings.js`, `BUILD_4_ACTUAL_STATE.md`. Nothing was removed. (Two pieces of temporary console/DOM scaffolding — `window.emberDebug.exportBackup`/`.restoreFromBackup` hooks and a floating "TEMP: Restore Backup" button — existed transiently mid-build for manual verification before Item 4/5 UI existed, and were removed once the real buttons landed. The current `app.js` has no trace of them; confirmed by grep.)

---

## 2. DATABASE SCHEMA

Still a single database file, `data/core.db` — no separate `user.db`. Build 4 adds exactly one new table.

### `meta` — NEW this build

```sql
CREATE TABLE IF NOT EXISTS meta (
    schema_version INTEGER NOT NULL,
    created_at     INTEGER NOT NULL,
    app_name       TEXT NOT NULL DEFAULT 'Ember Bible Study'
);
```

Single-row table, created idempotently by `db.js:ensureMetaTable()`, called at the end of `createUserTables()` (right after `migratePlanTables()`). `schema_version = 1`, `created_at` = unix timestamp set once at first creation, `app_name = 'Ember Bible Study'`.

**Not a naive `CREATE TABLE IF NOT EXISTS` + unconditional insert** — the function checks `SELECT COUNT(*) FROM meta` and only inserts when the table is empty, so re-running `createUserTables()` on every boot never resets `created_at`. Verified empirically (see §10): running the boot logic twice in a row left `created_at` byte-identical both times.

**Persistence wrinkle, and why `ensureMetaTable()` handles it differently from `migratePlanTables()`:** `createUserTables()` itself never calls `saveToStorage()` — every other schema-migration function in it (`migratePlanTables()` included) relies on some *later* write happening in the same boot (e.g. `seedBundledPlans()` inserting a plan) to actually persist the DDL to OPFS/IndexedDB. That's fine for `migratePlanTables()`, whose `CREATE TABLE IF NOT EXISTS` is naturally idempotent even if it takes an extra boot cycle to reach disk. It is *not* fine for `meta`'s one-time row: on an upgrade boot where plans and translations are already seeded, nothing else may write that session, and if the INSERT is never persisted, the next boot would find no `meta` row on disk and insert a *fresh* `created_at` — silently violating "never updated." `ensureMetaTable()` therefore calls `saveToStorage(db.export())` itself, immediately after the one-time INSERT, independent of whatever else happens that boot.

Confirmed identical to `translations`' `meta` table in *name only* — that one is a key/value table (`key TEXT PRIMARY KEY, value TEXT NOT NULL`) built by `scripts/build_translation.py`, lives in each `data/translations/*.db` file, and is unrelated to `core.db`'s `meta`.

### Every other table — unchanged from Build 3

`books`, `translations`, `cross_references`, `topics`, `topic_verses` (reference); `studies`, `notes`, `notes_fts`, `note_anchors`, `tags`, `tag_assignments`, `bookmarks`, `markups`, `app_state`, `plans`, `plan_days`, `plan_day_scripture` (user data) — see `BUILD_3_ACTUAL_STATE.md` §2 for full DDL; Build 4 touched none of it.

### Export scope (confirmed against a real exported file, not assumed)

`exportBackup()` (db.js) calls `db.export()` with no filtering — the downloaded file is a byte-for-byte serialization of the whole live database. Opened one such export with `sqlite3` during verification: it contained every table above (23 tables total, including FTS4's shadow tables `notes_fts_docsize`/`notes_fts_segdir`/`notes_fts_segments`/`notes_fts_stat` and `sqlite_sequence`), passed `PRAGMA integrity_check` → `ok`, and its `meta` row matched the live app's.

---

## 3. MODULE MAP

### `js/db.js` — Database Layer (CHANGED)

**New exports:**
- `exportBackup()` — serializes the current `db` via `db.export()`, wraps it in a `Blob` (`application/octet-stream`), builds `ember-backup-YYYY-MM-DD-HHmm.db` from local time (zero-padded), and triggers a download via a synthetic `<a download>` click. No network request, no page navigation.
- `looksLikeCoreDb(bytes)` — opens `bytes` as a **throwaway** sql.js `Database` (never assigned to the module's live `db`), checks for a `books` table via `sqlite_master`, returns a boolean. Never throws — any parse failure (wrong file type, corrupt file, not SQLite at all) is caught and treated as `false`. Always `.close()`s the throwaway instance in a `finally` block.
- `restoreCoreDb(bytes)` — `async`, destructively overwrites the stored `core.db`. If OPFS is available (`'storage' in navigator && 'getDirectory' in navigator.storage`), it commits to OPFS and does **not** fall back to IndexedDB on failure (see §2 and §10 for why — this is a deliberate asymmetry with `saveToStorage()`'s tolerant fallback). Only uses IndexedDB when OPFS isn't available as a platform feature at all. Returns a rejecting `Promise` on any failure, unlike the fire-and-forget `saveToStorage()`.

**New internal:** `ensureMetaTable()` (private, called from `createUserTables()`) — see §2. `_SQL` (new module-level variable) caches the sql.js module handle returned by `window.initSqlJs()` in `initDatabase()`, so `looksLikeCoreDb()` can construct throwaway `Database` instances without re-fetching/re-instantiating the WASM module on every restore attempt.

**Everything else in db.js (Build 1–3 exports, `_translationDbs`, `getChapter()`, `search()`, all the reading-plans functions, etc.) — unchanged.** Re-checked against `BUILD_3_ACTUAL_STATE.md`'s module map; still accurate.

---

### `js/backup.js` — Restore-from-Backup Flow — NEW

**Imports:** `looksLikeCoreDb`, `restoreCoreDb` (db.js).

**Exports:** `restoreFromBackup()`.

**Summary:** `restoreFromBackup()` creates a hidden `<input type="file" accept=".db">`, appends it to `document.body`, and clicks it. On `change`: reads the selected file's bytes, removes the temporary input element, validates via `looksLikeCoreDb()` (invalid → `alert()` and stop, no dialog shown), then awaits a confirmation dialog (`openRestoreConfirmDialog()`, private), then on confirm calls `restoreCoreDb(bytes)` and — only on success — `window.location.reload()`. Any failure at the read, validate, or write step shows a distinct `alert()` and leaves the current database untouched; the function never partially completes. Also listens for the file input's `cancel` event (fired by modern browsers when the native picker is dismissed with no selection) to clean up the temporary `<input>` element rather than leaking it into the DOM.

`openRestoreConfirmDialog()` (private) is built exactly the way `plans.js`'s `openConfirmDialog()` is — DOM nodes (`document.createElement`) and `.textContent` assignments only, no `innerHTML` anywhere — and reuses `plans.js`'s existing `.plan-metadata-overlay`/`.plan-metadata-dialog`/`.plan-metadata-actions`/`.plan-metadata-cancel`/`.plan-metadata-confirm` CSS classes (plus the `.danger` modifier already used for other destructive confirms in `plans.js`) rather than inventing new dialog styling. Resolves `true`/`false`; closes and resolves `false` on Cancel click, Escape, or backdrop click.

**Why this is a separate module from db.js, and why export didn't get the same treatment:** export is a thin, UI-free wrapper directly around `db.export()`, so it lives in db.js per the original Item 2 instruction. Restore fundamentally needs a file picker and a confirmation dialog — UI concerns — so `backup.js` owns those and calls into db.js only for the two things that are genuinely data-layer: structural validation and the destructive write. This mirrors how `plans.js` owns its own confirm dialogs and calls into db.js purely for data operations (`insertPlan`, `deletePlan`, etc.).

---

### `js/global-settings.js` — Global Settings Popover — NEW

**Imports:** `registerPopover`, `closeAllPopovers` (popover-registry.js); `exportBackup` (db.js); `restoreFromBackup` (backup.js).

**Exports:** `initGlobalSettings()`.

**Module-level `SECTIONS` array** — the single source of truth for the popover's content: `[{ id: 'backup-restore', title: 'Backup & Restore', render(container) {...} }]`. `render()` builds the section's body (a `<p class="settings-section-desc">` plus a `<div class="settings-section-actions">` containing the two buttons) directly with `document.createElement`.

**`initGlobalSettings()`:** grabs `#global-settings-btn`/`#global-settings-popover`, calls `buildPopoverContent(popover)` once to populate it, then wires the same open/close skeleton every other settings popover uses (`registerPopover`, click-to-toggle with `closeAllPopovers()` first, `stopPropagation` on clicks inside, outside-click/Escape to close) — copied from `reader-settings.js`'s structure with the font-size-specific logic removed.

**`buildPopoverContent(popover)`:** builds, in order: an `<h2 class="settings-popover-title">Settings</h2>`, a `.settings-divider`, a `<nav class="settings-toc">` (a `<p>On this page:</p>` plus a `<ul>` with one `<li><a>` per entry in `SECTIONS` — each link's click handler calls `preventDefault()` and `scrollIntoView({behavior:'smooth', block:'start'})` on the target section rather than navigating), another `.settings-divider`, then for each `SECTIONS` entry: a `<section class="settings-section" id="global-settings-section-{id}">` containing an `<h3 class="settings-section-title">`, a `.settings-divider`, and whatever `section.render()` appends.

**Reused vs. new CSS:** the popover container itself is `.help-popover` (same class every other popover uses — same box/shadow/border/z-index, no override beyond a `max-width: 320px` bump). Everything inside it (`.settings-popover-title`, `.settings-divider`, `.settings-toc*`, `.settings-section*`, `.settings-action-btn`) is new, purpose-built CSS in `style.css`'s new "Global settings popover" block (style.css:1188 onward) — except the action buttons' color treatment, which copies the existing accent/danger button pattern already established by `.plan-import-btn` and `.plan-metadata-confirm.danger` rather than inventing a third variant.

---

### `js/help.js` — CHANGED (one new entry, zero new logic)

Its `entries` array (previously reader/notes/reference) gained a fourth object: `{ btn: document.getElementById('global-help-btn'), popover: document.getElementById('global-help-popover') }`. Every other line in the file — `registerPopover`, the click-to-toggle handler, outside-click, Escape, the `.help-more-link` no-op wiring — is unchanged and now simply iterates over 4 entries instead of 3. This is the entire implementation of Item 4's global `?` button; no new functions were needed.

---

### `js/app.js` — Entry Point (CHANGED)

Net diff from Build 3: one new import (`initGlobalSettings` from `./global-settings.js`) and one new call (`initGlobalSettings();`) added to the fixed `init*()` sequence, right after `initTemplateBar()`. `exportBackup`/`restoreFromBackup` are **not** imported here — `global-settings.js` imports them directly, since app.js no longer needs them once the real UI (Item 5) replaced the temporary console/button hooks used for manual verification during Items 2–4.

---

### `index.html` — CHANGED

Two buttons added to `#search-bar`, after the existing `#theme-toggle`: `#global-help-btn` (class `panel-help-btn`) and `#global-settings-btn` (class `panel-settings-btn`) — reusing the exact classes the notes/reference panel headers already use, not new markup-specific styling. Two new popover containers added alongside the other four: `#global-help-popover` (class `help-popover`, static placeholder `<p class="help-popover-lead">` content) and `#global-settings-popover` (class `help-popover`, starts empty — `global-settings.js` populates it at init time via `buildPopoverContent()`, it is not static markup).

---

### Every other module (`reader.js`, `selection.js`, `notes.js`, `tags.js`, `search.js`, `panels.js`, `reference.js`, `bookmarks.js`, `markups.js`, `popover-registry.js`, `reader-settings.js`, `notes-settings.js`, `reference-settings.js`, `state.js`, `storage-worker.js`, `usfm.js`, `plans.js`, `template-bar.js`)

**No changes this build** — confirmed via `git diff --stat` across the full Build 4 commit range (§1). Behavior matches `BUILD_3_ACTUAL_STATE.md`'s descriptions exactly.

---

## 4. MODULE DEPENDENCIES

```
app.js
  → db.js (no imports except usfm.js)
  → ...(all Build 1–3 dependencies, unchanged — see BUILD_3_ACTUAL_STATE.md §4)
  → global-settings.js → popover-registry.js, db.js, backup.js     [NEW]

backup.js → db.js                                                  [NEW]

help.js → popover-registry.js                                      [unchanged — now serves 4 entries instead of 3]

db.js → usfm.js                                                    [unchanged]
```

**No circular dependencies.** `global-settings.js` importing both `db.js` (`exportBackup`) and `backup.js` (`restoreFromBackup`) — while `backup.js` itself only imports `db.js` — keeps the dependency graph a strict DAG: `global-settings.js` sits one layer above `backup.js`, the same relationship `plans.js`→`template-bar.js` established in Build 3 (a UI module that orchestrates calls into a lower-level module, never the reverse).

---

## 5. DATA FLOW

### Boot Sequence — one addition

Unchanged from Build 3 (`BUILD_3_ACTUAL_STATE.md` §5) except:
- Step 3 (`createUserTables()`) now ends with `ensureMetaTable()` after `migratePlanTables()` — see §2 for its idempotency and persistence behavior.
- Step "a" (loading the sql.js WASM module) now also caches the returned module as `_SQL` at module scope in db.js, for reuse by `looksLikeCoreDb()`.
- Step 4 (`init*()` calls) gained `initGlobalSettings()`, appended after `initTemplateBar()`.

### Manual Export (not part of boot)

User clicks "Export Backup" in the global settings popover → `exportBackup()` (db.js) → `db.export()` (synchronous, same primitive every write already uses) → `Blob` → synthetic anchor click → browser download dialog. Does not touch OPFS/IndexedDB, does not call `saveToStorage()`, does not reload the page. The live in-memory `db` and any open UI state are completely unaffected.

### Manual Restore (not part of boot, but ends by re-entering it)

User clicks "Restore from Backup" → `restoreFromBackup()` (backup.js) opens a native `.db` file picker → on selection, `looksLikeCoreDb()` (db.js) validates the bytes against a **throwaway** sql.js `Database` (the live `db` is never touched at this stage) → on a valid file, `openRestoreConfirmDialog()` (backup.js, private) awaits a Cancel/Restore decision → on Restore, `restoreCoreDb(bytes)` (db.js) writes the bytes over the stored `core.db` (OPFS, or IndexedDB only if OPFS isn't available as a platform feature — see §2/§3) → on success, `window.location.reload()` re-enters the boot sequence above, which calls `initDatabase()` fresh and reads back exactly the bytes just written. On Cancel, or on any failure at any step, none of `restoreCoreDb()`/`reload()` runs — the live `db` and stored `core.db` are both left exactly as they were.

### Persistence on Write — unchanged, with one deliberate carve-out

The Build 2/3 mechanism (`db.export()` → `saveToStorage()` → Web Worker → OPFS or IndexedDB fallback) is unchanged for every ordinary write. `restoreCoreDb()` is the one write path in the app that does **not** go through `storage-worker.js` and does **not** use its tolerant OPFS→IndexedDB fallback — see §2/§3 for why a destructive restore specifically needs to reject rather than silently substitute a different storage backend on partial failure.

---

## 6. CUSTOM EVENTS

Unchanged from Build 3 — Build 4 added no new `CustomEvent` types. All Build 4 interactions (export, restore, global popover open/close) are direct function calls and native DOM events (`click`, `change`, `cancel`, `keydown`), not the app's `selection-changed`/`study-changed`/`pane-changed` pattern.

| Event | Emitter | Detail | Listeners |
|-------|---------|--------|-----------|
| `selection-changed` | selection.js | `{ verseIds: [...], element: verseEl\|null }` | notes.js, reference.js, bookmarks.js, reference-settings.js |
| `study-changed` | panels.js | `{ studyId }` | notes.js |
| `pane-changed` | reader.js (`setActivePane`) | `{ paneId }` | selection.js |

---

## 7. WHAT'S WIRED vs. STUBBED

### Fully Functional — NEW in Build 4

- **`meta` table** — created idempotently on both fresh installs and existing pre-Build-4 databases; row never resets on subsequent boots.
- **Export Backup** — produces a valid, restorable, correctly-named `.db` file containing the entire live database (verified with `sqlite3 PRAGMA integrity_check` → `ok` against a real export).
- **Restore from Backup** — file picker, structural validation, confirm dialog, destructive write, reload, all verified working; Cancel and every failure path leave the existing database completely untouched (verified by re-reading data after a cancelled attempt and after simulated write failures — see §10).
- **Global header ⚙/? buttons** — visually identical (28×28, same hover) to the per-panel header buttons, confirmed by measuring both in-browser.
- **Global help popover** — placeholder content, shares `help.js`'s existing popover-closing mechanics with the other three.
- **Global settings popover** — ToC + Backup & Restore section, data-driven, both buttons live-wired.

### Fully Functional — Build 1–3 (unchanged, not re-audited line-by-line here)

See `BUILD_3_ACTUAL_STATE.md` §7 — nothing in that list was touched by Build 4.

### Partially Wired / Incomplete — unchanged from Build 3, plus one new deliberate deferral

- **Reference → Language tab**, **Study Templates sub-tab**, **devotional content columns**, **simultaneous "active" plans**, **`sw.js`'s stale `PRECACHE` list** — all unchanged from Build 3; see `BUILD_3_ACTUAL_STATE.md` §7 for details. `sw.js`'s precache list is now stale in one more way: it doesn't list `backup.js` or `global-settings.js` either, on top of the Build 2/3 gaps already documented. Doesn't break offline use in practice for the same reason already noted there (cache-first-with-fallback catches anything fetched at least once online).
- **reader-settings.js / notes-settings.js / reference-settings.js content is NOT migrated into the global settings popover** — explicitly out of scope for Build 4 per the spec; each panel keeps its own `⚙` popover with its own font-size/default-tab controls. The global popover's `SECTIONS` array structure is built to make that migration additive (future builds add a `{id, title, render}` entry per panel) rather than a rewrite, but no such entry exists yet.

### Schema Tables with No Runtime Code — unchanged from Build 3

See `BUILD_3_ACTUAL_STATE.md` §7. Build 4 added no new dead schema.

### Other

- **`js/state.js`** — still fully implemented, still unused. Unchanged.
- **`manifest.json`** — still references icon files that don't exist on disk. Unchanged.
- **PWA install prompt** — still DOM+styles only, no `beforeinstallprompt` handler. Unchanged.

---

## 8. VERSE ID CONVENTION

Unchanged. Build 4 touched no verse-ID logic anywhere — `meta`, export, and restore all operate on the database as an opaque byte blob or via table-existence checks, never on individual verse rows. See `BUILD_3_ACTUAL_STATE.md` §8.

---

## 9. GLOBAL SETTINGS POPOVER — Content Model (new in Build 4, documented because it isn't obvious from the DOM alone)

The popover's DOM is **entirely generated**, not authored in `index.html` — `#global-settings-popover` ships as an empty `<div class="help-popover hidden">` and `global-settings.js:buildPopoverContent()` populates it once, at `initGlobalSettings()` time, from the module-level `SECTIONS` array.

**Why this matters for anyone extending this code:** adding a new section in a future build means adding one `{ id, title, render(container) }` object to `SECTIONS` — the title, its divider, and its ToC entry are all handled generically by `buildPopoverContent()`'s loop. Nothing about the ToC or the section-title-plus-divider pattern is specific to "Backup & Restore"; that section's identity lives entirely inside its own `render()` function. The three `.settings-divider` instances (after the popover title, after the ToC, under each section's title) are all the same CSS class for exactly this reason — a future section reuses the pattern by construction, not by copy-pasting a one-off rule.

**Content is built once, not on every open.** `buildPopoverContent()` runs a single time during `initGlobalSettings()`; opening/closing the popover afterward only toggles the `.hidden` class via `openPopover()`/`closePopover()`. This matches every other popover in the app (reader/notes/reference settings and help are all static markup toggled the same way) — the only difference here is that the markup itself is generated once at startup instead of being written by hand in `index.html`.

---

## 10. DEVIATIONS FROM Build_4_Spec.md, AND WHAT WAS ACTUALLY VERIFIED

Per this document's own ground rule (code is truth over spec), two places where the shipped implementation is deliberately more specific than a literal reading of the spec:

1. **Restore's OPFS/IndexedDB fallback (Item 3).** The spec says to "write the file's bytes to OPFS (or IndexedDB fallback) in place of the current core.db," which could be read as reusing `storage-worker.js`'s tolerant fallback-on-any-failure behavior. The shipped `restoreCoreDb()` deliberately does **not** do that: it only uses IndexedDB when OPFS isn't available as a platform feature at all, and lets any failure *during* an OPFS write reject outright rather than silently retrying in IndexedDB. Reason: `createWritable()` truncates its target immediately, so a failure partway through an OPFS write (quota exceeded, transient error) can leave a truncated `core.db` sitting in OPFS — and `loadFromStorage()` always checks OPFS first on the next boot, so a "successful" IndexedDB fallback in that scenario would be silently shadowed by the truncated OPFS file on reload. This was caught by an advisor review mid-build (an earlier version of `restoreCoreDb()` did fall back), fixed, and specifically re-verified (see below) before being called done.

2. **Section divider placement (Item 5).** `Build_4_Spec.md`'s prose says each section has "a title and a page-width horizontal divider **above** it," but its own worked diagram shows the divider directly *below* the section title, functioning as an underline before the body content. The shipped implementation follows the diagram (title, then divider, then body) since that's the unambiguous, concrete example — and it's the same order used for the divider between the popover's own title and its ToC.

**What was actually exercised against the running app** (headless Chromium via Playwright throughout; Firefox specifically for the OPFS-on-main-thread claim below — none of this was taken on faith from reading the code):

- Fresh-install and upgrade-boot paths for `ensureMetaTable()`, both via direct SQL against copies of `data/core.db` and via the real app.
- A full export → add-marker-data → restore-back-to-clean-export cycle, confirming the marker data is gone after restore (proves the restore actually replaced storage, not just reloaded the same data).
- Cancel at the confirm dialog, followed by a manual reload, confirming zero bytes were written.
- An invalid file (plain text renamed `.db`) rejected before any confirm dialog is shown.
- A simulated total storage failure (both OPFS and IndexedDB broken) — confirmed a clear alert and no reload.
- A simulated **partial** OPFS failure (`write()` throws after `createWritable()` already truncated the file, IndexedDB left healthy) — confirmed `restoreCoreDb()` rejects rather than silently succeeding via IndexedDB, and that pre-restore data survives a subsequent real reload. This is the specific scenario deviation #1 above exists to prevent.
- The restore flow's main-thread `createWritable()` call actually working in real Firefox (via Playwright's Firefox build), not just Chromium — `storage-worker.js` had only ever exercised this API inside a Worker before Build 4, so this was new ground worth checking directly rather than assuming API parity.
- Global header button sizing measured pixel-for-pixel equal to the per-panel buttons' bounding boxes.
- Full settings-popover structural checks (title text, ToC entry count/text, section count, divider count, description text, button labels/order) plus outside-click and Escape close behavior.
- A final post-cleanup pass confirming no leftover `emberDebug` debug hooks or temporary DOM elements remain, and that the entire export→restore cycle still works end-to-end through the real, final popover buttons (not the temporary scaffolding used mid-build).
