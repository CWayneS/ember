# To-Do

Everything known to be open, in one place. Each item links to where the detail lives, so this file stays a short index. It points to sections rather than line numbers, which drift.

Created 2026-11-04, at `cc95ec5`. Nothing here is urgent. When an item is finished, delete it here and record the work in the usual build or feature docs.

---

## Decisions for Wayne

| Decision | The question | Source |
|---|---|---|
| **Deleted bundled plans** | The seeders run on every online boot, so a bundled plan you delete comes back on the next one. Keep that, or make deletion stick? | `FEATURE_INVENTORY.md` item 216; `seedBundledPlans()` in `js/db.js` |
| **Save frequency** | From about year 10 of data, autosave blocks typing on a CPU 4× slower than the test machine, mostly because it exports the whole database. Saving less often means fewer stutters, though each one stays as long and a crash could lose a little more text. | `docs/STRESS_TEST_RESULTS.md`, "Candidate remedies", remedy 4 |
| **Stress thresholds** | The thresholds are the spec's proposed starting points, left for you to adjust once you'd seen real numbers. | `docs/STRESS_TEST_RESULTS.md`, intro and "Thresholds after the fixes" |

## Performance and code

| To-do | Why it matters | Size | Source |
|---|---|---|---|
| **Try `PRAGMA locking_mode=EXCLUSIVE`** | It took a SQL statement from 0.25 ms to 0.02 ms, which would speed up every query in the app. Not tested across a save: `export()` may close and reopen the connection, which would reset the pragma, so it may need reapplying. | Small, but touches every database open | `docs/STRESS_TEST_RESULTS.md`, "Long lists, fixed" |
| **Speed up markup lookups** | `getMarkupsForChapter()` still uses the old one-sided overlap test. Psalm 119 renders in 93 ms at 40 years of data, so this can wait. | Small | `docs/BUILD_6.1_ACTUAL_STATE.md` §12 |

**Not recommended on current numbers:** splitting user data into its own database (remedy 5) or replacing sql.js (remedy 6). The reasoning is in "My read now that 1 to 3 are done", under "Candidate remedies" in `docs/STRESS_TEST_RESULTS.md`.

## Documentation

- **Fix drifted line references in `FEATURE_INVENTORY.md`.** For example, item 8 says the load error is shown at `app.js:46`, which is now `initMarkups()`; the `catch` is at line 77. Not recorded anywhere else.

## To check on Wayne's install

- **Storage persistence.** Run `await navigator.storage.persisted()` in the installed app and in a normal Chrome tab, and note each result here. A real grant has never been tested, because headless Chromium always declines, so seeing Backup & Restore switch to its "has agreed" wording would be the first real confirmation. Background: `docs/OFFLINE_LANGUAGE_REPORT.md` §5.
- **Long studies in Firefox.** `content-visibility` was only tested in Chromium. In a long study, check that typing then quickly scrolling away saves the note, that the tag autocomplete isn't cut off, and that Ctrl+F finds a note far down. Browsers without `content-visibility` just ignore it and lay out every block.

## Deferred by specs

From "Deferred / Related" in `docs/Offline_Language_And_Stress_Test_Spec.md`:

- **OPFS → IndexedDB fallback test**, including where translations and `language.db` live without OPFS, and Safari's missing `createWritable()` on restore. See also `docs/BUILD_6.1_ACTUAL_STATE.md` §11 and `docs/OFFLINE_LANGUAGE_REPORT.md` §2.
- **Readable export** (Markdown or HTML), for long-term readability, sharing and printing.

From "Deferred to Follow-Up Specs" in `docs/Hebrew_Word_Anatomy_Spec.md`:

- **Hebrew lexicon (tier 3).** The spec names a candidate source.
- **Root families**, after the lexicon.
- **Showing non-Ketiv variants** (Aleppo, BHS, LXX). The data is already in `original_word_variants`.
- **The 14 ghost rows** (Ketiv-only words), which need their own display design.

## Before going public

- **Add the PWA icons.** `manifest.json` lists them, but `icons/` has none. See `FEATURE_INVENTORY.md` item 3.
- **Finish the PWA install prompt.** The page element and styles exist, but there's no `beforeinstallprompt` handler. See `docs/BUILD_6.1_ACTUAL_STATE.md` §7.
- **Update the stale Help text.** See `FEATURE_INVENTORY.md` items 67a and 148a, and `docs/BUILD_6.1_ACTUAL_STATE.md` §7.
- **Notify STEPBible** once Ember is publicly available. See `README.md`, "Data & Attribution".

## Roadmap

From "Future" in `README.md`, which remains the source for this list:

- Nested notes
- In-app template creator, with template sharing
- Dictionary lookup (Webster's 1913)
- "Other occurrences of this word" for the Language tab
- Full LSJ Greek lexicon (TFLSJ), pending bundle-size headroom
- Version-aware translation and data reseeding for existing installs
- Landing page and public distribution
