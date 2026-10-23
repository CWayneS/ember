# Ember Bible Study — Build 3 Specification

**Purpose:** Add reading plans — the first feature that gives the user a structured path through Scripture over time. Build 3 introduces the Plans tab, the template bar as an active navigation surface, and the data model and import/export format that supports plans with or without devotional content.

**Prerequisite:** Build 2 complete. Multi-translation, cross-references, range selection, and text markups shipped and stable.

**Estimated effort:** 5–8 focused days.

---

## Design Principle: The Physical Study Metaphor

Reading plans in Ember behave like a physical bookmark. When you set a bookmark down after Day 4, it stays on Day 4. It does not move forward without you. When you return, you pick up exactly where you left off — no guilt, no catch-up prompts, no "you're 3 days behind" messaging.

| Surface | Physical equivalent | Build 3 addition |
|---|---|---|
| Plans tab | Your reading list | Installed plans, filterable by status, import button |
| Plan detail popover | The bookmark itself | Progress, day list, Continue/Restart/Delete |
| Template bar | A sticky note on your bookmark | Current passage, back/next navigation, progress dots |

---

## Scope

### In Scope

1. **Reading Plans** — sequential-only plans with the full data model, bundled plans, Plans tab with Reading Plans and Study Templates sub-tabs, plan detail popover, template bar navigation
2. **Plan import** — JSON and CSV formats, date-bound-to-sequential conversion on import
3. **Template bar** — active navigation surface showing current passage, progress dots, back/next/close

### Out of Scope (Explicit)

- Date-bound plans — eliminated entirely; import converts them to sequential
- Catch-up logic, "behind by N days" messaging, date tracking
- Backup/restore and `meta` table — moved to Build 4
- Study templates (Study Templates sub-tab ships with placeholder text)
- Plan creation UI — separate app, future project
- Reflection question answer capture — render-only in Build 3
- Notifications of any kind
- Plan export — import only in Build 3; export deferred

---

## Implementation Order

1. **Schema migration first** — extend `user.db` with the new plans tables before any UI work
2. **Bundled plan data** — prepare and bundle the plan JSON files; verify the data model handles real-world plan shapes
3. **Import logic** — JSON and CSV parsers, USFM resolution, date-bound conversion
4. **Plans tab UI** — sub-tabs, plan cards, filterable list, import button
5. **Plan detail popover** — name, progress, day checklist, Continue/Restart/Delete
6. **Template bar** — progress dots, current verse (clickable), back/next/next day, close

Each item should be demo-able before moving on.

---

## Item 1: Schema Migration

The existing `plans`, `plan_days`, and `plan_progress` tables in `user.db` were created as placeholders in Build 1. They must be dropped and replaced with the Build 3 schema. A migration function runs at app startup and detects the old schema by checking for missing columns.

```sql
-- Drop legacy placeholder tables
DROP TABLE IF EXISTS plan_progress;
DROP TABLE IF EXISTS plan_days;
DROP TABLE IF EXISTS plans;

-- Reading plans
CREATE TABLE IF NOT EXISTS plans (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id           TEXT UNIQUE NOT NULL,       -- stable external ID from JSON
  title             TEXT NOT NULL,
  description       TEXT,
  author            TEXT,
  language          TEXT DEFAULT 'en',
  duration_days     INTEGER NOT NULL,
  tags              TEXT,                        -- JSON array of strings
  schema_version    INTEGER DEFAULT 1,
  source            TEXT NOT NULL,              -- 'bundled' | 'imported'
  imported_at       INTEGER NOT NULL,           -- unix timestamp
  current_step      INTEGER NOT NULL DEFAULT 0, -- 0 = not started; 1..duration_days
  status            TEXT NOT NULL DEFAULT 'not_started'
                    CHECK(status IN ('not_started','active','completed'))
);

-- One row per day per plan
CREATE TABLE IF NOT EXISTS plan_days (
  plan_id           INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_number        INTEGER NOT NULL,           -- 1-indexed
  title             TEXT,                       -- optional day title
  devotional_title  TEXT,
  devotional_body   TEXT,                       -- Markdown
  reflection_questions_json TEXT,              -- JSON array of strings
  PRIMARY KEY (plan_id, day_number)
);

-- One row per passage per day (a day may have multiple passages)
CREATE TABLE IF NOT EXISTS plan_day_scripture (
  plan_id           INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_number        INTEGER NOT NULL,
  sequence          INTEGER NOT NULL,           -- order within the day
  ref               TEXT NOT NULL,              -- USFM ref (e.g. JHN.3.16-21)
  display           TEXT NOT NULL,              -- human-readable (e.g. John 3:16-21)
  book              INTEGER NOT NULL,           -- pre-resolved BBCCCVVV components
  chapter           INTEGER NOT NULL,
  verse_start       INTEGER NOT NULL,
  verse_end         INTEGER,                    -- NULL = single verse
  PRIMARY KEY (plan_id, day_number, sequence)
);
```

