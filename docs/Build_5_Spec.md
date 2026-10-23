# Ember Bible Study — Build 5 Specification

**Purpose:** Add Study Templates — a way for the user to generate a pre-structured study (a "worksheet") from a built-in method, without any session tracking, navigation, or progress logic. The template creates a study and its notes; from that moment on, the study behaves exactly like any freeform study.

**Prerequisite:** Build 4 complete. `meta` table, backup/restore, and the global settings popover shipped and stable.

---

## Design Principle: The Worksheet Metaphor

A study template is a teacher handing the student a worksheet. The worksheet has questions already printed on it, in order, with blank space to write. The student can answer in any order, skip questions, come back later, or never finish. Nobody is tracking whether they're "on step 3 of 5." Once the worksheet is handed over, it's just paper — it doesn't know it came from a template, and the app doesn't need to either, beyond remembering where it came from for display purposes.

This replaces the older (Build 1-era, never implemented) `session_records` design, which modeled a template as a live, navigable session with a current step, a status (in-progress/complete/ended), and template-bar-driven navigation. That model predates the `studies` table, which now already provides note grouping. Build 5 does not implement `session_records`, session status, resumability logic, or any template-bar involvement — none of it is needed once the template's only job is to generate notes.

| Old concept (unbuilt) | Build 5 replacement |
|---|---|
| Session with current_step, status | Nothing — a note with an empty body is unfinished; a note with content is finished |
| Welcome page overlay (name, passage, visibility) | A single "name this study" prompt at creation |
| Template bar step navigation (Next/Previous) | None — the study behaves like any other study |
| Resuming a paused session | Opening the study and seeing which notes are blank |

---

## Scope

### In Scope

1. **Template schema** — `study_templates` and `template_steps`, static/seeded tables defining the built-in methods
2. **Study/note linkage** — `studies.template_id` and `notes.template_step_id`, both nullable
3. **Study Templates sub-tab** — replaces the Build 3 placeholder with a real, tappable list of built-in templates
4. **Generation flow** — starting a template creates a study and one pre-populated note per step, in a single action
5. **Three built-in templates** — Inductive Study (OIA), Word Study, Passage Overview — with prompts rewritten for the worksheet format (fill-in-the-blank, not sequential instructions)

### Out of Scope (Explicit)

- Template Creator (in-app authoring UI) — moved to a separate, future, standalone application, same as the plan-creation UI
- "Save Study as Template" — deferred; depends on design work that hasn't happened yet
- Sharing/exporting studies or templates — deferred, likely bundled with "Save Study as Template" when that's designed
- `session_records`, session status, resumability — not part of this design at all, not merely deferred
- Template bar involvement of any kind — templates never touch `#template-bar`
- Welcome page overlay, passage field, estimated time — not needed (see Item 3)
- Step navigation UI (Next/Previous, "Step 2 of 6") — not needed
- Verse anchoring of generated notes — explicitly excluded (see Item 3)

---

## Implementation Order

1. **Schema** — add `study_templates`, `template_steps`, `studies.template_id`, `notes.template_step_id`
2. **Built-in template data** — write and seed the three templates' step definitions
3. **Generation logic** — the function that creates a study + notes from a template in one action
4. **Study Templates sub-tab UI** — list of templates, tap to start
5. **Verify notes render and edit normally** — no special-casing needed, but confirm nothing about `template_step_id` breaks existing note rendering, editing, search, or tagging

Each item should be demo-able before moving on.

---

## Item 1: Schema

### New Tables

```sql
CREATE TABLE IF NOT EXISTS study_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS template_steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    step_index  INTEGER NOT NULL,        -- display/generation order, 1-based
    prompt_text TEXT NOT NULL,           -- seeded verbatim into the generated note's body
    FOREIGN KEY (template_id) REFERENCES study_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_template_steps_template ON template_steps(template_id);
```

No `estimated_time`, no navigation-target fields, no input-type field — none of that is meaningful once a template's only output is plain notes.

### Column Additions

```sql
ALTER TABLE studies ADD COLUMN template_id INTEGER REFERENCES study_templates(id);
ALTER TABLE notes ADD COLUMN template_step_id INTEGER REFERENCES template_steps(id);
```

Both nullable. `studies.template_id` is NULL for freeform studies. `notes.template_step_id` is NULL for any note not generated by a template step (i.e., almost all notes in the app, including notes added later to a template-generated study).

