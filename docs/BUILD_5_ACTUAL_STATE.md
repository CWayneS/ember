# BUILD_5_ACTUAL_STATE.md — Ground-Truth Audit

> **⚠️ SNAPSHOT:** This document reflects the codebase as of 2026-08-29, after Build 5 (Study Templates: schema, three built-in templates, generation logic, Study Templates sub-tab UI) shipped.
> When this document and the actual source files disagree, **the source files are correct.**
> This document supersedes `BUILD_4_ACTUAL_STATE.md`.

_Read from source files on 2026-08-29. `Build_5_Spec.md` was checked only to confirm scope and to note where the shipped implementation deviates from it (see §10) — not copied from. Every claim below was also exercised against the running app in headless Chromium via Playwright before being written down; see §10 for what was specifically verified._

---

## 1. FILE STRUCTURE

```
ember/
├── index.html                        # App shell — CHANGED: Study Templates sub-tab placeholder replaced with a real list container
├── manifest.json                     # PWA manifest
├── sw.js                             # Service worker (unchanged; still stale — see §7)
├── CLAUDE.md                         # Claude Code project instructions
├── README.md                         # Project documentation
├── FEATURE_INVENTORY.md              # Living feature audit — CHANGED: Build 5 entries appended, #204 superseded
├── BUILD_5_ACTUAL_STATE.md           # This document
├── BUILD_4_ACTUAL_STATE.md           # Superseded — kept for history
├── BUILD_3_ACTUAL_STATE.md           # Superseded — kept for history
├── BUILD_2_ACTUAL_STATE.md           # Superseded — kept for history
├── BUILD_1_ACTUAL_STATE.md           # Superseded — kept for history
├── Build_2_Spec.md / Build_3_Spec.md / Build_4_Spec.md / Build_5_Spec.md
├── Technical_Spec_Build_1.md, USER_MANUAL.md, LICENSE
├── .gitignore
│
├── css/
│   └── style.css                     # All styles (~2,799 lines) — CHANGED: new `.template-card*` block
│
├── js/
│   ├── app.js                        # Entry point — CHANGED: +initStudyTemplates() call
│   ├── db.js                         # Database layer — CHANGED: +study_templates/template_steps tables, +studies.template_id/notes.template_step_id columns, +insertTemplate/seedBundledTemplates/getStudyTemplates/generateStudyFromTemplate
│   ├── study-templates.js            # NEW — Study Templates sub-tab: card list, name-dialog, generate-and-open flow
│   ├── plans.js, template-bar.js, backup.js, global-settings.js, usfm.js   # Unchanged since Build 4
│   ├── reader.js, selection.js, notes.js, tags.js, search.js, panels.js,
│   │   reference.js, bookmarks.js, markups.js, help.js,
│   │   popover-registry.js, reader-settings.js, notes-settings.js,
│   │   reference-settings.js, state.js, storage-worker.js  # otherwise unchanged
│   └── vendor/
│       ├── sql-wasm.js
│       └── sql-wasm.wasm
│
├── data/
│   ├── core.db                       # Reference data; user tables (incl. study_templates/template_steps) created at runtime
│   ├── templates/                    # NEW — inductive-study.json, word-study.json, passage-overview.json
│   ├── plans/                        # Unchanged since Build 3
│   ├── translations/                 # Unchanged since Build 3
│   └── translations-prep/
│
├── scripts/                          # Unchanged since Build 3
├── docs/ANCHOR_QUERIES.md
├── icons/, fonts/                    # Still empty — see §7
└── build/                            # Unchanged since Build 3
```

**Confirmed via `git diff --stat` across the Build 5 commit range (`a345a61..052def2`):** `Build_5_Spec.md` (added directly by the user, not part of an implementation commit), `css/style.css`, `data/templates/inductive-study.json` (new), `data/templates/passage-overview.json` (new), `data/templates/word-study.json` (new), `index.html`, `js/app.js`, `js/db.js`, `js/study-templates.js` (new) — 9 files, 610 insertions, 1 deletion. Nothing else in `js/` was touched — `reader.js`, `notes.js`, `panels.js`, `reference.js`, `plans.js`, `template-bar.js`, `backup.js`, `global-settings.js`, etc. — confirmed by grep and by the diff stat itself.

