# Template Bar — Additions to Proposal and Tech Spec

This document lists changes needed in the Design Proposal (v5) and Technical Specification (Build 1) to support the template bar session lifecycle: starting, pausing, resuming, completing, and ending template sessions.

---

## Design Proposal (v5)

### Section 7: Study Templates — add Session Lifecycle paragraph

Insert after the "Session-level visibility" paragraph and before the "Template creator" paragraph:

> **Session lifecycle:** A template session is the combination of a template and a passage — "Inductive Study on Romans 5" is one session. Sessions persist automatically. If the user toggles the guide off, navigates away, closes the app, or starts a different session, progress is saved. The template selector menu in the template bar lists all in-progress sessions alongside the available templates; clicking a paused session resumes it from the last active step. Multiple sessions can exist simultaneously — only one is active in the bar at any time. When the user advances past the final step, the session is marked complete and its record is preserved in the journal. The "End Session" action in the selector menu closes a session early with a confirmation prompt; the session record is saved with incomplete status and all notes remain anchored to their passages.

### Section 7: Study Templates — update Welcome page paragraph

Replace:

> **Welcome page:** When a user opens a study template or workflow, they first see a welcome page generated from the template and plan metadata. The welcome page shows: the study title and description, estimated total time, session count and outline, a visibility choice (notes created during this study will default to shareable or private), and a "Begin Study" button. For group-distributed templates, the welcome page can include a sharing destination.

With:

> **Welcome page:** When a user starts a new template session, they first see a welcome page. The welcome page shows: the template name and description, estimated total time, a passage field pre-filled with the currently displayed passage (adjustable), a visibility choice (notes created during this study will default to shareable or private), and a "Begin Study" button. The welcome page appears as a lightweight overlay — not a full-screen modal, consistent with the principle that the text is never obscured. For group-distributed templates, the welcome page can include a sharing destination. Resuming a paused session skips the welcome page and loads directly to the last active step.

### Section 9: Workflows — add session creation detail

After the existing sentence about workflows, add:

> Each day's workflow session is created automatically when the reading plan advances. If the previous day's session was not completed, it remains in the in-progress list and can be resumed from the template selector menu.

### Section 10: Session Summaries — add session status detail

Replace:

> Every meaningful study action generates a lightweight **session record**: date, passages read, notes created or modified, tags and themes used, template steps completed, and any incomplete work.

With:

> Every meaningful study action generates a lightweight **session record**: date, passages read, notes created or modified, tags and themes used, template steps completed, and session status (in-progress, complete, or ended). Template sessions that are paused mid-study remain in-progress until completed or explicitly ended by the user. Ended sessions are preserved with their partial progress rather than discarded.

### Schema Overview — update session_records description

Replace:

> - **session_records** — Auto-generated session summaries: ID, date, passages JSON, note IDs JSON, tags used JSON, template progress JSON, status (complete/in-progress), visibility_default.

With:

> - **session_records** — Auto-generated session summaries: ID, template ID (nullable — NULL for freeform sessions), passage range (verse start, verse end), start date, last modified date, current step number, note IDs JSON, tags used JSON, status (in-progress/complete/ended), visibility_default.

---

## Technical Specification (Build 1)

### Schema — update session_records table

The existing `session_records` table lacks the fields needed for session lifecycle. Replace:

```sql
CREATE TABLE IF NOT EXISTS session_records (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    date                TEXT NOT NULL,
    passages_json       TEXT,
    note_ids_json       TEXT,
    tags_used_json      TEXT,
    template_progress   TEXT,
    status              TEXT NOT NULL DEFAULT 'complete',
    visibility_default  TEXT NOT NULL DEFAULT 'private'
);
```

With:

```sql
CREATE TABLE IF NOT EXISTS session_records (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id         INTEGER,                            -- NULL = freeform session
    verse_start         INTEGER NOT NULL,                   -- passage range start (BBCCCVVV)
    verse_end           INTEGER NOT NULL,                   -- passage range end (BBCCCVVV)
    current_step        INTEGER NOT NULL DEFAULT 0,         -- 0-indexed step position
    started_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    status              TEXT NOT NULL DEFAULT 'in-progress', -- 'in-progress', 'complete', 'ended'
    visibility_default  TEXT NOT NULL DEFAULT 'private',
    note_ids_json       TEXT,                               -- JSON array of note IDs created during session
    tags_used_json      TEXT,                               -- JSON array of tag names used
    FOREIGN KEY (template_id) REFERENCES study_templates(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON session_records(status);
CREATE INDEX IF NOT EXISTS idx_sessions_template ON session_records(template_id);
```

Key changes: added `template_id` foreign key, replaced `passages_json` with typed `verse_start`/`verse_end`, added `current_step` for resume support, split `date` into `started_at`/`updated_at`, changed default status from `'complete'` to `'in-progress'`, added indexes for status and template lookups.

### Schema — verify notes.template_session_id reference

The existing `notes` table already has:

```sql
template_session_id INTEGER,  -- NULL = freeform note
```

This correctly links notes to their session. No change needed, but confirm that the foreign key relationship to `session_records(id)` is enforced or documented.

### Queries — add session lifecycle queries

These queries support the template bar's session management. They are not wired to UI in Build 1 (templates are Build 3), but the schema must support them.

**Get in-progress sessions for the selector menu:**

```sql
SELECT sr.id, sr.template_id, sr.verse_start, sr.verse_end,
       sr.current_step, sr.updated_at, st.name AS template_name,
       (SELECT COUNT(*) FROM template_steps ts WHERE ts.template_id = sr.template_id) AS total_steps
FROM session_records sr
JOIN study_templates st ON st.id = sr.template_id
WHERE sr.status = 'in-progress'
ORDER BY sr.updated_at DESC
```

**Start a new session:**

```sql
INSERT INTO session_records (template_id, verse_start, verse_end, status, visibility_default)
VALUES (?, ?, ?, 'in-progress', ?)
```

**Update session progress (on step change):**

```sql
UPDATE session_records
SET current_step = ?, updated_at = datetime('now')
WHERE id = ?
```

