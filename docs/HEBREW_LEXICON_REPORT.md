# Hebrew Lexicon — Build Report

The record of the Hebrew lexicon build (`docs/Hebrew_Lexicon_Spec.md`): what was checked before any code, what the data turned out to be, every place the build differs from the spec and why, and the decisions Wayne made at each checkpoint. Built on branch `hebrew-lexicon`, 2026-11-04 to 2026-11-10.

| Checkpoint | Spec items | Commit |
|---|---|---|
| Spec | | `aa3fc83` |
| 1. Build script and data file | 1, 2, 9 | `228924f` |
| 2. Loading, queries, renderer, tier 3 UI | 3, 4, 5, 6 | `701af04` |
| 3. Attribution, `lexicon` test scenario, docs | 7, 8 | see `git log` |

---

## 1. Before any code

**Did the Anatomy and Offline specs ship?** Both had, judged from the code. The anatomy view, `original_word_pieces` and `getPiecesForWords()` are live, so Item 5's two-root rule applies and those rows get one link per root. The general download helpers (`downloadToOpfs`, `getCompleteOpfsFile`, `isCompleteSqliteFile`) are live too, so Item 4's rule applied: the language.db-specific path was generalized only as far as two files needed (§4).

**Have the upstream repositories moved?** No. openscriptures/HebrewLexicon was still at `21c9add13bc727d3a951361778e97e3ff7afd1ce` and morphhb at `3d15126fb1ef74867fc1434be1942e837932691f`, so there was nothing to diff.

**Item 7's check: is Strong's data from another openscriptures repository already bundled?** No. No table in any shipped `.db` holds Strong's dictionary text, and nothing else in the repo comes from `openscriptures/strongs`. `FEATURE_INVENTORY.md` item 236g already recorded the same finding from Build 6.

**Where `language.db` differs from the spec's numbers** (counted before building; none of them changes the design):

| Spec | Measured |
|---|---|
| 214,144 root occurrences, 7,277 base numbers | 305,634 Hebrew word rows, 8,525 distinct numbers |
| Coverage 97.91 / 97.90 / 95.72 % | 98.01 / 98.00 / 95.42 % |
| Base numbers used with more than one BDB entry: 526 (473 with two) | 532 (479 with two) |
| H2007: 27 occurrences | 30 |
| Aramaic words: 3,642 | 4,827 |

The spec's word numbers (`#NN`) are `word_position + 1`. Num 7:59 #16 is `{H6301}//{H6301}`, one root written twice, so it gets one link.

---

## 2. The build (Items 1, 2, 9)

