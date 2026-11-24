# Ember Bible Study — Help System Design

**Status (2026-11-23):** All three tiers are built, plus a Tier 2.5. They were built to `docs/Help_Guide_Spec.md`, and what shipped is recorded in `docs/BUILD_6.1_ACTUAL_STATE.md` §21–22. The design below is kept as written. Where it differs from what shipped, this section is current:

- **Tier 1, quick help popovers:** built in Build 1.5. Their copy was updated on 2026-11-23 to match the app (the ☆ bookmark button, Related live, Language and Plans listed), and a fourth popover was added for the global `?`. "More help" became "More in the guide →", which opens the guide at that panel's section.
- **Tier 2, the full help panel:** this is `USER_MANUAL.md`, rendered in the app by `js/help-guide.js`, rather than a separate HTML document. The repository's manual and the in-app guide are one file. It's an overlay that fills the window, with a contents list, and it works offline.
- **Tier 2.5, the app map** (new, not in the original design): a wireframe of the live layout beside the guide (`js/help-map.js`). Links in the manual highlight a control on it, and **Show me** points at the real control.
- **Tier 3, help in search:** matches the manual's own headings, not a hand-kept keyword index, so there's nothing extra to maintain. Without a prefix, a query must match a heading; the `h:` prefix searches the sections' text as well.
- **Not built from this design:**
  - an opening "How Ember is organized" chapter (the manual starts with "What is Ember?")
  - setting names in help that link to their ⚙ popover
  - "Keyboard shortcuts" and "About Ember" sections
  - synonym matching in search: "notebook" or "dark mode" won't find a section unless a heading contains the word

---

## Overview

Help in Ember is layered: small and contextual by default, deep and browsable on demand. The system has three tiers — quick help popovers anchored to `?` buttons in each panel, a full help panel for comprehensive reference, and search integration that surfaces help topics alongside Scripture and notes.

The design principle from the proposal applies here: the application should never require a tutorial. Help exists for users who want it, not as a prerequisite for using the app.

Help is also where the **physical study metaphor** lives in user-facing copy. Each quick help popover opens with one sentence framing the panel as a familiar physical object — your Bible, your notebook, your reference shelf. A user who reads only the first line of the popover walks away with a working mental model of the app.

---

## The Three Tiers

### Tier 1: Quick Help Popover (Build 1.5)

A small `?` button in each panel header opens a contextual popover. The popover is a **peek** into help — small but not tiny, comfortably readable, clearly distinct from the full help panel. It contains the metaphor line and a short list of actions specific to that panel.

The user's expert friend leaning over to answer a quick question without making them leave their seat.

### Tier 2: Full Help Panel (deferred to a future build)

A larger surface — centered overlay or side drawer, TBD — with comprehensive guidance. Triggered by the "More help" button inside the quick popover. Covers every panel, every setting, every feature in one scrollable document. Anchor links allow quick popovers to deep-link directly to relevant sections.

The user pulls a reference book off the shelf and reads a chapter.

This tier is **not built in Build 1.5.** The "More help" link in quick popovers is non-functional in 1.5, with copy that honestly says "a full help guide is on its way." When the full panel ships, the link copy and target update.

### Tier 3: Help Search Integration (deferred with full panel)

The search bar surfaces help topics as a result group alongside Scripture, Notes, Studies, and Tags. Help entries are matched against a curated keyword index, not full-text search of help prose. Clicking a help result opens the full help panel scrolled to that section.

Ships with Tier 2.

---

## Quick Help Popovers (Build 1.5 Specification)

### Behavior

- Each popover is anchored to its `?` button (reader, notes panel, reference panel).
- Sizing: roughly 320–400px wide, height as needed for content. Comfortable for the copy, clearly a peek.
- Contains a small close ✕ button in addition to outside-click and Escape dismissal.
- Only one popover open at a time. Opening a new one closes the previous.
- May overlay any part of the interface, including Scripture text. This is permitted because help is a meta-task — the user has explicitly stepped outside the study to ask a question, and reading is paused. (See proposal Design Principles, "The text is never obscured during reading or study.")

### Content Structure

Each popover contains:

- **Metaphor line** — One short, bold sentence framing the panel as a physical object. Always first.
- **Action bullets** — Three to five short bullet points describing primary actions in the panel.
- **"More help" link** — At the bottom. In Build 1.5, this is a placeholder pointing to the deferred full help panel.

### Content by Panel

**Reader `?` popover:**

> **Your Bible.** Navigate, read, and bookmark Scripture here.
>
> - Use the book button (top left) to jump to any book and chapter
> - Click a verse to select it — notes and references update automatically
> - ‹ › arrows move between chapters
> - The ⬤ button bookmarks the selected verse
> - Split view lets you read two passages side by side

**Notes panel `?` popover:**

> **Your notebook.** Studies, notes, and tags live here.
>
> - Click + to start a new study
> - Select a verse, then click "Add Note" to write about it
> - Attach more verses to a note with the + button on the anchor bar
> - Type in the tag field to organize notes by theme
> - Click any tag chip to see everything tagged with that word

**Reference panel `?` popover:**

> **Your reference shelf.** Background material and cross-references appear here based on what you're reading.
>
> - **Info** — book context, chapter details, and any notes you've written about the selected verse
> - **Tags** — topics from Nave's Topical Bible and your own tags for this verse
> - **Related** — cross-references connecting this verse to the rest of Scripture *(coming soon)*

**"More help" link copy (all three popovers, Build 1.5):**

> Need more? A full help guide is on its way. For now, try clicking around — Ember is designed to teach itself through use.

When the full help panel ships, this link copy is updated and points to the relevant section of the panel.

### Future popovers (added when relevant features ship)

