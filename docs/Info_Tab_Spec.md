# Ember Bible Study — Info Tab Spec

**Status:** Draft 2026-11-24. Not built.
**Ground rule:** the code wins where it and this spec disagree. "Current state" claims were checked against `js/reference.js`, `js/reader.js`, `index.html` and `data/core.db` on 2026-11-24. Re-check before building.

---

## Summary

The Info tab answers "what am I reading?" Tags, Related and Language are about a verse; Info is about what surrounds it: the translation, the book and the chapter.

It becomes three accordion sections, **Translation**, **Book** and **Chapter**. Each folded header shows the name and a one-line summary, so the tab is useful even with everything folded:

```
▸ BSB      Berean Standard Bible · 2022 · public domain
▸ John     Gospel · c. AD 85–95 · traditionally John the apostle
▾ John 3   Nicodemus; "God so loved the world"; John the Baptist's last witness
   …chapter content…
```

What's selected in the reading pane decides which section is open.

---

## Locked Decisions (Wayne, 2026-11-24)

- **Accordions with summary-line headers.** Selecting a level opens it and folds the other two. Any section can also be opened by hand, and more than one can be open.
- **Chapter summaries are part of this work.** The first source is the 1611 KJV's chapter summaries (Item 4), used until a more modern source is found.
- **All copy needs outside review before release.** Wayne can't write or check this material himself. Anything written for Ember (book and translation copy) or sourced (chapter summaries) is marked unreviewed until someone qualified has checked it. See "Review" below.
- **Empty fields are hidden,** never shown as "—". The tab ships with what exists and fills in as copy arrives.

---

## Current State (verified 2026-11-24)

- `renderInfoTab()` in `js/reference.js` shows the book name, testament, genre, chapter number, verse count, the active pane's headings (WEB only), and the selected verse's notes. With no verse selected, `clearAll()` shows "Select a verse to see reference material."
- `core.db`'s `books` table has only `id, name, abbrev, testament, genre, chapters`. `translations` has `id, filename, name, abbreviation, year, license, installed_at, is_bundled`.
- The pane nav's `.pane-book-btn` holds both the translation label and the location in one button, which opens the book/chapter/translation picker. Nothing in the pane selects a book, chapter or translation as such.
- `reader.js` tracks an active pane (`activePaneId`, `setActivePane()`, a `pane-changed` event). It isn't shown visually.
- `core.db` can't take updates after install (TODO step 3, "Deferred"), so new reference copy must not live there.

---

## Item 1: Selection Levels

A selection in the reading pane has a level: **translation**, **book**, **chapter** or **verse**.

| What the user does | Level | Info opens |
|---|---|---|
| Nothing selected (first load, after Esc, after navigating) | chapter | Chapter |
| Selects a verse or range | verse | Chapter, plus that verse's notes below it (as today) |
| Clicks the chapter title in the pane | chapter | Chapter |
| Clicks the book name in the pane | book | Book |
| Switches the pane's translation | translation | Translation |
| Navigates to another chapter | chapter | Chapter |

**The chapter title (new).** A quiet line above the chapter's text (and above a Psalm's title), e.g. `JOHN  3`. The book name and chapter number are separate targets. A selected level gets the same subtle highlight as a selected verse, so the user can see what Info is describing. The pane nav button keeps opening the picker as today.

**Other tabs.** Tags, Related and Language stay verse-only. At the book, chapter or translation level they show "Select a verse to see …", not the last verse's content.

**Active pane in split view.** The active pane gets a subtle outline on its edge, so it's clear which side Info is describing. Clicking a pane already makes it active.

---

## Item 2: The Three Sections

Fields in the order shown. Any with no content is left out.

**Translation**
- Header: abbreviation · full name · year · license
- About: a short paragraph (translators, aim, textual basis)
- Style: e.g. formal / dynamic / hyper-literal; what it's good for in study
- Notes for this version: e.g. WEB's headings kept out of the verse text; YLT's tense rendering; known numbering differences

