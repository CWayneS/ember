# To-Do

Everything known to be open, in one place. Each item links to where the detail lives, so this file stays a short index. It points to sections rather than line numbers, which drift.

Created 2026-11-04, at `cc95ec5`. Ordered into a path on 2026-11-22. When an item is finished, delete it here and record the work in the usual build or feature docs.

**The order, in one line:** make saves safe, finish every change to the translation files while Wayne's install is the only one to clear, build the add-ons and a way to update installed data, get ready to go public, then add features. The reason for that order is that after launch, a changed data file reaches no one unless the app can update it (step 3).

---

## 1. Make saves safe

Done 2026-11-22: the storage worker queues its writes, and restore waits for it (`docs/BUILD_6.1_ACTUAL_STATE.md` §16). Save frequency stays as it is (`docs/STRESS_TEST_RESULTS.md`, remedy 4).

## 2. Rebuild all six translation files once

Done 2026-11-22: Scripture search on FTS4, and WEB rebuilt from eBible's USFM (`docs/BUILD_6.1_ACTUAL_STATE.md` §17). The new files now reach Wayne's install by themselves (step 3's updater): no OPFS clearing needed.

## 3. Translation add-ons, then updating installed data

Translation add-ons done 2026-11-23: every translation but KJV removable, Darby on the shelf, `data/translations/catalog.json` with a sha256 per file (`docs/BUILD_6.1_ACTUAL_STATE.md` §18). **Still to do on Wayne's install:** remove Darby through the shelf, as its first real test.

Version-aware reseeding done 2026-11-23: after launch, online, any installed translation, `language.db` or `lexicon-hebrew.db` whose sha256 differs from its catalog entry is replaced in the background and used from the next launch (`docs/BUILD_6.1_ACTUAL_STATE.md` §19).

Restore bundled plans done 2026-11-23: the Plans tab offers "Restore N bundled plans" while one is missing (`docs/BUILD_6.1_ACTUAL_STATE.md` §20). Step 3 is finished.

**Deferred (Wayne, 2026-11-23):** updates to cross-references or Nave's. They live in `core.db`, which also holds the user's notes, so it can't be swapped like a translation file and needs its own approach. Take it up when there's an actual fix to ship to those tables.

## 4. Get ready to go public

**Help**

Help guide done 2026-11-23: `USER_MANUAL.md` is the in-app guide, every help popover links into it, the popovers' copy is current, Strong's vs. BDB has its own heading, and Help is searchable (`docs/Help_Guide_Spec.md`, `docs/BUILD_6.1_ACTUAL_STATE.md` §21).

App map done 2026-11-23: a wireframe of the live layout beside the guide, map links in the manual, and Show me (`docs/BUILD_6.1_ACTUAL_STATE.md` §22). The Help items are finished.

**Testing**

OPFS → IndexedDB fallback done 2026-11-23: without OPFS, without `createWritable`, or with OPFS refused, `core.db` and the translations are kept in IndexedDB, and restore, Add, Remove, updates and offline reading all work (`python3 tests/verify.py fallback`, `docs/BUILD_6.1_ACTUAL_STATE.md` §23). `language.db` and the Hebrew lexicon are still online-only there.

- **On Wayne's install:**
  - **Storage persistence.** Run `await navigator.storage.persisted()` in the installed app and in a normal Chrome tab, and note each result here. A real grant has never been tested, because headless Chromium always declines, so seeing Backup & Restore switch to its "has agreed" wording would be the first real confirmation. Background: `docs/OFFLINE_LANGUAGE_REPORT.md` §5.
  - **The Hebrew lexicon in your own Firefox profile.** It was checked in Playwright's Firefox (H7307, H2617, H1254, H2219, H0114). In your browser, open one Hebrew Lexicon offline after it has downloaded once.
  - **Readable export in Firefox.** Checked in Chromium only. In your Firefox, export a study and Export Readable Copy, and open each file; with a large library, see that "Preparing…" shows while it works.
  - **Long studies in Firefox.** `content-visibility` was only tested in Chromium. In a long study, check that typing then quickly scrolling away saves the note, that the tag autocomplete isn't cut off, and that Ctrl+F finds a note far down. Browsers without `content-visibility` just ignore it and lay out every block.

**Polish**

- **Rebuild the Info tab.** Spec: `docs/Info_Tab_Spec.md`. Steps 1 and 2 are done (2026-11-25): selection levels, the chapter title, the active pane's outline, the Translation, Book and Chapter accordions, and `context.db` with each chapter's people, peoples and places from STEPBible's TIPNR (`python3 tests/verify.py info`). Still to do: step 3, chapter summaries from the 1611 KJV; step 4, translation and book copy drafted for review.
  - **Jacob and the tribal fathers are under Peoples even where the man is meant** (Genesis 29–50). TIPNR files the nation under the man and doesn't say which a verse means, so Ember lists them under Peoples with a note (option A in the spec's "Step 2 as built"). If STEPBible ever splits these records, or a source turns up that tags the sense per verse, they can go back under People where they belong.
  - **Esc doesn't clear the verse selection.** The spec's table lists "after Esc" as a way back to the chapter level, but Esc has never cleared the selection, and it's owned by several popovers and the picker. Step 1 left it alone; decide whether it should.
  - **Reminder for Wayne: find a reviewer for the Info tab copy, or a better source.** The book and translation copy and the chapter summaries need checking by someone qualified before release. Also keep looking for a more modern source of chapter summaries to replace the 1611 ones. See "Review" in the spec.
