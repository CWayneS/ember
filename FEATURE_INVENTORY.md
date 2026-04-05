# Ember Bible Study — Feature Inventory

Source-of-truth audit of the actual working code. Each item is traced to a live code path.
Items marked **[UNCONFIRMED]** or **[NON-FUNCTIONAL]** are noted at the end.

---

## App Shell

1. App name: "Ember Bible Study" (short name: "Ember") — manifest.json
2. PWA manifest present; display mode: `standalone`
3. Icons: 192×192 and 512×512 PNG (any/maskable)
4. Service worker registered (on non-localhost only) — app.js:42
5. Service worker strategy: cache-first for all static assets; network-first for `data/core.db` — sw.js
6. App works fully offline after first load (core.db persisted to OPFS/IndexedDB on first run)
7. Loading screen "Loading Scripture…" shown during init, hidden when ready — app.js / index.html:104
8. On load error, loading screen displays the error message — app.js:46

---

## Layout

9. Two-pane layout: study panels (left, default 50%) + reader (right)
10. Horizontal resize handle between study panels and reader — panels.js:initWorkspaceResize; min 300px each side
11. Panel column layout toggle (⇅ button in notes panel header): switches study panels between column (notes above reference) and side-by-side (notes beside reference) — panels.js:togglePanelLayout / app.js:34
12. Vertical resize handle between notes panel and reference panel (row resize in default layout, col resize in stacked layout) — panels.js:initPanelResize
13. Resize handles highlight on hover (accent color) — style.css

---

## Reader

14. KJV Bible text, all 66 books — db.js:getChapter
15. Verses rendered inline (`.verse` elements, `display: inline`) with superscript verse numbers
16. Scripture text max-width 680px, centered — style.css
17. Reader header contains: book abbreviation button, current-location label, ‹ prev, › next, spacer, "KJV" label, bookmark button, help button, settings button
18. Current location displayed as "Book Chapter" (e.g. "Genesis 1") — reader.js:47
19. Book abbreviation shown in book selector button — reader.js:48
20. Reading position persisted to SQLite `app_state`; restored on reload; default Genesis 1 — app.js:29-32, db.js:setState
21. Clicking a verse: selects it (`.selected` background), triggers brief gold glow animation (0.4s ease-out, rgba(196,163,90,0.55) → selected bg) — selection.js:handleVerseClick, style.css:`@keyframes verse-select-glow`
22. Re-clicking same verse: animation restarts via forced reflow — selection.js:39
23. Selection is single-verse only (previous selection cleared on new click) — selection.js:34
24. Clicking in notes panel or reference panel does NOT clear verse selection — selection.js:12-21
25. Clicking outside reader + panels (e.g. header area): clears selection — selection.js:12-21
26. Note indicator dots: 6px gold circle (`.note-indicator`) appended after verse text for verses with notes; tooltip shows count — reader.js:69-75, style.css
27. Indicator dots updated without full re-render after note writes — reader.js:refreshNoteDots
28. Navigating to a chapter via search or tag-view anchor: scrolls target verse into center and simulates a click to select it — reader.js:81-85

---

## Chapter Navigation

29. ‹ button: previous chapter; if chapter 1, goes to last chapter of previous book — reader.js:prevChapter
30. At Genesis 1: ‹ does nothing — reader.js:131
31. › button: next chapter; if last chapter, goes to chapter 1 of next book — reader.js:nextChapter
32. At Revelation 22: › does nothing — reader.js:142

---

## Book/Chapter Selector Overlay

33. Opens by clicking the book abbreviation button in reader header — reader.js:toggleBookOverlay
34. Full-screen overlay (fixed, below global header, z-index 200) covering the workspace
35. Books grouped by testament ("Old Testament" / "New Testament") with bold dividers
36. Within each testament, books sub-grouped by genre with genre headings: Law, History, Poetry & Wisdom, Prophecy, Gospels, Epistles, Apocalyptic
37. Each book shown as its abbreviation button; hover tooltip shows full book name
38. Clicking a book shows a chapter number grid (CSS grid, auto-fill ~44px columns)
39. Clicking a chapter number navigates to it and closes the overlay — reader.js:229-233
40. Clicking outside the overlay (but not the book button) closes it — reader.js:18-27
41. Pressing Escape closes it — reader.js:29-31

---

## Notes Panel

42. Tab bar: "All Studies" (permanent leftmost tab), dynamic study/tag tabs, "+" button
43. "All Studies" tab is always present and never shrinks — style.css
44. Dynamic study tabs truncate with ellipsis when space is tight; min 60px, max 160px — style.css
45. Tag view tabs displayed with "#tagname" prefix — panels.js:144
46. Each dynamic tab has a ✕ close button (appears inline) — panels.js:147-155
47. Closing a tab removes it; focus falls to nearest remaining tab or "All Studies" — panels.js:closeStudy
48. Layout toggle (⇅), help (?), and settings (⚙) buttons visible in notes panel header
49. Help and settings buttons have no event listeners — non-functional