**Note on `notes.template_step_id` vs. a `current_step` counter:** there is no counter anywhere. Which steps are "done" is derived by checking which of a study's notes (ordered by their step's `step_index`) are non-empty. This is intentionally not computed or cached — it's a simple query, not stored state, so there's nothing to keep in sync.

### Definition of Done (Item 1)

- [ ] `study_templates` and `template_steps` created in `createUserTables()`
- [ ] `studies.template_id` and `notes.template_step_id` columns added, both nullable
- [ ] Migration runs cleanly against an existing Build 4 database with no data loss
- [ ] App starts normally after migration

---

## Item 2: Built-in Template Data

Three templates, seeded at install time (same pattern as bundled reading plans in Build 3 — prepared as data, verified through the generation logic before UI work begins).

Each template's `step_index` values are a pure ordering/generation mechanism — 1, 2, 3... in the schema. User-facing numbering ("1.", "2.", "3.") is baked directly into `prompt_text` as plain text; the first row of every template is an unnumbered intro note. There is no schema difference between the intro row and the numbered rows — the numbering is copy, not structure.

#### Inductive Study (OIA)

`study_templates.description`:
> A three-step method for reading Scripture closely: see what it says, understand what it means, then live it out.

| step_index | prompt_text |
|---|---|
| 1 | This is an Inductive Study. Reading in this order (observe first, interpret second) keeps you from jumping to conclusions before you've actually looked closely at what the text says. It works through a passage in three steps: Observation, Interpretation, and Application, each in its own note below. Type your answer in each note. |
| 2 | 1. Observation: What does the text say? Note who's speaking, what happens, and any words or ideas that repeat, without yet deciding what any of it means. |
| 3 | 2. Interpretation: What does it mean? Consider the context, the original audience, and how this fits with the rest of Scripture. |
| 4 | 3. Application: How does this apply to my life? Be specific about what would actually change if I took this seriously this week. |

#### Word Study

`study_templates.description`:
> A close look at a single word: its meaning, its use across Scripture, and what that reveals about the passage.

| step_index | prompt_text |
|---|---|
| 1 | This is a Word Study. Words carry more freight in their original language than any translation can fully capture: a word study helps you see nuance, connections, and shades of meaning that get flattened in translation. It works through one key word in the passage: its original meaning, where else it appears, and what patterns emerge, each in its own note below. Type your answer in each note. |
| 2 | 1. Key Word: Which word in this passage carries the most weight? Write it down, along with the verse it appears in. |
| 3 | 2. Original Language: What is the word in the original Hebrew or Greek? What does it literally mean? |
| 4 | 3. Other Occurrences: Where else does this word appear in Scripture? Do those uses agree with each other, or shift depending on context? |
| 5 | 4. Patterns: What patterns or themes show up across those occurrences? |
| 6 | 5. Summary: In your own words, what does this word mean here, and why does it matter for understanding the passage? |

#### Passage Overview

`study_templates.description`:
> A wide-angle look at a passage before zooming in: its background, its shape, its themes, and what it asks of you.

| step_index | prompt_text |
|---|---|
| 1 | This is a Passage Overview. Before you dig into detail, it helps to see the whole first: where the passage sits in its book, how it's put together, and what it's really about. It works through context, structure, themes, and response, each in its own note below. Type your answer in each note. |
| 2 | 1. Context: Where does this passage sit in the book? What comes before and after it, and who is the original audience? |
| 3 | 2. Structure: How is the passage put together? Look for shifts in scene, speaker, or argument, and any natural breaks. |
| 4 | 3. Themes: What ideas or concerns come up more than once? What is this passage really about? |
| 5 | 4. Response: Now that you've seen the whole, what's your honest reaction? What stands out, surprises you, or unsettles you? |

### Definition of Done (Item 2)

- [ ] Three templates exist in `study_templates` with names/descriptions matching this spec
- [ ] Each template's steps exist in `template_steps` with `step_index` and `prompt_text` matching this spec exactly, including the intro row
- [ ] Step order matches the tables above for each template
- [ ] Data seeds correctly into a fresh install

Copy above is drafted and approved by Wayne, but not yet reviewed by anyone with hermeneutics/Bible-teaching background — see punch list.

---

## Item 3: Generation Logic

A single function: given a `template_id` and a study name, creates one `studies` row (with `template_id` set) and one `notes` row per `template_steps` row belonging to that template, each note's `body` pre-filled with that step's `prompt_text` and `template_step_id` set accordingly. All generated notes belong to the new study (`study_id`) and inherit the study's visibility.

