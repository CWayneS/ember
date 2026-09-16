# Ember Bible Study — User Manual

---

## What is Ember?

Ember is a Bible study app that runs in your browser or as an installed desktop app. It contains six full Bible translations, original-language (Hebrew/Greek) word study tools, cross-references, reading plans, and a complete note-taking system — with no account, no subscription, and no internet connection required after the first load. Everything you write stays on your device. Nothing is sent anywhere.

---

## Getting Started

### Installing the app

Ember is a Progressive Web App. Most desktop browsers will offer to install it — look for an install icon in the address bar, or check your browser's menu for an "Install" option. Once installed, Ember opens in its own window without browser chrome, just like a native app.

If you'd rather not install it, it works just as well in a browser tab.

### First launch

The first time Ember loads, it downloads the core database and all six bundled translations (roughly 65–70 MB total) and saves them to your device. After that, everything runs locally. Original-language data for the Language tab (about 55 MB) downloads separately, the first time you actually open that tab or read a Psalm with a title — not at first launch — so it doesn't slow down your very first load.

You'll land on Genesis 1 with empty study panels on the left. The loading screen disappears when the app is ready.

---

## Reading Scripture

### The layout

The screen is split into two halves. The right side is the reader. The left side holds your study panels — notes above, reference below. You can drag the vertical handle between them to resize either half, and click the **⇅** button above the notes panel to switch between the panels being stacked or side by side.

### The reader header

At the top of the reader you'll find, from left to right:

