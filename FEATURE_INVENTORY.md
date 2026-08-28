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

## Theme

9. Dark mode toggle (☀/☾ button in global header): toggles `.theme-dark` class on `<body>`, persists choice to `localStorage`, respects `prefers-color-scheme` on first visit — app.js:47-56
10. Complete dark palette defined via CSS custom properties; all colors switch together — style.css:`.theme-dark`
11. Font families, base sizes, and spacing are author-set defaults; only light/dark mode is user-controllable

---

## Layout

12. Two-pane layout: study panels (left, default 50%) + reader (right)
13. Horizontal resize handle between study panels and reader — panels.js:initWorkspaceResize; min 300px each side
14. Panel column layout toggle (⇅ button in notes panel header): switches study panels between column (notes above reference) and side-by-side (notes beside reference) — panels.js:togglePanelLayout / app.js:34
15. Vertical resize handle between notes panel and reference panel (row resize in default layout, col resize in stacked layout) — panels.js:initPanelResize
16. Resize handles highlight on hover (accent color) — style.css

---

## Reader

17. 6 bundled translations (KJV, ASV, WEB, YLT, Darby, BSB), all 66 books — db.js:getChapter; each translation stored in its own SQLite file under `data/translations/`
18. Verses rendered inline (`.verse` elements, `display: inline`) with superscript verse numbers
19. Scripture text max-width 680px, centered — style.css
20. Reader header contains: split toggle button, spacer, bookmark button (☆), help button (?), settings button (⚙)
21. Current location displayed as "Book Chapter" (e.g. "Genesis 1") in pane nav — reader.js
22. Book abbreviation shown in book selector button in pane nav — reader.js
23. Per-pane reading position, translation, and scroll offset persisted to `localStorage` (`ember.pane.left.state` / `ember.pane.right.state`); restored on reload; default Genesis 1 KJV — reader.js
23a. `.translation-label` in pane nav updated dynamically on every render and on translation switch — reader.js:updateTranslationLabel
24. Clicking a verse: selects it with a 2px accent-color outline (`outline-offset: 1px`); background stays transparent so markup colors show through; brief outline-pulse animation (0.4s ease-out, 3px→2px) — selection.js:handleVerseClick, style.css:`.verse.selected`, `@keyframes verse-select-glow`
25. Re-clicking same verse: animation restarts via forced reflow — selection.js:39
26. Plain click selects a single verse (sets anchor); previous selection cleared — selection.js
26a. Shift-click extends selection from the anchor verse to the clicked verse, selecting the full range in DOM order — selection.js:selectRange
26b. Shift-click across panes (anchor in pane A, click in pane B) falls back to plain-click behavior; cross-pane ranges are not supported — selection.js:46-55
26c. Switching the active pane clears any selection whose anchor belongs to the outgoing pane — selection.js (pane-changed listener)
27. Clicking in notes panel or reference panel does NOT clear verse selection — selection.js
28. Clicking outside reader + panels (e.g. header area): clears selection — selection.js
29. Verse indicators: 5px circles positioned below the verse-number superscript via `.verse-indicators` (absolute, centered). Gold dot (`.note-indicator`, `var(--note-indicator)`) for verses with notes — tooltip shows count. Green dot (`.bookmark-indicator`, `var(--accent)`) for bookmarked verses — tooltip shows comment or "Bookmarked". When both present, dots stack vertically — reader.js, style.css:`.verse-number`, `.verse-indicators`
30. Indicator dots updated without full re-render after note writes — reader.js:refreshNoteDots
31. Navigating to a chapter via search or tag-view anchor: scrolls target verse into center and simulates a click to select it — reader.js
31a. Cross-reference click-to-navigate: `selectVerseRange(startId, endId)` in selection.js programmatically selects a verse or range, scrolls to it, and dispatches `selection-changed` — selection.js:selectVerseRange

---

## Split View