**Book**
- Header: name · genre · date · author
- Author, date, written to, setting, purpose, summary, key themes, outline (with links to chapters)
- Where authorship or date is disputed: the traditional view, and a plain note that it's disputed

**Chapter**
- Header: book and chapter · one-line summary
- Summary (Item 4)
- People and places (Item 3), each linking to its first verse in the chapter
- Verse count
- Headings in the active pane's translation (as today)
- The selected verse's notes (as today, verse level only)

Room is left in Book and Chapter for book- and chapter-level notes (Proposal §1). That's a separate spec: notes are anchored by verse ID, and verse 0 already means a Psalm title, so they need their own anchor scheme.

---

## Item 3: People and Places from STEPBible (TIPNR)

STEPBible-Data's `Proper Nouns/TIPNR …txt` lists every proper name with all its references (CC BY 4.0, the same source and license as `language.db`'s data). A build script pins a commit and sha256, as `scripts/build_language.py` does, and produces each chapter's people and places. Upstream slips go in `docs/DATA_QUIRKS.md`.

Check before building: the file's exact format, and how it separates people from places and tells apart people who share a name.

---

## Item 4: Chapter Summaries (1611 KJV)

The 1611 KJV printed a short summary at the head of every chapter. These are the first source, until a more modern one is found.

- **Finding a clean digital copy is the first task.** Not yet confirmed: the Wikisource transcription of the 1611 edition and Project Gutenberg's KJV texts are the places to check. The copy must be public domain and keyed by chapter.
- **Shown as a quotation, with its source,** e.g. "Summary from the 1611 King James Bible", not as Ember's own words.
- **Spelling as the source has it,** or with only spelling modernized. Decide when the source is in hand.
- **Expect interpretation.** The 1611 summaries read some Old Testament passages Christologically (e.g. the Song of Solomon as Christ and the church). That's a reason to show them as attributed quotations, and a question for the reviewer.
- **Any gap** (a chapter the source doesn't cover) falls back to people and places alone.

---

## Item 5: Where the Data Lives

A new read-only file, `data/context.db`, built by `scripts/build_context.py` and listed in `data/reference-catalog.json`. That gives it the background download and sha256 update path that `language.db` and `lexicon-hebrew.db` already have, so corrections from review reach installed copies. It's small enough (likely under 1 MB) to download soon after launch rather than on first use.

Hand-written copy (translations, books) lives as reviewable text in `build/context/` (one file per book and translation), built into the db. Each entry has a `reviewed` field: who checked it, and when.

Where OPFS can't be written, it is online-only, like `language.db`.

---

## Review

**Wayne will need a reminder to find a reviewer, or a better source.** This is tracked in `docs/TODO.md`. Until the review is done:

- book and translation copy, and the chapter summaries, may ship marked "Draft", or stay unshipped. Wayne decides before release.
- the review covers book facts (author, date, audience, setting), the translation notes, and the choice of chapter-summary source.

---

## Item 6: Tests and Docs

- `tests/verify.py`, a new `info` scenario: each selection level opens the right section; folded headers show their summary; empty fields are hidden; split view follows the active pane; switching translation opens Translation; the other tabs show their placeholders above verse level.
- `USER_MANUAL.md` and the Reference panel's help popover describe the tab and the new selections. The chapter title and the accordion get `data-help-target`s and entries in `help-map.js`.
- `sw.js`: bump `CACHE_NAME`.
- `README.md` "Data & Attribution": TIPNR and the 1611 source.

---

## Order of Work

1. Selection levels, chapter title, active-pane outline, and the three sections with today's data.
2. `context.db` and TIPNR people and places.
3. Chapter summaries from the 1611 KJV.
4. Translation and book copy, drafted for review.
5. Review (Wayne finds help); corrections ship through the update path.

## Out of Scope

- Book- and chapter-level notes (their own spec).
- A modern chapter-summary source (replaces Item 4's when found).