**New in Build 5:** `js/study-templates.js`, `data/templates/*.json` (3 files), `BUILD_5_ACTUAL_STATE.md`. Nothing was removed, though `index.html`'s old placeholder `<p class="ref-placeholder">Study Templates — coming in a future build...</p>` line was replaced with an empty `<div id="study-templates-list">` that `study-templates.js` populates at init.

---

## 2. DATABASE SCHEMA

Still a single database file, `data/core.db` — no separate `user.db`. Build 5 adds two new tables and two new columns on existing tables.

### `study_templates` — NEW this build

```sql
CREATE TABLE IF NOT EXISTS study_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT
);
```

### `template_steps` — NEW this build

```sql
CREATE TABLE IF NOT EXISTS template_steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    step_index  INTEGER NOT NULL,
    prompt_text TEXT NOT NULL,
    FOREIGN KEY (template_id) REFERENCES study_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_template_steps_template ON template_steps(template_id);
```

No `estimated_time`, no navigation-target field, no input-type field — deliberately thinner than the Build-1-era `session_records`/`study_templates` design in `Technical_Spec_Build_1.md`, which this build formally retires (see §11).

### `studies.template_id` / `notes.template_step_id` — NEW columns this build

```sql
ALTER TABLE studies ADD COLUMN template_id INTEGER REFERENCES study_templates(id);
ALTER TABLE notes ADD COLUMN template_step_id INTEGER REFERENCES template_steps(id);
```

Added via the same idempotent `try { db.run('ALTER TABLE ... ADD COLUMN ...') } catch (_) {}` pattern already used for `notes.position` — a no-op once the column exists, so it's safe to run on every boot. Both nullable, no default. `studies.template_id` is NULL for every freeform study; `notes.template_step_id` is NULL for every note not generated by a template step (almost all notes in the app, including freeform notes added later to a template-generated study).

**Neither declares `ON DELETE CASCADE`** — unlike `template_steps.template_id`, which does (steps are owned by their template and should die with it). This is deliberate: `studies.template_id`/`notes.template_step_id` are historical references, not live dependencies. Empirically verified under `PRAGMA foreign_keys = ON` in an isolated sql.js instance: deleting a `study_templates` row is rejected outright (`NO ACTION`, the SQLite default for an undeclared `ON DELETE` clause) rather than cascading — see §10.

### Every other table — unchanged from Build 4

`books`, `translations`, `cross_references`, `topics`, `topic_verses` (reference); `studies`, `notes`, `notes_fts`, `note_anchors`, `tags`, `tag_assignments`, `bookmarks`, `markups`, `app_state`, `meta`, `plans`, `plan_days`, `plan_day_scripture` (user data) — see `BUILD_4_ACTUAL_STATE.md` §2 for full DDL; Build 5 touched none of it.

**Dead column, worth flagging given this build's subject matter:** `notes.template_session_id` (a Build-1-era column, `REFERENCES session_records(id)`) is never populated or read anywhere in the codebase — `session_records` itself was never created by any version of `createUserTables()`, so the column's own foreign key target doesn't exist. Build 5's design principle explicitly retires the `session_records` model (see §11); this column is its last remaining trace in the live schema. Not removed in this build (out of scope — no migration work was requested), but callers should use `notes.template_step_id`, not this column, for anything template-related.

---

## 3. MODULE MAP

### `js/db.js` — Database Layer (CHANGED)

**New exports:**
- `insertTemplate(meta, steps)` — inserts one `study_templates` row (`meta: { name, description }`) plus one `template_steps` row per entry in `steps` (`{ step_index, prompt_text }`), in `step_index` order, then persists once. Throws `Error` with `.code === 'DUPLICATE_TEMPLATE_NAME'` if a template with that name already exists — `study_templates` has no separate stable-key column like `plans.plan_id`, so `name` is the dedupe key.
- `getStudyTemplates()` — returns all rows in `study_templates` (`{ id, name, description }`), ordered by `id` (seed order). No filter/sort params — only three templates exist and none is needed yet.
- `generateStudyFromTemplate(templateId, studyName)` — the Item 3 generation function. Inserts one `studies` row (`name`, `template_id`), queries `template_steps` for that template ordered by `step_index`, and inserts one `notes` row per step (`body` = that step's `prompt_text` verbatim, `study_id` = the new study, `template_step_id` = that step's id), plus a matching `notes_fts` row for each so generated notes are searchable immediately. Persists once at the end, after all inserts — no explicit SQL transaction (`BEGIN`/`COMMIT`), matching the existing convention every other multi-insert function in this file uses (`insertPlan()`, `insertTemplate()`); sql.js runs synchronously on one thread, so sequential `db.run()` calls are already atomic in practice with nothing that can partially fail. **Never reads reader selection state and never creates a `note_anchors` row** — the function's body doesn't reference `selection.js` or any verse-selection global at all, so no anchor is created regardless of what's selected when a template is started.