32. Split toggle button (⊞) in reader header: shows/hides second reader pane side-by-side — reader.js:toggleSplit
33. Opening split: pane B restores its saved `ember.pane.right.state`; first-ever open defaults to Genesis 1 KJV — reader.js
34. Each pane has independent book/chapter navigation, translation, and scroll position — reader.js
35. Active pane highlighted with accent underline on its nav bar in split mode — style.css:`#reader.split-active`
36. Draggable resize handle between split panes; minimum 200px per pane — reader.js:initSplitResize
36a. Split-view on/off state persisted to `localStorage` (`ember.reader.split`); restored on reload — reader.js:initReader, toggleSplit
37. Clicking a verse in either pane activates that pane and sets it as the active selection for notes and reference — selection.js, reader.js:setActivePane

---

## Chapter Navigation

38. ‹ button: previous chapter; if chapter 1, goes to last chapter of previous book — reader.js:prevChapter
39. At Genesis 1: ‹ does nothing — reader.js:131
40. › button: next chapter; if last chapter, goes to chapter 1 of next book — reader.js:nextChapter
41. At Revelation 22: › does nothing — reader.js:142

---

## Book/Chapter Selector Overlay

42. Opens by clicking the book abbreviation button in pane nav — reader.js:toggleBookOverlay
43. Full-screen overlay (fixed, below global header, z-index 200) covering the workspace
44. Books grouped by testament ("Old Testament" / "New Testament") with bold dividers
45. Within each testament, books sub-grouped by genre with genre headings: Law, History, Poetry & Wisdom, Prophecy, Gospels, Epistles, Apocalyptic
46. Each book shown as its abbreviation button; hover tooltip shows full book name
47. Clicking a book shows a chapter number grid (CSS grid, auto-fill ~44px columns)
48. Clicking a chapter number navigates to it and closes the overlay — reader.js
49. Clicking outside the overlay (but not the book button) closes it — reader.js
50. Pressing Escape closes it — reader.js
50a. Translation row at top of overlay: one button per installed translation; active translation highlighted with accent color — reader.js:renderTranslationRow, style.css
50b. Clicking a translation button in the row switches the active pane's translation, preserves the current passage (falls back to chapter 1 if the chapter is absent in the target translation), and keeps the overlay open — reader.js:switchPaneTranslation

---

## Bookmarks

51. Bookmark button (☆) in reader header; displays filled star when the selected verse is already bookmarked — bookmarks.js
52. Clicking bookmark button with a verse selected: opens an inline comment prompt (text input + Save / Cancel buttons) — bookmarks.js
53. Saving with a comment: stores bookmark with that label — bookmarks.js
54. Saving with an empty input: stores bookmark with null label — bookmarks.js
55. Cancel button: closes prompt without saving — bookmarks.js
56. Clicking bookmark button with no verse selected: opens a dropdown listing all saved bookmarks — bookmarks.js
57. Bookmark dropdown shows: book name, chapter:verse reference, label (if any), creation date — bookmarks.js
58. Clicking a bookmark in the dropdown: navigates to that verse and closes dropdown — bookmarks.js
59. Clicking outside bookmark dropdown or prompt: closes it — bookmarks.js
60. Pressing Escape: closes dropdown or prompt — bookmarks.js

---

## Reader Settings

61. Settings popover (⚙ button in reader header): opens a positioned popover using the shared `.help-popover` component — reader-settings.js
62. Font size control: A− and A+ buttons adjust scripture text size in 1px steps, min 12px, max 28px — reader-settings.js
63. A− and A+ disable at their respective limits — reader-settings.js
64. Font size affects `.verse-text` and `.verse-number` only via `--scripture-font-size` CSS variable scoped to `#reader-body`; UI chrome is unaffected — reader-settings.js, style.css
65. Reset button returns font size to 18px default — reader-settings.js
66. Font size persists across reloads via `app_state` key `scripture_font_size` — reader-settings.js

---

## Reader Help

67. Help popover (? button in reader header): opens a contextual help overlay with metaphor lead, action bullets, and a non-functional "More help" placeholder link — help.js

---

## Notes Panel