**Complete a session:**

```sql
UPDATE session_records
SET status = 'complete', current_step = ?, updated_at = datetime('now')
WHERE id = ?
```

**End a session early:**

```sql
UPDATE session_records
SET status = 'ended', updated_at = datetime('now')
WHERE id = ?
```

### HTML / CSS — template bar structure note

The template bar element (`#template-bar`) is placed in the `#app-frame` layout between `#title-bar` and `#main`, spanning the full application width. The selector menu within the bar needs to render four groups: in-progress sessions, start new, actions, and end session. This markup is detailed in the Template Bar Design document and the companion wireframe (`ember-wireframe-template-bar.html`).

The `#study-section` element previously in the side panel is removed. The side panel contains two sections (`#notes-section` and `#tools-section`) with a single resize handle between them.

---

# Studies, Notebook, Highlighter, Reader, and Search — Additions to Proposal and Tech Spec

This section documents the introduction of Studies as a note-grouping concept, the Notebook overlay, the floating highlighter, the simplified verse interaction model, and search shortcut behavior.

---

## Design Proposal

### Section 4: Notes — add Studies concept

Insert after the "Nested notes" paragraph:

> **Studies:** A study is a named container that groups related notes together. Where individual notes are anchored to verses, a study collects notes into a coherent unit of work — for example, "Romans 5 word study," "Covenant theme across Genesis," or "Sunday sermon prep." Notes created while a study is open are automatically associated with that study. A note can also exist outside any study (freeform).
>
> The notes panel displays studies as **browser-style tabs** across the top of the panel. Each tab shows the study name. The user can have multiple studies open simultaneously, switching between them by clicking tabs. A "+" button on the tab bar creates a new study. Tabs can be closed without deleting the study — closing a tab removes it from the active tab bar, but the study and all its notes persist and can be reopened from the Notebook.
>
> **Drag-to-quote:** The user can drag a verse from the reader into an open note to insert an inline Scripture quotation. The quotation renders as a styled block showing the verse text and reference, and functions as a clickable link back to that verse in the reader. This supports the natural study pattern of collecting relevant verses within a note without retyping them.
>
> **Timestamps:** Both studies and notes carry created and modified timestamps. Notes already have `created_at` and `modified_at` fields. Studies add the same. These timestamps enable future features: journal view (reverse-chronological study history), calendar integration (what did I study on a given date), and data visualization (study patterns over time).

### Section 4: Notes — add Notebook concept

Insert after the Studies paragraph:

> **Notebook:** The Notebook is the master view of all studies. It is accessed via a small icon (e.g., a book or grid icon) at the top-left of the notes panel header. Clicking the icon opens a floating overlay panel — similar in behavior to the search results panel and the help panel — that lists all studies with their titles, dates, and associated passage ranges. The user clicks a study in the Notebook to open it as a tab in the notes panel.
>
> The Notebook is not a primary panel and does not occupy space in the three-panel layout (reader, notes, reference). It is a utility overlay for browsing and managing studies — things the user does between study sessions, not during them. Future features that serve a similar "between sessions" purpose — such as the journal timeline, calendar view, and study analytics — can also live in the Notebook overlay, accessible as tabs or sections within it. The principle: tools used *during* study live in the three main panels; tools used to *review or organize* past study live in the Notebook.

### User Interface Structure — update Notes section

In the side panel description under "Notes," append:

> Notes are organized into studies, displayed as browser-style tabs across the top of the notes panel. A Notebook icon in the panel header opens a floating overlay listing all studies for browsing and management.

### Section 3: Reader — update verse interaction model

Replace the paragraph describing the contextual toolbar behavior:

> **Verse selection:** Clicking a verse selects it. Selection is the primary interaction — it does not open a menu. Instead, the rest of the application reacts to the selection contextually: the notes panel shows notes anchored to the selected verse and connects new notes to it, the reference panel updates to show cross-references and language data for the selection, and tags associated with the verse are surfaced in the tag subpanel. There is no per-verse popup menu.
>
> **Highlighter:** A small floating highlighter icon is positioned at the mid-left inside edge of the reader panel, anchored to the viewport (it does not scroll with the text). Clicking the icon expands it into a compact row of color dots (one per available highlight color, using the existing six-color palette). Clicking a color dot activates highlight mode — subsequent verse clicks apply that color as a highlight. Clicking the active color dot or the highlighter icon again deactivates highlight mode and collapses the dots back to the single icon. Clicking an already-highlighted verse while in highlight mode removes the highlight.
>
> **Bookmark:** A bookmark button is placed in the reader header bar (near navigation controls or settings). Clicking it toggles a bookmark on the currently selected verse.

### Section 6: Search — add empty-state shortcuts

Insert after the existing search description:

> **Search shortcuts:** When the user focuses the search bar without typing (empty state), the search results area displays a set of shortcuts, search help, and quick-access settings instead of an empty panel. Shortcuts include prefix-based filters:
>
> - `B-` — Filter results to the currently displayed book (e.g., if reading Romans, `B- justification` searches only Romans).
> - `B-Genesis` — Filter results to a specific named book.
> - `#tagname` — Filter results by tag (equivalent to a tag search).
> - `N-` — Search within notes only.
> - `S-` — Search within the current study's notes only.
>
> The empty state also shows a brief search help summary (explaining the prefix syntax) and links to search-related settings. This turns the empty search bar from a dead end into a discovery surface — users learn the filtering syntax by seeing it every time they open search.

---

## Technical Specification

### Schema — add studies table

This table supports the study grouping concept. It is created in the Build 1 schema (empty, like templates and plans) so the structure is in place.

```sql
CREATE TABLE IF NOT EXISTS studies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL DEFAULT 'Untitled Study',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    modified_at TEXT NOT NULL DEFAULT (datetime('now')),
    status      TEXT NOT NULL DEFAULT 'active'  -- 'active', 'archived'
);

CREATE INDEX IF NOT EXISTS idx_studies_status ON studies(status);
CREATE INDEX IF NOT EXISTS idx_studies_modified ON studies(modified_at);
```