**No verse anchor.** Generated notes get no `note_anchors` row. This is unconditional — the generation logic does not read the reader's current selection state at all, regardless of what verse or range happens to be selected when the user starts a template. This avoids both an incorrect/unwanted anchor and any side effect on unrelated UI that listens for `selection-changed`.

**Study name.** The user is prompted for a name at creation (a single field, not a full welcome-page overlay). A sensible default (e.g. the template's name) can pre-fill the field.

**Visibility.** Uses the study's existing `visibility` column and default handling — no separate `visibility_default` concept is introduced; the study-level field already does this job.

**No passage field.** Templates do not ask for or store a passage. If the user wants a note anchored to a verse, that happens the same way it happens for any other note in the app — not as part of template generation.

### Definition of Done (Item 3)

- [ ] Starting a template creates exactly one study and N notes (N = step count) in a single action
- [ ] Each generated note's body is pre-filled with its step's prompt text, as plain editable text
- [ ] Notes are created in step order
- [ ] No `note_anchors` row is created for any generated note, regardless of current reader selection
- [ ] Generated notes inherit the new study's visibility
- [ ] The study's `template_id` is set correctly
- [ ] Each note's `template_step_id` is set correctly

---

## Item 4: Study Templates Sub-tab UI

Replaces the Build 3 placeholder in the Plans tab's Study Templates sub-tab.

**List view:** one card per built-in template — name, description. Tapping a card prompts for a study name (pre-filled default, editable) and a confirm action. Confirming runs the Item 3 generation logic and opens the resulting study in the Notes panel.

No import button, no filter/sort control — with only three static, built-in templates, none of that machinery is needed yet. (Template import/creation is out of scope per this spec's Scope section.)

**Empty state:** not applicable — the three built-in templates are always present.

### Definition of Done (Item 4)

- [ ] Study Templates sub-tab shows the three built-in templates, replacing the placeholder text
- [ ] Tapping a template prompts for a study name
- [ ] Confirming generates the study and notes, and opens the new study in the Notes panel
- [ ] Cancelling the name prompt creates nothing

---

## Item 5: Verify Existing Note Behavior Is Unaffected

No new note-rendering logic is introduced by this build. This item is a verification pass, not new code: confirm that notes with a non-NULL `template_step_id` behave identically to any other note everywhere else in the app — editing, deleting, tagging, full-text search, the Notebook, nested notes (if applicable) — since nothing about template provenance is meant to be visually distinguished per this build's decisions.

### Definition of Done (Item 5)

- [ ] Template-generated notes are editable exactly like any other note
- [ ] Template-generated notes appear in full-text search (`notes_fts`) normally
- [ ] Template-generated notes can be tagged normally
- [ ] Deleting a template-generated note does not affect the study, the template, or other notes in the study
- [ ] A template-generated study can be renamed, archived, or have freeform notes added to it, exactly like any other study
- [ ] Deleting a `study_templates` row (should this ever be possible in a future build) does not cascade-delete existing studies or notes — `studies.template_id` and `notes.template_step_id` are historical references, not live dependencies

---

## Definition of Done (Build 5 Overall)

- [ ] All five items above are complete with their individual checklists
- [ ] Three built-in templates are available on fresh install
- [ ] Starting a template generates a study and its notes in one action, with no session state anywhere
- [ ] No verse anchor is ever attached to a template-generated note
- [ ] Generated notes are indistinguishable in behavior from freeform notes
- [ ] Study Templates sub-tab no longer shows placeholder text
- [ ] `FEATURE_INVENTORY.md` updated to reflect Build 5 additions
- [ ] `BUILD_4_ACTUAL_STATE.md` superseded by `BUILD_5_ACTUAL_STATE.md` after build ships

---

## Punch List — Deferred Beyond Build 5

- **Template Creator** — separate, future, standalone application (same status as the plan-creation UI)
- **Save Study as Template** — turn any existing study into a reusable template; depends on design work not yet done
- **Sharing/export of studies** — a user sharing a single study (e.g. a template-generated worksheet) with a friend or small group; likely designed alongside Save Study as Template, since the two ideas are connected
- **Copy review** — intro notes and step prompts make implicit methodological claims (e.g., why observation precedes interpretation). Draft copy should be reviewed by someone with hermeneutics or Bible-teaching background before ship, not just accepted as-drafted.