68. Tab bar: "All Studies" (permanent leftmost tab), dynamic study/tag tabs, "+" button
69. "All Studies" tab is always present and never shrinks — style.css
70. Dynamic study tabs truncate with ellipsis when space is tight; min 60px, max 160px — style.css
71. Tag view tabs displayed with "#tagname" prefix — panels.js:144
72. Each dynamic tab has a ✕ close button (appears inline) — panels.js:147-155
73. Closing a tab removes it; focus falls to nearest remaining tab or "All Studies" — panels.js:closeStudy
74. Layout toggle (⇅), help (?), and settings (⚙) buttons visible in notes panel header — all three functional

---

## Notes Settings

75. Settings popover (⚙ button in notes panel header): opens a positioned popover using the shared `.help-popover` component — notes-settings.js
76. Font size control: A− and A+ buttons adjust note text size in 1px steps, min 12px, max 28px — notes-settings.js
77. A− and A+ disable at their respective limits — notes-settings.js
78. Font size affects `.note-body` and `.note-block-body` (editable text) only via `--notes-font-size` CSS variable scoped to `#notes-panel`; fully independent from scripture font size — notes-settings.js, style.css
79. Reset button returns font size to 18px default — notes-settings.js
80. Font size persists across reloads via `app_state` key `notes_font_size` — notes-settings.js

---

## Notes Help

81. Help popover (? button in notes panel header): opens a contextual help overlay with metaphor lead, action bullets, and a non-functional "More help" placeholder link — help.js

---

## Study Document View

82. Editable study title at top of study (contenteditable, placeholder "Untitled Study") — notes.js:49-58
83. Typing in title: renames the study in DB, updates the open tab label — notes.js:54-57
84. Press Enter in title: blurs (no newline) — notes.js:59-61
85. Empty state: "No notes yet. Select a verse and click Add Note." — notes.js:64-73
86. Notes displayed in creation-order (ascending) as `.note-block` cards — notes.js:buildNoteBlock
87. Each note block: verse anchor chip(s) at top, contenteditable body, tag area, delete button in footer
88. Note body autosaves 800ms after last input — notes.js:scheduleSave
89. Note body placeholder text "Write your note…" when empty — notes.js:131
90. Note block gains accent-color border when focused (`focus-within`) — style.css
91. Anchor chip(s) above note body: show verse reference(s), clickable to navigate to that verse — notes.js:106-110
92. Attach button appears next to anchor chips when a verse is selected; labeled "+ BookName Chapter:Verse" — notes.js:updateAttachButtons
93. Clicking attach: adds selected verse as additional anchor to that note (no duplicate check if same verse) — notes.js:115-123
94. Attach button hidden when no verse is selected — notes.js:82
95. "Add Note" button: dashed full-width button at bottom of study — notes.js:buildAddNoteButton
96. Clicking "Add Note": creates a new empty note; if a verse is selected, anchors it to that verse; scrolls to and focuses the new note body — notes.js:addNote
97. Delete button: asks "Delete this note?"; on confirm, cancels pending autosave, deletes from DB, re-renders — notes.js:buildDeleteButton

---

## Tag Chips on Notes

98. Existing tags shown as chips (rounded pill, green-tinted) — style.css`.tag-chip`
99. Clicking a tag chip navigates to tag view — notes.js:189
100. Tag input: always-visible "Add tag…" field at end of tags row — notes.js:156-168
101. Typing in tag input: filters existing tags (case-insensitive substring match), excludes already-applied tags, shows up to 8 suggestions — tags.js
102. Up/Down arrows navigate suggestion list; highlighted suggestion fills on Enter — tags.js
103. Clicking a suggestion with mouse: fills and confirms it (prevents blur-hide race) — tags.js:55-57
104. Press Escape: hides suggestions — tags.js:111
105. Press Enter with text (no suggestion highlighted): adds the tag, clears input — notes.js:161-166
106. Tags stored lowercase (normalized on save) — db.js:saveNote / addNoteTag
107. Tags are reused if the same name exists; new tags created if not — db.js:saveNote

---

## All Studies View