**Notes:**
- `schedule_type` column eliminated — sequential only, no column needed
- `start_date` column eliminated — no date tracking
- `plan_progress` table eliminated — progress tracked via `plans.current_step` alone
- Scripture refs pre-resolved at import time; navigation never re-parses USFM at runtime

### Definition of Done (Item 1)

- [ ] Migration runs cleanly on an existing Build 2 `user.db`
- [ ] Old placeholder tables dropped without data loss (they were empty)
- [ ] New tables created with correct schema and constraints
- [ ] App starts normally after migration

---

## Item 2: Bundled Plans

Bundled plans ship as JSON files in `data/plans/`. They are seeded into `user.db` at install time alongside the existing bootstrap. The following plans are bundled:

- **M'Cheyne One-Year Reading Plan** — 365 days, 4 passages per day, no devotional content
- **Bible in a Year (Canonical)** — 365 days, sequential Genesis to Revelation
- **Bible in a Year (Chronological)** — 365 days, passages ordered by historical sequence

These are verse-list-only plans (no devotional block). The `devotional_title`, `devotional_body`, and `reflection_questions_json` fields are NULL for all bundled plans.

**Data prep:** Before writing any UI code, prepare the three JSON files, run them through the import parser, and verify the data lands correctly in all three tables. Fix any parser issues before proceeding.

### Definition of Done (Item 2)

- [ ] Three plan JSON files exist in `data/plans/`
- [ ] All three seed correctly into `user.db` on fresh install
- [ ] Day counts are correct for each plan
- [ ] Passage counts per day are correct
- [ ] USFM refs resolve to correct BBCCCVVV components
- [ ] Bundled plans appear in the Plans tab as "Not Started"

---

## Item 3: Import Logic

### JSON Format (Canonical)

```json
{
  "plan_metadata": {
    "id": "mcheyne-1year",
    "title": "M'Cheyne One-Year Reading Plan",
    "description": "Robert Murray M'Cheyne's classic plan covering the NT and Psalms twice, OT once.",
    "author": "Robert Murray M'Cheyne",
    "language": "en",
    "duration_days": 365,
    "tags": ["whole-bible", "classic"],
    "schema_version": 1
  },
  "days": [
    {
      "day_number": 1,
      "scripture": [
        { "ref": "GEN.1.1-2.17", "display": "Genesis 1:1–2:17" },
        { "ref": "MAT.1", "display": "Matthew 1" },
        { "ref": "EZR.1", "display": "Ezra 1" },
        { "ref": "ACT.1", "display": "Acts 1" }
      ]
    }
  ]
}
```

**Date-bound conversion:** If an imported JSON file contains `"schedule_type": "date"` or a `start_date` field, the import logic silently converts it to sequential. `current_step` is set from the last completed day if determinable, otherwise 0. Schedule dates are discarded. No warning is shown — conversion is silent and automatic.

**Unknown fields** at the day level are ignored. Forward-compatible.

### CSV Format (Minimal)

```
day,ref,display
1,GEN.1.1-2.17,Genesis 1:1-2:17
1,MAT.1,Matthew 1
2,GEN.2.18-3.24,Genesis 2:18-3:24
```