**New internal:**
- `BUNDLED_TEMPLATE_FILES` (module-level array, mirrors `BUNDLED_PLAN_FILES`) — `['inductive-study.json', 'word-study.json', 'passage-overview.json']`.
- `seedBundledTemplates()` (async, private) — fetches each file from `data/templates/`, calls `insertTemplate()`, and skips (via the `DUPLICATE_TEMPLATE_NAME` code) any template already seeded. Called from `initDatabase()` right after `seedBundledPlans()`. Mirrors `seedBundledPlans()`'s structure exactly, including its error handling (a fetch/parse failure on one file is logged and skipped, not fatal to the others).

**Everything else in db.js (Build 1–4 exports, `_translationDbs`, `getChapter()`, `search()`, all the reading-plans functions, backup/restore, `meta`, etc.) — unchanged.** Re-checked against `BUILD_4_ACTUAL_STATE.md`'s module map; still accurate.

---

### `js/study-templates.js` — Study Templates Sub-tab — NEW

**Imports:** `getStudyTemplates`, `generateStudyFromTemplate` (db.js); `openStudy` (panels.js).

**Exports:** `initStudyTemplates()`.

**Summary:** `initStudyTemplates()` calls `renderStudyTemplatesList()` once at startup. Unlike `plans.js`'s reading-plans list, there is no re-render-on-tab-click wiring — the three built-in templates are static for the lifetime of the app (no import/delete path exists yet), so a one-time render is sufficient and the spec explicitly says no filter/sort/import machinery is needed.

`renderStudyTemplatesList()` clears `#study-templates-list` and appends one `buildTemplateCard(template)` per row from `getStudyTemplates()`.

`buildTemplateCard(template)` builds a `.template-card` div (name + description, both `.textContent`) with a click listener on the whole card — no separate "start" sub-element, matching the plan-card interaction pattern from Build 3's Reading Plans sub-tab, simplified further here since template cards have no delete button competing for the click target.

`handleStartTemplate(template)` awaits `openStudyNameDialog(template.name)`; a `null` result (Cancel) returns immediately with nothing created. Otherwise it calls `generateStudyFromTemplate(template.id, studyName)` and passes the result straight to `openStudy(studyId, studyName)` — the exact same function the notes-tab-bar "+" new-study button already calls, so a generated study opens through the established tab-open path with zero special-casing.

`openStudyNameDialog(defaultName)` (private) — a small centered modal collecting one text field, pre-filled with the template's name. Built entirely with `document.createElement`/`.textContent` (no `innerHTML`), and deliberately reuses `plans.js`'s existing `.plan-metadata-overlay`/`.plan-metadata-dialog`/`.plan-metadata-field`/`.plan-metadata-actions`/`.plan-metadata-cancel`/`.plan-metadata-confirm` CSS classes rather than inventing a new dialog pattern — same reuse relationship `backup.js`'s `openRestoreConfirmDialog()` already established with the same classes in Build 4. Resolves the trimmed name string, or `null` on Cancel/Escape/backdrop-click. An empty/whitespace-only name is rejected silently (refocuses the input) rather than closing the dialog.

---

### `js/app.js` — Entry Point (CHANGED)

Net diff from Build 4: one new import (`initStudyTemplates` from `./study-templates.js`) and one new call (`initStudyTemplates();`), inserted between `initPlans()` and `initTemplateBar()` in the fixed `init*()` sequence.

---

### `index.html` — CHANGED

One line changed inside `#study-templates-subtab`: the static placeholder paragraph (`<p class="ref-placeholder">Study Templates — coming in a future build...</p>`) is replaced with `<div id="study-templates-list"></div>`, populated entirely by `study-templates.js` at init time — the same "empty container, JS populates it" pattern `#plans-list` already used for Reading Plans.

---

### `css/style.css` — CHANGED

New block, "Study Templates Sub-tab" (inserted just before the existing "Plan Detail Popover" block): `.template-card` (bordered, rounded, hover background — visually parallel to `.plan-card` but without the flex/delete-button layout, since template cards have no delete affordance), `.template-card-title` (bold, `--font-display`), `.template-card-description` (`--text-muted`, `--size-xs`). No changes to any existing rule.