- **Split reader** (the two-rectangle icon) — opens a second reading pane alongside the first, so you can read two passages (or two translations) at once. Click again to close it.
- **Markup tools** (the pen icon) — opens a strip of highlight colors, underline styles, and a circle tool for marking up a selected verse or range. See [Marking Up Verses](#marking-up-verses).
- **☆ Bookmark** — bookmarks the selected verse, or shows your bookmark list if nothing is selected. See [Bookmarks](#bookmarks).
- **? Help** — a quick reference popover for the reader.
- **⚙ Settings** — adjust reading font size and other display options for this pane.

### Switching translations

Each reading pane shows its translation abbreviation (e.g. "KJV") at the top. Click the book/chapter button to open the selector — it now opens with a row of translation buttons (KJV, ASV, WEB, YLT, Darby, BSB) across the top. Click one to switch that pane to that translation without leaving your current chapter. If you're using split reader, each pane keeps its own translation independently.

### Reading in two panes side by side

Click the split-reader icon in the reader header to open a second pane. Each pane navigates and switches translations independently — a common use is the same chapter in two translations, or two different passages, side by side. Click the icon again to close the second pane.

### Navigating chapters

Click **‹** to go back one chapter, **›** to go forward. At the end of a book, the arrows cross into the next or previous book automatically. At Genesis 1, the back arrow does nothing. At Revelation 22, the forward arrow does nothing.

Your reading position is saved automatically. When you reopen Ember, you'll return to where you left off.

### The book/chapter selector

Click the book abbreviation button (e.g. "Gen") to open the selector. It covers the workspace with a translation row at top, then all 66 books organized by testament and genre:

**Old Testament:** Law · History · Poetry & Wisdom · Prophecy

**New Testament:** Gospels · Epistles · Apocalyptic

Books appear as abbreviation buttons — hover over one to see the full name. Click a book to see its chapter grid, then click a chapter number to navigate there. The overlay closes automatically.

To close without navigating, click anywhere outside the overlay or press **Escape**.

---

## Selecting Verses

Click any verse in the reader to select it. The verse gets a subtle background highlight and a brief gold glow as it selects.

To select a range of verses, click the first verse, then **Shift+click** the last verse in the same pane — every verse in between is selected too. Clicking a different verse (without Shift) moves the selection and collapses it back to one verse.

**Clicking inside the notes or reference panel does not clear your selection.** You can move between the panels and the reader freely without losing it. The selection clears when you click in the header or anywhere else outside the two panels.

### Note indicator dots

If a verse has notes attached to it, a small gold dot appears after the verse text. Hover over it to see how many notes there are.

---

## Marking Up Verses

Select a verse or range, then click the pen icon in the reader header to open the markup strip: five highlight colors, two underline styles (solid and wavy), and a circle tool.

Click any tool to apply it to your current selection. Clicking the same tool again on the same range removes it; clicking a different color of the same type (highlight or underline) replaces it. The markup strip stays open across sessions until you close it again by clicking the pen icon.

---

## Bookmarks

Click the **☆** button in the reader header to bookmark the currently selected verse. A small prompt lets you add an optional label before saving.

If the selected verse is already bookmarked, clicking **☆** removes the bookmark immediately.

With no verse selected, clicking **☆** instead opens your bookmark list. Click any bookmark to jump to that verse, or click the **✕** next to it to remove it.

---

## Taking Notes

### How notes work

Notes belong to studies. Before you can add a note, you need a study open. Think of a study as a named document that holds a collection of notes — you might have one for a sermon series, one for a book you're working through, or one for a topic you're exploring.

### Creating a study

Click the **+** button in the notes panel tab bar. A new study called "Untitled Study" opens immediately in a tab.

### Adding a note

With a study open, click the **+ Add Note** button at the bottom of the study document. A new blank note appears and focuses automatically.

If you have a verse (or a verse range) selected when you click Add Note, the note is anchored to that selection — the reference appears as a chip above the note body (e.g. "John 3:16" or "John 3:16-17" for a range). If no verse is selected, the note is created without an anchor.

### Writing and editing

The note body is a plain text area. Just click and type. Notes save automatically 800 milliseconds after you stop typing — you don't need to press anything.

### Attaching verses to existing notes

When you have a verse selected, a small **+** button appears next to the anchor chips on every note in the open study. The button is labeled with the verse reference. Click it to attach that verse to the note as an additional anchor.

Clicking any anchor chip on a note navigates the reader to that verse.

### Deleting a note

Click **Delete** in the note footer. You'll be asked to confirm.

---

## Using Tags

Each note has a tag area in its footer. Click the **Add tag…** field and start typing.

As you type, a dropdown shows matching tags from your existing tag library (up to 8 suggestions, filtered to exclude tags already on this note). Use **↑ / ↓** to move through the list, **Enter** to apply, or **Escape** to dismiss. You can also click any suggestion directly.

If you type a tag that doesn't exist yet and press **Enter**, it's created. Tags are always stored in lowercase.

Tags appear as green-tinted chips on the note. Click any tag chip to open a tag view for that tag.

---

## Studies

### The All Studies view

Click the **All Studies** tab (the permanent leftmost tab in the notes panel) to see all your studies. Each row shows the study name, how many notes it contains, and when it was last modified. Studies are sorted by most recently modified first.

Click a study to open it. If it's already open in a tab, you'll switch to that tab.

### Renaming a study

The study title at the top of the document is editable — click it and type. The tab label updates as you type.

### Closing a study tab

Click the **✕** on the tab. This doesn't delete the study — it just closes the tab. You can reopen it from All Studies.

### Deleting a study

In the All Studies view, hover over a study to reveal the **✕** delete button on the right. Click it and confirm. Deleting a study permanently deletes all of its notes.

---

## The Reference Panel

The reference panel sits below the notes panel on the left. It has five tabs: **Info**, **Tags**, **Related**, **Language**, and **Plans**.

Select a verse in the reader to populate the first four tabs. Without a selection, each shows "Select a verse to see reference material." Plans doesn't depend on a selection — see below.

### Info

Shows the book name, testament, and genre. Below that, the current chapter number and verse count. If the selected verse has notes, they're listed here too — with their text, tags, and a button to open the parent study.

### Tags

Shows two groups of chips for the selected verse:

- **Topics** — system-assigned topics from the database (lighter styling)
- **Your Tags** — tags you've applied via notes on this verse

Clicking any chip opens a tag view for that topic or tag.

### Related

Shows cross-references for the selected verse — other passages that speak to the same theme, event, or wording. If nothing meets the default relevance bar, you'll see a note saying so, with a **Show all** button underneath if a longer tail of lower-confidence references exists. Clicking **Show all** re-lists every reference, grouped into collapsible sections by book. Click any reference to jump to it.

### Language

Shows the original Hebrew or Greek text for the selected verse (or verses, for a range selection), word by word, with an English gloss under each word. Words that read naturally as one phrase in English (like "the Word") are grouped into a single row.

Tap any row to open a card beneath it with that word's original-language spelling, its English meaning in this verse, its Strong's number, and its grammar code — without leaving your place in the verse. Only one card is open at a time; tapping a different row (or the same one again) closes it.

Tap **Click for more** on a word for its dictionary form (lemma), transliteration, and a plain-English breakdown of its grammar. Greek words also get a **Lexicon** button revealing the full dictionary entry. Hebrew words don't have a Lexicon button yet — that source is still pending a rights clearance.

### Plans

The Plans tab has two sub-tabs: **Reading Plans** and **Study Templates**. Neither depends on a verse selection.

**Reading Plans** comes pre-loaded with three plans (M'Cheyne's one-year plan and two Bible-in-a-year plans — canonical and chronological order). Click a plan to open its detail view: a **Continue →** button, a day-by-day list (☑ completed, ▶ current, ○ upcoming — click any day to jump straight to it), and Restart/Delete at the bottom.

Opening a day activates a bar at the very top of the screen showing the plan's title and today's passage(s). Use **◀ Prev** / **Next ▶** to move between passages within the day, which roll over into **Prev Day** / **Next Day** at the ends. Click **✕** on the bar to close it — your progress is saved, and you can resume anytime from the Plans tab.

You can also import your own plan as a JSON or CSV file with the **Import** button.

**Study Templates** offers three ready-made structures — Inductive Study, Word Study, and Passage Overview. Click one, name your study, and it opens as a new study tab, pre-filled with that template's structure.

---

## Search

The search bar is centered at the top of the screen.

Click into it to see the prefix shortcuts panel. Start typing (at least 2 characters) to run a search. Results appear in a dropdown below the bar, grouped into sections: **Scripture**, **Notes**, **Studies**, **Tags**, and **Bookmarks**.

- **Scripture result** — navigates to that verse and selects it (searches your currently active translation)
- **Note result** — navigates to the note's verse and opens its study in a tab
- **Study result** — opens the study in a tab
- **Tag result** — opens a tag view tab
- **Bookmark result** — navigates to that bookmark

Press **Escape** or click outside the results to close the overlay.

### Prefix shortcuts

You can narrow results to a single type by starting your query with a prefix:

| Prefix | Searches |
|--------|----------|
| `b:` | Scripture verses only |
| `n:` | Notes only |
| `s:` | Studies only |
| `t:` | Tags only |
| `k:` | Bookmarks only |

The shortcuts panel that appears when you focus the search bar is interactive — clicking a prefix row inserts it into the input so you can type right after it.

### Tag views

When you open a tag (from a chip, the reference panel, or a search result), it opens as a tab in the notes panel labeled **#tagname**. Tag views show:

- All verses in that topic (if it's a system topic), paginated 100 at a time with a "Load more" button
- All your notes with that tag, shown below the verses in read-only form

Clicking a verse reference in a tag view navigates the reader there. Clicking the study link arrow opens that study.

---

## Appearance & Settings

Click the **☀/🌙** icon next to the search bar to toggle dark mode.

Most panels have a **⚙** button in their header for panel-specific display options (like font size). The **⚙** next to the search bar opens global settings, covering:

- **Backup & Restore** — export your entire notes/tags/studies/bookmarks database as a single file, or restore from a previously exported one. Restoring asks you to confirm first, since it replaces everything currently on your device.
- **Data & Attribution** — credits for the two externally-sourced, CC BY 4.0–licensed datasets Ember bundles (original-language word data and cross-reference data), each linked to its source.

---

## Your Data

All your notes, tags, studies, bookmarks, and markups are stored locally on your device in your browser's storage (OPFS when available, IndexedDB as a fallback). Nothing leaves your device.

No account is required. There is no cloud sync — if you use Ember on more than one device, use Export/Restore under **Settings** to carry your data between them.

**One important caveat:** if you clear your browser's site data for Ember without exporting a backup first, your notes and studies will be permanently deleted. The app will reset as if it's the first run.

Your last reading position is also saved locally and restored each time you open the app.

---

*Planned for future updates: nested notes, shareable study templates, a Webster's dictionary lookup, and a fuller Greek lexicon.*