- **Add the PWA icons.** `manifest.json` lists them, but `icons/` has none. See `FEATURE_INVENTORY.md` item 3. Three concepts were sketched (a glowing coal, a flame rising from an open book, a spark over a page corner); the coal was the one that stayed readable at 16px. No final choice recorded yet. Warm amber on dark; keep the mark inside the central ~80% for the maskable version.
- **Finish the PWA install prompt.** The page element and styles exist, but there's no `beforeinstallprompt` handler. See `docs/BUILD_6.1_ACTUAL_STATE.md` §7.
- **Fix drifted line references in `FEATURE_INVENTORY.md`.** For example, item 8 says the load error is shown at `app.js:46`, which is now `initMarkups()`; the `catch` is at line 77. Not recorded anywhere else.

**Launch**

- **Landing page and public distribution.** From "Future" in `README.md`.
- **Notify STEPBible** once Ember is publicly available. See `README.md`, "Data & Attribution".

## 5. After launch, roughly by value to the user

1. **Nested notes.** From "Future" in `README.md`.
2. **In-app template creator, with template sharing.** From "Future" in `README.md`.
3. **Hebrew lexicon follow-ups**, from "Deferred to Follow-Up Specs" in `docs/Hebrew_Lexicon_Spec.md`:
   - **A BDB abbreviations key** for the scholarly shorthand ("Ges", "Kö", "Dl W").
   - **Stub entries as links** to the entries they point at. No Strong's number links to a stub today.
   - **Root families**, from `LexicalIndex.xml`'s `<etym>` data.