---

## Study Document View

50. Editable study title at top of study (contenteditable, placeholder "Untitled Study") — notes.js:49-58
51. Typing in title: renames the study in DB, updates the open tab label — notes.js:54-57
52. Press Enter in title: blurs (no newline) — notes.js:59-61
53. Empty state: "No notes yet. Select a verse and click Add Note." — notes.js:64-73
54. Notes displayed in creation-order (ascending) as `.note-block` cards — notes.js:buildNoteBlock
55. Each note block: verse anchor chip(s) at top, contenteditable body, tag area, delete button in footer
56. Note body autosaves 800ms after last input — notes.js:scheduleSave
57. Note body placeholder text "Write your note…" when empty — notes.js:131
58. Note block gains accent-color border when focused (`focus-within`) — style.css
59. Anchor chip(s) above note body: show verse reference(s), clickable to navigate to that verse — notes.js:106-110
60. Attach button appears next to anchor chips when a verse is selected; labeled "+ BookName Chapter:Verse" — notes.js:updateAttachButtons
61. Clicking attach: adds selected verse as additional anchor to that note (no duplicate check if same verse) — notes.js:115-123
62. Attach button hidden when no verse is selected — notes.js:82
63. "Add Note" button: dashed full-width button at bottom of study — notes.js:buildAddNoteButton
64. Clicking "Add Note": creates a new empty note; if a verse is selected, anchors it to that verse; scrolls to and focuses the new note body — notes.js:addNote
65. Delete button: asks "Delete this note?"; on confirm, cancels pending autosave, deletes from DB, re-renders — notes.js:buildDeleteButton

---

## Tag Chips on Notes

66. Existing tags shown as chips (rounded pill, green-tinted) — style.css`.tag-chip`
67. Clicking a tag chip navigates to tag view — notes.js:189
68. Tag input: always-visible "Add tag…" field at end of tags row — notes.js:156-168
69. Typing in tag input: filters existing tags (case-insensitive substring match), excludes already-applied tags, shows up to 8 suggestions — tags.js
70. Up/Down arrows navigate suggestion list; highlighted suggestion fills on Enter — tags.js
71. Clicking a suggestion with mouse: fills and confirms it (prevents blur-hide race) — tags.js:55-57
72. Press Escape: hides suggestions — tags.js:111
73. Press Enter with text (no suggestion highlighted): adds the tag, clears input — notes.js:161-166
74. Tags stored lowercase (normalized on save) — db.js:saveNote / addNoteTag
75. Tags are reused if the same name exists; new tags created if not — db.js:saveNote

---

## All Studies View

76. Accessed via "All Studies" tab (permanent leftmost tab)
77. Lists all studies ordered by most-recently-modified first — db.js:getStudies
78. Each row: study name (bold, truncated), note count + last-modified date
79. Clicking the study row: opens the study in a new tab (or switches to existing tab if already open) — notes.js:388
80. Delete button (✕) hidden by default, fades in on row hover — style.css
81. Delete study: confirm dialog; if notes exist, includes count in prompt — notes.js:406-415
82. Deleting a study also deletes all its notes (CASCADE) and closes its open tab if any — db.js:deleteStudy, panels.js:closeStudy
83. Empty state: "No studies yet. Click + to start one." — notes.js:374-378

---

## Creating and Managing Studies

84. Create new study: click "+" in notes tab bar → "Untitled Study" created, opened in new tab immediately — panels.js:initNotesTabs
85. Rename study: click into title field at top of study document, edit inline
86. Close study tab: click ✕ on the tab
87. Delete study: from All Studies view only
88. Opening the same study twice does not open a duplicate tab — panels.js:openStudy

---

## Tag View Tab

89. Opening a tag (from chip click, reference panel, or search): opens a tab labeled "#tagname" in notes panel — panels.js:openTagView
90. Tag view shows system topic verses and user notes with that tag
91. Topic verses shown first as non-editable note-block cards (verse reference anchor + verse text) — notes.js:buildTopicVerseCard
92. Verses paginated: 100 per page; "Load more" button shows "Load N more of M remaining" — notes.js:buildLoadMoreButton
93. Verses rendered in chunks of 30 per animation frame (prevents UI blocking) — notes.js:renderInChunks
94. User notes shown after verses: read-only (verse anchor, body, tag chips, study link arrow)
95. Clicking verse anchor in tag view: navigates to that verse — notes.js:301
96. Clicking study link arrow: opens that study in a tab — notes.js:336
97. Empty tag (no notes or verses): "No notes or verses tagged 'tagname'." — notes.js:230-234

---

## Reference Panel — Info Tab