CSV imports trigger a metadata dialog for: title, description, author, tags. Duration is inferred from the highest `day` value in the file.

CSV is not suitable for plans with devotional content. Plans imported via CSV are always Scripture-only.

### USFM Resolution

A static JS constant maps the 66 USFM 3-letter book codes to internal book numbers. Resolution happens once at import time. The resolved `book`, `chapter`, `verse_start`, `verse_end` values are stored in `plan_day_scripture` — runtime navigation reads those columns directly.

### Definition of Done (Item 3)

- [ ] JSON import parses plan_metadata and all days correctly
- [ ] CSV import parses day/ref/display rows and opens metadata dialog
- [ ] Date-bound plans convert silently to sequential on import
- [ ] USFM refs resolve correctly for all 66 books
- [ ] Multi-passage days store one row per passage in plan_day_scripture
- [ ] Import button in the Reading Plans sub-tab triggers a file picker
- [ ] Duplicate plan_id is rejected with a clear message
- [ ] Malformed files show a clear error without crashing

---

## Item 4: Plans Tab UI

The Plans tab is a top-level navigation tab in the reference panel, alongside Info, Tags, Related, and Language. It contains two sub-tabs: **Reading Plans** and **Study Templates**.

### Reading Plans Sub-tab

A filterable list of installed plans. Default sort order: In Progress → Not Started → Completed.

**Plan card** (one per installed plan):
- Plan title
- Status badge (In Progress / Not Started / Completed)
- Progress summary ("Day 4 of 365") for in-progress plans
- ✕ button to delete (opens confirmation dialog)

**Controls:**
- Filter/sort control — toggle between status groups or show all
- Import button — opens file picker, accepts `.json` and `.csv`

**Empty state:** "No reading plans installed. Use the Import button to add a plan." (Bundled plans are pre-installed so this state only appears if all plans are deleted.)

### Study Templates Sub-tab

Placeholder content for Build 3:

> **Study Templates** — coming in a future build. Templates guide you through a structured method for engaging with a passage: observe, interpret, apply. Check back soon.

The sub-tab is present and tappable. It shows only the placeholder. No import button, no list.

### Definition of Done (Item 4)

- [ ] Plans tab appears in the reference panel tab bar
- [ ] Two sub-tabs render: Reading Plans and Study Templates
- [ ] Reading Plans list shows all installed plans with correct status badges
- [ ] Default sort: In Progress, Not Started, Completed
- [ ] ✕ on a plan card opens the delete confirmation dialog
- [ ] Import button opens file picker
- [ ] Study Templates sub-tab shows placeholder text only

---

## Item 5: Plan Detail Popover

Clicking a plan card (anywhere except the ✕) opens the plan detail popover.

### Layout

```
┌─────────────────────────────────────────────────┐
│ M'Cheyne One-Year Reading Plan      [Continue →] │
│ Day 4 of 365                                     │
├─────────────────────────────────────────────────┤
│ ☑ Day 1 — Genesis 1:1–2:17, Matthew 1…          │
│ ☑ Day 2 — Genesis 2:18–3:24, Matthew 2…         │
│ ☑ Day 3 — Genesis 4–5, Matthew 3…               │
│ ▶ Day 4 — Genesis 6–7, Matthew 4…               │  ← current day
│ ○ Day 5 — Genesis 8–9, Matthew 5…               │
│ …                                                │
├─────────────────────────────────────────────────┤
│ [Restart]                          [Delete]      │
└─────────────────────────────────────────────────┘
```

**Continue button** — top right, visually prominent (filled button, distinct from secondary actions). Closes the popover and activates this plan in the template bar, navigating the reader to the current day's first passage.

**Day list** — scrollable checklist. Each row is clickable and starts that day (same behavior as Continue but for a specific day). Current day is visually indicated. Completed days show a checkmark. Future days are open circles.

**Restart confirmation dialog:**
> Restart "M'Cheyne One-Year Reading Plan"?
> Current progress: Day 4 of 365
> This will reset your progress to Day 1. Your notes are not affected.
> [Cancel] [Restart]