4. **Link the Greek lexicon's Old Testament references.** 6,647 references in TBESG cite the Septuagint, so they stay text: its book names ("1Ki" = 1 Samuel) and verse numbers (most Psalms one lower) differ from English Bibles. Linking them needs an LXX-to-English map, like `hebrew-versification.js` for BDB. Medium. Source: FEATURE_INVENTORY item 142ak; `js/greek-lexicon.js`.
5. **Dictionary lookup (Webster's 1913)**, then **TFLSJ** (full LSJ Greek lexicon), pending bundle-size headroom and reusing the lexicon's loading pattern. From "Future" in `README.md` and `docs/Hebrew_Lexicon_Spec.md`.
6. **The 14 ghost rows** (Ketiv-only words), which need their own display design. From "Deferred to Follow-Up Specs" in `docs/Hebrew_Word_Anatomy_Spec.md`.
7. **Devotional content for reading plans.** `plan_days` has `devotional_title`, `devotional_body` and `reflection_questions_json`, and import and export carry them, but no plan fills them and nothing displays them. Waits on someone writing the content, then needs a place in the plan view. See `docs/BUILD_3_ACTUAL_STATE.md` §7.

**Maybe, not planned:**

- **The 1611 KJV's marginal notes.** Two sources, surveyed 2026-11-24:
  - The translators' notes ("Heb. expansion", "Or, creeping", "That is, sorrowful"; about 7,350) come from [basil/bible's listing](https://github.com/basil/bible/blob/master/sources/exhaustive-listing-marginal-notes-1611-edition-king-james-bible.md) (from Literatura Bautista; licence unclear). It's in modern spelling, one note per line, with the verse and the word the note is about (`Genesis 1:20 moving: Or, creeping`). In the KJV, that word could carry a small mark, with the note shown on hover.
  - The 1611 cross-references (about 4,500) come from [lb42/KJV_1611](https://github.com/lb42/KJV_1611) (no licence stated), as a "1611 margin" group in the Related tab. lb42 ties each note to its verse but not its word: a verse's notes are joined into one, and the 1611's reference marks were dropped. Scrivener (1910) warns the 1611's references are often misprinted, and its Psalms references follow the Vulgate's numbering.

  Both licences need settling first. Background: "Source" in Item 4 of `docs/Info_Tab_Spec.md`.

## From the proposal

Features `docs/Bible_Study_Software_Proposal_v6.md` describes that no build or spec has taken on yet. They're the design's long-range horizon, not planned work: each needs a spec before it's built. Checked against the code on 2026-11-22.

**Essential tier, not built**

- **Note visibility** (private or shareable, with a study default). `notes.visibility` exists and defaults to `'private'`; nothing sets or shows it. Proposal §4.
- **Themes** as a second kind of tag. Proposal §5.
- **User-made passage links**, alongside the cross-references. Proposal §6.
- **Book- and chapter-level notes**, and the book overview surface. The Info tab shows book information only. Proposal §1.
- **Workflows**: a reading plan linked to a study template, one session per day. Proposal §9 and the template-session additions in `docs/Add_To_Proposal_And_Tech_Spec.md`.
- **Session summaries and continuity**: session records, the daily summary card, "continue or advance". `notes.template_session_id` points at a `session_records` table that was never created. Proposal §10.
- **Dragging** tags, cross-references or verses into a note. Proposal "Interaction Model".

**Add-on tier, not built**

- Memory verses (spaced repetition). Proposal §18.
- Study journal and analytics. Proposal §19.
- Commentary (Matthew Henry's Concise). Proposal §14.
- Theological concept mapping. Proposal §15.
- Literary and structural analysis. Proposal §16.
- Historical and cultural context layers. Proposal §17.
- Multi-device sync and sharing. Proposal §20.

## When needed

- **Speed up markup lookups.** `getMarkupsForChapter()` still uses the old one-sided overlap test. Psalm 119 renders in 93 ms at 40 years of data, so this can wait until the numbers say otherwise. Small. Source: `docs/BUILD_6.1_ACTUAL_STATE.md` §12.
- **Re-checking Open Scriptures' progress.** A rebuild needs the pinned commits and sha256 values updated in `scripts/build_lexicon_hebrew.py`, and its exact-count checks reviewed. After launch, ship the result through step 3's update path. From `docs/Hebrew_Lexicon_Spec.md`.
- **Merge the per-panel settings into the global settings popover.** Left on purpose: do it when a truly global preference is added or the panel ⚙ buttons go away, and unify the two stores of saved preferences at the same time. See `docs/BUILD_6.1_ACTUAL_STATE.md` §10, "Explicitly not done".
- **Decision for Wayne: stress thresholds.** The thresholds are the spec's proposed starting points, left for you to adjust once you'd seen real numbers. Source: `docs/STRESS_TEST_RESULTS.md`, intro and "Thresholds after the fixes".

**Not recommended on current numbers:** splitting user data into its own database (remedy 5) or replacing sql.js (remedy 6). The reasoning is in "My read now that 1 to 3 are done", under "Candidate remedies" in `docs/STRESS_TEST_RESULTS.md`. `PRAGMA locking_mode=EXCLUSIVE` was tested and not adopted; see "Long lists, fixed" in the same file.

The README's "Future" list remains the public roadmap; every item on it is placed above.