108. Accessed via "All Studies" tab (permanent leftmost tab)
109. Lists all studies ordered by most-recently-modified first — db.js:getStudies
110. Each row: study name (bold, truncated), note count + last-modified date
111. Clicking the study row: opens the study in a new tab (or switches to existing tab if already open) — notes.js:388
112. Delete button (✕) hidden by default, fades in on row hover — style.css
113. Delete study: confirm dialog; if notes exist, includes count in prompt — notes.js:406-415
114. Deleting a study also deletes all its notes (CASCADE) and closes its open tab if any — db.js:deleteStudy, panels.js:closeStudy
115. Empty state: "No studies yet. Click + to start one." — notes.js:374-378

---

## Creating and Managing Studies

116. Create new study: click "+" in notes tab bar → "Untitled Study" created, opened in new tab immediately — panels.js:initNotesTabs
117. Rename study: click into title field at top of study document, edit inline
118. Close study tab: click ✕ on the tab
119. Delete study: from All Studies view only
120. Opening the same study twice does not open a duplicate tab — panels.js:openStudy

---

## Tag View Tab

121. Opening a tag (from chip click, reference panel, or search): opens a tab labeled "#tagname" in notes panel — panels.js:openTagView
122. Tag view shows system topic verses and user notes with that tag
123. Topic verses shown first as non-editable note-block cards (verse reference anchor + verse text) — notes.js:buildTopicVerseCard
124. Verses paginated: 100 per page; "Load more" button shows "Load N more of M remaining" — notes.js:buildLoadMoreButton
125. Verses rendered in chunks of 30 per animation frame (prevents UI blocking) — notes.js:renderInChunks
126. User notes shown after verses: read-only (verse anchor, body, tag chips, study link arrow)
127. Clicking verse anchor in tag view: navigates to that verse — notes.js:301
128. Clicking study link arrow: opens that study in a tab — notes.js:336
129. Empty tag (no notes or verses): "No notes or verses tagged 'tagname'." — notes.js:230-234

---

## Reference Panel — Info Tab

130. Active when a verse is selected; placeholder "Select a verse to see reference material." otherwise — reference.js
131. Shows: book name, testament label ("Old Testament" / "New Testament"), genre — reference.js:57-69
132. Shows: chapter number, verse count for that chapter — reference.js:76-88
133. If the selected verse has notes: shows a "Notes" section with each note's body, tag chips, and a "StudyName →" link button — reference.js:appendVerseNotes
134. Clicking tag chip in reference panel: opens tag view — reference.js:118
135. Clicking study link in reference panel: opens that study in a tab — reference.js:127

---

## Reference Panel — Tags Tab

