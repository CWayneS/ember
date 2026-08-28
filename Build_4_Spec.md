# Ember Bible Study — Build 4 Specification

**Purpose:** Give the user a way to protect their notes, tags, markups, bookmarks, and reading plan progress against data loss. Build 4 introduces a `meta` table in `core.db`, full-database export and restore, and the first piece of a global settings surface — the "workspace environment" of the physical study metaphor, reached from the global header rather than any single panel.

**Prerequisite:** Build 3 complete. Reading plans shipped and stable.

**Estimated effort:** 2–4 focused days.

---

## Design Principle: The Global Area

The physical study metaphor extends to the search bar's header: it isn't part of the Bible, the notebook, or the reference shelf — it's the room they all sit in. Just as each panel has its own ⚙ (settings) and ? (help) in its own header, the global header gets the same pair, governing things that belong to the whole space rather than any one surface within it.

| Surface | Physical equivalent | Build 4 addition |
|---|---|---|
| Global header ⚙ | The room's utility drawer | Settings popover shell — table of contents, one populated section |
| Backup & Restore section | A fireproof box for your notebook | Export current data, restore from a backup file |

Backup/restore doesn't belong to the reader, the notebook, or the reference shelf specifically — it protects all of them at once. It lives in the global area for that reason.

---

## Scope

### In Scope

1. **`meta` table** — new table in `core.db`: `schema_version`, `created_at`, `app_name`
2. **Export** — full `core.db` export as a downloadable, timestamped file
3. **Restore** — destructive restore from a previously exported `core.db` file
4. **Global settings popover shell** — ⚙ and ? buttons added to the global header (search bar area), consistent with each panel's existing header treatment. Popover contains a clickable table-of-contents placeholder at the top and one fully built section: **Backup & Restore**, using page-width section dividers sized for future sections to be added the same way

### Out of Scope (Explicit)