---

### Every other module (`reader.js`, `selection.js`, `notes.js`, `tags.js`, `search.js`, `panels.js`, `reference.js`, `bookmarks.js`, `markups.js`, `popover-registry.js`, `reader-settings.js`, `notes-settings.js`, `reference-settings.js`, `state.js`, `storage-worker.js`, `usfm.js`, `plans.js`, `template-bar.js`, `backup.js`, `global-settings.js`, `help.js`)

**No changes this build** — confirmed via `git diff --stat` across the full Build 5 commit range (§1). Behavior matches `BUILD_4_ACTUAL_STATE.md`'s descriptions exactly. In particular: `panels.js`'s `openStudy()` required no changes at all to support template-generated studies — it already treats "a study id plus a name" as opaque, with no assumption about how the study was created.

---

## 4. MODULE DEPENDENCIES

```
app.js
  → db.js (no imports except usfm.js)
  → ...(all Build 1–4 dependencies, unchanged — see BUILD_4_ACTUAL_STATE.md §4)
  → study-templates.js → db.js, panels.js                           [NEW]

db.js → usfm.js                                                     [unchanged]
```

**No circular dependencies.** `study-templates.js` sits at the same layer `plans.js` occupies — a UI module that imports data-layer functions from `db.js` and calls into `panels.js`'s existing `openStudy()` to reuse the tab-open path, never the reverse. `panels.js` has no knowledge of `study-templates.js` or templates at all.

---

## 5. DATA FLOW

### Boot Sequence — one addition

Unchanged from Build 4 (`BUILD_4_ACTUAL_STATE.md` §5) except:
- Step 3 (`initDatabase()`) gained `await seedBundledTemplates();` immediately after `await seedBundledPlans();` — both run before `seedTranslations()`.
- Step 4 (`init*()` calls) gained `initStudyTemplates()`, inserted between `initPlans()` and `initTemplateBar()`.

### Generate Study From Template (new flow, not part of boot)