- **Study Guide popover** — added when study templates ship (Build 3). Will follow the same metaphor pattern: "*Your guided study session*" or similar wording, framing template-driven study as a structured worksheet.
- **Memory popover** — added when memory verses ship. Metaphor TBD — possibly "*Your flashcards*" if memory lands in the notebook conceptually.
- **Journal popover** — added when journal ships. Metaphor TBD.

Each new popover follows the same structure: metaphor line + action bullets + "More help" link.

---

## Full Help Panel (Future Build)

### Format

A single scrollable HTML document covering every feature in the application. Reads like a short manual — clear headings, short paragraphs, no dense walls of text. Sections are anchored so quick popovers can deep-link via "More help" links.

### Opening section: the metaphor

The full help panel opens with the physical study metaphor as its framing chapter. Not buried, not decorative — the first thing a user reads if they open full help. A user who reads only the opening section already understands how the app is organized.

> **How Ember is organized**
>
> Ember mirrors a physical Bible study setup.
>
> - The **reader** is your Bible. Scripture text, bookmarks, highlights, and markups all live here.
> - The **notes panel** is your notebook. Studies, notes, and tags — your own thinking — live here.
> - The **reference panel** is your reference shelf. Cross-references, topics, dictionaries, and background material appear here based on what you're reading.
> - **Settings** are your workspace environment — like the lighting, your reading glasses, and how you've arranged your desk.
> - **Help** is the expert you go to when you're stuck.
>
> Once you have this picture, the rest of the app explains itself. Bookmarks live in the Bible because that's where ribbons go. Studies live in the notebook because that's where worksheets go. Cross-references live on the reference shelf because that's where indexes and concordances go.
>
> You don't need to remember any of this. The panels are labeled, and the app teaches itself through use. But if you ever wonder "where would I find X?" — ask yourself where it would live in a physical study, and you'll usually be right.

### Section structure

Following the opening section, the full help panel has one section per panel and one section for cross-cutting features. Each section uses the same key-value layout: setting name on the left, description and current value on the right. Settings link directly to the relevant `⚙` popover so help is not a dead end.

Section list:

- How Ember is organized (the metaphor)
- Reading Scripture (the reader)
- Studies and notes (the notes panel)
- Reference material (the reference panel)
- Bookmarks
- Tags and themes
- Search
- Keyboard shortcuts
- Settings reference
- About Ember (citations, sources, license)

Sections for features that don't yet exist (templates, memory, journal, language tools) are added when those features ship.

### Settings discoverability via help

When the full help panel describes a setting, the setting name is a direct link to the relevant `⚙` popover. Clicking "Font size" in the Reading Scripture help section closes help and opens the reader's settings popover with that option visible. This means help is not a dead end — it connects directly to the controls it describes.

This keeps settings discoverable (mentioned in help, linked from help, accessible from the gear icon) without creating a separate settings labyrinth — consistent with the proposal's design principle.

---

## Help in Search Results (Future Build)

When a user types a query into the search bar that matches a help topic or setting name, the search results include a "Help" result group alongside Scripture, Notes, Studies, and Tags.

### Matching

Help entries are matched by keyword against a lightweight index of topic names and setting labels. This is not full-text search against help prose — it matches against a curated list of terms:

- Panel names: "reader," "notes," "reference," "Bible," "notebook," "reference shelf"
- Setting names: "font size," "default tab," "translation," "dark mode"
- Feature names: "bookmarks," "tags," "topics," "search," "split view," "cross-references"
- Meta topics: "help," "settings," "about," "citations," "sources," "keyboard shortcuts"
- Metaphor terms: "Bible," "notebook," "reference shelf" — these match the panel they describe, so a user searching "notebook" finds the notes panel help section

### Result Format

A help search result appears as a distinct group labeled **Help**. Each result shows the topic name and a one-line description. Clicking a help result opens the full help panel scrolled to that section.

### Implementation Notes

The help index is a static array of objects — no database table needed. Each entry has a set of match keywords, a display title, a short description, and an anchor ID that corresponds to a section in the full help document. The search module checks this array alongside its existing verse and note queries.

```javascript
const helpIndex = [
    {
        keywords: ['notes', 'note', 'notebook', 'writing', 'anchor'],
        title: 'Notes',
        description: 'Write, tag, and organize notes anchored to verses.',
        anchor: 'help-notes'
    },
    {
        keywords: ['font', 'font size', 'text size', 'reading'],
        title: 'Font Size',
        description: 'Adjust the reader font size. Notes have their own font size setting.',
        anchor: 'help-reading'
    },
    {
        keywords: ['bookmark', 'bookmarks', 'ribbon', 'marker'],
        title: 'Bookmarks',
        description: 'Save your place in Scripture with optional comments.',
        anchor: 'help-bookmarks'
    },
    // ...
];
```

---

## Build Sequence

**Build 1:** No help system. The `?` buttons are present in the wireframe but inert.

**Build 1.5:** Quick help popovers ship for all three current panels (reader, notes, reference). Metaphor-aligned copy. The "More help" link is a non-functional placeholder. No full help panel, no search integration.

**Build 2:** No help system changes by default. If the Reference panel's Related tab content changes meaningfully when cross-references ship, the reference popover's content may need a small update.

**Build 3 or later:** *(Shipped 2026-11-23 as the rendered `USER_MANUAL.md`, with Help in search and the app map; see the status at the top.)* Full help panel ships. "More help" links become functional. Help search integration ships in the same build (the help index is small and the search module is already structured to accept new result groups).

**Future:** As new panels and settings are added (templates, memory verses, journal, commentary, language tools), each gets a quick help popover and a section in the full help document. The help index gains new keyword entries. The pattern scales without structural changes.