- Migrating reader-settings.js / notes-settings.js / reference-settings.js content into the global popover — those stay in their own per-panel popovers for now
- Global search-box filtering of settings/help — future build, once the aggregate page has enough content to make filtering meaningful
- Legacy pre-`meta` database tolerance — no backup files predate Build 4 (the app hasn't shipped and has no prior backup capability), so there's nothing legacy to tolerate yet
- Translation file backup — translations are re-fetchable from `data/translations/` and are not user data
- Merge or non-destructive restore — restore always replaces `core.db` in full
- Scheduled or automatic backups
- Cloud sync of any kind
- Versioned backup history — a single "restore this file" action only
- Full global help panel — global ? button placement only; content deferred

---

## Implementation Order

1. **`meta` table + schema migration** — add the table before any UI work
2. **Export** — wire up the download flow using the existing `db.export()` primitive
3. **Restore** — file picker, confirmation dialog, destructive write, reload
4. **Global header UI** — ⚙ and ? buttons, positioned to match per-panel header conventions
5. **Settings popover shell** — ToC placeholder, Backup & Restore section, divider styling

Each item should be demo-able before moving on.

---

## Item 1: `meta` Table

A new table, created idempotently alongside the rest of `createUserTables()`'s DDL — the same pattern used for `migratePlanTables()` in Build 3.

```sql
CREATE TABLE IF NOT EXISTS meta (
  schema_version    INTEGER NOT NULL,
  created_at        INTEGER NOT NULL,   -- unix timestamp, set once on first creation
  app_name          TEXT NOT NULL DEFAULT 'Ember Bible Study'
);
```

**Notes:**
- Single-row table — one row, no primary key needed beyond that convention (matches the key/value `meta` table already present in each translation `.db`, but this is a different table serving a different purpose: `core.db`'s `meta` is a single descriptive row, not key/value pairs)
- `schema_version` starts at `1` for Build 4; bumped in future builds if `core.db`'s schema changes in a way that matters for restore compatibility checks
- `created_at` is set once, at first creation, and never updated — it marks when this particular `core.db` was first initialized, not when it was last backed up
- If the row already exists (idempotent boot), nothing is touched

### Definition of Done (Item 1)

- [ ] `meta` table created on fresh install with `schema_version = 1`, `created_at` set, `app_name = 'Ember Bible Study'`
- [ ] Table creation is idempotent — running `createUserTables()` again does not duplicate or reset the row
- [ ] Existing `core.db` (Build 3 or earlier, no `meta` table) gets the table added on next boot without disrupting any other data

---

## Item 2: Export

**Trigger:** "Export Backup" button/action inside the Backup & Restore section of the global settings popover.

**Mechanism:** Reuse the existing `db.export()` call already used on every write (see `db.js` write path, Build 2/3). Export produces the same `Uint8Array` that's normally handed to `storage-worker.js` for OPFS/IndexedDB persistence — for a manual export, that byte array is instead wrapped in a `Blob` and offered to the user as a file download via a synthetic anchor click, the standard browser download pattern.

**Filename:** `ember-backup-YYYY-MM-DD-HHmm.db` (local time), so multiple backups taken the same day don't collide and sort chronologically by filename.

**Scope of export:** the entirety of `core.db` — all reference tables (`books`, `translations` manifest, `cross_references`, `topics`, `topic_verses`) and all user data tables (`studies`, `notes`, `notes_fts`, `note_anchors`, `tags`, `tag_assignments`, `bookmarks`, `markups`, `app_state`, `plans`, `plan_days`, `plan_day_scripture`, `meta`). Translation `.db` files under `data/translations/` are **not** included.

### Definition of Done (Item 2)

- [ ] "Export Backup" triggers a file download, no page navigation or reload
- [ ] Downloaded file is a valid SQLite database openable by sql.js
- [ ] Filename includes a timestamp and doesn't collide with same-day repeat exports
- [ ] Exported file, when restored, reproduces all notes/tags/bookmarks/markups/plan progress exactly

---

## Item 3: Restore

**Trigger:** "Restore from Backup" button/action inside the Backup & Restore section, opening a native file picker restricted to `.db`.

**Flow:**
1. User selects a `.db` file
2. Confirmation dialog — explicit, stating the action is destructive and irreversible:
   > Restore from backup?
   > This will replace all current notes, tags, bookmarks, markups, and reading plan progress with the contents of the selected file. This cannot be undone.
   > [Cancel] [Restore]
3. On confirm: read the file's bytes, write them to OPFS (or IndexedDB fallback) in place of the current `core.db`, then reload the app so `initDatabase()` boots fresh from the restored file
4. On a read or write failure: show a clear error, leave the existing `core.db` untouched

**Validation before restore:** open the selected bytes as a sql.js database and confirm it has a `books` table (or similarly minimal structural check) before committing to the destructive write — catches "wrong file selected" (e.g. a `.json` renamed to `.db`, or an unrelated SQLite file) without needing to fully validate schema correctness.

### Definition of Done (Item 3)

- [ ] File picker restricted to `.db` files
- [ ] Confirmation dialog clearly states the action is destructive
- [ ] Cancel leaves the current database completely untouched
- [ ] Confirm replaces `core.db` in OPFS/IndexedDB and reloads the app
- [ ] Restored data (notes, tags, bookmarks, markups, plans/progress) matches the backup file exactly after reload
- [ ] Selecting an invalid or unrelated file shows a clear error and does not touch the existing database
- [ ] A failed write (e.g. storage quota) shows a clear error and does not leave the app in a half-restored state

---

## Item 4: Global Header UI

**Buttons:** ⚙ (settings) and ? (help) added to the global header, alongside the search bar — same visual treatment (icon buttons) as the existing per-panel header buttons in reader, notes, and reference panels.

**Global ? button (Build 4 scope):** wired to open using the same shared `.help-popover` component and `popover-registry.js` mechanism as the other three help popovers, but with placeholder content only:
> **Ember** — the whole workspace. Settings and help for each panel live in that panel's own ⚙ and ? buttons. Global settings (below) cover things that apply everywhere, like backup and restore.

**Global ⚙ button:** opens the new settings popover shell (Item 5).

Both register with `popover-registry.js` so opening either — or any other popover in the app — closes all others, matching existing behavior.

### Definition of Done (Item 4)

- [ ] ⚙ and ? buttons appear in the global header, visually consistent with per-panel header buttons
- [ ] Global ? opens a help popover with placeholder content, using the shared `.help-popover` styling
- [ ] Global ⚙ opens the settings popover (Item 5)
- [ ] Opening either global popover closes any other open popover, and vice versa

---

## Item 5: Global Settings Popover Shell

**Layout:**

```
┌───────────────────────────────────────────┐
│  Settings                                  │
├───────────────────────────────────────────┤
│  On this page:                             │
│  • Backup & Restore                        │
├───────────────────────────────────────────┤
│  Backup & Restore                          │
│  ─────────────────────────────────────     │
│  Export your data as a backup file, or     │
│  restore from a previous backup.           │
│                                             │
│  [Export Backup]                           │
│  [Restore from Backup]                     │
└───────────────────────────────────────────┘
```

**Table of contents:** a clickable list at the top of the popover. In Build 4 it has exactly one entry, "Backup & Restore," which jumps to (or simply is, given the popover's short length) that section. Built as a real list rendered from a small array of section definitions — not hardcoded prose — so future builds add sections by extending that array rather than restructuring the popover.

**Section styling:** each section has a title and a page-width horizontal divider above it, per Wayne's spec — this is the pattern later builds will repeat when reader/notes/reference settings eventually migrate in.

**Backup & Restore section:** the only populated section. Contains the Export button (Item 2) and Restore button (Item 3), plus a one-line description of each action. No other settings content in Build 4.

### Definition of Done (Item 5)

- [ ] Popover opens from the global ⚙ button, styled consistently with existing `.help-popover`-family components
- [ ] Table of contents renders from a data structure, with one entry: "Backup & Restore"
- [ ] Backup & Restore section has a title, page-width divider, and both Export/Restore controls
- [ ] Section styling (title + divider) is generic enough to reuse without rework when future sections are added
- [ ] Popover closes on outside click and Escape, matching existing popover conventions

---

## Definition of Done (Build 4 Overall)

- [ ] All five items above are complete with their individual checklists
- [ ] `meta` table exists in `core.db` on both fresh installs and after upgrading an existing database
- [ ] Export produces a valid, restorable `core.db` file
- [ ] Restore is destructive, explicitly confirmed, and correctly replaces all user and reference data
- [ ] Global ⚙ and ? buttons are live in the global header
- [ ] Settings popover shell (ToC + Backup & Restore section) is in place and stylistically ready for future sections
- [ ] Notes, tags, bookmarks, markups, and plan progress reliably survive a rebuild/refresh cycle when a backup is taken beforehand
- [ ] `FEATURE_INVENTORY.md` updated to reflect Build 4 additions
- [ ] `BUILD_3_ACTUAL_STATE.md` superseded by `BUILD_4_ACTUAL_STATE.md` after build ships

---

## What Comes Next: Build 5 Preview

**Build 5 — Study Templates:**
- Study Templates sub-tab (currently a placeholder in the Plans tab) becomes functional
- Shares UX patterns with reading plans (Plans tab, template bar) established in Build 3
- Global settings popover may gain additional sections as reader/notes/reference settings migrate in, and global search-box filtering of settings/help may begin here or in a later build — not committed as part of Build 5 scope until planned
