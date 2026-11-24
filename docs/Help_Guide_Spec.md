# Ember Bible Study — Help Guide Spec

**Status:** Drafted 2026-11-23. Updated 2026-11-23: the guide overlay now fills the window, and Item 10 (the app map) was added. Later on 2026-11-23: Wayne took the default on all four open questions (see Decisions), Item 1's manual fixes and Item 2's headings were made in `USER_MANUAL.md`, and the spec was corrected after checking it against the code. Items 3–9 were built the same day; what shipped and every departure from this spec is in `docs/BUILD_6.1_ACTUAL_STATE.md` §21.
**Ground rule:** where the code and this spec disagree, the code wins. Every "current state" claim below was checked against `index.html`, `js/help.js`, `js/search.js`, `js/popover-registry.js`, `sw.js` and `USER_MANUAL.md` at `a823fef` (2026-11-23). Check again before building.
**Covers:** the three Help items in step 4 of `docs/TODO.md`: stale Help text, "More help", and the Strong's vs. BDB entry. Item 10, the app map, is a third column in the guide. It is deferred to its own TODO item.

---

## Summary

`USER_MANUAL.md` becomes Ember's in-app help guide. This is Tier 2 of `Help_System_Design.md`, built from a document that already exists instead of one written from scratch. Every "More help" link opens the guide at the section for its panel. The four quick help popovers get current copy. Help also becomes searchable from the search bar (Tier 3, Item 6).

The guide doesn't need much new writing. The manual is already current: it covers the translation shelf, FTS search, the Language tab, both lexicons and Plans, and it already explains Strong's vs. BDB. The missing piece is a way to reach it from inside the app.

Item 10, deferred, adds a wireframe map of the app beside the guide. It's drawn from the app's current layout, and links in the help text point to features on it.

| Tier (Help_System_Design) | Today | After this work |
|---|---|---|
| 1. Quick help popovers | Built, but the copy is stale | Current copy, and a working "More help" link |
| 2. Full help panel | Not built. "More help" does nothing | The guide overlay, rendered from `USER_MANUAL.md` |
| 2.5. App map | Not built | Item 10, its own TODO item after the guide ships |
| 3. Help in search | Not built | Item 6, built with the guide |

---

## Decisions (Wayne, 2026-11-23)

1. **Item 6 (Help in search)** is built with the guide.
2. **The "Planned for future updates" line** is removed from the manual (done). In-app help describes what exists; the roadmap lives in `README.md` and `docs/TODO.md`. Webster's 1913 was never dropped: it's still under "Future" in `README.md` and is step 5 of `docs/TODO.md`.
3. **The overlay's name:** the header keeps the manual's H1, "Ember Bible Study — User Manual", and links call it "the guide".
4. **Item 10 (the app map)** becomes its own TODO item, after the guide has shipped.

---

## Locked Decisions

- **One source.** `USER_MANUAL.md` is both the repository's manual and the in-app guide. There's no second copy, generated file or hand-kept HTML version, so the two can't drift apart.
- **No build step.** The app fetches the Markdown and renders it at runtime with a small renderer that handles only what the manual uses. This keeps CLAUDE.md's "no build step, no bundler" rule.
- **DOM only, never `innerHTML`**, as in the lexicon renderers. Anything the renderer doesn't recognize is shown as plain text.
- **Works offline.** `sw.js` precaches `USER_MANUAL.md` and the new module.
- **Help is a meta-task**, so the guide may cover Scripture (Build 1.5 spec, "text is never obscured" note). Closing it returns the user exactly where they were: the selection, scroll positions and open tabs are untouched.
- **The physical metaphor holds:** the popovers are the expert leaning over your shoulder, and the guide is the reference book you take off the shelf. The map is the expert pointing at the desk.
- **The guide fills the window** (Item 4), so the map column (Item 10) can be added later without reworking the layout.

---

## Current State (verified 2026-11-23, `a823fef`)

