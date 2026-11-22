# Ember Bible Study — Design Proposal (v5)

---

## Executive Summary

This document describes **Ember Bible Study** (referred to throughout as **Ember**), a Bible study application designed for serious, long-term Scripture study. The software is built around a single organizing principle: **the biblical text is always the center, and every tool radiates outward from it**. Rather than offering a sprawling feature set behind menus and toolbars, the application presents a clean reading surface where study tools appear contextually — only when the user reaches for them, and always anchored to the passage being studied.

Study is modeled as **relationship formation**. Every interaction — reading, annotating, linking passages, tracing themes — contributes to a growing personal knowledge network anchored to biblical text. The application does not organize knowledge into folders or categories; it discovers relationships within the user's accumulated study and surfaces them when relevant.

The architecture is offline-first, zero-dependency, and designed so that the initial release contains every structural foundation needed to support future features without reworking the core. All launch data — Scripture text, cross-references, original language data, and lexicons — is sourced from public domain or openly licensed datasets, eliminating licensing costs and legal risk.

The application is **desktop-first**. It is designed as a focused study workspace optimized for laptop and desktop screens, with study panels, a tag palette, and template navigation that take full advantage of available screen space. Mobile is not a launch target; the architecture supports a future mobile layout if demand warrants it.

The result is a tool that feels as simple as reading a book on day one, but accumulates years of personal study into a searchable, interconnected knowledge base that grows richer with every session.

---

## Design Philosophy

### Text-Centered Interaction

The user is always reading Scripture. They never navigate "to a feature." Selecting text — a verse, a range, or a word — is the universal entry point for study. The rest of the application reacts to the selection contextually: notes, cross-references, tags, and original language data update to reflect what is selected. Every tool lives in a panel alongside the text, never replacing it. The application is not navigated by features but by relationships to text.

### Study as Relationship Formation

Serious Bible study consists primarily of forming connections: passage to passage, passage to theme, passage to historical context, passage to language data, passage to personal insight. The system therefore models nearly all information as linked entities, not isolated documents. Notes are not files. Themes are not folders. Everything is relational, and the software's value increases not through added features but through accumulated relationships.

### Progressive Disclosure

A new user sees only a reading surface with chapter navigation and a translation label. Depth reveals itself through interaction: selecting a verse exposes cross-references; tapping a word opens the original language layer; writing a note introduces the tagging system. The learning curve is near zero, but the ceiling is high. Complexity grows organically from use.

### Accumulative Scholarship

Everything the user creates — notes, tags, links, reading progress, study session records, memory verse history — is timestamped and anchored to specific Scripture locations. Over months and years, this data forms a personal study web. The application surfaces past insights, repeated themes, and growth patterns exactly when the user returns to a passage they have studied before. Over time, the software becomes a searchable intellectual history of the user's engagement with Scripture.

### Offline-First Architecture

All Scripture text, study data, and user-generated content lives locally on the device. The application functions fully without an internet connection. This is not a feature added later — it is a foundational storage and sync philosophy that shapes every technical decision. Sync capabilities, if added in the future, are additive and never required.

### Theme-Ready Visual Design

All visual styling is built through CSS custom properties (variables) from the start — colors, font sizes, spacing, and contrast values are defined as variables at the root level. This ensures that color themes (dark mode, sepia/parchment, high-contrast, custom) can be added at any time by swapping one set of values for another. The application ships with a clean light theme and a dark theme. The architecture supports unlimited themes without structural changes.

---

## Feature Specification

### Essential Tier — Launch Features

These features form the structural foundation. Each one establishes a data pattern or system that later features extend rather than replace.

#### 1. Scripture Text Engine and Navigation

The core rendering system treats Scripture as structured data addressed by book, chapter, and verse. Navigation is simple: click arrows to move between chapters; select a book and chapter from a compact overlay. The text is displayed in a single clean column optimized for sustained reading.

The text engine supports **multiple selection levels**, each of which opens appropriate tools and information:

- **Book level** — Selecting a book opens a book overview surface showing: book-level notes, authorship and background info, structural outline (if the user has created one), genre classification, and links down to each chapter. Any notes or themes tagged to the book as a whole are surfaced here.
- **Chapter level** — Selecting a chapter shows chapter-level notes, links up to the book overview, and links down to individual verses. Chapter summaries (if written) appear here.
- **Verse level** — The primary interaction. Selecting a verse is the universal entry point for study actions.
- **Range level** — Dragging to select multiple verses or a phrase within a verse enables range-bound notes, highlights, and cross-references that span the selection.
- **Word level** — Clicking a single word opens the deepest level: Strong's number, lexicon definition, morphology, and occurrence search.

This hierarchy is a first-class navigation concept. Moving between levels feels like zooming in and out of the same knowledge structure. Every level aggregates what is below it and links to what is above it.

**Verse selection:** Clicking a verse selects it. Selection is the primary interaction — it does not open a menu. Instead, the rest of the application reacts to the selection contextually: the notes panel shows notes anchored to the selected verse and connects new notes to it, the reference panel updates to show cross-references and language data for the selection, and tags associated with the verse are surfaced in the tag subpanel. There is no per-verse popup menu. Selection includes a brief visual transition — a warm glow on the selected verse that confirms the interaction without interrupting focus. This is a CSS animation, not a popup or tooltip.

**Highlighter:** A small floating highlighter icon is positioned at the mid-left inside edge of the reader panel, anchored to the viewport (it does not scroll with the text). Clicking the icon expands it into a compact row of color dots (one per available highlight color, using the existing six-color palette). Clicking a color dot activates highlight mode — subsequent verse clicks apply that color as a highlight. Clicking the active color dot or the highlighter icon again deactivates highlight mode and collapses the dots back to the single icon. Clicking an already-highlighted verse while in highlight mode removes the highlight.

**Bookmark:** A bookmark button is placed in the reader header bar (near navigation controls or settings). Clicking it toggles a bookmark on the currently selected verse.

All included translations share standard English versification, so no cross-translation verse mapping is required. The schema includes a verse_mappings table (initially empty) to support non-English versification systems when translations such as the LXX or Vulgate are added in the future.

#### 2. Multi-Translation Support

Ember includes public domain English translations. Each translation is its own file, so translations can be added and removed without touching the user's study data.

**Always installed:**

- **King James Version (KJV)** — The historic standard; archaic but deeply familiar and widely cross-referenced in existing study materials. KJV cannot be removed. It is the fallback whenever another translation is removed.

