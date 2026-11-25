# Ember Bible Study — Info Tab Spec

**Status:** Draft 2026-11-24. Steps 1 and 2 built 2026-11-25 (see "Step 1 as built" and "Step 2 as built" below); steps 3–5 not built.
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

**Source: [lb42/KJV_1611](https://github.com/lb42/KJV_1611)** (surveyed 2026-11-24). A TEI XML edition of the 1611 text, one file per chapter in `chaps/` (1,361 files, Apocrypha included). Each chapter has a `<head>CHAP. N.</head>` followed by a second `<head>` holding the summary, e.g. John 3: "1 Christ teacheth Nicodemus the necessitie of regeneration. 14 Of faith in his death. 16 The great loue of God towards the world. 18 Condemnation for vnbeliefe. 23 The baptisme, witnes & doctrine of Iohn concerning Christ."

- **Coverage:** every chapter of the 66 books except Proverbs 11–24, which the 1611 itself left without summaries. Its note at Proverbs 10 covers them: "From this Chapter to the fiue and twentieth, are sundry obseruations of morall vertues, and their contrary vices." Show that note on Proverbs 11–24, attributed to Proverbs 10. (Ecclesiasticus 51 is also bare, but the Apocrypha isn't in Ember.)
- **Verse numbers inside the summaries** ("14 Of faith…") become links to those verses.
- **Original spelling** ("loue", "Iohn", "Dauid"). Lengths run 29 to 668 characters, median about 190. Entities such as `&amp;` need decoding.
- **Licence: none stated.** The repo's header says the transcription was taken from kingjamesbibleonline.org and reprocessed. The 1611 text is public domain, and a faithful transcription normally adds no new copyright in the US, but ask the repo's author for an explicit licence before shipping. Pin the commit and sha256 in the build script either way.
- **It also has the 1611 marginal notes** inline (`<note>` in each verse, e.g. John 3:3 "Or, from aboue."). Not part of this spec; a candidate for the KJV's "Notes for this version". [basil/bible's listing](https://github.com/basil/bible/blob/master/sources/exhaustive-listing-marginal-notes-1611-edition-king-james-bible.md) of all 7,341 notes in modern spelling (from Literatura Bautista; licence unclear) is a cross-check.
- **Shown as a quotation, with its source,** not as Ember's own words.
- **Expect interpretation.** The 1611 summaries read some Old Testament passages Christologically (e.g. Song of Solomon 2: "The mutuall loue of Christ and his Church"; Isaiah 53: "the scandall of the crosse"). That's a reason to show them as attributed quotations, and a question for the reviewer.
- **Any other gap** falls back to people and places alone.

Looked at and not used: aruljohn/Bible-kjv-1611 (1611 verse text as JSON, no summaries); kennethreitz/kjvstudy.org (modern section headings of unknown origin, not the 1611 summaries).

### Editorial convention

- **Modernize spelling only; never change a word.** u/v, i/j, final -e, doubled letters and the like ("loue" → "love", "Iohn" → "John", "vnbeliefe" → "unbelief"). Wording, word order and punctuation stay as printed. Spelling is modernized by a fixed, reviewable word list in the build, not by hand, edit by edit.
- **One label per summary, not a mark per word:** a small line under it, "1611 King James Bible · spelling modernized". Modernization touches almost every line, so marking each word would bury the text, and editions of early modern texts state their spelling policy once. The label links to a short note in `USER_MANUAL.md` saying what was and wasn't changed.
- **Square brackets only for words Ember adds,** the standard editorial use. The only planned case is the Proverbs 10 note shown on 11–24, introduced as "[From Proverbs 10:]".
- **Hard words are glossed, not replaced.** A word whose meaning has changed or dropped out of use (e.g. "prelation", 1 Corinthians 13, meaning preference) keeps its place and gets a dotted underline with the meaning on hover. The glosses are a small hand-kept list, so they're part of the review.
- **Original spelling stays one click away.** The db keeps both forms; clicking the label toggles to the 1611 spelling.

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
- `README.md` "Data & Attribution": TIPNR and lb42/KJV_1611.

---

## Order of Work

1. Selection levels, chapter title, active-pane outline, and the three sections with today's data.
2. `context.db` and TIPNR people and places.
3. Chapter summaries from the 1611 KJV (lb42/KJV_1611), spelling modernized.
4. Translation and book copy, drafted for review.
5. Review (Wayne finds help); corrections ship through the update path.

### Step 1 as built (2026-11-25)

Where the code and the table in Item 1 part ways, the code chose:

- **Navigating keeps the verse selection.** It always has (the Language tab's lexicon references and the way back rely on it). Info describes the chapter on screen at the chapter level, and shows the verse level again when the selected verse's chapter is back. Tags, Related and Language keep showing the selected verse.
- **Switching translation keeps the verse selection** too, for the same reason; Info opens Translation, and the verse's notes stay under Chapter.
- **Esc doesn't clear the selection;** it never has. Left as a question in `docs/TODO.md`.
- **Chapter's header summary is the verse count** until chapters have summaries (step 3).
- A click in the pane's margin clears a chosen book, chapter or translation as well as the verses.

### Step 2 as built (2026-11-25)

- **Source:** TIPNR at STEPBible-Data commit `be4191f` (2026-10-24), the commit `language.db` is pinned to and the last to change TIPNR; sha256 `d595b916…16a318c`. `scripts/build_context.py` downloads and checks it, and rebuilds byte-identically. `data/context.db` is 1.34 MB (0.72 MB before @Brief, @Short and the peoples) and joins `data/reference-catalog.json`, so it has the background download and the sha256 update path.
- **Format, as checked:** `$`-separated records, one per individual; a first line of fields (UniqueName=uStrong, description, family, …, Type) and sub-records ("– Named", "– Greek", "– Spelled", …) each listing every verse a form of the name occurs in, in English versification with Psalm titles as verse 0, Ember's numbering. Every one of the 30,935 references used lands on a real verse.
- **People, peoples and places:** PERSON(s) records of type Male or Female are people (2,979 with a verse); PLACE and PLACE+PERSON are places (1,003). TIPNR gives each individual their own record, which is how people who share a name stay apart (29 Zechariahs). Peoples (271): Group records (the Amorites), each record's gentilic forms as one entry ("Levite", "Philistine", "Jew"; described as "Descendants of Levi", "People of Philistia"), and 17 ancestors whose own name TIPNR also uses for their people. Left out: unnamed people ("– Mentioned"), LXX-only references, and the OTHER records (God, months, titles). 1,105 of the 1,189 chapters name someone or somewhere.
- **Ancestors and their peoples (Wayne chose option A, 2026-11-25):** TIPNR files a nation under its ancestor where they share a name: every Old Testament "Israel" (2,501) is under the patriarch, and Judah's record is the man, the tribe and the kingdom. Nothing in the data says which sense a verse has. So Israel/Jacob, the tribes (Reuben, Simeon, Levi, Judah, Issachar, Zebulun, Gad, Asher, Naphtali, Joseph, Benjamin, Ephraim, Manasseh), Esau (Edom), Javan (Greece) and Kedar always go under Peoples, marked `ambiguous`, and the tooltip says the name may mean the people or the man. The cost: where the man is meant (Jacob in Genesis 32) he's still under Peoples. The list is `ANCESTOR_PEOPLES` in the build, chosen by hand: a rule on references long after the man's lifetime also catches David, Moses and Abraham. Nations TIPNR already keeps apart from their ancestor (Moab, Edom, Amalek, Dan, Cush, Midian, Canaan) need nothing. Rejected: listing them under People with a note (B), and guessing the sense by book (C).
- **The name shown** is the form the chapter uses, from TIPNR's own AltName|UnifiedName ("Abram" in Genesis 12); the tooltip gives the other name, TIPNR's one-sentence @Short, and where they first appear. A click shows the verse without selecting it (as a BDB reference does), so Info stays where it was.
- **TIPNR's descriptions:** @Brief and @Short are kept and @Short is shown. TIPNR marks them as adapted from AI output, but STEPBible uses them in its own lexicon (TIPNR's extraction recipe maps them to @STEPSuperMeaning and @ShortDef), and Wayne decided (2026-11-25) that STEPBible's use is the review: they're outside the "Review" rule above, which covers copy Ember writes or chooses itself. Their `<ref>` markup becomes plain references. @Article isn't used. With them, and the peoples, the file is 1.34 MB.
- **Upstream slips** are items 28–30 in `docs/DATA_QUIRKS.md`.

## Out of Scope

- Book- and chapter-level notes (their own spec).
- A modern chapter-summary source (replaces Item 4's when found).