- `js/help.js` binds four popovers through `bindPopover()`: reader, notes, reference and global. "More help" links (`.help-more-link`) exist in the reader, notes and reference popovers. Their only handler is `preventDefault()`. The global popover has one line of text and no link.
- **Stale copy in `index.html`:**
  - The reader popover calls the bookmark button "⬤" (it's ☆; FEATURE_INVENTORY 67a) and doesn't mention the markup pen or range selection.
  - The reference popover still says Related is "(coming soon)" and doesn't mention Language or Plans (148a).
  - Each link reads "Need more? A full help guide is on its way…" (154).
- **`USER_MANUAL.md`** at `a823fef` had 345 lines: one H1, 13 `##`, 29 `###` and no `####` headings. Its Markdown is limited to paragraphs, `-` lists one level deep, one table, `---` rules, `**bold**`, `*italic*`, `` `code` ``, the `\*` escape, and two in-page links (`#marking-up-verses`, `#bookmarks`). It has no images, no numbered or nested lists, no external links and no link titles. Items 1 and 2 have since added three `####` headings and renamed one `###` (see below).
- **Strong's vs. BDB** was already explained in the manual (under `### Language`, the "The Hebrew lexicon" bold paragraph), but as a paragraph, not a heading, so nothing could link to it or list it. Item 2 fixed this.
- **Search** (`js/search.js`) is synchronous over sql.js results, with prefixes `b: n: s: t: k:` in `PREFIXES` and in `renderShortcuts()`. The groups appear in this order: Scripture, Notes, Studies, Tags, Bookmarks.
- `sw.js` `PRECACHE` lists every `js/` module. `CACHE_NAME` is `ember-v34`. Only `/data/` requests bypass the cache; every other same-origin GET is cache-first, so a precached root-level `USER_MANUAL.md` is served offline with no change to the fetch handler.
- Nothing in `js/` reads or writes `location.hash`.
- **Escape has several listeners at the document level**: `popover-registry.js` (closes bound popovers), `reader.js` (closes the book overlay), and the search overlay and tag autocomplete have their own.

---

## Item 1: Check the manual first — done 2026-11-23

Once it's in the app, every sentence in the manual is shipped text. The manual was checked against `FEATURE_INVENTORY.md` and the code. Spot-checked and correct: the 800 ms autosave, 8 tag suggestions, the 2-character search minimum, the markup tools, bookmarks, the Info tab, the "Continue anyway" phone notice, the book picker closing on an outside click or Escape, the selection glow, and the first-launch size (core.db 24 MB plus five translations of about 8 MB). Fixed, with Wayne's approval:

- **The reader's ⚙** was "font size and other display options for this pane". It's font size only, with a Reset, and it applies to both panes.
- **Note indicator dots** said the gold dot appears "after the verse text". It sits under the verse number. The section is now "Note and bookmark dots" and also describes the bookmark dot (green, under the verse number; hovering shows the bookmark's label), which the manual didn't mention.
- **Appearance & Settings** said most panels' ⚙ hold display options "like font size". Now it says what each holds: font size for the reader and notes panel, the default tab for the reference panel.
- **The "Planned for future updates" line** is removed (Decision 2).

Still to keep in step:

- **"Installing the app"** describes the browser's own install option. If the install-prompt polish item ships later, update this section in that change.
- **The Info tab** section will change if the "Info tab shows the chapter" polish item ships. Update it in that change.

## Item 2: Give Strong's vs. BDB a heading — done 2026-11-23

Under `### Language`, the lexicon paragraphs became linkable subsections without changing what they say. A section's text runs to the next heading of any level, so the paragraphs around them were arranged so each lands under the right heading:

- **"All occurrences"** moved up, above the Greek lexicon, with the general paragraphs about the word card. It's about every word, not the Greek lexicon.
- `#### The Greek lexicon`, over the Abbott-Smith paragraph (its bold lead-in became plain text).
- `#### The Hebrew lexicon: Strong's and BDB`, over the "The Hebrew lexicon shows two dictionaries" block, running through the BDB references, "To get back", and the paragraph on Lexicon links for words built from pieces. Its bold lead-in became plain text.
- `#### Reading the Hebrew`, a new heading over the paragraphs that follow: words built from pieces, verb grammar, Aramaic, Ketiv and Qere, other manuscripts, words not in the Hebrew, and the † mark. Without it they would all have fallen under the Hebrew lexicon heading, in the contents and in search results.

The renderer and the contents list support `####` for this (Item 3). This finishes the TODO item "A Help entry explaining Strong's vs. BDB." It can be linked to (`the-hebrew-lexicon-strongs-and-bdb`), appears in the contents, and (with Item 6) can be found by search.

Item 1 also renamed `### Note indicator dots` to `### Note and bookmark dots` (`note-and-bookmark-dots`).

## Item 3: The renderer

A new module, `js/help-guide.js`. It fetches `./USER_MANUAL.md` the first time the guide opens and keeps the rendered DOM for the rest of the session.

**It supports exactly what the manual uses:**

| Markdown | Rendered as |
|---|---|
| `#` … `####` | `h1` … `h4`, each with an `id` (see slugs) |
| Blank-line-separated lines | `p` (lines within a paragraph join with a space) |
| `- item` | `ul > li` (one level) |
| `\| a \| b \|` with a `---` separator row | `table` with a `thead` |
| `---` on its own line | `hr` |
| `**x**`, `*x*`, `` `x` `` | `strong`, `em`, `code` |
| `\*` (and `\` before any punctuation) | the literal character |
| `[text](#slug)` | a link that scrolls the guide to that heading |
| `[text](#slug "map:name")` | a map link (Item 10). Until the map ships, an ordinary in-guide link |
| `[text](https://…)` | a link opening in a new tab, `rel="noopener"` |

Anything else is shown as plain text, never as markup. A link title that doesn't start with `map:` is ignored.

**Slugs** follow GitHub's rule, so the manual's links work in the repository and in the app alike: lowercase, drop every character that isn't a letter, digit, space or hyphen, then turn spaces into hyphens. ("Appearance & Settings" becomes `appearance--settings`; "The Hebrew lexicon: Strong's and BDB" becomes `the-hebrew-lexicon-strongs-and-bdb`.) If two headings would get the same slug, the second gets `-1`, the third `-2`, and so on. Every `id` gets a `help-` prefix in the DOM so it can't clash with app IDs. The prefix isn't added in the Markdown; the renderer adds it when resolving `#slug` links.

**In-guide links** scroll the guide's own body and never touch `location.hash`.

## Item 4: The guide overlay

**Opening:** a "More help" link, the global popover's link, a Help search result (Item 6), or `openHelpGuide(slug)` called from code. Opening it closes every open popover (`closeAllPopovers()`).

**Layout:** the overlay fills the window, with a margin of about 24 px over a dimmed backdrop, using the existing theme variables (light and dark). It's a grid:

- **Header:** the manual's H1 ("Ember Bible Study — User Manual") and a ✕ button.
- **Left column, the contents:** narrow (about 220 px), like the outline in Google Docs. It lists every `##` heading, with its `###` headings indented beneath it. `####` headings appear only under the section they belong to. Clicking an entry scrolls the body.
- **Center column, the body:** the rendered manual, scrolling on its own. It takes the remaining width, but the text is capped at a readable measure (about 70 characters) and centered in the column.
- **Right column, the map:** Item 10, deferred. Until the map ships, this column doesn't exist and the body column takes its space.

**Opening at a section:** the body scrolls so that section's heading is at the top, and its contents entry is marked as current. Opened with no section, the guide starts at the top.

**Closing:** ✕, Escape, or a click on the backdrop margin. Focus goes back to whatever opened the guide.

**While the guide is open:** Escape closes only the guide. Several document-level listeners act on Escape (see Current State), so the guide handles keydown on `window` in the capture phase and calls `stopPropagation()` for every key it handles, so none of them see it. The keys the app normally uses (search, verse navigation) don't reach the app either.

**Errors:** if the fetch fails (offline before the file was ever cached, which precaching should prevent), the guide shows "The guide couldn't be loaded. Try again when you're online." with a Retry button. Nothing breaks.

## Item 5: Popover copy and "More help"

Replace the four popovers' content in `index.html` with the copy below. Each keeps the bold lead sentence (the physical-metaphor line from `Help_System_Design.md`) and no more than five bullets.

Every "More help" link becomes **"More in the guide →"** and carries `data-help-section`. `help.js` replaces the `preventDefault` placeholder with a handler that calls `openHelpGuide(link.dataset.helpSection)`.

**Reader** (`data-help-section="reading-scripture"`)
> **Your Bible.** Read, navigate and mark up Scripture here.
> - Click the translation and chapter (e.g. "KJV Genesis 1") to jump anywhere; ‹ › move between chapters
> - Click a verse to select it, then Shift+click another to select a range
> - The pen marks up the selection; ☆ bookmarks it, or lists your bookmarks when nothing is selected
> - Split view reads two passages side by side; the lines button puts each verse on its own line
> - In the book picker, the + after the translations opens your shelf to add or remove one

**Notes** (`data-help-section="taking-notes"`)
> **Your notebook.** Studies, notes and tags live here.
> - + starts a new study; All Studies lists every one
> - Select a verse, then + Add Note to write about it. Notes save as you type
> - With a verse selected, the + beside a note's verse chips attaches that verse too
> - Type in a note's tag field to tag it; click a tag to see everything tagged with it
> - Export saves a study as a web page to read, print or share

**Reference** (`data-help-section="the-reference-panel"`)
> **Your reference shelf.** Background for the verse you've selected.
> - **Info**: the book and chapter, and your notes on this verse
> - **Tags**: Nave's topics and your own tags
> - **Related**: cross-references to the rest of Scripture
> - **Language**: the Hebrew or Greek, word by word, with lexicons
> - **Plans**: reading plans and study templates (no verse needed)

**Global** (no section, so it opens at the top)
> **Ember**: the whole workspace.
> - ⚙ here holds Backup & Restore, readable export and data credits
> - ☀/🌙 switches between light and dark
> - Each panel's own ? and ⚙ cover that panel
>
> **Open the guide →**

Each popover's copy has to agree with the manual. If the Info tab change ships later, update the reference popover's Info line with it.

## Item 6: Help in search (Tier 3) — built with the guide

`Help_System_Design.md` planned a hand-kept keyword index. This item takes the sections from the manual itself, so there's nothing extra to maintain. It's what makes the Strong's vs. BDB entry findable from the search bar.

- **Units:** every `##`, `###` and `####` section. A section's text runs to the next heading of any level.
- **Unprefixed search matches headings only.** Every query word must start a word in the heading, ignoring case (`bookm` matches "Bookmarks"; `bdb` matches "The Hebrew lexicon: Strong's and BDB"). Matching the body here would add noise: the Search section's examples contain "love", so a search for *love* would show a Help result. At most 3 results.
- **The `h:` prefix** also searches the body, with headings ranked first. At most 10 results. Add `h:` to `PREFIXES`, `renderShortcuts()` ("Help only") and the manual's prefix table.
- **The group is called "Help"** and comes last, after Bookmarks. Each result shows the heading, its parent heading in a smaller line ("The Reference Panel › Language"), and the section's first sentence, shortened to one line. Clicking one closes the search overlay and opens the guide at that section.
- **Loading:** search stays synchronous. The manual's text is fetched the first time the search bar gets focus (it's precached, so this is local). Until it arrives, searches show no Help group. The section index is built once from the same parse the renderer uses, not a second parser.

## Item 7: Offline and the service worker

- Add `./USER_MANUAL.md` and `./js/help-guide.js` to `PRECACHE`, and bump `CACHE_NAME`.
- The fetch handler needs no change: only `/data/` bypasses the cache (see Current State). The offline test in Item 8 confirms it.

## Item 8: Tests

Add a `help` scenario to `tests/verify.py`:

- **Each popover:** open it, click its link, and the guide opens with that section's heading at the top of the body and marked current in the contents. The global link opens at the top.
- **Every `data-help-section`** in `index.html` matches a heading in the manual.
- **Every in-manual `#` link** matches a heading. Clicking the two existing links scrolls to them.
- **The contents** list every `##` and `###` heading, in order, and each `####` under its own section.
- **Section boundaries:** "Reading the Hebrew" is its own section, and the "The Hebrew lexicon: Strong's and BDB" section doesn't contain the Ketiv paragraph.
- **Rendering:** the prefix table renders as a `table` with 6 body rows including `h:`. `\*` shows as `*`. A test string containing `<b>x</b>` shows the tags as literal text. A link with a `map:` title renders as a working in-guide link. `help-guide.js` contains no `innerHTML`, checked with grep.
- **Layout:** the overlay fills the window less its margin; the body text never runs wider than its cap.
- **Closing:** Escape, ✕ and the backdrop each close the guide, focus returns to the link, and the reader's selection and scroll position haven't changed. With the search overlay or book picker open underneath, Escape closes only the guide.
- **Offline:** after one online load, take the network away, reload, and the guide opens and renders.
- **Help in search:**
  - `bookm` shows a Help result "Bookmarks".
  - `love` shows no Help group.
  - `h:bdb` and `bdb` both find "The Hebrew lexicon: Strong's and BDB".
  - Clicking a result opens the guide there.
- Run `smoke` and `popovers` too; the popover copy changed.

## Item 9: Documents

- **`FEATURE_INVENTORY.md`:** close 67a, 148a and 154, and add entries for the guide and Help search.
- **`docs/BUILD_6.1_ACTUAL_STATE.md`:** add an addendum (§21) recording what shipped and any departures from this spec.
- **`docs/TODO.md`:** remove the three Help items from step 4, and add Item 10 (the app map) as its own item, pointing to this spec.
- **`CLAUDE.md`:**
  - Add `js/help-guide.js` to the Project Structure list.
  - Add this rule: *`USER_MANUAL.md` is shown in the app as the help guide. A change that alters what the user sees isn't finished until the manual (and the panel's help popover, if it applies) says so.*
- **`Help_System_Design.md`** (project doc): change its status to say Tier 2 is the rendered manual, that Tier 2.5 is the app map (planned), and that Tier 3 uses the manual's headings instead of a keyword index.

---

## Item 10: The app map (Tier 2.5) — deferred to its own TODO item

Built after the guide has shipped. Item 4's full-width layout already leaves room for it, so nothing in the guide gets reworked. When it's built, it also adds `./js/help-map.js` to `PRECACHE` and to CLAUDE.md's Project Structure, and adds this CLAUDE.md rule: *A new control the manual mentions gets a `data-help-target` and an entry in `help-map.js`'s target table.*

**What it is:** the guide's right column shows a wireframe of the app as it's laid out right now. Links in the help text ("map links") highlight a feature's location on the map, and a key below the map shows the icon to click. Clicking the map works the other way: it jumps the help text to that part of the app. A **Show me** button closes the guide and points at the real control.

**Size:** one new module, `js/help-map.js` (roughly 300–400 lines), plus target attributes in `index.html`, map links in the manual, and a little CSS. About 15–20 KB in total. It costs nothing while the guide is closed.

### Drawing the map from the live layout

- The map is **measured, not drawn by hand.** Each time the guide opens, `help-map.js` reads the size and position (`getBoundingClientRect()`) of the app's main regions: the header and search bar, each reader pane, the notes panel, the reference panel and its tab bar, and the resize handles between them.
- It scales those rectangles into one SVG whose `viewBox` is the window's size, so the map keeps the window's shape. It therefore always matches the current layout: Split Reader on or off, side by side or stacked, and the panel widths the user has dragged.
- Regions are drawn as outlined rectangles labeled with their metaphor names ("Bible", "Notebook", "Reference shelf"). Tagged targets inside them are drawn as faint small outlines. All colors come from the theme variables, so it follows light and dark.
- **Built with DOM methods only** (`createElementNS`), with no `innerHTML`, no screenshots and no library.
- **While the guide is open,** a `ResizeObserver` (throttled to one redraw per animation frame) redraws the map if the window size changes. It's disconnected when the guide closes.
- The overlay doesn't change the app's layout behind it, so measuring works while the guide is showing.

### Targets

- Each control the manual points to carries `data-help-target="name"` on its real element (e.g. `data-help-target="markup-pen"`).
- `help-map.js` holds one **target table** with an entry per name:
  - `label`: what the key calls it ("Markup pen")
  - `section`: the manual heading slug it belongs to (for map clicks)
  - `anchor`: a selector for the nearest container that's always visible (e.g. the reader header), used when the target itself isn't on screen
  - `when`: an optional note shown when the target is hidden ("Appears when you select a verse")
- **Starting list** (confirm against `index.html` when building): the translation and chapter button, ‹ ›, the markup pen, ☆, the lines button, the Split Reader button, the translation shelf +, the side-by-side/stacked control, the resize handles, the notes panel's + and All Studies, + Add Note, the verse-chip +, the tag field, Export, each reference tab (Info, Tags, Related, Language, Plans), the search bar, the global ⚙, ☀/🌙, and each panel's ? and ⚙.

### Map links in the manual

- A map link is an ordinary in-page link with a `map:` title: `[the pen](#marking-up-verses "map:markup-pen")`. On GitHub it's a working link with a tooltip. In Ember, the renderer (Item 3) turns it into a map link.
- Map links look different from ordinary links (a dotted underline and a small map glyph), so readers know they point at the map, not elsewhere in the text.
- **Clicking one** doesn't scroll the guide. It highlights the target on the map, scrolls the map into view if needed, and fills in the key.

### Highlight and key

- **Target on screen:** its rectangle on the map fills with the accent color and pulses once, and the region around it is outlined.
- **Target hidden** (not in the DOM, or with zero size): the `anchor` container is outlined dashed on the map, and the key shows the `when` note. If the anchor is hidden too (for example, the second reader pane when Split Reader is off), the whole panel region is outlined dashed with the note.
- **The key** sits below the map and shows the real control's icon, its `label`, and the `when` note if there is one. The icon is copied from the actual element with `cloneNode(true)`: ids are stripped, and the copy is made `inert` and `aria-hidden`. That way the ☆, 🌙 or pen in the key is always the one on screen, and the key can't go stale the way the old popover's ⬤ did. If the element isn't in the DOM at all, the key shows the label only.

### Clicking the map

- Clicking a target outline on the map scrolls the help body to that target's `section` and highlights it, as a map link would.
- Clicking a region outside any target scrolls to that panel's section (`reading-scripture`, `taking-notes`, `the-reference-panel`; the header goes to the Search section).
- Targets brighten on hover, and their `label` shows as a tooltip, so the map can be explored on its own.

### Show me

- The key has a **Show me** button when the highlighted target is on screen. It's hidden for hidden targets.
- Show me closes the guide by the normal closing path, then pulses an outline around the real control for about 1.5 seconds, and moves focus to it if it can take focus.
- It never changes the app's state: no selecting a verse, switching tabs or opening Split Reader. This keeps the rule that closing help returns the user exactly where they were.
- With `prefers-reduced-motion`, the pulse is replaced by a steady outline for 2 seconds. The map highlight's pulse follows the same rule.

### Narrow windows

- When the window is too narrow for three readable columns (below about 1100 px), the map column collapses. A **Map** button in the guide's header opens it as a drawer over the body's right edge.
- Clicking a map link opens the drawer automatically. ✕ on the drawer or Escape closes the drawer first, then a second Escape closes the guide.

### Tests

Add to the `help` scenario:

- **Every `map:` title** in the manual names an entry in the target table.
- **Every table entry** has a `section` that matches a manual heading and an `anchor` that matches an element in `index.html`. Every `data-help-target` in `index.html` has a table entry.
- **Layouts:** in side by side, stacked, Split Reader on and off, and after dragging a resize handle, a map link's highlighted rectangle lines up with the real element's scaled position (within a few pixels).
- **Hidden target:** with no verse selected, a link to a selection-only control outlines the anchor dashed, shows the `when` note and hides Show me.
- **Key:** the icon in the key matches the real control's content, has no ids and is inert.
- **Map clicks:** clicking a target scrolls the body to its section; clicking the reference panel region scrolls to "The Reference Panel".
- **Show me:** it closes the guide, the real control gets the outline, and the selection, tabs and scroll positions haven't changed.
- **Resize:** changing the window size while the guide is open redraws the map; below the narrow threshold, the Map button appears and a map link opens the drawer.
- **Reduced motion:** no animation runs.
- `help-map.js` contains no `innerHTML`, checked with grep.

---

## Out of Scope

- A link from inside a lexicon card to its help section. It's easy to add later with `openHelpGuide('the-hebrew-lexicon-strongs-and-bdb')`.
- Help popovers for the Plans tab's sub-views, the translation shelf, or global settings sections.
- Onboarding or tours. "The application should never require a tutorial."
- Any change to how the manual reads on GitHub. (Map links stay ordinary links there.)
- A map that redraws the app in the state a feature needs (for example, drawing a second reader pane when Split Reader is off). Hidden targets get a dashed outline and a note instead.
- Show me changing the app's state to reveal a hidden control.