136. Shows Topics (system-assigned from Nave's Topical Bible data in core.db) for selected verse as chips — reference.js:renderTagsTab
137. Shows "Your Tags" (user-applied via notes) for selected verse as chips
138. Both types of chips are clickable and open tag view — reference.js
139. System topic chips have distinct styling (`.system-tag`, lighter bg/text) — style.css
140. If no topics or tags: "No topics or tags for this verse." — reference.js:147-149

---

## Reference Panel — Related Tab

141. Shows cross-references sourced from `cross_references` table in core.db (OpenBible.info data, ~340K pairs with vote scores) — reference.js:renderRelatedTab
141a. Results filtered to vote ≥ 2 by default; a "Show all" toggle reveals lower-confidence references — reference.js
141b. References grouped by target book; displayed as clickable buttons showing book+chapter:verse reference — reference.js
141c. Clicking a cross-reference: navigates the active pane to the target chapter and selects the target verse range — reference.js:navigateToRef, selection.js:selectVerseRange
141d. If no high-signal cross-references exist: shows "No high-signal cross-references for this verse." — reference.js:203

---

## Reference Panel — Language Tab

142. Shows placeholder text: "Original language tools will be available in a future build." — reference.js:renderLanguageTab

---

## Reference Settings

143. Settings popover (⚙ button in reference panel header): opens a positioned popover using the shared `.help-popover` component — reference-settings.js
144. Default tab selector: three-button toggle group (Info / Tags / Related) — reference-settings.js
145. Selected default tab activates automatically whenever a verse is selected — reference-settings.js (listens to `selection-changed`)
146. Reset button returns default to Info — reference-settings.js
147. Default tab persists across reloads via `app_state` key `default_reference_tab` — reference-settings.js

---

## Reference Help

148. Help popover (? button in reference panel header): opens a contextual help overlay with metaphor lead, action bullets (Info / Tags / Related described), and a non-functional "More help" placeholder link — help.js

---

## Help System

149. All three panels have a help popover (? button): reader, notes, reference — help.js
150. Popovers use the shared `.help-popover` CSS component: fixed position, z-index 170, max-width 280px, theme-aware colors — style.css
151. Opening one popover closes any other open popover — popover-registry.js:closeAllPopovers (called at the top of each open handler; registered by help.js, bookmarks.js, reader-settings.js, notes-settings.js, reference-settings.js)
152. Clicking outside any open popover closes it — help.js (document click handler)
153. Pressing Escape closes any open popover — help.js (keydown handler)
154. "More help" link in each popover: non-functional placeholder (`preventDefault` only) — help.js

---

## Search

155. Search bar in global header, centered pill-shaped input (max-width 520px)
156. Clicking search input when empty: shows prefix shortcuts panel — search.js:17-20
157. Typing 1 character: hides overlay (no results) — search.js:30-32
158. Typing 2+ characters: runs search after 200ms debounce — search.js:33-35
159. Search covers: Scripture (FTS with LIKE fallback, 50 results max), notes (FTS4, 50 max), tag names + topic names (LIKE), study names (LIKE, 20 max) — db.js:search
160. Results displayed in labeled sections: "Scripture · {abbrev}" (e.g. "Scripture · KJV"), Notes, Studies, Tags — search.js
160a. Scripture section runs FTS against the active pane's translation database — search.js:runSearch; db.js:search
161. Empty results: "No results for 'query'" — search.js:renderEmpty
162. Clicking a Scripture result: navigates to that verse, closes search, clears input — search.js:111-115
163. Clicking a Note result: navigates to the note's first anchor verse, opens the note's study in a tab, closes search — search.js:154-163
164. Clicking a Study result: opens the study in a tab, closes search — search.js:184-189
165. Clicking a Tag result: opens tag view tab, closes search — search.js:208-213
166. Press Escape: closes overlay, blurs input — search.js:37-40
167. Click outside search bar + results: closes overlay — search.js:45-48

---

## Search Prefix Shortcuts

All five prefixes are functional:

168. `b:` — Scripture verses only
169. `n:` — Notes only
170. `s:` — Studies only
171. `t:` — Tags only
172. `k:` — Bookmarks only

173. Shortcuts panel shows all five prefixes with descriptions — search.js:renderShortcuts
174. Clicking a prefix row in the shortcuts panel inserts that prefix into the input and focuses it — search.js

---

## Text Markups

175. Markup button (pencil icon) in reader header: toggles the markup tool strip open/closed — markups.js
176. Markup button expanded/collapsed state persists across reloads via `localStorage` key `ember.markup_button.expanded` — markups.js
177. Tool strip contains highlight tools (multiple colors) and underline tools — index.html, markups.js
178. `markup-mode-on` class on `<body>` controls markup visibility; applied when strip is expanded — markups.js, reader.js
179. Clicking a markup tool with verse(s) selected: creates a markup record for the selected range — markups.js:handleToolClick, db.js:createMarkup
180. Clicking the same tool type + color on an already-marked range: removes the markup (toggle off) — markups.js
181. Clicking a different color of the same type on a marked range: replaces the markup color — markups.js
182. Markup visual classes applied per verse during chapter render — reader.js:refreshMarkupClasses, db.js:getMarkupsForChapter
183. Markups stored in `markups` table in user data (core.db), persisted via the normal OPFS/IndexedDB write path — db.js

---

## Notes — Anchor Coalescing

184. When a note has multiple single-verse anchors that form a contiguous range, they are coalesced into a single range anchor on save — notes.js:coalesceAnchors
185. Coalesced anchors reduce the number of anchor chips shown while preserving the full verse span

---

## Data Persistence

186. SQLite database via sql.js (WebAssembly), runs entirely in-browser — db.js
187. User data (notes, tags, studies, bookmarks, markups, app state) stored in OPFS (`core.db`) if available; falls back to IndexedDB — db.js / storage-worker.js
188. Translation databases (kjv.db, asv.db, etc.) stored in OPFS `translations/` subdirectory; fetched from network on first use, then served from OPFS — db.js
189. Database writes offloaded to a Web Worker (storage-worker.js) — zero-copy transfer
190. Every write operation (note save, delete, tag add/remove, anchor add, study create/rename/delete, bookmark add/remove, markup create/delete, state change) triggers a DB export and async save — db.js
191. No cloud sync; no account required; all data stays on the device
192. Clearing browser storage (site data) deletes all notes, studies, tags, bookmarks, and markups (user data reset to empty core.db); translations must be re-fetched
193. Font size preferences and default reference tab persisted in `app_state` table — db.js:setState/getState
194. Per-pane reading position, translation, and scroll offset persisted in `localStorage` — reader.js
194a. sql.js does not enforce foreign keys by default (confirmed empirically — the `foreign_keys` pragma is off, and a parent-row delete leaves child rows in place). The schema's `ON DELETE CASCADE` on `plan_days`/`plan_day_scripture` is therefore inert; `deletePlan()` deletes both explicitly, in dependency order, before the `plans` row — db.js:deletePlan

---

## Reading Plans

195. Plans tab in the reference panel tab bar, after Language — index.html:68. It plugs into panels.js's existing generic tab-switch handler (any `.tab-btn` + matching `#<tab>-tab` panel); no plans-specific code was needed in panels.js
195a. Two sub-tabs inside the Plans tab: Reading Plans and Study Templates, with their own independent tab-switch logic — index.html:80-93, plans.js:initPlansSubtabs/switchPlansSubtab
196. Reading Plans sub-tab lists every installed plan as a card; the list re-renders whenever the Plans tab button is clicked (so imports/deletes made earlier are reflected) and immediately after any import or delete — plans.js:initPlans, renderReadingPlansList
197. Default sort: In Progress (active) first, then Not Started, then Completed; alphabetical by title within each group — db.js:getPlans
198. Each card shows the title, a status badge ("In Progress" / "Not Started" / "Completed"), and — only for in-progress plans — a "Day N of M" progress line — plans.js:buildPlanCard, planStatusLabel
199. ✕ on a card opens a delete confirmation dialog without also opening the plan detail popover (click event is stopped from bubbling) — plans.js:buildPlanCard
200. Clicking a card anywhere else opens the plan detail popover — plans.js:buildPlanCard → openPlanDetailPopover
201. Import button opens a native file picker restricted to `.json`/`.csv` — index.html:86-87, plans.js:initPlanImport
202. Import failures (duplicate id, missing required fields, malformed file, unknown extension) are surfaced via `alert()` with the specific message from the parser — plans.js:initPlanImport
203. Empty state (all plans deleted): "No reading plans installed. Use the Import button to add a plan." — plans.js:renderReadingPlansList
204. Study Templates sub-tab shows static placeholder text only ("Study Templates — coming in a future build...") — plain markup in index.html:92, no JS renders it, no import button or list

---

## Plan Detail Popover

205. Clicking a plan card opens a centered modal (reuses the `.plan-metadata-overlay` backdrop) with the plan title, a prominent filled "Continue →" button, a progress summary line (omitted for not_started plans), a scrollable day-list checklist, and a Restart/Delete footer — plans.js:openPlanDetailPopover
206. Each day row shows a status icon — ☑ completed, ▶ current, ○ upcoming — the day number, an optional day title, and that day's first passage display string, joined with " — " — plans.js:openPlanDetailPopover
206a. The popover opens already scrolled to the current day (day 1 for not_started plans) — plans.js:openPlanDetailPopover (`currentRowEl.scrollIntoView({ block: 'center' })`)
207. Clicking Continue, or clicking any day row, activates the template bar for that plan starting at that day, then closes the popover — plans.js → template-bar.js:activatePlan
208. Restart and Delete each open a confirmation dialog naming the plan and its current progress ("Current progress: Day N of M") and stating notes are not affected. Restart resets `current_step` to 0 and `status` to `not_started`; Delete removes the plan and its `plan_days`/`plan_day_scripture` rows — plans.js:handleRestartPlan/handleDeletePlan, db.js:restartPlan/deletePlan
208a. Both dialogs (and the CSV import metadata dialog) are built from DOM nodes via `textContent`, never `innerHTML`, so a plan title sourced from imported data can never be interpreted as markup — plans.js:openConfirmDialog

---

## Plan Import — JSON and CSV

209. `importPlan(file)` (js/plans.js) detects format by file extension and routes to a JSON or CSV parser; unknown extensions get "Only .json and .csv plan files are supported." — plans.js:importPlan
210. JSON import requires `plan_metadata.id`, `.title`, `.duration_days`, and a non-empty `days` array; any missing field produces "This plan file is missing required field(s): …" naming exactly which ones — plans.js:importJsonPlan
211. A `plan_metadata.schedule_type` of `'date'`, or a `start_date` field, is converted to sequential silently (no warning shown); `current_step` is derived from days elapsed since `start_date`, clamped to `duration_days`, or 0 if `start_date` is missing/unparseable — plans.js:deriveCurrentStepFromStartDate
212. A duplicate `plan_id` (from either JSON or CSV) is rejected with "A plan with this ID is already installed." — db.js:insertPlan (throws with `.code === 'DUPLICATE_PLAN_ID'`), plans.js:insertPlanOrThrowFriendly
213. Malformed or unreadable files (invalid JSON, a CSV with no `day`/`ref`/`display` header) show "Could not read this file. Make sure it's a valid Ember plan file." — plans.js:importJsonPlan/importCsvPlan/parseCsv
214. CSV import expects `day`, `ref`, `display` columns in any order (matched by header name), supports minimal RFC4180-style quoting, infers `duration_days` from the highest `day` value, and opens a metadata dialog (title required; description and author optional) before inserting — plans.js:importCsvPlan, parseCsv, openCsvMetadataDialog
215. CSV-imported plans are always Scripture-only (no devotional fields) and are assigned a generated `plan_id` (`csv-{slugified-title}-{timestamp}`), since the CSV format carries no stable external id — plans.js:importCsvPlan, slugify

---

## Bundled Reading Plans

216. Three plans ship as JSON files in `data/plans/` and are seeded into `plans`/`plan_days`/`plan_day_scripture` on first run — db.js:seedBundledPlans, called from `initDatabase()` right after `createUserTables()`/schema migration, before translation seeding
216a. **M'Cheyne One-Year Reading Plan** (`mcheyne-1year`) — 365 days, 4 passages/day — data/plans/mcheyne-1year.json
216b. **Bible in a Year (Canonical)** (`bible-in-a-year-canonical`) — 362 days (not 365 — the actual bundled data covers the whole Bible in fewer, denser days) — data/plans/bible-in-a-year-canonical.json
216c. **Bible in a Year (Chronological)** (`bible-in-a-year-chronological`) — 365 days, passages ordered by historical sequence — data/plans/bible-in-a-year-chronological.json
217. Seeding is idempotent: a plan whose `plan_id` already exists is silently skipped (matched via `insertPlan()`'s duplicate check) — db.js:seedBundledPlans
218. All three ship Scripture-only (no `devotional_title`/`devotional_body`/`reflection_questions_json`) and appear "Not Started" on fresh install — db.js:insertPlan

---

## USFM Reference Resolution

219. `js/usfm.js` maps all 66 USFM 3-letter book codes to internal book numbers (1–66, matching the `books` table's canonical order). Nahum is coded `'NAH'` — not the stricter USFM `'NAM'` — to match what the bundled plan data actually uses — usfm.js:USFM_BOOK_CODES
220. `resolveUsfmRef(ref)` parses five ref shapes — whole chapter (`GEN.1`), single verse (`GEN.1.1`), in-chapter verse range (`GEN.1.1-25`), chapter range (`GEN.9-10`), and cross-chapter verse range (`GEN.1.1-2.17`) — into `{ book, chapter, verseStart, verseEnd, approximate }` — usfm.js:resolveUsfmRef
221. Chapter-range and cross-chapter refs are flagged `approximate: true` and stored with `verse_end = NULL`; navigation for those relies on the plan's stored `display` string rather than an exact end verse — usfm.js:resolveUsfmRef
222. Resolution happens exactly once, at seed/import time (`insertPlan()`); runtime navigation reads the pre-resolved `book`/`chapter`/`verse_start`/`verse_end` columns from `plan_day_scripture` directly and never re-parses USFM — db.js:insertPlan, getPlanDayScripture
222a. A ref that fails to resolve (unrecognized book code, unexpected shape) is skipped with a console error rather than aborting the whole plan; `insertPlan()` returns a count of unresolved refs — db.js:insertPlan

---

## Template Bar

223. `#template-bar`, below the global header, is fully wired: plan title, Prev/Next passage navigation, progress dots, the current passage as a clickable label, and a close (✕) button — index.html:30-36, template-bar.js
224. The bar is hidden by default and never auto-activates on load, even if a plan's `status` is `'active'` in the database from a previous session — it only appears via Continue or a day row in the plan detail popover — template-bar.js (module-level `state` starts `null`)
225. Prev/Next move between passages within the day currently shown in the bar; Prev becomes "◀ Prev Day" on the first passage of a day (Next becomes "Next Day ▶" on the last) — template-bar.js:render
226. Progress dots: one per passage in the current day. Filled = before the passage currently shown, outline = after it; the current passage itself renders as the clickable label, not a dot — template-bar.js:render
227. Clicking the current-passage label re-navigates the reader to it — useful after following a cross-reference or note anchor away from the plan passage — template-bar.js (label click → `navigateToCurrentPassage`)
228. Only "Next Day" writes to the database: it advances `current_step` by one (`db.js:setPlanProgress`), or — if that was the last passage of the plan's final day — marks the plan `completed` and hides the bar. Prev/Prev Day is pure review: it never changes `current_step`, even when it walks backward past the day the plan is bookmarked at — template-bar.js:handleNext/handlePrev
229. Which day/passage the bar is currently browsing (as opposed to `current_step`, the persisted "bookmark" day) is in-memory only — it is not written anywhere and does not survive a reload — template-bar.js (module-level `state`)
230. ✕ closes the bar and reverts the plan's `status` to `not_started` while preserving `current_step` (`db.js:deactivatePlan`) — the plan is not deleted, and Continue from the Plans tab resumes it from the same day — template-bar.js:handleClose
230a. Nothing prevents more than one plan from having `status = 'active'` in the database at once (e.g. activate plan A, close the Plans tab, activate plan B — A's row is untouched). The bar only ever displays one plan at a time; the Plans tab list still reflects each plan's own `current_step`/`status` correctly regardless — template-bar.js, db.js:getPlans

---

## COMING SOON — UI elements present but not yet wired up

**PWA install prompt:** `#install-overlay` DOM element and styles are in place (Install / Not now buttons). JavaScript handling for `beforeinstallprompt` is coming in a future update.

**`state.js` module**: in-memory reactive state manager scaffolded (`getAppState`, `setAppState`, `onStateChange`); still not imported or wired into the app by anything. Work in progress.

*(The `#template-bar` entry that used to live here — "DOM element present, no content yet" — is gone as of Build 3: the bar is now fully implemented. See the Template Bar section above.)*

---

## Needs Verification

- Does the LIKE fallback for Scripture search actually fire (requires FTS to fail first)?