### Schema — add study_id to notes table

Add a nullable foreign key to the existing `notes` table linking notes to studies:

```sql
ALTER TABLE notes ADD COLUMN study_id INTEGER REFERENCES studies(id);
CREATE INDEX IF NOT EXISTS idx_notes_study ON notes(study_id);
```

Notes with `study_id = NULL` are freeform notes (not part of any study). This preserves backward compatibility — all existing notes remain freeform.

### Schema — add note_quotes table

This table supports the drag-to-quote feature, storing inline Scripture quotations embedded in notes:

```sql
CREATE TABLE IF NOT EXISTS note_quotes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id     INTEGER NOT NULL,
    verse_start INTEGER NOT NULL,       -- BBCCCVVV format
    verse_end   INTEGER,                -- NULL if single verse
    position    INTEGER NOT NULL,       -- character offset in note body where quote is inserted
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotes_note ON note_quotes(note_id);
```

### Schema — confirm existing timestamp fields

The existing `notes` table already has `created_at` and `modified_at` fields with `datetime('now')` defaults. No changes needed for note timestamps. The new `studies` table includes matching timestamp fields.

The existing `text_markups` table already has `created_at` and supports the highlighter feature. No schema changes needed for highlighting.

### Queries — study lifecycle

**Create a new study:**

```sql
INSERT INTO studies (name) VALUES (?)
```

**List all studies (for Notebook):**

```sql
SELECT s.id, s.name, s.created_at, s.modified_at, s.status,
       COUNT(n.id) AS note_count
FROM studies s
LEFT JOIN notes n ON n.study_id = s.id
GROUP BY s.id
ORDER BY s.modified_at DESC
```

**Get notes for a study:**

```sql
SELECT n.id, n.body, n.created_at, n.modified_at
FROM notes n
WHERE n.study_id = ?
ORDER BY n.created_at ASC
```

**Associate a note with a study:**

```sql
UPDATE notes SET study_id = ?, modified_at = datetime('now') WHERE id = ?
```

**Update study timestamp (called when any note in the study is modified):**

```sql
UPDATE studies SET modified_at = datetime('now') WHERE id = ?
```

**Archive a study:**

```sql
UPDATE studies SET status = 'archived', modified_at = datetime('now') WHERE id = ?
```

### HTML / CSS — notes panel structure changes

The notes panel header gains two new elements:

1. A **Notebook icon** at the top-left of `#notes-section` header. Clicking it opens a floating overlay (`#notebook-overlay`) positioned relative to the notes panel, listing all studies. The overlay follows the same pattern as search results and help — a positioned floating panel with a close button, dismissed by clicking outside.

2. A **study tab bar** below the notes header, rendered as a horizontal scrollable row of tabs. Each tab shows the study name and a close (×) button. A "+" button at the end creates a new study. The active tab is visually distinguished. Tabs overflow horizontally with scroll, not wrapping.

### HTML / CSS — reader panel changes

The contextual toolbar (`#context-toolbar`) that previously appeared on verse click is removed. Verse click now only applies the `.selected` class to the verse element. The application listens for selection changes and updates the notes panel and reference panel contextually.

A **floating highlighter** element (`#highlighter-toggle`) is added inside `#reader-area`, positioned with `position: sticky` or `position: fixed` relative to the reader viewport, vertically centered on the left inside edge. Its resting state is a single icon. Its expanded state is a horizontal or vertical row of color dot buttons (one per highlight color). An additional "eraser" state is not needed — clicking a highlighted verse while in highlight mode removes the highlight.

The **bookmark button** is added to the reader header bar, next to existing controls.

### HTML / CSS — search empty state

When `#search-input` is focused and its value is empty, the `#search-results` container displays a static shortcuts panel instead of search results. This panel contains:

- A list of prefix shortcuts (`B-`, `B-BookName`, `#tagname`, `N-`, `S-`) with brief descriptions.
- A "Search Help" link that opens the help panel to the search section.
- A link to search-related settings.

The shortcuts panel is replaced by live search results as soon as the user begins typing. It reappears if the input is cleared.

### Proposal Schema Overview — add studies description

After the `notes` entry, insert:

> - **studies** — Study containers: ID, name, created timestamp, modified timestamp, status (active/archived).

Update the `notes` entry to mention the optional study_id:

> - **notes** — Note content: ID, body text (Markdown), created timestamp, modified timestamp, visibility (private/shareable), parent_note_id (nullable, for nesting), optional template_session_id, optional study_id.

---

## Summary of Changes