User opens the Plans tab → Study Templates sub-tab → clicks a template card → `openStudyNameDialog()` (study-templates.js) collects a name (pre-filled with the template's name, editable) → on confirm, `generateStudyFromTemplate(templateId, studyName)` (db.js) creates the study + notes as one batch of sequential `db.run()` calls, ending in a single `saveToStorage(db.export())` → the returned `studyId` is passed straight to `openStudy(studyId, studyName)` (panels.js), which opens a new tab and renders the study document exactly as if the user had clicked "+" and typed notes in by hand. On Cancel (or Escape, or backdrop click), `openStudyNameDialog()` resolves `null` and `handleStartTemplate()` returns before calling anything in db.js — nothing is created, nothing is persisted.

### Persistence — unchanged

The Build 2–4 mechanism (`db.export()` → `saveToStorage()` → Web Worker → OPFS or IndexedDB fallback) is unchanged. `generateStudyFromTemplate()` and `insertTemplate()`/`seedBundledTemplates()` both go through the same ordinary write path every other mutating db.js function uses — neither is a "destructive" operation in the sense `restoreCoreDb()` is, so there was no reason to special-case either.

---

## 6. CUSTOM EVENTS

Unchanged from Build 4 — Build 5 added no new `CustomEvent` types. Opening a generated study fires the existing `study-changed` event exactly the way any other `openStudy()` call does (see panels.js) — `study-templates.js` itself listens for nothing and dispatches nothing directly.

| Event | Emitter | Detail | Listeners |
|-------|---------|--------|-----------|
| `selection-changed` | selection.js | `{ verseIds: [...], element: verseEl\|null }` | notes.js, reference.js, bookmarks.js, reference-settings.js |
| `study-changed` | panels.js | `{ studyId }` | notes.js |
| `pane-changed` | reader.js (`setActivePane`) | `{ paneId }` | selection.js |

---

## 7. WHAT'S WIRED vs. STUBBED

### Fully Functional — NEW in Build 5

- **`study_templates`/`template_steps` schema** — created idempotently on both fresh installs and existing pre-Build-5 databases; verified the migration doesn't error or lose data on an existing database (the `try/catch` `ALTER TABLE` pattern is a no-op once the columns exist).
- **Three built-in templates** (Inductive Study/OIA — 4 steps, Word Study — 6 steps, Passage Overview — 5 steps) — seeded idempotently from `data/templates/*.json` on first run; copy verified byte-for-byte against `Build_5_Spec.md`'s tables via an automated diff, not eyeballed.
- **`generateStudyFromTemplate()`** — creates exactly one study and N notes (N = step count) in a single logical operation, notes in step order, no `note_anchors` row ever created regardless of reader selection state, `template_id`/`template_step_id` set correctly throughout.
- **Study Templates sub-tab** — the Build 3 placeholder is gone; real cards render name + description, tapping one opens a name dialog (pre-filled, editable), confirming generates and opens the study via the same path the "+" button uses, cancelling creates nothing.
- **Template-generated notes behave identically to freeform notes** — editable, appear in FTS search, taggable, deletable without affecting the study/template/other notes; the generating study can be renamed and have freeform notes added to it. See §10 for the verification methodology (live Playwright session, not code inspection alone).

### Fully Functional — Build 1–4 (unchanged, not re-audited line-by-line here)

See `BUILD_4_ACTUAL_STATE.md` §7 — nothing in that list was touched by Build 5.

### Partially Wired / Incomplete — unchanged from Build 4, minus one item now resolved

- **Study Templates sub-tab** is REMOVED from this list as of Build 5 — it is no longer a placeholder (see "Fully Functional" above).
- **Reference → Language tab**, **devotional content columns**, **simultaneous "active" plans**, **`sw.js`'s stale `PRECACHE` list**, **reader-settings.js/notes-settings.js/reference-settings.js not migrated into the global settings popover** — all unchanged from Build 4; see `BUILD_4_ACTUAL_STATE.md` §7 for details. `sw.js`'s precache list is now stale in one more way: it doesn't list `study-templates.js` either, on top of the Build 2–4 gaps already documented (`data/templates/*.json`, like `data/plans/*.json`, was never in the precache list to begin with — runtime cache-on-fetch still covers it after first load).
- **No `studies.visibility` column exists** (see §10, deviation #1) — every study's notes, template-generated or freeform, get their visibility from `notes.visibility`'s own column default (`'private'`), never from a study-level setting, because no such setting exists anywhere in the schema.

### Schema Tables/Columns with No Runtime Code

See `BUILD_4_ACTUAL_STATE.md` §7 for the pre-existing list (`session_records` was never created as a table at all, despite `notes.template_session_id` referencing it — see §2's "Dead column" note, which is new detail added this build). Build 5 added no new dead schema of its own — every column and table it added (`study_templates`, `template_steps`, `studies.template_id`, `notes.template_step_id`) has live, exercised runtime code.

### Other

- **`js/state.js`** — still fully implemented, still unused. Unchanged.
- **`manifest.json`** — still references icon files that don't exist on disk. Unchanged.
- **PWA install prompt** — still DOM+styles only, no `beforeinstallprompt` handler. Unchanged.

---

## 8. VERSE ID CONVENTION

Unchanged. Build 5 touched no verse-ID logic anywhere — template generation explicitly never reads verse selection state, and none of the new schema stores a verse reference of any kind. See `BUILD_4_ACTUAL_STATE.md` §8.

---

## 9. STUDY TEMPLATES — Data Model (new in Build 5, documented because the intro-row/numbered-row distinction isn't obvious from the schema alone)

`template_steps.step_index` is a pure ordering/generation mechanism (1, 2, 3…) — there is no schema-level distinction between a template's unnumbered intro row (step 1 of every template) and its numbered content rows. User-facing numbering ("1.", "2.", "3.") is baked directly into `prompt_text` as plain text; the intro row's `prompt_text` simply doesn't start with a number. This means renaming or reordering steps in a future template-authoring tool would require rewriting `prompt_text` strings to keep the numbers consistent — the numbering is copy, not structure, by deliberate design choice (`Build_5_Spec.md` Item 2), not an oversight.

**Which steps are "done" is derived, never stored.** There is no `current_step` counter anywhere in the Build 5 schema (unlike the retired `session_records` design — see §11). A step is "answered" if its corresponding note's `body` differs from the seeded `prompt_text` — a UI could compute this by comparing `notes.body` to `template_steps.prompt_text` via the `template_step_id` join, but no build has implemented that comparison anywhere yet; today the Notes panel shows every generated note as a plain editable card with no completion indicator.

---

## 10. DEVIATIONS FROM Build_5_Spec.md, AND WHAT WAS ACTUALLY VERIFIED

Per this document's own ground rule (code is truth over spec), one place where the shipped implementation necessarily diverges from a literal reading of the spec:

1. **Note visibility (Item 3).** The spec says generated notes should "inherit the study's visibility" via "the study's existing `visibility` column and default handling." **No such column exists.** `studies` has only `id, name, created_at, modified_at, status` — visibility has only ever been a per-note concept (`notes.visibility`, `DEFAULT 'private'`). This appears to be a spec assumption that was never actually true of the schema at any point in this codebase's history (confirmed: `BUILD_1_ACTUAL_STATE.md` through `BUILD_4_ACTUAL_STATE.md` never document a `studies.visibility` column either). `Build_5_Spec.md` Item 1 also didn't add one — correctly, since it wasn't on that item's explicit column list. `generateStudyFromTemplate()` resolves this the same way `saveNote()` already does: the `INSERT INTO notes` omits `visibility` entirely and lets the column's own `DEFAULT 'private'` apply. This was flagged to the user during implementation rather than silently patched over; no `studies.visibility` column has been added as of this document.

**What was actually exercised against the running app** (headless Chromium via Playwright throughout — none of this was taken on faith from reading the code):

- Full generation flow: Study Templates sub-tab → click a card → name dialog pre-filled with the template's name → confirm → new study tab opens with all N notes pre-filled verbatim, in step order. Repeated for Cancel (dialog closes, tab count unchanged, nothing created).
- Screenshot-verified the card list (all three templates, name + description) and the generated study document visually, in both cases confirmed against the actual rendered DOM, not just data returned from `db.js`.
- Confirmed no anchor chip appears on a generated note in the live UI, regardless of what verse was selected in the reader at generation time (matching the "unconditional, never reads selection state" requirement).
- **Item 5's full checklist**, each verified live rather than by code inspection alone: edited a generated note's body inline (autosaved via the normal 800ms debounce, confirmed to persist across a full page reload — not just in-memory DOM state); searched for a phrase unique to an untouched generated note and confirmed it surfaced in FTS results; tagged a generated note via the normal tag input and confirmed the chip rendered; deleted one of five generated notes and confirmed the other four were unaffected and in the same order, the study stayed open, and the template definitions themselves were unaffected; renamed a template-generated study inline and confirmed the tab label updated; added a freeform note to a template-generated study via the normal "+ Add Note" button.
- **No-cascade-on-template-delete**, verified at the schema level in an isolated sql.js instance (no delete-template UI exists yet to test live, since template management is out of scope for this build): under `PRAGMA foreign_keys = ON`, deleting a `study_templates` row that a study/note referenced was rejected outright (`NO ACTION`), never cascaded — confirming the schema declaration is correct independent of whether sql.js enforces FKs at runtime in the real app (it doesn't, by design established in Build 3 — see `BUILD_3_ACTUAL_STATE.md`).
- Zero console errors during the full Item 4 + Item 5 verification pass, except one pre-existing, unrelated one: scripture verse search falling back from FTS5 to a LIKE query, because sql.js's WASM build doesn't support the FTS5 module — the same known limitation already documented as the reason `notes_fts` uses fts4 instead of fts5 (`db.js`, `createUserTables()`). Not a Build 5 regression; present before this build and unrelated to templates.

---

## 11. WHAT BUILD 5 FORMALLY RETIRES

Documented here because it's a design decision, not just an implementation detail: `Technical_Spec_Build_1.md` originally modeled a study template as a live, navigable session — a `session_records` table with `current_step`, `status` ('in-progress'/'complete'/'ended'), `verse_start`/`verse_end`, `visibility_default`, and JSON blobs of note IDs/tags used, driven by `#template-bar` step navigation (the same bar Build 3 built for reading plans). **None of that was ever implemented** — `session_records` does not exist in any version of `createUserTables()` across Builds 1–5 — and `Build_5_Spec.md` explicitly declines to build it now, on the grounds that the `studies` table (which didn't exist yet when `Technical_Spec_Build_1.md` was written) already provides note grouping, making a session-tracking layer redundant. The only surviving trace of the old design is the dead `notes.template_session_id` column (see §2) and the mention of `session_records` in `template_steps.template_id`'s comment history — neither of which any Build 5 code reads or writes. `#template-bar` remains exclusively a reading-plans feature; `study-templates.js` never imports `template-bar.js` and never touches `#template-bar` in the DOM.
