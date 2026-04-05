# Ember Bible Study — User Manual

---

## What is Ember?

Ember is a Bible study app that runs in your browser or as an installed desktop app. It contains the full King James Bible and a complete set of study tools — notes, tags, and studies — with no account, no subscription, and no internet connection required after the first load. Everything you write stays on your device. Nothing is sent anywhere.

---

## Getting Started

### Installing the app

Ember is a Progressive Web App. Most desktop browsers will offer to install it — look for an install icon in the address bar, or check your browser's menu for an "Install" option. Once installed, Ember opens in its own window without browser chrome, just like a native app.

If you'd rather not install it, it works just as well in a browser tab.

### First launch

The first time Ember loads, it downloads the Bible database (~18 MB) and saves it to your device. After that, everything runs locally.

You'll land on Genesis 1 with empty study panels on the left. The loading screen disappears when the app is ready.

---

## Reading Scripture

### The layout

The screen is split into two halves. The right side is the reader. The left side holds your study panels — notes above, reference below. You can drag the vertical handle between them to resize either half.

### The reader header

At the top of the reader you'll find:

- **Book abbreviation button** — click to open the book/chapter selector
- **Current location** — shows the book and chapter you're reading (e.g. "Romans 8")
- **‹ and › arrows** — navigate to the previous or next chapter
- **KJV label** — the current translation
- Additional buttons on the right are coming in a future update

### Navigating chapters

Click **‹** to go back one chapter, **›** to go forward. At the end of a book, the arrows cross into the next or previous book automatically. At Genesis 1, the back arrow does nothing. At Revelation 22, the forward arrow does nothing.

Your reading position is saved automatically. When you reopen Ember, you'll return to where you left off.

### The book/chapter selector

Click the book abbreviation button (e.g. "Gen") to open the selector. It covers the workspace and lists all 66 books organized by testament and genre:

**Old Testament:** Law · History · Poetry & Wisdom · Prophecy

**New Testament:** Gospels · Epistles · Apocalyptic

Books appear as abbreviation buttons — hover over one to see the full name. Click a book to see its chapter grid, then click a chapter number to navigate there. The overlay closes automatically.

To close without navigating, click anywhere outside the overlay or press **Escape**.

---

## Selecting Verses

Click any verse in the reader to select it. The verse gets a subtle background highlight and a brief gold glow as it selects.

Only one verse can be selected at a time. Clicking a different verse moves the selection.

**Clicking inside the notes or reference panel does not clear your selection.** You can move between the panels and the reader freely without losing it. The selection clears when you click in the header or anywhere else outside the two panels.

### Note indicator dots

If a verse has notes attached to it, a small gold dot appears after the verse text. Hover over it to see how many notes there are.

---

## Taking Notes

### How notes work

Notes belong to studies. Before you can add a note, you need a study open. Think of a study as a named document that holds a collection of notes — you might have one for a sermon series, one for a book you're working through, or one for a topic you're exploring.

### Creating a study

Click the **+** button in the notes panel tab bar. A new study called "Untitled Study" opens immediately in a tab.

### Adding a note

With a study open, click the **+ Add Note** button at the bottom of the study document. A new blank note appears and focuses automatically.

If you have a verse selected when you click Add Note, the note is anchored to that verse — the reference appears as a chip above the note body (e.g. "John 3:16"). If no verse is selected, the note is created without an anchor.

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

The reference panel sits below the notes panel on the left. It has four tabs: **Info**, **Tags**, **Related**, and **Language**.

Select a verse in the reader to populate the panel. Without a selection, each tab shows "Select a verse to see reference material."

### Info

Shows the book name, testament, and genre. Below that, the current chapter number and verse count. If the selected verse has notes, they're listed here too — with their text, tags, and a button to open the parent study.

### Tags

Shows two groups of chips for the selected verse:

- **Topics** — system-assigned topics from the database (lighter styling)
- **Your Tags** — tags you've applied via notes on this verse

Clicking any chip opens a tag view for that topic or tag.

### Related

Cross-references are coming in a future update.

### Language

Original language tools are coming in a future update.

---

## Search

The search bar is centered at the top of the screen.

Click into it to see the prefix shortcuts panel. Start typing (at least 2 characters) to run a search. Results appear in a dropdown below the bar, grouped into sections: **Scripture**, **Notes**, **Studies**, and **Tags**.

- **Scripture result** — navigates to that verse and selects it
- **Note result** — navigates to the note's verse and opens its study in a tab
- **Study result** — opens the study in a tab
- **Tag result** — opens a tag view tab

Press **Escape** or click outside the results to close the overlay.

### Prefix shortcuts

You can narrow results to a single type by starting your query with a prefix:

| Prefix | Searches |
|--------|----------|
| `b:` | Scripture verses only |
| `n:` | Notes only |
| `s:` | Studies only |
| `t:` | Tags only |

The shortcuts panel that appears when you focus the search bar is interactive — clicking a prefix row inserts it into the input so you can type right after it.

### Tag views

When you open a tag (from a chip, the reference panel, or a search result), it opens as a tab in the notes panel labeled **#tagname**. Tag views show:

- All verses in that topic (if it's a system topic), paginated 100 at a time with a "Load more" button
- All your notes with that tag, shown below the verses in read-only form

Clicking a verse reference in a tag view navigates the reader there. Clicking the study link arrow opens that study.

---

## Your Data

All your notes, tags, and studies are stored locally on your device in your browser's storage (OPFS when available, IndexedDB as a fallback). Nothing leaves your device.

No account is required. There is no cloud sync.

**One important caveat:** if you clear your browser's site data for Ember (via browser settings), your notes and studies will be permanently deleted. The app will reset as if it's the first run. There's currently no export or backup feature.

Your last reading position is also saved locally and restored each time you open the app.

---

*Dark mode and additional features are coming in a future update.*