**Installed by default (removable, and can be downloaded again):**

- **Berean Standard Bible (BSB)** — A modern, essentially literal translation placed into the public domain in April 2023. Readable, accurate, and unrestricted.
- **World English Bible (WEB)** — A modern-language update of the ASV; public domain and broadly accessible.
- **American Standard Version (ASV)** — The 1901 scholarly revision in the KJV line.
- **Young's Literal Translation (YLT)** — Hyper-literal; follows the original word order and tenses closely, built for word study.

**Available to add:**

- **Darby Translation** — 1890, literal-leaning. Not installed by default; one click away on the Translations shelf.

The user can switch translations at any time, and each pane of the split reader holds its own translation, so two can be compared side by side. Translations are added and removed from a **Translations shelf** reached from the translation row in the book picker — the place you keep your other Bibles. Adding a translation needs an internet connection once; after that it works offline like the rest of the app. Future translations, including licensed ones, arrive the same way: a new entry on the shelf, no code changes. See `Translation_Addons_Spec.md`.

The reading panel supports **Hebrew and Greek rendering** for future original language display. Biblical Hebrew (right-to-left, with vowel points) and Greek (with diacritics) are rendered using bundled Unicode web fonts (SBL Hebrew and SBL Greek, both freely available). At launch, original language access is through the reference panel (Strong's number lookup per word); full interlinear display (original language words shown inline beneath English text) is an add-on feature pending word-alignment data readiness.

#### 3. Text Markup Layer

Users can visually annotate the Scripture text directly in the reading panel, independent of notes. Available markup types:

- **Highlight** — Colored background on a verse, range, or phrase.
- **Underline** — Emphasis on a word or phrase.
- **Circle** — Visual attention marker on a single word.

Six fixed highlight colors are available at launch. The colors are defined as CSS custom properties, so adding custom colors and user-defined color names is a straightforward future enhancement.

Markups are stored as small records: verse range or word position, markup type, color, and timestamp. They render as CSS overlays on the text and are visible whenever the passage is read.

Markups are independent from notes — the user can highlight without writing a note. Selecting a highlighted verse surfaces any attached notes in the notes panel and shows the highlight color in the verse's selected state. A note can be attached to highlighted material at any time by writing a note while the verse is selected. This mirrors how people use a physical Bible: mark first, annotate later.

Colors can optionally be associated with themes (e.g., "covenant" is always blue, "grace" is always green), turning a marked-up page into a visual map of theological content. Color-to-theme association is a future user preference, not a launch feature.

#### 4. Passage-Bound Notes with Nested Structure and Visibility Control

Notes are the primary unit of personal study data. Each note consists of **lightweight formatted text** (supporting bold, italic, and simple lists via Markdown-style syntax), one or more passage anchors, zero or more tags, and a visibility setting.

**Lightweight formatting:** Notes support bold, italic, bullet lists, and block quotes. Formatting is stored as Markdown-compatible plain text, keeping notes portable and exportable while rendering with visual formatting when displayed. Notes do not support font choices, font sizes, colors, tables, or embedded images.

**Passage anchoring:** A passage anchor binds the note to a specific verse, verse range, or (optionally) a specific word within a verse identified by its Strong's number. A single note can anchor to multiple passages, enabling thematic notes that span books. All anchors are bidirectional — viewing any linked passage surfaces the note in the notes panel.

**Nested notes:** Notes can contain **child notes**, displayed as distinct boxes within the parent note's panel. Each child note is self-contained — it has its own text, its own anchors, its own tags, and its own visibility setting. The user creates child notes sequentially (a new empty box appears below the last one used), and can populate them by typing, or by dragging and dropping content from the cross-reference panel, tag palette, or reader. Nesting is limited to one level: a parent note can have child notes, but child notes cannot have children of their own. Each box can be collapsed, expanded, reordered, or dragged out to become an independent top-level note.

This supports natural study patterns: a general observation about a passage is the parent note, with child notes capturing specific thoughts about individual words, cross-references, or sub-themes within that passage. A template session can generate a parent note with child notes for each step.

**Visibility control:** Visibility is managed at the study level. Each study has a visibility setting — private (the default) or shareable. All notes created in that study inherit its visibility. Individual notes can override the study default for granular control. Private notes never leave the device during export or sharing. Shareable notes are included when the user exports study material or shares a completed study template session. The study's settings popover includes a bulk action to set all notes in the study to private or shareable, resetting any per-note overrides. The All Studies view shows a visibility indicator on each study.

**Studies:** A study is a named container that groups related notes together. Where individual notes are anchored to verses, a study collects notes into a coherent unit of work — for example, "Romans 5 word study," "Covenant theme across Genesis," or "Sunday sermon prep." Every note belongs to a study — there are no freeform notes. If the user writes a note without an active study, the app auto-creates a default study named with the current passage and date (e.g., "Genesis 1 — March 30"), which can be renamed at any time.

The notes panel displays studies as **browser-style tabs** across the top of the panel. Each tab shows the study name. The user can have multiple studies open simultaneously, switching between them by clicking tabs. A "+" button on the tab bar creates a new study. Tabs can be closed without deleting the study — closing a tab removes it from the active tab bar, but the study and all its notes persist and can be reopened from the All Studies view.

**Drag-to-quote:** The user can drag a verse from the reader into an open note to insert an inline Scripture quotation. The quotation renders as a styled block showing the verse text and reference, and functions as a clickable link back to that verse in the reader. This supports the natural study pattern of collecting relevant verses within a note without retyping them.

**Timestamps:** Both studies and notes carry created and modified timestamps. Notes already have `created_at` and `modified_at` fields. Studies add the same. These timestamps enable future features: journal view (reverse-chronological study history), calendar integration (what did I study on a given date), and data visualization (study patterns over time).

**All Studies:** The Notes panel includes a navigation view called All Studies. The panel header shows the current study name; clicking it switches to the All Studies view — a list of all studies with their titles, dates, and associated passage ranges. Clicking a study in the list switches back to the active study view with that study loaded. This is the only way to switch between studies. The All Studies view is also where the user creates new studies and archives old ones.

All Studies is not a separate panel and does not occupy space outside the Notes panel. It is a navigation view — the user goes there to find something, then comes back. Future features that serve a similar "between sessions" purpose — such as the journal timeline, calendar view, and study analytics — can live as additional sections within the All Studies view.

#### 5. Tagging, Theme System, and Tag Subpanel

Tags are a first-class layer in the application, not metadata hidden inside notes. They are visible, interactive, and serve as the primary way users build a personal conceptual map across Scripture. The tag layer has two sources:

- **User tags** — Created by the user during study. Each tag is a first-class entity with its own identifier and a **type field** distinguishing two kinds: **tags** (organizational labels for personal workflow: "review-later," "discuss-with-group," "sermon-illustration," "question") and **themes** (theological and conceptual markers: "covenant," "atonement," "kingdom," "faith," "eschatology"). User tags are linked to notes via tag assignments.

- **System tags** — Pre-seeded topical tags from Nave's Topical Bible (1896, public domain), a concordance mapping over 20,000 topics to specific verse references. These ship with the database in dedicated `topics` and `topic_verses` tables, separate from the user's `tags` and `tag_assignments` tables. System tags are read-only — they cannot be edited, removed, or reassigned by the user. They ensure that every verse has topical context from the moment the app is first opened, before any personal study has been done.

Not all of Nave's 20,000+ topics are useful as visible tags on every verse. The build script applies a curation pass: broadly relevant theological concepts and themes are **visible** in the tag subpanel as chips, while granular entries (individual proper names, minor geographical references) are **searchable only** — stored in the database and returned by search, but not displayed as chips by default.

**Tag subpanel:** The Reference section's Tags tab displays tags relevant to the current context. Its contents change depending on what is selected:

- **Verse selected, no specific note focused:** The tag subpanel shows two groups: (1) system tags from Nave's mapped to that verse, and (2) user tags aggregated from every note anchored to that verse. This gives an at-a-glance view combining the verse's established topical context with everything the user has personally associated with it.
- **Specific note selected:** The tag subpanel narrows to show only the user tags assigned to that note. System tags for the note's anchored verse(s) remain visible but visually deemphasized.

System tags and user tags are visually distinct — system tags use a subtler chip style indicating they are pre-seeded reference data.

**Adding tags:** The tag subpanel includes an input field with a **+** button. The user types a tag name and presses Enter or clicks **+** to add it. Autocomplete suggests existing user tags as the user types. Adding a tag requires a note context — a tag is always assigned to a specific note.

**Removing tags:** When the user drags a user tag chip, a trash zone appears. Dropping the tag onto the trash zone removes the tag assignment from the current note. Removing a tag from a note does not delete the tag from the database — it continues to exist if assigned to other notes. System tags cannot be removed.

**Inline tags in notes:** Tags can be dragged from the tag subpanel into a note's body text. When dropped, they appear inline as a styled `#hashtag` reference within the prose. **The note body is not the source of truth for tag relationships.** Dragging a tag into a note does not create a new tag assignment (the assignment already exists in the database). Deleting a `#covenant` string from the note body does not remove the tag from the note. To actually remove a tag relationship, the user drags it to the trash zone. The system never parses note bodies to discover or manage tags — the `#word` pattern is recognized at render time for styling purposes only.

**Drag-to-search:** Dragging any tag chip (user or system) from the subpanel to the search bar populates the search field with the tag name prefixed by `#` and executes a tag search. This provides a quick gesture for exploring a topic across both personal study and Nave's reference data.

In the essential tier, themes function as searchable labels and navigation paths through Scripture. In the add-on tier, themes can be promoted to graph nodes with defined relationships between them, enabling visual concept navigation.

#### 6. Cross-Reference System

A cross-reference links one passage to another with an optional relationship type and relevance score. At launch, the application ships with a **merged cross-reference dataset** combining:

- **Treasury of Scripture Knowledge (TSK)** — Approximately 500,000 cross-references, comprehensive in scope, public domain.
- **OpenBible.info ranked cross-references** — Community-ranked with relevance vote counts, providing a curated layer on top of the TSK's breadth.

The two datasets are merged during the build process with deduplication: where the same verse-pair appears in both sources, the entry is unified and the OpenBible relevance score is preserved. Each reference retains a source tag (TSK, OpenBible, or both) for attribution.

In the cross-reference panel, results are sorted by relevance score by default (community-ranked entries surface first). A toggle allows the user to show all references, including the deeper TSK entries that may lack a ranking. This gives the casual user a curated list and the deep student the full picture.

User-created cross-references are stored in the same structure with a "user" source tag. Personal links and curated links coexist seamlessly.

#### 7. Study Templates with Welcome Page, Step Navigation, and Template Creator

Study templates are reusable, step-by-step structures that guide how a user engages with a passage. A template defines a method — a sequence of prompts, fields, and actions that walk the user through a particular study approach.

Each template has a name, a description, an estimated time, and an ordered list of steps. Each step has: a prompt (the instruction or question), an expected input type (free text, passage reference, tag selection, or word selection), optional help text, and optional navigation targets (a verse range to auto-scroll to, a tool to open in the study panels, or a text range to highlight).

**Welcome page:** When a user starts a new template session, they first see a welcome page. The welcome page shows: the template name and description, estimated total time, a passage field pre-filled with the currently displayed passage (adjustable), a visibility choice (notes created during this study will default to shareable or private), and a "Begin Study" button. The welcome page appears as a lightweight overlay — not a full-screen modal, consistent with the principle that the text is never obscured. For group-distributed templates, the welcome page can include a sharing destination. Resuming a paused session skips the welcome page and loads directly to the last active step.

**Step navigation:** During a template session, a compact navigation bar appears in the template bar, showing the current step: "<< Step 2 of 6 >>". Clicking "Next" advances to the next step, which may auto-scroll the reading panel to a new verse range, highlight a section of text, open a specific tool, or prompt a new child note within the session note. Clicking "Previous" returns to the prior step with its content preserved.

**Session-level visibility:** At the start of a template session (chosen on the welcome page), the user sets a visibility for the study created by that session. All notes and child notes created during the session inherit the study's visibility. The user can override individual notes. The study's visibility can be changed at any time from the notes panel settings.

**Session lifecycle:** A template session is the combination of a template and a passage — "Inductive Study on Romans 5" is one session. Sessions persist automatically. If the user toggles the guide off, navigates away, closes the app, or starts a different session, progress is saved. The template selector menu in the template bar lists all in-progress sessions alongside the available templates; clicking a paused session resumes it from the last active step. Multiple sessions can exist simultaneously — only one is active in the bar at any time. When the user advances past the final step, the session is marked complete and its record is preserved in the journal. The "End Session" action in the selector menu closes a session early with a confirmation prompt; the session record is saved with incomplete status and all notes remain anchored to their passages.

**Template creator:** A straightforward form interface accessible from the Plans view allows users to create custom templates. The form provides fields for: template name, description, estimated time, and an ordered list of steps (each with prompt, input type, help text, and optional navigation targets). Steps can be added, removed, and reordered. The resulting template is saved locally and can be exported as JSON for sharing. A richer visual template builder with drag-and-drop step arrangement is a future enhancement; the form interface is sufficient for launch.

At launch, the application includes two to three built-in templates:

- **Inductive Study (OIA)** — Observation (what does the text say?), Interpretation (what does it mean?), Application (how does it apply?).
- **Word Study** — Select a key word → look up the original language → trace occurrences → note patterns → write a summary.
- **Passage Overview** — Context and background → structure and outline → key themes → personal response.

All templates (built-in and custom) are exportable as JSON and importable from shared files.

#### 8. Full-Text Search

A single search surface accessible from a persistent icon searches across all loaded Scripture translations, all user notes (including nested notes and template-structured notes), all tags and themes, and (when original language data is available) Strong's numbers. Results are grouped by type — **Scripture**, **Notes**, **Tags**, and **Help** — but presented in one unified list.

Search supports two modes distinguished by a single character:

- **Plain text search** (e.g., `covenant`) — Searches everything: verse text, note bodies, user tag names, and system topic names (Nave's). This is the broad net, surfacing both passages the user has never studied (discovery) and passages they have personally annotated (recall).
- **Tag search** (e.g., `#covenant`) — Searches only the tag layer, both user tags and system topics. Returns every note assigned that user tag, every verse anchored to those notes, and every verse mapped by Nave's to that topic. This is the personal + topical lens. Dragging any tag chip to the search bar automatically populates the `#` prefix and executes a tag search.

The **Help** result group matches user queries against a lightweight keyword index of help topics, setting names, and feature names (e.g., "font size," "visibility," "cross-references"). Clicking a Help result opens the full help panel scrolled to the relevant section. The help index is a static array — no database table required.

Search results are immediately actionable: clicking a Scripture result navigates to that passage; clicking a note result opens the note in the notes panel with its anchored passage loaded in the reader.

**Search shortcuts:** When the user focuses the search bar without typing (empty state), the search results area displays a set of shortcuts, search help, and quick-access settings instead of an empty panel. Shortcuts include prefix-based filters:

- `B-` — Filter results to the currently displayed book (e.g., if reading Romans, `B- justification` searches only Romans).
- `B-Genesis` — Filter results to a specific named book.
- `#tagname` — Filter results by tag (equivalent to a tag search).
- `N-` — Search within notes only.
- `S-` — Search within the current study's notes only.

The empty state also shows a brief search help summary (explaining the prefix syntax) and links to search-related settings. This turns the empty search bar from a dead end into a discovery surface — users learn the filtering syntax by seeing it every time they open search.

**Search entry points:** Any panel can link directly to the global search overlay with a filter pre-applied. A "Search tags" link in the Tags tab opens search with `#` pre-filled. A "Search studies" link in the All Studies view opens search with `N-` or `S-` pre-filled. A "Search this book" link in the Info tab opens search with `B-` and the current book name pre-filled. This pattern means panels never need their own search UI — they hand off to the global search with context, and the user stays in one familiar search experience.

#### 9. Reading Plans, Workflows, and Progress Tracking

**Reading plans** define a schedule: a sequence of daily readings, each specified as a verse range. Pre-built plans (book-by-book, chronological, New Testament, Psalms and Proverbs) and user-created custom plans are supported. Progress is tracked per day with completion timestamps.

**Workflows** combine a reading plan with a study template. "This quarter, study Romans using the Inductive Study template" is a workflow — each day's assigned passage opens with the template ready in the template bar, beginning with the welcome page on the first session.

Each day's workflow session is created automatically when the reading plan advances. If the previous day's session was not completed, it remains in the in-progress list and can be resumed from the template selector menu.

**Plan-aware home screen:** When an active reading plan or workflow exists, the app opens to today's assigned passage by default. When no plan is active, the app opens to where the user left off.

The plan view shows today's reading, overall progress, and a calendar or list of completed and upcoming days. Clicking any day's reading navigates directly to that passage in the reader.

Plans, workflows, and templates are all independently exportable and importable.

#### 10. Session Summaries and Continuity

Every meaningful study action generates a lightweight **session record**: date, passages read, notes created or modified, tags and themes used, template steps completed, and session status (in-progress, complete, or ended). Template sessions that are paused mid-study remain in-progress until completed or explicitly ended by the user. Ended sessions are preserved with their partial progress rather than discarded.

When the app opens, the user sees a **session summary card** — a brief recap of their last session. Below the summary, two clear choices: **"Continue where I left off"** (reopens incomplete work) or **"Go to today's reading"** (advances to the next planned passage).

Session summaries accumulate into a browsable history — the journal/timeline feature.

#### 11. Bookmarks

A lightweight marker: a verse reference, an optional short label, and a timestamp. Bookmarks appear as subtle indicators in the text margin and are listed in a dedicated section accessible from search or a bookmarks list.

#### 12. Data Export

All user-generated data is exportable in three formats:

- **JSON** — Structured, machine-readable, suitable for import into other tools or custom analysis.
- **Markdown** — Human-readable, suitable for printing, archiving, or publishing.
- **SQL dump** — Direct database export for technical users who want to query their own study data.

**Selective export (search-and-add builder):** The export interface uses a search-and-add pattern. The user clicks "Export," then searches for what they want to include — a book, a chapter, a tag, a theme, a specific note, a word study, a template session. Each search result has an "Add" button that places it in the export collection list. The user repeats the process — search, add, search, add — until the collection contains everything desired. The collection list is visible and editable (items can be removed). When ready, the user chooses a format and exports.

Export respects visibility settings: the user can choose to export all notes or only shareable notes. When sharing study material with a group, private notes are automatically excluded unless the user explicitly overrides.

---

### Add-On Tier — Built on the Foundation

Each add-on extends an existing system from the essential tier. None require reworking the core data model.

#### 13. Original Language Tools (Full)

Extends the essential-tier word-level lookup (Strong's number and definition per word) with a complete original language layer. Adds: interlinear display (original language words shown inline beneath English text, pending word-alignment data readiness), morphological parsing in readable form, full lexicon entries, and occurrence search filterable by book, author, or testament.

Data sources: Open Scriptures Hebrew Bible (CC BY 4.0), morphgnt Greek New Testament, Strong's Dictionaries (public domain), Thayer's Greek Lexicon (public domain), abridged Brown-Driver-Briggs Hebrew Lexicon (public domain), STEPBible-Data (CC BY 4.0).

The interlinear display specifically requires verified word-level alignment between English translations and original language texts. This alignment data exists in the STEPBible project but needs hands-on evaluation for coverage and accuracy before integration. Until verified, original language access uses the Strong's number lookup system, which is functional at launch without alignment data.

#### 14. Commentary Integration

Uses the same passage-binding system as personal notes, but for third-party content. Commentary entries anchor to verse ranges and display in the reference panel in a dedicated tab. Multiple commentary sources can be loaded and compared on the same passage.

At launch of this add-on, public domain commentaries can be included: Matthew Henry's Concise Commentary, John Wesley's Notes on the Bible, and others.

#### 15. Theological Concept Mapping

Graduates the theme system into a navigable graph. Theme-type tags become nodes; user-defined relationships between themes become edges. The concept map merges user-created theme relationships with cross-reference data to form a visual web of theological connections.

#### 16. Literary and Structural Analysis

Extends passage-bound notes with a "structure" annotation type for chiastic structures, parallelisms, inclusios, and narrative arcs, visualized as collapsible outlines or diagrams overlaid on the text.

#### 17. Historical and Cultural Context Layers

Toggleable information panels tied to passage ranges, providing historical setting, cultural background, geographical context, and archaeological findings.

#### 18. Spaced Repetition Memorization

A memory verse system using the SM-2 spaced repetition algorithm. The user adds any verse or passage to their memorization queue from the reader. Review sessions use progressive blanking with performance tracking and optimized review intervals.

#### 19. Study Journal and Analytics

A reverse-chronological timeline built from session summary records. Analytics surface patterns: study frequency, book and chapter coverage, tag and theme distribution, template completion rates, and memorization progress.

#### 20. Multi-Device Sync and Sharing

Optional sync with conflict resolution. Sharing allows export and import of note collections, template sessions (respecting visibility), reading plans, workflows, templates, and concept maps.

---

## User Interface Structure

### Application Frame

Ember runs as a standalone Progressive Web App. The PWA manifest specifies `"display": "standalone"`, which removes browser chrome (address bar, tabs, bookmarks toolbar) and presents the app in its own window with OS-provided window controls (close, minimize, maximize). The OS also provides the system tray, clock, and taskbar — the user can switch to other applications, check the time, or minimize Ember without closing it.

Ember does not render its own title bar or window controls. The app name appears in the OS window title via the manifest's `name` field. The app opens maximized by default and supports full-screen mode.

### Global Header

The global header is a slim bar (~36px tall) spanning the full width of the application. It contains a single element: the search input field. Search is the only feature that operates across all panels — it searches scripture, notes, tags, and help in one unified interface. Results drop down as an overlay below the header.

The global header is the only app-level UI element. Everything else — navigation, settings, help, translation selection — lives inside the panel it belongs to. There is no app-level settings menu, no app-level help button, and no navigation controls in the header.

Below the global header, the template bar occupies a second slim row (~36px) when a guided study session is active. The template bar is the only element that coordinates across panels (it may instruct the reader to navigate while prompting a note in the notes panel). When no session is active, the template bar is hidden and the workspace fills the space.

### Primary Surfaces

The workspace below the global header (and template bar, when visible) is divided into two zones: **study panels** on the left and the **reader** on the right. The default split is 50/50. A draggable vertical handle between them lets the user resize the balance in either direction.

**Reader** — The right half of the workspace. A single column of Scripture text with the text markup layer and contextual selection. The reader is self-contained — it has its own header strip with: book/chapter selector (clickable label that opens the book overlay), previous/next chapter arrows, translation label (clickable to switch translations), bookmark button, and `?` and `⚙` icons for reader-specific help and settings. When the split reader is active (comparing passages), each pane gets its own copy of these controls.

**Study Panels** — The left half of the workspace contains two panels: Notes and Reference. These can be arranged in two layouts, toggled by the user:

- **Side by side (horizontal split)** — Notes on the left, Reference on the right, each getting roughly half the study panel width. A vertical drag handle between them allows resizing.
- **Stacked (vertical split)** — Notes on top, Reference below. A horizontal drag handle between them allows resizing. This is the layout for users who prefer more width per panel at the cost of vertical space.

Each panel is self-contained with its own header, settings gear (`⚙`), and contextual help (`?`) button. The toggle between horizontal and vertical layout is accessible from either panel's settings.

- **Notes** — Personal notes on the current passage. Every note is anchored to the verse selected when it was created. Supports one level of child notes, tags, and visibility control. Notes are organized into studies, displayed as browser-style tabs across the top of the notes panel. The panel header doubles as a navigation control — clicking the study name switches to the All Studies view for browsing and managing all studies.
- **Reference** — Contextual reference material for the selected passage, organized into four tabs:
  - **Info tab** — Book-level metadata for the current reading selection: author, date/period, genre, historical context, key locations, and a short summary. Data is sourced from public domain Bible dictionaries. Structurally present from Build 1 with book-level data; chapter-level and passage-level detail may be added in later builds.
  - **Tags tab** — Topical tags from Nave's (system tags) plus the user's own tags and themes. See Section 5 for subpanel behavior.
  - **Related tab** — Cross-references sorted by relevance, drawn from the merged TSK/OpenBible dataset and user-created links. Structurally present from Build 1; populated with data in Build 2 when cross-reference datasets are integrated. Displays a placeholder message until then.
  - **Language tab** — Hebrew/Greek definitions and morphology for the selected word (Strong's number lookup). Structurally present from Build 1; populated in a later build when original language data is integrated. Displays a placeholder message until then.

  The Reference tab bar is always visible, even when the Reference content area is collapsed — serving as both navigation and a visual reminder that reference tools are available. Clicking any tab expands the panel and activates that tab. Clicking the currently active tab collapses the panel back to its tab bar alone. The drag handle between Notes and Reference allows resizing in whichever layout is active (vertical handle in side-by-side mode, horizontal handle in stacked mode). Minimum sizes are enforced so neither panel can be dragged to zero. Double-clicking the handle resets to the default split.

**Plans** — The reading plan, workflow, and template management view. Shows active plans and workflows, today's reading, overall progress, and tools for creating, importing, and exporting plans, workflows, and templates. The template creator form is accessed from this view.

**Memory** — The spaced repetition review interface. Shows active memory verses, upcoming reviews, and the recall testing surface.

**Journal** — An optional fourth tab. A browsable timeline of session summaries and study activity.

### Interaction Model

The primary interaction is **selection**. Clicking a verse, selecting a range, or clicking a word updates the entire workspace contextually — the notes panel shows notes anchored to the selection, the reference panel updates with cross-references and language data, and tags associated with the selection are surfaced. There is no popup menu or contextual toolbar on verse click. The panels react; the user works in whichever panel is relevant.

Each panel is self-contained: it has its own header, its own settings (`⚙`), and its own help (`?`). The reader has its own navigation controls and translation selector. Notes and reference each manage their own display. The user learns one pattern — click the thing you want to change — and it works everywhere.

When a study template is active, the template bar coordinates across panels, guiding the reader to navigate and prompting tools as each step requires.

Content can be dragged from the tag palette, cross-reference panel, or reader into notes.

Search lives in the global header — a slim bar above all panels. It is the only app-level element.

### Layout Philosophy

**Equal weight for text and tools.** The default layout gives the reader and study panels equal space (50/50 split). Bible study happens in both the reading and the annotating — neither deserves to be an afterthought. The split is resizable, so users who prefer more reading space or more tool space can adjust.

**Each panel is its own app.** The reader, notes panel, and reference panel each have their own header, navigation, settings, and help. There is no global settings menu, no global help button, and no global navigation. The user learns one pattern — click the thing you want to change — and it works in every panel. This consistency reduces the learning curve: understanding one panel means understanding all of them.

**Flexible arrangement.** Notes and reference can be side by side or stacked, toggled by the user. The split reader (for comparing passages) divides the reader zone into two panes. All dividers are draggable. The layout adapts to the user's task without requiring a settings page.

The application should never require a tutorial. A typical user should understand the interface through natural interaction within their first session.

### Design Principles

- **The application mirrors a physical Bible study setup.** This is the organizing principle from which the other principles follow.

    | Surface | Physical equivalent | What lives here |
    |---|---|---|
    | Reader pane | Your Bible | Scripture text, bookmarks, highlights, markups, verse selection |
    | Notes panel | Your notebook | Studies, notes, tags, organization, your own thinking |
    | Reference panel | Your reference shelf | Cross-references, topical indexes, book info, background material |
    | Settings popovers | Your workspace environment | Lighting (theme), reading glasses (font size), desk arrangement (layout) |
    | Help popovers | The expert you go to when you're stuck | Brief orientation per panel, deeper help on demand |

    When deciding where a feature belongs, ask: *in a physical study setup, where does this thing live?* The metaphor is also a one-sentence learning device for users — it appears in help popover copy but is never forced as a tutorial. A user who never recognizes the metaphor still uses the app fine, because the panels are also self-explanatory at a literal level.

- No settings labyrinth. No feature menus. No global settings. Each panel (reader, notes, reference) has its own settings gear (`⚙`) that opens a small popover scoped to that panel's options. Settings are discoverable where they are used, not collected in a central menu.
- Contextual help (`?` buttons) on each panel header provide layered assistance: a brief popup describing the panel and its key actions, with a link to the full help panel for deeper reference. The application should never require a tutorial, but help is available for users who want it.
- **The text is never obscured during reading or study.** Modal overlays, splash screens, tutorials, and "what's new" notifications are forbidden — they interrupt the work. Help and settings popovers, which the user explicitly invokes when stepping outside the study, may overlay the text freely. The rule protects focused reading; it does not prevent the user from asking a question or adjusting their workspace.
- Every screen is reachable in two clicks or fewer from the reader.
- The interface teaches itself through use; no onboarding tutorial is required.
- Visual density increases only in response to user action, never by default.
- All styling uses CSS custom properties, making the entire application theme-ready from launch.

### Empty State Ghost Text

Every panel and input field displays helpful ghost text when empty, guiding the user toward the first action without requiring a tutorial.

- **Study panel (no study open)** — Header: "Study." Body: "What are you studying? Type a name here. Add notes by selecting a verse and typing below."
- **Notes panel (no verse selected)** — "Select a verse and type here, or drag a tag into this note."
- **Tags search field (Tags tab, empty)** — "Search to find more tags"
- **Related tab (nothing selected)** — "Select a book, chapter, or verse to see related passages."
- **Info tab (nothing selected)** — "Select a book or passage to see background and context."
- **Language tab (no word selected)** — "Select a word in the reader to see its original language data."

---

## Data Architecture

### Storage

All data is stored in a single SQLite database file on the local device. To optimize startup performance, the database is split into two files:

- **Core database** — Translations, books, and verse text. This is small (under 30MB) and loads immediately, allowing the reader to be usable within a second of launch.
- **Supplemental database** — Cross-references, lexicon entries, and original language data. This loads in the background after the reader is already functional. The user experiences no delay in reading; deeper tools become available moments later.

User-generated data (notes, tags, markups, templates, session records, progress) is stored in the core database and is negligibly small.

The database is downloaded once on first visit and stored persistently using OPFS (Origin Private File System) where available, or IndexedDB as a fallback. Subsequent launches load from local storage without a network fetch.

SQLite is accessed via sql.js (a WebAssembly compilation of SQLite that runs in the browser). If performance testing reveals that full in-memory loading is too slow for the supplemental database, the implementation can be migrated to wa-sqlite with an OPFS backend for page-based access without loading the entire file into memory.

No server, no account, no internet connection is required to use the full application after the initial download.

### Schema Overview

The data model consists of approximately twenty core tables organized around a universal verse-addressing system (book + chapter + verse as a composite identifier):

**Scripture Data (read-only, shipped with the app):**

- **books** — Book metadata: ID, name, abbreviation, testament, genre.
- **translations** — Translation metadata: ID, name, abbreviation, language, license.
- **verses** — Scripture text: verse ID, translation ID, text content.
- **verse_mappings** — Cross-translation verse address mappings. Empty at launch (all launch translations share English versification); populated when LXX, Vulgate, or other non-English-versified translations are added.
- **cross_references** — Merged passage-to-passage links: from-range, to-range, source (TSK/OpenBible/user), relevance score.
- **original_words** — Word-level original language data: verse ID, word position, original text, Strong's number, morphology code.
- **lexicon** — Strong's dictionary entries: Strong's number, original word, transliteration, short definition, full definition.
- **topics** — Pre-seeded topical tags from Nave's Topical Bible: ID, name (normalized), display flag (1 = visible in tag subpanel, 0 = searchable only).
- **topic_verses** — Nave's topic-to-verse mappings: topic ID, verse ID. Indexed on both columns for fast lookup in either direction.
- **book_info** — Book-level metadata for the Info tab: book ID, author, date/period, genre, historical context, key locations, summary. Sourced from public domain Bible dictionaries during the build process. Read-only at runtime.

**User Data (read-write, created by the user):**

- **notes** — Note content: ID, body text (Markdown), created timestamp, modified timestamp, visibility (private/shareable, inherited from study with per-note override), parent_note_id (nullable, for one-level nesting), optional template_session_id, study_id (required).
- **studies** — Study containers: ID, name, created timestamp, modified timestamp, status (active/archived).
- **note_anchors** — Passage bindings for notes: note ID, verse start, verse end, optional word/Strong's reference.
- **text_markups** — Visual annotations: ID, verse start, verse end, optional word position, markup type (highlight/underline/circle), color, timestamp.
- **tags** — Tag and theme entities: ID, name (normalized), type (tag/theme).
- **tag_assignments** — Join table: tag ID, note ID.
- **bookmarks** — Verse ID, optional label, timestamp.
- **study_templates** — Template metadata: ID, name, description, estimated_time, is_builtin flag.
- **template_steps** — Ordered steps: template ID, step number, prompt text, input type, help text, target verse range (optional), tool to open (optional), highlight range (optional).
- **plans** — Plan metadata: ID, name, type, optional linked template ID (for workflows), sharing_destination (optional).
- **plan_days** — Daily readings: plan ID, day number, verse start, verse end.
- **plan_progress** — Completion records: plan ID, day number, completed, completion date.
- **session_records** — Auto-generated session summaries: ID, template ID (nullable — NULL for freeform sessions), passage range (verse start, verse end), start date, last modified date, current step number, note IDs JSON, tags used JSON, status (in-progress/complete/ended), visibility_default.
- **memory_verses** — SM-2 scheduling: verse range, next review date, interval, ease factor, repetition count.
- **memory_reviews** — Review history: memory entry ID, review date, quality rating.

### Design Principles

- **Verses are the universal anchor.** Every piece of data connects to the verse-addressing system.
- **Adding data never alters structure.** New translations, commentaries, lexicons, and templates are inserted as rows, not schema changes.
- **User data and shipped data are cleanly separated.** Export targets only user-generated tables.
- **The schema supports every add-on tier feature.** Commentary uses the same binding model as notes. Concept mapping extends the tag/theme tables. Sync adds version vectors to user tables.
- **Visibility is enforced at the data level.** The visibility field on notes and the session-level default ensure that private content is never included in exports or shares unless explicitly changed.
- **Nesting is one level deep.** The parent_note_id field links child notes to a parent. The UI enforces a one-level limit — child notes cannot have children. The schema technically supports deeper nesting (same column), but the constraint is applied in application logic to keep the notes panel manageable.

---

## Data Sources

### Freely Available — Public Domain or Open License

| Resource | Content | License | Format Available |
|---|---|---|---|
| King James Version (KJV) | Full Bible text | Public domain | SQLite, JSON, CSV, XML |
| Berean Standard Bible (BSB) | Full Bible text, modern English | Public domain (April 2023) | JSON, USFM, XML |
| World English Bible (WEB) | Full Bible text, modern English | Public domain | SQLite, JSON, CSV, XML |
| American Standard Version (ASV) | Full Bible text, 1901 | Public domain | SQLite (via scrollmapper) |
| Young's Literal Translation (YLT) | Full Bible text, hyper-literal | Public domain | SQLite (via scrollmapper) |
| Darby Translation | Full Bible text, 1890 (add-on, not installed by default) | Public domain | SQLite (via scrollmapper) |
| Treasury of Scripture Knowledge | ~500,000 cross-references | Public domain | SQLite, TXT |
| OpenBible.info Cross-References | Ranked cross-reference dataset | Open | CSV, SQLite |
| Open Scriptures Hebrew Bible | Westminster Leningrad Codex with morphology and Strong's | Text: public domain; Morphology: CC BY 4.0 | OSIS XML, JSON (npm) |
| morphgnt Greek NT | Tischendorf text with Strong's and morphology | Open | CSV, Python API |
| Strong's Hebrew & Greek Dictionaries | Lexicon keyed to Strong's numbers | Public domain (1890) | XML |
| Thayer's Greek Lexicon | NT Greek definitions | Public domain (1889) | Various |
| Abridged BDB Hebrew Lexicon | OT Hebrew definitions | Public domain (abridged) | XML (via OpenScriptures) |
| STEPBible-Data | Amalgamated tagged Hebrew/Greek with brief lexicons | CC BY 4.0 | TSV, GitHub |
| scrollmapper/bible_databases | Pre-structured Bible + cross-reference database | Public domain / open | SQLite, MySQL, JSON, CSV |
| Nave's Topical Bible (1896) | ~20,000 topics mapped to ~100,000 verse references; pre-seeded system tags | Public domain | CSV (via BradyStephenson/bible-data on GitHub) |
| Matthew Henry's Concise Commentary | Verse-by-verse OT and NT commentary | Public domain | Various |
| SBL Hebrew Font | Biblical Hebrew display | Free license | WOFF/TTF |
| SBL Greek Font | Biblical Greek display | Free license | WOFF/TTF |

### Requires Licensing

Popular modern translations (ESV, NIV, NASB, NLT, NKJV, CSB) are copyrighted and require commercial licensing for embedding in applications. Academic lexicons (BDAG for Greek, HALOT for Hebrew) and modern commentaries are similarly restricted.

These can be integrated later via API partnerships (e.g., API.Bible) or individual licensing agreements, but they are not required for a fully functional study tool.

---

## Technical Approach

### Platform

The application is a **desktop-first Progressive Web App (PWA)** — a single-page application built with HTML, CSS, and vanilla JavaScript, with no external service dependencies.

When installed as a PWA, Ember launches in its own window with no browser chrome — no address bar, no tabs, no bookmarks toolbar. It appears and behaves as a standalone application with its own taskbar icon. This eliminates browser-based distractions while maintaining the simplicity of web-based distribution (no app store required, no gatekeeping, instant updates).

**Install flow:** The application is designed for standalone mode. When first opened in a browser tab, a full-screen install overlay covers the application, prompting the user to install Ember as a desktop app. The overlay provides an install button (triggering the browser's native PWA install prompt where supported) and manual instructions for browsers that do not support automatic installation. A small "Continue in browser" link allows skipping installation, but the standalone experience is the intended default. After installation, a one-time message guides the user to close the browser tab and open Ember from their desktop. The install overlay does not appear when the app is running in standalone mode.

**One codebase, multiple operating systems:** The same code runs on Windows, macOS, Linux, and ChromeOS. The application is optimized for desktop-class screens and mouse/keyboard input.

No framework is required at launch. The SQLite database is accessed via sql.js (a WebAssembly compilation of SQLite that runs in the browser). This achieves the zero-dependency goal while providing full SQL query capability over the local dataset.

If native desktop features are needed in the future (deeper file system access, system tray integration, native menus), the same codebase can be wrapped in Tauri to produce native installers without rewriting application code. If mobile demand emerges, a simplified "reading and review" mobile layout can be developed as a future phase, potentially wrapped in Capacitor for native mobile distribution.

### Performance Strategy

- **Split database architecture:** Core text data loads immediately; supplemental data (cross-references, lexicons) loads in the background. The reader is usable within a second of launch.
- **Persistent local storage:** The database is downloaded once and stored via OPFS or IndexedDB. Subsequent launches are instant.
- **Indexed verse lookup:** All verse-level queries are indexed for sub-millisecond response.
- **FTS5 full-text search:** SQLite's full-text search extension provides sub-second results across all translations and user content.
- **Fallback path:** If sql.js in-memory loading proves too slow for the supplemental database, migration to wa-sqlite with OPFS backend enables page-based access without loading the full file into memory.

### Extensibility

The architecture supports future enhancement without structural changes:

- **New translations:** Add the translation's file and a catalog entry. It appears on the Translations shelf, where users add or remove it. No code changes.
- **Commentary:** Add a commentary table with the same anchor model as notes. Display in a new tab added to the Reference panel's tab bar — the tab structure accepts additional tabs without changes.
- **Concept mapping:** Add a tag_relationships table connecting theme-type tag IDs with relationship types.
- **Sync:** Add version vector columns to user-generated tables; implement conflict resolution.
- **API integration:** Add an optional network layer for fetching licensed translations from services like API.Bible, cached locally after retrieval.
- **Color themes:** Swap CSS custom property values. No structural changes required.
- **Custom markup colors:** Extend the fixed six-color palette to user-defined colors and names via a settings interface.
- **Native wrappers:** Wrap the existing web application in Tauri (desktop) or Capacitor (mobile) if needed.
- **Mobile layout:** Design a simplified single-column layout as a future phase without changing the data model or application logic.

---

## Open Questions and Decisions

### Resolved

1. **Word alignment and interlinear display** — Deferred to add-on tier. At launch, original language access uses Strong's number lookup per word (functional without alignment data). Full interlinear display awaits hands-on evaluation of STEPBible alignment data quality.

2. **Versification mapping** — Deferred. All launch translations share English versification. The verse_mappings table exists in the schema but is empty at launch. Populated when non-English-versified translations are added.

3. **Cross-reference dataset overlap** — Resolved. TSK and OpenBible datasets are merged during the build process with deduplication and source attribution. OpenBible relevance scores are preserved. The cross-reference panel sorts by relevance by default with a toggle for full TSK depth.

4. **Database size and load performance** — Resolved with split database strategy. Core text loads immediately; supplemental data loads in the background. Persistent local storage via OPFS eliminates re-download on subsequent visits. wa-sqlite fallback path identified if in-memory loading is too slow.

5. **Mobile** — Resolved. Desktop-first. Mobile is not a launch target. A simplified mobile layout is a future phase if demand warrants.

6. **Markup colors** — Resolved. Six fixed colors at launch. Custom colors and names are a future settings enhancement.

7. **Template creation** — Resolved. A form-based template creator is included in the essential tier, accessible from the Plans view. A richer visual builder is a future enhancement.

8. **Application name.** Resolved. The application is named **Ember Bible Study**, shortened to **Ember** in casual use.

### To Be Determined

9. **Built-in reading plans.** Three to five default plans need to be defined with full day-by-day verse ranges. Sources are being researched.

10. **Default study template content.** The exact step-by-step prompts, help text, and navigation targets for the three built-in templates need to be authored.

11. **Book overview content.** Authorship, background, and structural information for each book of the Bible needs to be sourced from public domain Bible dictionaries or authored. Sources are being researched.

12. **First build scope.** The essential tier contains twelve features. The minimum subset for a first working prototype needs to be identified — likely: Scripture engine, one translation, basic notes (without nesting), search, and a reading plan — with remaining essential features layered in iteratively. When nesting is added in a later build, it is limited to one level (parent → child, no deeper).

13. **Service worker caching strategy.** The specific caching approach (cache-first vs. network-first, update mechanisms, cache invalidation for data updates) needs to be defined during development.

---

## Summary

Ember is not a Bible reading app with study features bolted on. It is a study environment built around the reading experience. Its simplicity is intentional — the interface stays out of the way so the user can focus on the text. Its depth is structural — the data model supports years of accumulated study, interconnected by tags, themes, passage links, and timestamps, all searchable and all anchored to the words of Scripture.

The study template engine gives the application a distinctive identity: it supports guided, method-driven study (inductive, word study, topical, sermon prep) without prescribing any single approach. Templates are shareable, importable, and composable with reading plans to form complete guided study programs. This makes the software valuable not only for individual study but for groups, classes, and congregations.

Session continuity — the daily summary card, the "continue or advance" prompt, the accumulating journal — transforms the application from a tool you use into an environment that remembers your study life and meets you where you left off.

The essential tier delivers a complete, useful tool on day one. The add-on tier extends it into a comprehensive study platform. Nothing in the second tier requires rethinking the first. The foundation is built to last.