| Location | What changed |
|---|---|
| Proposal §7 | Added session lifecycle paragraph; updated welcome page to describe passage field and overlay behavior |
| Proposal §9 | Added note about incomplete workflow sessions persisting in the in-progress list |
| Proposal §10 | Updated session record description to include status values and paused/ended sessions |
| Proposal Schema | Updated session_records description with template_id, passage range, current step, and three-value status |
| Tech Spec Schema | Replaced session_records CREATE TABLE with new columns, foreign key, and indexes |
| Tech Spec Queries | Added five session lifecycle queries (list, start, update, complete, end) |
| Tech Spec HTML/CSS | Note about template bar placement and side panel simplification |
| Proposal §4 | Added Studies concept (named note containers, browser-style tabs, drag-to-quote, timestamps) |
| Proposal §4 | Added Notebook concept (floating overlay for browsing all studies, future home for journal/calendar) |
| Proposal UI | Updated Notes panel description to reflect study tabs and Notebook icon |
| Proposal §3 | Replaced verse popup menu with contextual selection model; added floating highlighter and bookmark button |
| Proposal §6 | Added search empty-state shortcuts (B-, #tag, N-, S- prefixes, search help, settings) |
| Proposal Schema | Added studies table description; updated notes to include optional study_id |
| Tech Spec Schema | Added studies table, study_id column on notes, note_quotes table |
| Tech Spec Queries | Added study lifecycle queries (create, list, get notes, associate, archive) |
| Tech Spec HTML/CSS | Notes panel gains Notebook icon and study tab bar; reader loses context menu, gains floating highlighter and bookmark button; search gains empty-state shortcuts panel |

---

# Build 1.5 Planning — Additions to Proposal, Tech Spec, and Help Doc

This section captures decisions made during the Build 1.5 planning conversation that need to land in the Design Proposal (v6), be reflected in the (sealed) Technical Specification, or be incorporated into the Help System Design doc.

---

## Design Proposal (v6)

### New Design Principle: The Physical Study Metaphor

Add as the **first bullet** in the Design Principles section (the UI/UX one, not the Data Architecture one), before the existing bullets. This is the organizing principle from which the others derive.

> **The application mirrors a physical Bible study setup.** This is the organizing principle from which the other principles follow.
>
> | Surface | Physical equivalent | What lives here |
> |---|---|---|
> | Reader pane | Your Bible | Scripture text, bookmarks, highlights, markups, verse selection |
> | Notes panel | Your notebook | Studies, notes, tags, organization, your own thinking |
> | Reference panel | Your reference shelf | Cross-references, topical indexes, book info, background material |
> | Settings popovers | Your workspace environment | Lighting (theme), reading glasses (font size), desk arrangement (layout) |
> | Help popovers | The expert you go to when you're stuck | Brief orientation per panel, deeper help on demand |
>
> When deciding where a feature belongs, ask: *in a physical study setup, where does this thing live?* The metaphor is also a one-sentence learning device for users — it appears in help popover copy but is never forced as a tutorial. A user who never recognizes the metaphor still uses the app fine, because the panels are also self-explanatory at a literal level.

### Refine: "The text is never obscured" principle

Replace the existing bullet:

> The text is never obscured by a modal or full-screen overlay.

With:

> **The text is never obscured during reading or study.** Modal overlays, splash screens, tutorials, and "what's new" notifications are forbidden — they interrupt the work. Help and settings popovers, which the user explicitly invokes when stepping outside the study, may overlay the text freely. The rule protects focused reading; it does not prevent the user from asking a question or adjusting their workspace.

---

## Technical Specification (Build 1 v2)

### Add disclaimer block at top of document

The tech spec is sealed as a historical planning document. Add this disclaimer block at the very top of `Technical_Spec_Build_1_v2.md`:

> **⚠️ STATUS: This spec reflects Build 1 as originally planned, not as built.** During implementation, the architecture evolved significantly — the panel layout, selection model, study/note relationship, and other details changed based on real design decisions. For the actual state of the codebase, refer to `BUILD_1_ACTUAL_STATE.md`. When this spec and the code disagree, **the code is correct.**

No other edits to the tech spec. Decisions about future builds are made in their own specifications (`Build_1_5_Spec.md`, future Build 2 spec, etc.).

---

## Help System Design Doc

The existing `Help_System_Design.md` was written before the physical study metaphor existed and before Build 1.5 scope was defined. Full reconciliation was performed during Build 1.5 planning:

- Restructured as three tiers (quick help, full help panel, search integration) with explicit build assignments
- Added the physical study metaphor as the framing concept for help copy
- Replaced existing popup copy with metaphor-aligned versions
- Removed "Study Guide popup" from Build 1.5 scope (templates are Build 3)
- Deferred full help panel and search integration to "Build 3 or later" formally
- Added metaphor as the opening section of the future full help panel
- Updated the help index keyword examples to include metaphor terms

The reconciled version replaces the original `Help_System_Design.md` in full.

---

## Feature Inventory

Updates to land when Build 1.5 ships are covered in the Build 1.5 spec, Item 9. No punch list action separate from the build itself.

---

## Bookmarks Schema

The `bookmarks` table is described in the tech spec but is not created by `createUserTables()` in the running code. Build 1.5 adds the table to `createUserTables()` (covered in Build 1.5 spec, Item 5a). No punch list action separate from the build itself.

---

## Build 2 Decisions Captured (Not Yet in Any Spec)

These decisions were made during Build 1.5 planning and should be referenced when the Build 2 spec is written. They are recorded here so they survive between sessions:

- **Translation selection UI:** A preselected translation row sits above the books in the book selection menu. Users do not interact with it unless changing translations. Each split-view pane has its own translation button (placeholders already exist in Build 1).
- **Translation switch behavior:** Switching translation in a pane preserves the current reference (Gen 1:1 → Gen 1:1). If the target translation does not contain that verse, fall back to the nearest preceding verse in the same chapter. Versification mismatch is not a Build 2 concern (all launch translations share English versification).
- **Anchor display coalescing:** Note anchors display as ranges (Genesis 1:4-7), not lists of individual verses. Storage is unchanged — each attach action creates a row, the coalescer merges contiguous anchors at render time. Multi-verse selection creates a single row with `verse_start` and `verse_end` set to the range endpoints. Single-verse anchors continue using `verse_end = NULL` (consistent with existing convention).
- **Bookmark relocation possibility:** When markup controls ship in Build 2, consider grouping the bookmark button and markup tools into a coherent "Bible actions" area in the reader header. Build 1.5 leaves the bookmark button in its current position.
- **Font size in settings popovers:** Reader and notes panels each get their own independent font size +/− with reset. The reader settings popover gains a "Show highlights" toggle when text markups ship in Build 2.
- **Plan-aware home screen:** Cut permanently. The reader is the home screen. The `#template-bar` element carries plan state when reading plans ship; no separate dashboard.
- **Context toolbar:** Cut permanently. CSS removed in Build 1.5.

---

## Cut From All Builds

These features were considered and explicitly cut. Recording them so they don't get re-suggested:

- **Plan-aware home screen** — Cut. The reader is the home screen. Violates "the text is always the center."
- **Context toolbar on verse selection** — Cut. Verse selection updating panels is sufficient; the floating toolbar adds learning cost without justifying it.

---

## Summary of Build 1.5 Planning Changes

| Location | What changed |
|---|---|
| Proposal Design Principles | Added physical study metaphor as first bullet |
| Proposal Design Principles | Refined "text is never obscured" to exempt meta-task UI (help, settings) |
| Tech Spec (entire document) | Added historical-planning disclaimer at top; sealed against further edits |
| Help System Design | Full reconciliation: three tiers, metaphor-aligned copy, Build 1.5 scope, deferred full panel |
| Build 1.5 Spec | New document (`Build_1_5_Spec.md`) covering nine cleanup items plus tech spec disclaimer |
| Punch List | Captured Build 2 design decisions for future spec work |

---

# Build 2 Planning — Additions to Proposal, Tech Spec, and Punch List

This section captures decisions made during the Build 2 planning conversation. Parallel to the Build 1.5 Planning section above. These decisions should be referenced when the Build 2 spec is written and should survive between sessions.

---

## Scope (Locked)

Build 2 ships four new features. Implementation order:

1. Range selection + anchor coalescing
2. Text markups
3. Cross-references (Related tab)
4. Multi-translation

Reading plans moved to Build 3 to allow the UI concept time to settle. Data model decisions for plans are recorded below under "Build 3 Planning — Reading Plans."

**Out of scope for Build 2:** lexicon/language tools, study templates, nested notes, data export, PWA install prompt, memory verses, home screen, context toolbar, full help panel, user-added translations beyond the bundled shortlist, cross-translation search, character-level markups, versification mismatch handling, reading plans.

---

## Range Selection

- **Gesture:** Shift-click extends selection from anchor verse. Plain click creates a new single selection and sets a new anchor. Shift-click measures from the anchor, allowing both extension and contraction.
- **Click target:** Two listeners. `.verse` handles selection (plain click selects + sets anchor; shift-click extends from anchor) and calls `stopPropagation()`. `.pane-content` handles deselect — any click that bubbles up to it (i.e., not on a verse) clears the selection, clears the anchor, and fires `selection-changed` with empty state. Margin click as the deselect gesture matches the physical metaphor of taking your finger off the page. Shift+margin clears too — there's nothing to extend to.
- **Selection scope:** Contiguous verses within a single chapter. Chapter boundaries break a range; plain margin click inside `.pane-content` clears the selection, anchor, and dependent panel state; navigating clears it.
- **Storage:** Multi-verse selection creates a single `note_anchors` row with `verse_start` and `verse_end` set to the range endpoints. Single-verse anchors continue using `verse_end = NULL`.
- **Display coalescing:** Contiguous anchors merge at render time into ranges like "Genesis 1:4-7." Storage is unchanged — each attach action creates a row; the coalescer merges for display only.
- **Query pattern:** All `note_anchors` queries already use the range-aware `WHERE verse_start <= ? AND COALESCE(verse_end, verse_start) >= ?` pattern (confirmed in Build 1.5 audit). No migration required.

---

## Text Markups

- **Schema:** New `markups` table in the user database: `id, verse_start, verse_end, type, color, created_at`. Anchored the same way as notes, using the same NULL convention and range-aware queries.
- **Scope:** Whole-verse markups only. Character-level is deferred indefinitely — it would require a different storage model (offset ranges within verse text) and is a separate project.
- **Types and palette:**
  - **Highlight:** 5 colors — yellow (default), green, blue, pink, orange
  - **Underline:** 2 styles — solid, wavy; both in ink color
  - **Circle:** 1 style, ink color; marks emphasis on a verse or range
- **Palette storage:** CSS custom properties, so dark mode gets its own tuned versions.

### Markup Button (Single Control)

The markup button lives in the reader header, grouped with the bookmark button as the "Bible actions" cluster (fulfilling the Build 1.5 punch list note about regrouping these controls). The button is a single toggle with two states:

- **Collapsed (default):** only the button is visible. Highlights layer is hidden. Clean book mode.
- **Expanded:** button expands into the tool strip showing all palette options. Highlights layer becomes visible. Marking-up mode.

Clicking the button toggles between states. One control, two states, no separate "Show highlights" setting anywhere. The physical metaphor is exact: reach for your highlighter kit and it's open on the desk; tuck it away and the page goes clean.

**Implications:**

- **No "Show highlights" entry in the reader settings popover.** The button is the only control. Settings popover stays focused on existing controls (font size, etc.).
- **Selection behavior when collapsed:** Clicking a verse still selects it (notes and tags still work), but no markup UI appears because the button hasn't been expanded. The only way to mark up is to expand the button. Both orders work — expand then select, or select then expand. The tool strip acts on the current selection.
- **Persistence across reload:** The button's state persists. If you left the tools out, they come back out when you reopen the app. Matches the "walked away from your desk, came back" principle.
- **Split view:** Shared state across both panes. Marking up is a mode the user is in, not a per-pane property. One button in the reader header controls both panes. When expanded, marking up works in whichever pane the user clicks.

---

## Cross-References

- **Dataset:** OpenBible.info ranked cross-references only. Already in the project at `build/sources/cross_references.txt`. CC-BY licensed, snapshot date in file header. 344,799 rows. Format is tab-separated with `From Verse`, `To Verse`, `Votes` columns; verse format is `BookName.Chapter.Verse` (e.g., `1John.4.9`); ranges use `Start-End` format. Book tokens map cleanly to internal book IDs with a single static lookup. See `CROSSREF_RECON.md` for the full reconnaissance.
- **TSK dropped from Build 2.** Considered as a complementary source but cut. Adds significant data prep complexity (book abbreviation normalization, merge logic, dedup) without changing the headline experience — OpenBible's vote-ranked data already provides Build 2's curation needs. The `sources` field in the schema leaves room to add TSK later as `"ob,tsk"` if it becomes a felt need.
- **Storage:** One table in `core.db` (not a separate file — this is app data, not content, and does not need to be addable/removable like translations). Alongside Nave's topics.
- **Schema:** `cross_references(source_verse, target_start, target_end, votes, sources)`. All 344,799 rows stored verbatim, including negative-vote rows. Nothing discarded. Compound index on `(source_verse, votes DESC)` covers the canonical query and makes the sort free.
- **Range NULL convention:** Single-verse targets use `target_end = NULL`, matching `note_anchors` and `markups`. Same-chapter range targets store both endpoints. Consistent pattern across the app.
- **Cross-chapter and cross-book range splitting:** The OpenBible source includes 655 same-book cross-chapter ranges and 18 cross-book ranges. The data prep script splits them at chapter and book boundaries — one row per chapter the range touches, each inheriting the original vote count. The user sees two clean intra-chapter entries that travel together visually because they share the same source verse. Cross-book splits are written to a report file for hand-audit before commit. This is honest about the data shape and avoids special-casing in the reader.
- **Sources field:** String like `"ob"` (Build 2 default everywhere) with room for `"tsk"` or `"ob,tsk"` if TSK is added later.
- **Scale estimate:** 344,799 OpenBible rows + ~700 split rows = ~345,500. Adds ~12-18MB to `core.db`. Smaller than the prior TSK+OpenBible estimate because TSK is gone.
- **Vote floor:** A constant `CROSSREF_VOTE_FLOOR = 5` lives in `js/db.js`. The default Related tab query applies the floor; "Show all" bypasses it. Tunable from the browser console via `window.emberDebug.crossrefFloor` for live iteration during development. No database rebuild required to change the floor.
- **Display:** Top 25 by votes DESC at floor 5 in the default view. "Show all" expands to every cross-reference for the verse — bypasses the row cap and the floor — grouped by target book in canonical order. Both the count and the floor are tunable constants; expect to adjust during Build 2 testing based on how the Related tab feels in actual use.
- **Empty state:** "No cross-references for this verse" when nothing exists above the floor. If the long tail has refs but the default view is empty, hint at "Show all."
- **Interaction:** Clicking a cross-reference navigates the active reader pane to the target *and* selects the range. Range selection is a first-class Build 2 feature, and cross-references are where it earns its keep visually.
- **Nave's curation gap audited at Build 2 time.** `CROSSREF_RECON.md` flags John 1:1's Christological neighborhood as a Nave's coverage gap — INCARNATION missing as a visible topic, WORD OF GOD possibly mis-parsed, TRINITY coverage thin. A short curation pass before Build 2 ships cross-references closes the gap so John's Gospel feels right in the Related tab. This is data work, not code work; treated as a guide chapter in Part 3.

---

## Multi-Translation

### Storage Model: One SQLite File Per Translation

- Each translation lives as its own `.db` file in OPFS under `translations/`.
- `core.db` no longer contains Scripture text. KJV moves to `translations/kjv.db`, bundled and seeded on first install alongside the other shortlist translations and `core.db`.
- `core.db` becomes the app data database: cross-references, Nave's topics, book metadata, translation manifest.
- User tables (notes, bookmarks, studies, tags, markups) remain in the user database, untouched by translation add/remove.

**Rationale:** Optimizes for the future "user adds/removes translations from external files" workflow. Add = copy file + register in manifest. Remove = delete file + deregister. No surgery on a shared database, no corruption risk from malformed third-party files, portable format (bundled and imported files are identical), per-pane loading is natural (each pane holds a handle to its active translation's `Database` object).

### Schema Inside Each Translation File

- `verses(book, chapter, verse, text)`
- `books(id, name, abbreviation, testament, chapter_count)`
- `meta(name, abbreviation, year, license, versification, schema_version)`
- FTS5 virtual table over `verses` for per-translation search

### Manifest Table in `core.db`

`translations(id, filename, name, abbreviation, year, license, installed_at, is_bundled)`. On app start, the app reads the manifest, opens a handle to each file, and caches the handles. The book picker's translation row reads from this table.

### Query Layer Refactor

Every Scripture-reading function (`getChapter`, `getVerse`, `searchScripture`) takes a `translationId` parameter or reads it from pane state. A `getTranslationDb(id)` helper returns the right `Database` handle. This touches every Scripture read site — notable but not huge.

### Search Scope

Per-translation. Search executes against the active pane's translation FTS table. Cross-translation search is out of scope for Build 2.

### Bundled Shortlist (6 Translations)

| Translation | Notes |
|---|---|
| KJV | Already bundled; moves to `translations/kjv.db` |
| ASV (1901) | KJV lineage, slightly modernized, scholarly |
| WEB (World English Bible) | Modern English, actively maintained public domain |
| YLT (Young's Literal) | Hyper-literal, useful for word study |
| Darby | 19th century, literal-leaning |
| BSB (Berean Standard Bible) | Modern, public domain as of April 30, 2023 |

**BSB licensing note:** Dedicated to the public domain April 30, 2023. All uses freely permitted. Attribution and linking appreciated but not required. The Berean name may be used because Ember maintains verbatim text. Optional attribution can appear in the translation's info display in the book picker or a future About screen. Not a UI concern for Build 2.

> **Superseded (November 2026):** planned: Darby will no longer be installed by default. KJV will be the only locked translation and can't be removed. ASV, WEB, YLT and BSB will install by default and can be removed and downloaded again. Darby will be the first add-on translation, available from a Translations shelf reached from the book picker. See `Translation_Addons_Spec.md`.

### Translation Selection UI

- A preselected translation row sits above the books in the book selection menu. Users do not interact with it unless changing translations.
- Each split-view pane has its own translation button (placeholders already exist in Build 1).
- Switching translation in a pane preserves the current reference. If the target translation does not contain that verse, fall back to the nearest preceding verse in the same chapter. Versification mismatch is not a Build 2 concern — all launch translations share English versification.

### Per-Pane State Persistence

Each pane remembers its own `{ translation, book, chapter, verse, scroll_position }` across reload. Walk away from the desk, come back the next day, find it exactly as you left it. Split-view pane translations persist independently.

### Loading Strategy

All six bundled translations are seeded into OPFS during the same bootstrap that currently seeds `core.db`. No lazy loading, no "please wait" moments, no first-use friction after install.

> **Superseded (November 2026):** planned: first boot will seed the five default translations (KJV, ASV, WEB, YLT, BSB), and Darby and any later add-ons will download only when the user adds them. See `Translation_Addons_Spec.md`.

### Future (Post-Build-2 Conversation)

A user-facing "add translation" workflow that accepts external files conforming to the translation file schema. Not in Build 2 scope. NIV and other licensed translations would eventually arrive via that path, with whatever licensing arrangement is required at that time. Recorded as a future conversation.

---

## Cut From Build 2 (Recording So They Don't Get Re-Suggested)

- **Character-level markups** — deferred indefinitely; different storage model, separate project.
- **Cross-translation search** — out of scope; search is per-translation.
- **User-added translations** — future workflow; bundled shortlist only in Build 2.
  > **Partly superseded (November 2026):** planned: users will add and remove translations from Ember's own catalog on a Translations shelf. Importing your own translation file stays future work. See `Translation_Addons_Spec.md`.
- **Lazy-loaded translations** — all bundled translations seed at install time.
  > **Superseded (November 2026):** planned: only the five default translations will seed at install time, and Darby and any later add-ons will download when the user adds them. See `Translation_Addons_Spec.md`.
- **Versification mismatch handling** — all launch translations share English versification.
- **Click-to-preview cross-reference in reference panel** — clicking navigates + selects; no preview-in-place. Can be revisited later.
- **"Show highlights" as a separate setting** — merged into the markup button itself; no settings entry.
- **TSK (Treasury of Scripture Knowledge) cross-references** — deferred. OpenBible alone provides Build 2's curation needs. May be added later as augmentation via the `sources` field already in the schema. The data prep shape and book name normalization for TSK would be net new work, so revisit only if the long tail becomes a felt need.
- **Topic overlap annotation on cross-references** — visual indicator + tooltip showing which Nave's topics a cross-reference shares with the source verse. Free at query time via JOIN to `topic_verses`. Deferred to a polish pass — see "Post-Build-2 Polish Ideas" below.
- **Topic-aware sorting for cross-references** — boost shared-topic refs above pure votes-DESC. Deferred to the same polish pass.

---

## Post-Build-2 Polish Ideas (Recording So They Don't Get Lost)

These are real ideas that surfaced during Build 2 planning but aren't in scope for Build 2 itself. They're recorded here so they survive between sessions and so the next planning conversation doesn't have to rediscover them.

### Topic Overlap on Cross-References

`CROSSREF_RECON.md` flagged that cross-checking each cross-reference against `topic_verses` is a strong secondary quality signal independent of vote count. Pattern from the recon: "high votes + shared topic" is almost always a genuinely useful link; "high votes + no shared topic" is worth investigating case by case.

Two flavors of this feature, both deferred from Build 2:

1. **Visual indicator + tooltip.** A small dot or star next to cross-references that share at least one topic with the source verse. Hovering shows the list of shared topics. Cheap to add (one JOIN at query time). Doesn't change sort order — just annotates.

2. **Topic-aware sort.** Promote shared-topic refs nearer the top of the Related tab results. Two sub-options:
   - **Strict tier:** shared-topic refs first (sorted by votes within), then pure votes-DESC for the rest.
   - **Weighted score:** `score = votes + (shared_topics_count × N)` where N is a tunable boost. Predictable but harder to explain.
   - Lean toward the strict tier as the default with pure votes as a fallback toggle.

Both flavors land together in the same polish pass. Build the visual indicator first, then layer the sort on top of it.

### TSK Augmentation

If the long tail of OpenBible cross-references ever feels insufficient — particularly for less-popular verses where vote signals are sparse — TSK can be added later as a complementary source. The schema already has the `sources` field for this. Adding TSK would involve: obtaining a clean parseable source, normalizing book abbreviations, merging with OpenBible (preserving votes for refs that exist in both), and writing the merged data into the same `cross_references` table. No schema migration required.

### Cross-Reference Display Tuning

Two tunable constants in `js/db.js` (`CROSSREF_VOTE_FLOOR`, top-N count) will need adjustment based on actual feel during Build 2 testing. The dev hooks (`window.emberDebug.crossrefFloor`, `window.emberDebug.crossrefTopN`) make this easy. Once Build 2 ships and you've used the Related tab in real study sessions, the values may settle differently than the initial defaults of 5 and 25.

### Nave's Curation Gaps Beyond Christology

Build 2 closes the John 1:1 / Christological gap (INCARNATION, WORD OF GOD, TRINITY). Other Nave's gaps will surface during use. There's no point trying to find them all in one pass — just fix them as they show up. A pattern: when a verse's Related tab feels unhelpful, check whether it's a Nave's coverage problem (missing topic) or a cross-reference data problem (sparse OpenBible signal). The first is cheap to fix; the second is what TSK augmentation would address.

---

# Build 3 Planning — Reading Plans

Reading plans were scoped into Build 2 during early planning, then moved to Build 3 to allow the UI concept time to settle. The data model decisions below are locked in; the UI decisions are locked in at the structural level but may be refined during Build 3 spec work.

---

## Surface (UI Structure)

Reading plans live in **two new tabs** in the reference panel:

- **Plans tab (the bookshelf):** Lists all installed plans grouped by status — in progress, not started, completed. This is the plan picker and management surface. Import, export, and delete live here. Picking a plan that isn't already active creates or opens its workspace in the Current Plan tab.
- **Current Plan tab:** Only present when a plan is active. The workspace for the active plan — current step, scripture references, devotional content, reflection questions, mark complete action, catch-up action (if date-bound).

Tab order for the reference panel will include these two tabs when Build 3 ships. Exact position among existing tabs (Info, Tags, Related) to be confirmed during Build 3 spec work.

The **`#template-bar`** element (already present in the DOM, carried forward from Build 1) shows the active plan's current step as a compact always-visible surface. Hidden when no plan is active.

**One active plan at a time.** Multiple installed plans are available, but only one drives the template bar and the Current Plan tab at a time. Switching active plans happens from the Plans tab.

---

## Data Model

### Plan JSON Format (Canonical)

```json
{
  "plan_metadata": {
    "id": "grace-101",
    "title": "Finding Peace",
    "description": "A three-day walk through peace and anxiety.",
    "author": "Example Publisher",
    "language": "en",
    "duration_days": 3,
    "schedule_type": "sequential",
    "tags": ["Peace", "Anxiety"],
    "schema_version": 1
  },
  "days": [
    {
      "day_number": 1,
      "title": "Cast Your Cares",
      "scripture": [
        { "ref": "1PE.5.7", "display": "1 Peter 5:7" },
        { "ref": "PSA.55.22", "display": "Psalm 55:22" }
      ],
      "devotional": {
        "title": "The Weight of Worry",
        "body": "Today we look at the weight of worry...",
        "reflection_questions": [
          "What is one thing weighing on you today?",
          "How does 1 Peter 5:7 change your perspective?"
        ]
      }
    }
  ]
}
```

### Metadata Fields

- `id` — unique plan identifier (string)
- `title` — display name
- `description` — short paragraph describing the plan
- `author` — author or publisher
- `language` — ISO code (e.g., `"en"`)
- `duration_days` — number of steps in the plan
- `schedule_type` — `"sequential"` or `"date"`. Sequential plans advance when the user taps mark complete. Date-bound plans expect one step per calendar day and support catch-up.
- `tags` — array of topic strings
- `schema_version` — integer, currently `1`. Future Ember versions use this to handle old plans cleanly.

### Day Fields

- `day_number` — 1-indexed step number
- `title` — optional day title
- `scripture` — array of `{ref, display}` pairs. `ref` uses USFM short codes (e.g., `JHN.3.16-21`). `display` is the human-readable string (`"John 3:16-21"`). A day may have one or many passages.
- `devotional` — optional. Plans that are pure Scripture (e.g., M'Cheyne) omit this block entirely.
  - `title` — devotional title
  - `body` — devotional text (Markdown supported)
  - `reflection_questions` — array of strings. Rendered as a list; capturing user answers is a future feature.

**Forward compatibility:** The schema does not reject unknown fields at the day level. A future version can add fields like `media: [...]` without invalidating Build 3 plans.

**USFM book codes:** Standard 3-letter codes (GEN, EXO, ..., REV). A static 66-row USFM-to-internal-book-number mapping lives as a JS constant (not a DB table — tiny and never changes). Scripture refs are pre-resolved to internal BBCCCVVV components at import time, so clicking a day's reading doesn't require re-parsing USFM every time.

---

## Schedule Types

**Sequential plans:**
- Plan advances one step at a time when the user taps "mark complete."
- `current_step` counter starts at 0 (not started) and advances to `duration_days` (complete).
- No catch-up action — there's nothing to catch up to.

**Date-bound plans:**
- Expect one step per calendar day, starting from a recorded `start_date`.
- `current_step` advances on mark complete, same as sequential.
- A "catch up" action computes the expected step from the start date: `expected_step = min(days_elapsed_since_start + 1, duration_days)`. If `current_step < expected_step`, the catch-up button is shown. Tapping it advances `current_step` to `expected_step`.
- Sequential plans treat catch-up as a no-op — the button is simply not displayed.

Treating everything sequentially at the progress-tracking level (with catch-up as a date-bound enhancement) keeps the core model simple.

---

## Import and Export

### Two Template Formats

1. **JSON template** — full schema, supports devotional content. Use for rich plans with titles, bodies, reflection questions.
2. **CSV template** — minimal schema for simple Scripture-only plans:
   ```
   day,ref,display
   1,JHN.3.16-21,John 3:16-21
   2,ROM.8.28-30,Romans 8:28-30
   ```
   CSV imports require a small metadata dialog where the user fills in title, description, duration, schedule_type, and tags. CSV is not suitable for devotional plans (multi-paragraph body text, escaping, etc.).

Format detection is by file extension (`.json` / `.csv`). Both templates are provided as downloads from the Plans tab so users (including Wayne) can create plans.

**Export** produces a JSON file — always JSON on export, even if the plan was imported as CSV. This consolidates the portable format on the richer schema.

---

## Database Schema (User DB)

```sql
plans(
  id INTEGER PRIMARY KEY,
  plan_id TEXT UNIQUE,
  title TEXT,
  description TEXT,
  author TEXT,
  language TEXT,
  duration_days INTEGER,
  schedule_type TEXT,
  tags TEXT,
  schema_version INTEGER,
  source TEXT,
  imported_at INTEGER,
  start_date INTEGER,
  current_step INTEGER,
  status TEXT
)

plan_days(
  plan_id INTEGER,
  day_number INTEGER,
  title TEXT,
  devotional_title TEXT,
  devotional_body TEXT,
  reflection_questions_json TEXT,
  PRIMARY KEY (plan_id, day_number)
)

plan_day_scripture(
  plan_id INTEGER,
  day_number INTEGER,
  sequence INTEGER,
  ref TEXT,
  display TEXT,
  book INTEGER,
  chapter INTEGER,
  verse_start INTEGER,
  verse_end INTEGER,
  PRIMARY KEY (plan_id, day_number, sequence)
)
```

**Notes:**
- `plans.source` = `"bundled" | "imported"`
- `plans.start_date` is NULL for sequential plans; set to import/start time (as a unix timestamp) for date-bound plans
- `plans.current_step` = 0 when not started; otherwise 1..duration_days
- `plans.status` = `"not_started" | "active" | "completed" | "paused"`
- Reflection questions stored as a JSON string in `plan_days`; small enough to not need a separate table
- Scripture refs pre-resolved at import time so navigation is cheap

---

## Bundled Plans

TBD during Build 3 spec work. Candidates:
- M'Cheyne One-Year Reading Plan (date-bound, 365 days, 4 passages per day, no devotional)
- Bible in a Year — chronological
- Bible in a Year — canonical
- A Gospel-focused 90-day plan

Plan sources to be reviewed during Build 3 planning to finalize the selection and verify the data model handles the range of real-world plan shapes.

---

## Reflection Questions (First Pass)

Render-only. Reflection questions display as a list in the Current Plan tab but Ember does not capture user answers in Build 3. Capturing answers is a later feature, likely tied to the Notebook/journal concept. The data shape supports it already (each question is distinct), so adding answer capture later is additive, not breaking.
