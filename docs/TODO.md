# To-Do

Everything known to be open, in one place. Each item links to where the detail lives, so this file stays a short index. It points to sections rather than line numbers, which drift.

Created 2026-11-04, at `cc95ec5`. Nothing here is urgent. When an item is finished, delete it here and record the work in the usual build or feature docs.

---

## Decisions for Wayne

| Decision | The question | Source |
|---|---|---|
| **Save frequency** | From about year 10 of data, autosave blocks typing on a CPU 4× slower than the test machine, mostly because it exports the whole database. Saving less often means fewer stutters, though each one stays as long and a crash could lose a little more text. | `docs/STRESS_TEST_RESULTS.md`, "Candidate remedies", remedy 4 |
| **Stress thresholds** | The thresholds are the spec's proposed starting points, left for you to adjust once you'd seen real numbers. | `docs/STRESS_TEST_RESULTS.md`, intro and "Thresholds after the fixes" |

## Performance and code

| To-do | Why it matters | Size | Source |
|---|---|---|---|
| **Speed up markup lookups** | `getMarkupsForChapter()` still uses the old one-sided overlap test. Psalm 119 renders in 93 ms at 40 years of data, so this can wait. | Small | `docs/BUILD_6.1_ACTUAL_STATE.md` §12 |
| **Link the Greek lexicon's Old Testament references** | 6,647 references in TBESG cite the Septuagint, so they stay text: its book names ("1Ki" = 1 Samuel) and verse numbers (most Psalms one lower) differ from English Bibles. Linking them needs an LXX-to-English map, like `hebrew-versification.js` for BDB. | Medium | FEATURE_INVENTORY item 142ak; `js/greek-lexicon.js` |
| **Getting a deleted bundled plan back** | Deleted bundled plans stay deleted (they're listed in `bundled_installs`). The only way back is importing the plan's JSON from `data/plans/`, which a user doesn't have. A "Restore bundled plans" action could take a plan off the list and seed it again. | Small | `seedBundledPlans()` in `js/db.js` |
| **Scripture search on FTS4** | Translations are built with an FTS5 `verses_fts` that sql.js can't read, so Scripture search always falls back to `LIKE`. `LIKE '%love%'` also matches "glove" and "beloved". FTS4 (already used for `notes_fts`) gives whole-word matching and optional stemming, with no sql.js rebuild. Decided over custom-compiling sql.js with FTS5. Needs the translation files rebuilt and a reseed path for existing installs. | Small–Medium | `scripts/build_translation.py` (`verses_fts`); `js/db.js` search fallback |
| **Queue writes in the storage worker** | `storage-worker.js` handles messages concurrently with no queue, so an older save could in principle finish after a newer one and overwrite the latest edit. Not seen in testing ("reassuring, not proof"). Serialize writes and keep only the newest pending one. | Small | `docs/STRESS_TEST_RESULTS.md`, "Other results", write ordering; `js/storage-worker.js`, `saveToStorage()` |

## Reader and panel controls

These all touch the reader and panel controls, so they could ship together as one small build.

| To-do | What Wayne wants | Size | Source |
|---|---|---|---|
| **Side-by-side as the default study-panel layout** | Studies panel to the left of the Reference panel. Today the layout is notes-above-reference and resets on every refresh, because the toggle isn't saved. Default to side-by-side and save the choice (`app_state`, like the other panel settings). The code's "stacked"/"column" naming is used inconsistently, so check which class means which before changing it. | Small | `togglePanelLayout()` in `js/panels.js`; FEATURE_INVENTORY items 14–15 |
| **"Keep" as the default reference tab** | Change `DEFAULT_TAB` from `'info'` to `'keep'`, so Reset also returns to Keep. With Keep, decide which tab is open at startup; remembering the last open tab fits best. | Small | `js/reference-settings.js` |
| **Verse-per-line toggle** | A button just right of the split-pane button (both control the view), switching both panes together between inline verses and one verse per line. Save the choice. It means one verse per line, not poetic lineation, which the translations don't carry. Check titled Psalm rows. | Small | `js/reader.js`; `.verse` is `display: inline` in `css/style.css` |
| **Reader nav row: "KJV Genesis 1 < >"** | Replace the separate book button (`GEN`), the "Genesis 1" label and the far-right translation label with one row reading "KJV Genesis 1 < >". Clicking "KJV Genesis 1" opens the existing book/chapter/translation picker. Less to scan, one fewer control. Applies to each pane's nav row. | Small | `.pane-nav` in `index.html`; `js/reader.js` |
| **"Mobile not supported" message** | For phones and other small touch screens. Detect by a narrow viewport plus a coarse pointer, not by browser name. Reuse the install-overlay pattern ("Ember is built for a desk") with a "Continue anyway" link. Low priority. | Small | `#install-overlay` in `index.html` |

**Not recommended on current numbers:** splitting user data into its own database (remedy 5) or replacing sql.js (remedy 6). The reasoning is in "My read now that 1 to 3 are done", under "Candidate remedies" in `docs/STRESS_TEST_RESULTS.md`. `PRAGMA locking_mode=EXCLUSIVE` was tested and not adopted; see "Long lists, fixed" in the same file.

## Documentation

- **Fix drifted line references in `FEATURE_INVENTORY.md`.** For example, item 8 says the load error is shown at `app.js:46`, which is now `initMarkups()`; the `catch` is at line 77. Not recorded anywhere else.

## To check on Wayne's install

- **Storage persistence.** Run `await navigator.storage.persisted()` in the installed app and in a normal Chrome tab, and note each result here. A real grant has never been tested, because headless Chromium always declines, so seeing Backup & Restore switch to its "has agreed" wording would be the first real confirmation. Background: `docs/OFFLINE_LANGUAGE_REPORT.md` §5.
- **The Hebrew lexicon in your own Firefox profile.** It was checked in Playwright's Firefox (H7307, H2617, H1254, H2219, H0114). In your browser, open one Hebrew Lexicon offline after it has downloaded once.
- **Readable export in Firefox.** Checked in Chromium only. In your Firefox, export a study and Export Readable Copy, and open each file; with a large library, see that "Preparing…" shows while it works.
- **Long studies in Firefox.** `content-visibility` was only tested in Chromium. In a long study, check that typing then quickly scrolling away saves the note, that the tag autocomplete isn't cut off, and that Ctrl+F finds a note far down. Browsers without `content-visibility` just ignore it and lay out every block.

## Deferred by specs

From "Deferred / Related" in `docs/Offline_Language_And_Stress_Test_Spec.md`:

- **OPFS → IndexedDB fallback test**, including where translations and `language.db` live without OPFS, and Safari's missing `createWritable()` on restore. See also `docs/BUILD_6.1_ACTUAL_STATE.md` §11 and `docs/OFFLINE_LANGUAGE_REPORT.md` §2.

From "Deferred to Follow-Up Specs" in `docs/Hebrew_Word_Anatomy_Spec.md` (the Hebrew lexicon it deferred has shipped):

- **The 14 ghost rows** (Ketiv-only words), which need their own display design.

From "Deferred to Follow-Up Specs" in `docs/Hebrew_Lexicon_Spec.md`:

- **A BDB abbreviations key** for the scholarly shorthand ("Ges", "Kö", "Dl W").
- **Root families**, from `LexicalIndex.xml`'s `<etym>` data.
- **Stub entries as links** to the entries they point at. No Strong's number links to a stub today.
- **TFLSJ** (fuller Greek lexicon), reusing the lexicon's loading pattern.
- **Re-checking Open Scriptures' progress.** A rebuild needs the pinned commits and sha256 values updated in `scripts/build_lexicon_hebrew.py`, and its exact-count checks reviewed.
- **A Help entry** explaining Strong's vs. BDB, with the Help rewrite below (Open Question 5).

## Before going public

- **Add the PWA icons.** `manifest.json` lists them, but `icons/` has none. See `FEATURE_INVENTORY.md` item 3. Three concepts were sketched (a glowing coal, a flame rising from an open book, a spark over a page corner); the coal was the one that stayed readable at 16px. No final choice recorded yet. Warm amber on dark; keep the mark inside the central ~80% for the maskable version.
- **Finish the PWA install prompt.** The page element and styles exist, but there's no `beforeinstallprompt` handler. See `docs/BUILD_6.1_ACTUAL_STATE.md` §7.
- **Update the stale Help text.** See `FEATURE_INVENTORY.md` items 67a and 148a, and `docs/BUILD_6.1_ACTUAL_STATE.md` §7.
- **Notify STEPBible** once Ember is publicly available. See `README.md`, "Data & Attribution".

## Roadmap

From "Future" in `README.md`, which remains the source for this list:

- Nested notes
- In-app template creator, with template sharing
- Dictionary lookup (Webster's 1913)
- Full LSJ Greek lexicon (TFLSJ), pending bundle-size headroom
- Version-aware translation and data reseeding for existing installs
- Landing page and public distribution