**Delete confirmation dialog:**
> Delete "M'Cheyne One-Year Reading Plan"?
> Current progress: Day 4 of 365
> The plan and your progress will be removed. Your notes are not affected.
> [Cancel] [Delete]

### Definition of Done (Item 5)

- [ ] Clicking a plan card opens the detail popover
- [ ] Popover shows plan name, progress summary, and day list
- [ ] Continue button is visually prominent and positioned top right
- [ ] Day list is scrollable and scrolls to current day on open
- [ ] Clicking any day starts that day and closes the popover
- [ ] Continue closes the popover and activates the plan in the template bar
- [ ] Restart shows confirmation dialog with plan name and current progress
- [ ] Delete shows confirmation dialog with plan name and current progress
- [ ] Both confirmations state that notes are preserved
- [ ] Restart resets current_step to 0 and status to not_started
- [ ] Delete removes the plan and all plan_days/plan_day_scripture rows

---

## Item 6: Template Bar

The `#template-bar` element is already in the DOM (hidden). Build 3 makes it functional.

### Visibility

The bar is shown when a plan is active (status = `active`, current_step ≥ 1). It is hidden when no plan is active or when the user closes it.

### Layout

```
[◀ Prev]  ● ● [John 3:16–21] ○ ○  [Next ▶]  [✕]
```

- **◀ Prev** — goes to previous passage within the day; on the first passage of the day, becomes **◀ Prev Day**
- **Progress dots** — one dot per passage in the current day. Filled = completed, outline = remaining. Current passage is represented by the verse label in position among the dots.
- **[Verse label]** — the current passage reference, clickable. Clicking navigates the reader to that passage (useful after following cross-references or related links away from the plan passage)
- **Next ▶** — advances to the next passage within the day; on the last passage of the day, becomes **Next Day ▶**
- **✕** — closes/deactivates the bar without deleting the plan. Progress is preserved.

### Marking Complete

Advancing past the last passage of the day (Next Day) increments `plans.current_step` and records that day as complete. If `current_step` reaches `duration_days`, status is set to `completed`.

### Context Awareness

The bar reflects whatever plan is currently active. It does not care how the user arrived at the current passage — via the Plans tab, a bookmark, or manual navigation. If the user navigates away from the plan passage, the verse label still shows the plan's current passage and remains clickable to return.

### Definition of Done (Item 6)

- [ ] Bar is hidden on load and when no plan is active
- [ ] Bar appears when a plan is continued or a day is started from the detail popover
- [ ] Progress dots render correctly for days with 1, 2, 3, and 4+ passages
- [ ] Current passage label is correct and clickable
- [ ] Clicking the passage label navigates the reader to that passage
- [ ] Next advances to the next passage within the day
- [ ] Next Day appears on the final passage and advances to the next day
- [ ] Prev goes to the previous passage within the day
- [ ] Prev Day appears on the first passage and goes to the previous day
- [ ] Advancing past the last passage of the last day marks the plan complete
- [ ] ✕ hides the bar and deactivates the plan without deleting it
- [ ] Progress persists across reload

---

## Definition of Done (Build 3 Overall)

- [ ] All six items above are complete with their individual checklists
- [ ] Three bundled plans are installed on fresh launch
- [ ] Plans can be imported from JSON and CSV
- [ ] Date-bound plans convert to sequential on import without error
- [ ] Plan detail popover works for all status states
- [ ] Template bar navigates correctly through multi-passage days
- [ ] Plan progress persists across reload and app restart
- [ ] Notes are never affected by plan deletion or restart
- [ ] Study Templates sub-tab shows placeholder text
- [ ] `FEATURE_INVENTORY.md` updated to reflect Build 3 additions
- [ ] `BUILD_2_ACTUAL_STATE.md` superseded by `BUILD_3_ACTUAL_STATE.md` after build ships

---

## What Comes Next: Build 4 Preview

**Build 4 — Backup/Restore:**
- `meta` table in `user.db` (`schema_version`, `created_at`, `app_name`)
- Full `user.db` export as a downloadable file
- Destructive restore from a backup file
- Import logic tolerates pre-meta legacy databases