`scripts/build_lexicon_hebrew.py` fetches 43 files at the pinned commits (Strong's, BDB, the two lexical indexes, and the 39 OSHB book files), checks each against a sha256 constant, and writes `data/lexicon-hebrew.db`. Downloads go to the gitignored `data/lexicon-prep/raw/`; `--ship` copies the build to `data/`. It stops without shipping on any failed check.

### Row counts

| Table | Rows |
|---|---|
| `lexicon_strongs_hebrew` | 8,674 |
| `lexicon_bdb_hebrew` | 11,845 |
| `lexicon_hebrew_links` | 9,280 (9,299 `strong` attributes − 8 letter values − 11 repeated pairs) |
| `lexicon_meta` | 45 (2 commits + 43 sha256; no build date) |

- **Links per Strong's number:** none, 1 (H2007); one, 8,141; two or more, 532 (sizes 2: 479, 3: 37, 4: 11, 5: 4, 6: 1).
- **BDB status:** base 6,395, ref 2,312, done 560, made 2,123, new 453, added 2, all exactly as the spec says. **Language:** heb 10,993, arc 852.

### Homonym ordering (Item 2)

| Measure | Spec | Built |
|---|---|---|
| Lemma pieces counted | 300,808 | 300,808 |
| Unmapped | about 825 | 825 (267 distinct; 801 end in `+`, none in AugIndex) |
| Homonym sets | 532 | 532 |
| First entry changes | about 242 | 242 |
| Any order changes | — | 250 |
| Tied for first | about 60 | 60 |
| All-zero sets | 0 | 0 |

All the spec's listed orders came out as expected. H5921's first entry has "height" as its first `<def>`. That is the entry the spec calls "upon": the count matches, and "height" is BDB's etymological noun at the head of it.

### Integrity

- **Unknown elements:** none, in the source or in what was stored. Element counts match the spec.
- **Markup:** all 37,745 stored strings re-parse, in Python at build time and in Chromium's `DOMParser` in the `lexicon` scenario. A text check found nothing lost. An independent lxml census matches the source exactly, minus `<status>`, `<page>` and the wrappers that became columns.
- **A bug the checks caught:** a plain `.strip()` removed a trailing non-breaking space from two BDB entries. Whitespace handling is now ASCII-only, and the source's 218 non-breaking spaces stay as transcribed.

### Size (Item 9)

| | Bytes |
|---|---|
| Raw | 4,403,200 (4.20 MiB; limit 10 MiB; spec expected about 7 MB) |
| Gzipped (level 9) | 1,400,750 (1.34 MiB) |

- **By table:** BDB 2.29 MB, Strong's 1.74 MB, BDB index 184 KB, links 172 KB.
- **Why smaller than the prototype:** I can't say how the prototype reached 6.7 MB. The census shows nothing missing.
- **Real download cost:** GitHub Pages serves `.db` files gzipped (checked on `language.db`: `content-encoding: gzip`), so 1.34 MiB is what a first download actually costs.

### Byte-identical rebuilds

Three builds (two with random hash seeds, one with `PYTHONHASHSEED=12345`) all gave sha256 `1e5f9af59709873e6d9a7b153885d6e0385e831c86c457d384a0d3cfca085a3e`, with SQLite 3.51.2. The file header records the SQLite version, so a different SQLite can change bytes without changing content.

---

## 3. Where the data disagrees with the spec

| Spec | Data | What was done |
|---|---|---|
| Strong's `language` is `heb` or `arc` | Three values: heb 5,393, arc 653, **x-pn 2,628** (names). H0426, Item 8's Aramaic test word, is `x-pn` | Data kept as written. **Decision 1 (Wayne):** the Strong's section shows "Aramaic" when `language = 'arc'` or the source text begins "(Aramaic)" (678 entries). BDB uses its own `language`. 12 `x-pn` names link to Aramaic BDB entries with no Aramaic marking in Strong's; they get the label in BDB only |
| Every Strong's entry has a derivation | 7 have none (H119, H597, H2474, H5120, H5223, H5345, H6776) | Field left out |
| Nearly all have KJV renderings | H3390 has none | Field left out |
| `made` stubs show their text as-is | No Strong's number links to any `made` entry | Rule never fires; stubs stay in the table as the spec asks |
| H7984 links only to stubs | Its one link is to an `added` entry | Wording only |
| Largest `done` entries about 1,400 characters | Largest reachable: H0006 at 11,886 (`ref`); largest `done` 3,280 | Long entries work (§6, scrolling) |
| BDB entries are told apart by headword + part of speech + first definition | True in 531 of 532 sets. H7197's two entries differ only by BDB's I/II numeral, which the schema drops | **Decision 2 (Wayne):** numerals stay out. H7197's first entry is always open, so no two collapsed lines match |

---

## 4. Loading and queries (Items 3, 4)

- **`getHebrewLexiconEntry(strongsNumber)`** returns `{ strongs, bdb, bdbHeadwords }`. It takes the STEP form (`H0776G`), returns `null` for numbers ≥ 9000 without opening the file, and `null` for a number with no rows. `bdbHeadwords` was added for the raw-id rule in §5.
- **Link visibility: option (a).** Every root below H9000 gets a link; every such number the text uses has a Strong's entry.
- **Loading:** the language.db code was generalized for two files, `LANGUAGE_DB` and `HEBREW_LEXICON_DB`, sharing `openReferenceDb` / `loadReferenceBuffer` / `downloadReferenceDbInBackground`. `startLanguageBackgroundDownload()` is now `startReferenceDbDownloads()`, and both files download about 2 seconds after launch.
- **When the file opens:** only on the first Hebrew Lexicon tap; one download per tab; no cached rejected promise; the header check catches truncated files.
- **When the file can't be had:** tier 3 shows a friendly message and logs one `console.warn`. The next tap retries, and so does the browser's `online` event.
- **Service worker:** `js/hebrew-lexicon.js` was added to `PRECACHE`, and `CACHE_NAME` is now `ember-v17`. `/data/` stays uncached.

---

## 5. The lexicon view and rendering (Items 5, 6)

What follows lists only what goes beyond or differs from the spec text.

| Spec | Built | Why |
|---|---|---|
| Derivation labeled e.g. "From" | **"Derivation"** | The source text usually begins with "from" already, so the label would read "From: from 7306" |
| Abridged note: "most references and etymology aren't transcribed yet" | "Abridged in this edition: references and etymology aren't fully transcribed yet." | False for some `ref` entries: אָבַד carries 229 references. The spec allowed rewording |
| Part of speech | Strong's codes expanded to words ("n-f" becomes "feminine noun") | Readers wouldn't know the codes. The wording is Ember's own; an unknown code shows as written. Source oddities remain (H0114 Addon is a name, but Strong's says `a`) |
| Every `w` in Ezra SIL, `dir="rtl"` | `w` with no Hebrew letters renders as plain text | 7,931 Strong's `w` elements are cross-reference numbers ("7306") |
| `note` is a container | A `note` inside a meaning or derivation (39) renders small and muted after a space | It would otherwise run into the text ("251number 250, corrected to 251") |
| `sense` labeled with its `n` | Senses with no `n` (2,562, all of a verb's stems among them) show no label | Not covered by the spec |
| Friendly message when the file is unavailable | The same message for any failed lookup | Simpler; a rare non-network failure would also say it downloads when online |
| Collapsed line: headword, part of speech, first `<def>` | When an entry has no `<def>` (169 of 1,139 set entries, mostly names), its opening words instead | Open Question 2 |
| `<foreign>` shown as is (Open Question 1) | **Decision (Wayne):** where the text is only the language's name (628 elements; 46 in entries a reader can reach), it shows in brackets: "Ar. [Arabic] cause to fly" | Readers took "Arabic" for a word BDB wrote |
| Not in the spec | **Decision (Wayne):** 177 BDB entries point at another entry by internal id ("id. [a.be.ad]"); the renderer shows that entry's headword ("id. [אַדָּן]") | An id means nothing to a reader. The data is unchanged |
| Not in the spec | `hebrewLexiconRoots()` labels each link on a two-root row with its number ("Show Lexicon (H0935G)") | So two links on one card are told apart |

- **Not shown:** OSHB occurrence counts beside BDB entries, per the spec's default (Open Question 3). BDB already prints its own counts, which differ (247 vs. 249 for חֶסֶד).
- **Trailing semicolons:** the 8,216 derivations that end in ";" are left as written (Wayne's decision).
- **Bidi:** checked on H7307 and H5414. Each Hebrew span is isolated, so surrounding punctuation keeps its place.
- **Safety:** checked with deliberately hostile markup: no script, image or event-handler attribute survives, and nothing runs.

### Scrolling

Every tap rebuilds the interlinear and restores the scroll position. Two problems turned up at the real window size (a 432 px panel at 1600×1000):

1. **The card-visibility fallback moved what had just been tapped.** It was written for a newly opened card but runs on every rebuild. With tier 3 open the card is taller than the panel, so expanding a BDB line moved that line down by up to 131 px. Taps inside a Hebrew lexicon now skip the fallback (`rerenderHebrewLexicon`). In 8 measured expands and collapses the tapped line didn't move.
2. **A Lexicon opened near the bottom edge could open entirely out of sight** (H0430: 0 of 601 px visible). **Decision 3 (Wayne):** it should come into view, smoothly enough to follow by eye. A Lexicon or BDB entry that opens below the panel's edge now glides up, but never so far that the link just tapped leaves the top; it waits until the entry has loaded. Measured: H0430 moves from 0 to 391 px visible, over about 20 animation frames in Chromium and 28 in Firefox.

At Wayne's direction, the existing card-visibility fallback, shared with Greek, now glides too. Both are instant when the system asks for reduced motion. Greek's own Show Lexicon still relies only on that fallback, which barely moves for a tall card; that's in `docs/TODO.md`. Wayne noted the Language tab will become full-height in a later UI change, which makes the bottom-edge case rarer.

---

## 6. Attribution (Item 7)

- **New entry:** Data & Attribution has a new entry, **Open Scriptures Hebrew Bible Project**, linked to https://hb.openscriptures.org (it resolves, HTTP 200). One entry covers both repositories.
- **Lead sentence:** it now counts three CC BY 4.0 sources and names Brown-Driver-Briggs (1906) and Strong's (1890) as public domain.
- **README:** its attribution table mirrors the in-app text.

---

## 7. Verification (Item 8)

The `lexicon` scenario in `tests/verify.py` covers:

- **Item 8's test words,** in the spec's table.
- **Safe rendering:** the spec's `<script>` check plus event-handler attributes.
- **Every stored string,** rendered through the browser's parser.
- **When the file opens:** not at boot, nor when tier 2 opens; exactly once on the first tap.
- **Single download:** one request across several quick taps and the background download.
- **Offline:** never downloaded and blocked, then recovery.
- **The new rules:** the two-root row, the placeholders and the raw-id headwords.
- **The glide:** the reveal at the real window size.

The `smoke` check that Hebrew has no Lexicon button now checks that it has one, and the `offline` scenario's header check covers both shipped files.

**Firefox:** checked in Playwright's Firefox 153 with H7307, H2617 (expanded), H1254 (expanded), H2219 and H0114, plus the glide. Rendering matched Chromium, with no console messages.

### Test results

Final run on the Checkpoint 3 code, every scenario:

| Scenario | Result |
|---|---|
| popovers, smoke, notes, indicators, sw, hebrew, offline, storage | 0 failures |
| lexicon | 0 failures (38 checks) |
| boots | 0 failures; warm-boot median 395 ms (406–429 ms before this build) |

- **Before the Checkpoint 2 commit:** all scenarios passed, except the old `smoke` check that Hebrew has no Lexicon button, which this checkpoint flips.
- **`dbcompare` across the `db.js` change:** all 36 keys matched apart from `created_at` timestamps.
- **`notes` crash:** during Checkpoint 2, `notes` crashed the browser page in 2 of 6 runs. The same crash happened in 3 of 3 runs on the commit before any lexicon code (§9).

---

## 8. Open questions, resolved

| Question | Outcome |
|---|---|
| 1. `<foreign>` placeholders | Brackets, "[Arabic]" (Wayne) |
| 2. Collapsed-entry line | Headword + part of speech + first definition reads well for H0834 and H0859; falls back to opening words |
| 3. Occurrence counts | Not shown (spec default) |
| 4. Long entries | Work; scrolling fixed and the glide added (§5) |
| 5. Help entry | Deferred to the Help rewrite (`docs/TODO.md`) |

## 9. Tappable BDB references (follow-up, 2026-11-10)

The spec deferred these; they're now links. The decisions:

- **Hebrew numbering.** BDB cites verses as the Hebrew Bible numbers them, and `r` follows BDB. The check: `r` has Hebrew-only references (`Joel.4.*`, `Mal.3.21`, `Ps.40.18`, `Ps.9.21`, `Ps.70.6`, `Ps.12.9`, `Ps.68.36`) and none that exist only in English numbering (`Joel.3.6`+, `Mal.4.*`). Opened as written, 372 of the 3,928 references that link (9%) would land on the wrong verse, mostly in titled Psalms.
- **The map is a JS module, not a table.** A rebuilt reference database never reaches an install that already has one (`getCompleteOpfsFile` keeps any whole copy), and core.db's shipped tables don't update either. `scripts/build_hebrew_versification.py` reads the pinned TAHOT files (sha256-checked, the same ones as `language.db`), whose rows carry both numbers (`Mal.4.1(3.19)`), and writes `js/hebrew-versification.js`: Hebrew verse counts per chapter, and the 2,038 renumbered verses as 145 runs. The script checks that the runs reproduce the per-verse map exactly; the output is byte-identical on rebuild. `lexicon-hebrew.db` is unchanged.
- **One Hebrew verse, two English ones.** In 59 places English splits a Hebrew verse, mostly a Psalm title plus the start of verse 1. The link opens the first numbered verse, not the title. Where the Hebrew verse is all title (Ps 51:1–2), it opens the title row (verse 0); translations without one (WEB, YLT, BSB) fall back to verse 1.
- **Conservative resolving.** Ten book slips are read as the book printed beside them ("Ho", "Hosea", "Is", "Jb", "Zp", "Zec", "Ez", "Erz", "Jugd", "iKgs"; "1cHR" by ignoring case). `Jos.21.23` prints as "Jb 21:23", so it isn't guessed. The printed chapter:verse must agree with `r`; where it doesn't (5 references), the link would go to one of two places, so there's none. Verses that don't exist in Hebrew numbering stay plain. Result: 3,928 of 3,952 references link, 24 stay plain text.
- **A tap doesn't select.** Selecting a verse re-renders the reference panel and switches it to the default tab, which would take away the entry being read. `showVerse()` in `reader.js` renders the chapter only if it differs, scrolls the verse to the middle and outlines it briefly (`.verse.shown`, the accent color, fading over 1.6 s). Wayne can overrule this; selecting would be a one-line change.
- **Module boundary.** `hebrew-lexicon.js` still only builds DOM: a resolvable reference is a `<button class="language-lexicon-ref">` with `data-book`, `data-chapter` and `data-verse-id`; `language.js` handles the click by delegation on the Language tab.

Tests: `lexicon` resolves twelve references (renumbered, aliased, chapter-only, New Testament, and four that must stay plain), taps "Ex 9:31" from Exo 13:4 and "ψ 56:9" (English Ps 56:8) from Gen 5:1's second entry, and checks the tab, the entry and the selection are unchanged.

## 10. Left for later

- **Spec deferrals:** in `docs/TODO.md`, under "Deferred by specs": an abbreviations key, root families, stub links, TFLSJ, and re-checking Open Scriptures' progress.
- **Upstream updates need code edits:** an update means editing the pinned commits and sha256 constants, and reviewing the exact-count checks. That contradicts the spec's "no code change", but those checks are what make the stop conditions work.
- **The `notes` crash:** the test's 300-note check sometimes crashes the browser page. It also happens on the commit before any lexicon code, and the cause is unknown (`docs/TODO.md`).
- **Dev workflow:** after rebuilding the file, clear its OPFS copy (`lexicon-hebrew.db`) to see the change locally, as with `language.db`.