98. Active when a verse is selected; placeholder "Select a verse to see reference material." otherwise — reference.js
99. Shows: book name, testament label ("Old Testament" / "New Testament"), genre — reference.js:57-69
100. Shows: chapter number, verse count for that chapter — reference.js:76-88
101. If the selected verse has notes: shows a "Notes" section with each note's body, tag chips, and a "StudyName →" link button — reference.js:appendVerseNotes
102. Clicking tag chip in reference panel: opens tag view — reference.js:118
103. Clicking study link in reference panel: opens that study in a tab — reference.js:127

---

## Reference Panel — Tags Tab

104. Shows Topics (system-assigned, from the database) for selected verse as chips — reference.js:renderTagsTab
105. Shows "Your Tags" (user-applied via notes) for selected verse as chips
106. Both types of chips are clickable and open tag view — reference.js
107. System topic chips have distinct styling (`.system-tag`, lighter bg/text) — style.css
108. If no topics or tags: "No topics or tags for this verse." — reference.js:147-149

---

## Reference Panel — Related Tab

109. Shows placeholder text: "Cross-references will be available in Build 2." — reference.js:renderRelatedTab

---

## Reference Panel — Language Tab

110. Shows placeholder text: "Original language tools will be available in a future build." — reference.js:renderLanguageTab

---

## Search

111. Search bar in global header, centered pill-shaped input (max-width 520px)
112. Clicking search input when empty: shows prefix shortcuts panel — search.js:17-20
113. Typing 1 character: hides overlay (no results) — search.js:30-32
114. Typing 2+ characters: runs search after 200ms debounce — search.js:33-35
115. Search covers: Scripture (FTS with LIKE fallback, 50 results max), notes (FTS4, 50 max), tag names + topic names (LIKE), study names (LIKE, 20 max) — db.js:search
116. Results displayed in labeled sections: Scripture, Notes, Studies, Tags — search.js:75-78
117. Empty results: "No results for 'query'" — search.js:renderEmpty
118. Clicking a Scripture result: navigates to that verse, closes search, clears input — search.js:111-115
119. Clicking a Note result: navigates to the note's first anchor verse, opens the note's study in a tab, closes search — search.js:154-163
120. Clicking a Study result: opens the study in a tab, closes search — search.js:184-189
121. Clicking a Tag result: opens tag view tab, closes search — search.js:208-213
122. Press Escape: closes overlay, blurs input — search.js:37-40
123. Click outside search bar + results: closes overlay — search.js:45-48

---

## Search Prefix Shortcuts

All four prefixes are functional (filter which result sections are shown):

124. `b:` — Scripture verses only
125. `n:` — Notes only
126. `s:` — Studies only
127. `t:` — Tags only

128. Shortcuts panel shows all four prefixes with descriptions — search.js:renderShortcuts
129. Clicking a prefix row in the shortcuts panel inserts that prefix into the input and focuses it — search.js:254-259

---

## Data Persistence

130. SQLite database via sql.js (WebAssembly), runs entirely in-browser — db.js
131. User data stored in OPFS (`core.db`) if available; falls back to IndexedDB — db.js / storage-worker.js
132. Database writes offloaded to a Web Worker (storage-worker.js) — zero-copy transfer
133. Every write operation (note save, delete, tag add/remove, anchor add, study create/rename/delete, state change) triggers a DB export and async save — db.js
134. No cloud sync; no account required; all data stays on the device
135. Clearing browser storage (site data) deletes all notes, studies, and tags (the database is reset to the bundled core.db)
136. Reading position and last-used translation persisted in `app_state` table — db.js:setState/getState

---

## COMING SOON — UI elements present but not yet wired up

**Theme toggle:** CSS class `.theme-dark` is defined with a complete dark palette. Toggle button and wiring are coming in a future update.

**PWA install prompt:** `#install-overlay` DOM element and styles are in place (Install / Not now buttons). JavaScript handling for `beforeinstallprompt` is coming in a future update.

**Context toolbar:** CSS styles exist for `#context-toolbar` (a dark floating toolbar that would appear on verse selection). Not in HTML; JS not yet written. Design is undecided — not confirmed for any specific update.

**Bookmark button** (`#bookmark-btn`): visible in reader header; functionality coming in a future update.

**Help buttons** (`?` in reader and both panels): visible; functionality coming in a future update.

**Settings buttons** (`⚙` in reader and both panels): visible; functionality coming in a future update.

**`state.js` module**: in-memory reactive state manager scaffolded (`getAppState`, `setAppState`, `onStateChange`); not yet wired into the app. Work in progress.

**`#template-bar`**: DOM element present (`height: 40px`, currently hidden). No content yet.

---

## Needs Verification

- Are system Topics actually populated in `core.db`? (Code queries them, but the audit can't confirm data presence without running the app.)
- Does the LIKE fallback for Scripture search actually fire (requires FTS to fail first)?
