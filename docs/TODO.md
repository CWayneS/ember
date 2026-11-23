# To-Do

Everything known to be open, in one place. Each item links to where the detail lives, so this file stays a short index. It points to sections rather than line numbers, which drift.

Created 2026-11-04, at `cc95ec5`. Ordered into a path on 2026-11-22. When an item is finished, delete it here and record the work in the usual build or feature docs.

**The order, in one line:** make saves safe, finish every change to the translation files while Wayne's install is the only one to clear, build the add-ons and a way to update installed data, get ready to go public, then add features. The reason for that order is that after launch, a changed data file reaches no one unless the app can update it (step 3).

---

## 1. Make saves safe

Done 2026-11-22: the storage worker queues its writes, and restore waits for it (`docs/BUILD_6.1_ACTUAL_STATE.md` §16). Save frequency stays as it is (`docs/STRESS_TEST_RESULTS.md`, remedy 4).

## 2. Rebuild all six translation files once

Done 2026-11-22: Scripture search on FTS4, and WEB rebuilt from eBible's USFM (`docs/BUILD_6.1_ACTUAL_STATE.md` §17). **Still to do on Wayne's install:** clear `translations/*.db` from OPFS (in Firefox with `removeEntry()`; "Clear site data" leaves OPFS alone), so the new files are seeded.

## 3. Translation add-ons, then updating installed data

Translation add-ons done 2026-11-23: every translation but KJV removable, Darby on the shelf, `data/translations/catalog.json` with a sha256 per file (`docs/BUILD_6.1_ACTUAL_STATE.md` §18). **Still to do on Wayne's install:** remove Darby through the shelf, as its first real test.

| To-do | Why it matters | Size | Source |
|---|---|---|---|
| **Version-aware reseeding** | `seedTranslations()` only checks that a file is present and whole, so a fixed or rebuilt translation never reaches an existing install. Compare each installed file with its catalog version and download the new one when they differ. Needed before launch, or the first data fix after launch reaches no one. Cover `language.db` and `lexicon-hebrew.db` the same way. | Medium | `js/db.js` (`seedTranslations()`, `downloadReferenceDbInBackground()`); README "Future" |
| **Getting a deleted bundled plan back** | Deleted bundled plans stay deleted (they're listed in `bundled_installs`). The only way back is importing the plan's JSON from `data/plans/`, which a user doesn't have. A "Restore bundled plans" action could take a plan off the list and seed it again. "Restore default translations" (the Translations shelf, `js/translation-shelf.js`) is the pattern to follow. | Small | `seedBundledPlans()` in `js/db.js` |

**Scope question:** updates to cross-references or Nave's live in `core.db`, which also holds the user's notes. It can't be swapped like a translation file, so updating those tables needs its own approach. Fine to defer, but decide it consciously.

## 4. Get ready to go public

**Help**

- **Update the stale Help text.** Do it after the features above, since the shelf and the new search change what Help has to explain. See `FEATURE_INVENTORY.md` items 67a and 148a, and `docs/BUILD_6.1_ACTUAL_STATE.md` §7.
- **Make "More help" work.** The link in the reader, notes and reference help popovers is a placeholder that does nothing (`preventDefault` only). See `FEATURE_INVENTORY.md` item 154.
- **A Help entry** explaining Strong's vs. BDB. From "Deferred to Follow-Up Specs" in `docs/Hebrew_Lexicon_Spec.md` (Open Question 5).

**Testing**

- **OPFS → IndexedDB fallback test**, including where translations and `language.db` live without OPFS, and Safari's missing `createWritable()` on restore. From "Deferred / Related" in `docs/Offline_Language_And_Stress_Test_Spec.md`; see also `docs/BUILD_6.1_ACTUAL_STATE.md` §11 and `docs/OFFLINE_LANGUAGE_REPORT.md` §2.
- **On Wayne's install:**
  - **Storage persistence.** Run `await navigator.storage.persisted()` in the installed app and in a normal Chrome tab, and note each result here. A real grant has never been tested, because headless Chromium always declines, so seeing Backup & Restore switch to its "has agreed" wording would be the first real confirmation. Background: `docs/OFFLINE_LANGUAGE_REPORT.md` §5.
  - **The Hebrew lexicon in your own Firefox profile.** It was checked in Playwright's Firefox (H7307, H2617, H1254, H2219, H0114). In your browser, open one Hebrew Lexicon offline after it has downloaded once.
  - **Readable export in Firefox.** Checked in Chromium only. In your Firefox, export a study and Export Readable Copy, and open each file; with a large library, see that "Preparing…" shows while it works.
  - **Long studies in Firefox.** `content-visibility` was only tested in Chromium. In a long study, check that typing then quickly scrolling away saves the note, that the tag autocomplete isn't cut off, and that Ctrl+F finds a note far down. Browsers without `content-visibility` just ignore it and lay out every block.

**Polish**

- **Info tab shows the chapter before a verse is selected.** Today the tab is empty until a verse is selected, though its book, chapter and headings sections don't depend on one; only the notes do. Decide first: when the selected verse is in a different chapter from the one on screen, which the tab follows; and in split view, whether it follows the active pane, as the headings section already does. Tags, Related and Language stay verse-only. Source: `js/reference.js` (`renderInfoTab`, `clearAll`); Wayne, 2026-11-23.
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
