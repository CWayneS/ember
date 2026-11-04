# Ember Bible Study — Hebrew Lexicon Spec (Tier 3)

**Purpose:** Give Hebrew and Aramaic words a tier 3 Lexicon in the Language tab's word card, as Greek has with TBESG. The source is the Open Scriptures Hebrew Bible (OSHB) lexicon: the full Strong's Hebrew entry for every word, plus Brown-Driver-Briggs (BDB) sense outlines. It ships as its own small database file, `data/lexicon-hebrew.db`, so `language.db` is not rebuilt.

**Prerequisites:**
- `Language_Panel_Word_Inspector_Spec.md` shipped (tiered word card; Greek tier 3 via `getGreekLexiconEntry()` / `sanitizeLexiconMeaning()`).
- **Recommended order:** after `claude/Hebrew_Word_Anatomy_Spec.md` and `Offline_Language_And_Stress_Test_Spec.md`. Neither is strictly required (see Item 5 and Item 4), but building after them avoids doing the same work twice. If either hasn't shipped when this starts, say so in the implementation report and follow the notes in those items.
- Code baseline: the latest `BUILD_*_ACTUAL_STATE.md`. Codebase over documentation: if anything here disagrees with the code, the code wins. Report the difference; don't force the spec.

**Status:** Source data read and measured 2026-11-04 (see Findings). License read by Wayne. Ready to hand to Claude Code.

---

## Problem Statement

Greek words get a Lexicon link at the bottom of tier 2 that opens the TBESG entry. Hebrew words have none. TBESH, the Hebrew counterpart of TBESG, was dropped in Build 6 because its Meaning field comes from Online Bible's Abridged BDB, which requires permission from a separate rights holder. Since Build 6, Hebrew and Greek word cards have had a known gap.

---

## Design Principle: Show What the Lexicon Says, Never Guess the Sense

STEP's sense letters (`H2617A`) and OSHB's (`2617a`) are **different schemes**. The Anatomy spec's investigation found 38 letters that coincide but point to different senses, and 254 STEP codes that don't map. Ember therefore matches on the **base Strong's number only** and shows **everything** the lexicon has under that number: the full Strong's entry and every BDB entry linked to it.

Some Strong's numbers cover more than one BDB entry: homonyms such as חֶסֶד "kindness" vs. חֶסֶד "shame", or a phrase entry such as כִּי עַל כֵּן. Ember lists them **in order of how often each occurs in the Hebrew Bible**, from OSHB's own tagging (Item 2). It never marks one entry as "the meaning in this verse". The reader decides, with this verse's contextual gloss right above the lexicon.

---

## Findings (Verified 2026-11-04)

All findings come from real files:

> **Which repository each commit hash belongs to:**
> - `21c9add` (2019-09-02) — **openscriptures/HebrewLexicon** (`BrownDriverBriggs.xml`, `HebrewStrong.xml`, `LexicalIndex.xml`, `AugIndex.xml`, `HebrewLexicon.pdf`).
> - `3d15126` (2024-08-27) — **openscriptures/morphhb** (the OSHB text `wlc/*.xml`; used only to count how often each BDB entry occurs).
> - `5de0a47` (2026-11-02) — **STEPBible-Data** master, TAHOT files only, used to measure coverage. Coverage was measured against STEP's root Strong's numbers, which `original_words.strongs_number` already stores.

### Provenance and license

- **License (Wayne read the readme):** the files are CC BY 4.0, and the BDB and Strong's text itself is public domain. Credit: "the Open Scriptures Hebrew Bible Project". morphhb's lemma and morphology data are under the same CC BY 4.0 terms and attribution.
- **This is not the TBESH source.** `HebrewLexicon.pdf` says the BDB text is checked against the original BDB page scans on Wikisource (each entry's `<status p="…">` is its BDB page number). There's no Online Bible or Abridged BDB material and no permission clause.
- **TWOT numbers** in `LexicalIndex.xml` are "for reference purposes only". Ember doesn't import them.

### Completeness: a sense outline, not the full scholarly BDB

The BDB file is a transcription that is still in progress (no commits since 2019). Each entry's status:

| Status | Entries | Meaning (from `HebrewLexicon.pdf`) |
|---|---|---|
| `base` | 6,395 | BDB's definitions and sense outline only |
| `ref` | 2,312 | Some scripture references added, still incomplete |
| `done` | 560 | Fully represents the BDB entry |
| `made` | 2,123 | Cross-reference stub (alphabetical pointer to the real entry) |
| `new` | 453 | BDB root entry with no Strong's counterpart |
| `added` | 2 | Root added to hold internal BDB information |

In practice, most entries are BDB's numbered senses without most of the citations and etymology. Common words still carry rich outlines: רוּחַ H7307 has 9 numbered senses with counts ("breath… (33 t.)", "wind (117 t.)", "spirit of God (94 t.)"); אֶרֶץ H0776 has 18 definitions; נָתַן H5414 is broken down by stem with counts. Rare words and names are short (זִיזָא H2124: "a Simeonite; a son of Rehoboam").

Every Strong's entry has a derivation (`<source>`), most have a meaning (`<meaning>`, 8,435 of 8,674), and nearly all have the KJV renderings (`<usage>`, 8,673), e.g. H7307: "air, anger, blast, breath… tempest… wind".

### Coverage of Ember's Hebrew words

Measured over the 214,144 root occurrences in TAHOT (the `{…}` piece of each word; prefixes and suffixes excluded):

- **97.91%** reach a Strong's Hebrew entry; **97.90%** reach at least one BDB entry; **95.72%** reach a BDB entry with at least one `<def>`.
- 7,277 distinct base Strong's numbers are used.
- **Every Strong's miss is a STEP-only number** (H9005, H9007, H9008, H9030–H9039). The one extra BDB miss is H2007 (27 occurrences): it has a Strong's entry but no BDB link, so it shows Strong's only. The H9030–H9039 numbers are pronoun suffixes that STEP tags as the root, e.g. Gen 1:11 #16 `ב֖/וֹ` = `H9003/{H9033}`, where H9033 is `Os3m` "him". Strong's and BDB have no entries for these. Those words get no Lexicon link (Item 5).
- **Aramaic:** BDB has a separate Aramaic section (852 entries). 3,554 of 3,642 Aramaic-coded root occurrences reach an Aramaic BDB entry (e.g. אֱלָהּ H0426, Dan 2:18 #05: "god, God").
- `LexicalIndex.xml` also has 8 entries whose `strong` attribute is a letter (`b`, `c`, `d`, `i`, `k`, `l`, `m`, `s`): the prefix letters. They aren't Strong's numbers; skip them. Prefixes are explained by the Anatomy spec's `hebrew_affixes`.
- Only one Strong's number (H7984) links to nothing but stub entries (`made`/`new`/`added`). Every BDB id in the index exists in the BDB file.

### Homonyms and ordering

- **526 of the 7,277 base numbers used in TAHOT have more than one BDB entry**, and they cover **19.1% of root occurrences**: 2 entries for 473 numbers, 3 for 37, 4 for 11, 5 for 4, 6 for 1 (H5526). H0859 אַתָּה has 5, one per pronoun form.
- **The index order is often wrong for reading.** In 242 of 532 homonym sets (all Strong's numbers, not just those in TAHOT), the first entry in `LexicalIndex.xml` order isn't the most common one. Examples: עַל H5921 lists the phrase "כִּי עַל כֵּן forasmuch as" before "upon"; עַיִן H5869 lists "spring" before "eye"; חֶסֶד H2617 lists "shame, reproach" before "goodness, kindness"; בָּרָא H1254 lists "be fat" before "shape, create".
- **Ordering by OSHB frequency fixes these.** Counting each BDB entry's occurrences in OSHB's text (lemma → `AugIndex.xml` → `LexicalIndex.xml` → BDB id) over 300,808 lemma pieces (825 unmapped, mostly `+`-suffixed compound names like `1008+`) gives:
  - H5921: upon 5,774× · forasmuch as 31×
  - H5869: eye 874× · spring 27×
  - H2617: kindness 249× · shame 2×
  - H1254: create 53× · be fat 1×
  - H1121: son 4,940× · בְּנוֹ as a personal name 2×
  - H7451: רָעָה 306× · רַע adj. 242× · רַע n. 105×
- 60 sets tie for first place. Break ties by `LexicalIndex.xml` order. No set has all-zero counts.
- **BDB's own counts aren't usable for this.** Only 72 of the 1,127 entries in the 526 TAHOT homonym sets have BDB's count after the headword.
- **This ordering is text-wide, not per verse.** It says which entry is most common in the Hebrew Bible, not which one applies in the verse on screen.

### Markup

- **BDB entries** use: `w` (Hebrew, 17,495), `def` (21,343), `sense` (8,989, nested, with `n="1"`, `n="a"`…), `pos` (9,195), `stem` (3,149), `ref` (3,952, OSIS refs like `r="Exod.13.4"`), `foreign` (835), `em` (312), `asp` (129), `status` (one per entry), `page` (4).
- **Strong's entries** use: `w` (with `pos`, `pron`, `xlit`, `xml:lang`, and `src` for cross-references), `source`, `meaning`, `def`, `usage`, `note` (167, notes on corrections to the original).
- **`<status>` text is inside the entry.** Naive text extraction appends "base"/"done" to every entry. Strip the element.
- **`<foreign>` sometimes holds a placeholder word instead of the script**, e.g. `cf. Ar. <foreign xml:lang="ara">Arabic</foreign>` (the Arabic script wasn't transcribed). Shown as-is, it reads "cf. Ar. Arabic". See Open Questions.

### Size

A prototype with Strong's, BDB (inner markup kept, `<status>` stripped), and the ranked links came to **6.7 MB** after `VACUUM` (1.5 MB gzipped). The plain text is about 1.1 MB for each lexicon; the rest is markup and SQLite overhead.

---

## Scope

### In Scope

1. **New build script** `scripts/build_lexicon_hebrew.py` that produces `data/lexicon-hebrew.db`.
2. **Three tables:** Strong's entries, BDB entries, and ranked Strong's → BDB links (Item 1).
3. **Homonym ordering** by OSHB text frequency, computed at build time (Item 2).
4. **Lazy loading** of the new file, with the same offline guarantees as `language.db` (Item 4).
5. **Hebrew tier 3** in the word card: a Lexicon link and the lexicon view (Item 5).
6. **A safe renderer** for the stored markup (Item 6).
7. **Attribution:** an OSHB credit (Item 7).
8. **Verification:** a `lexicon` scenario in `tests/verify.py`; `FEATURE_INVENTORY.md` and `USER_MANUAL.md` updated (Item 8).
9. **Size limit** for the new file (Item 9).

### Out of Scope (Explicit)

- **Choosing a sense per verse.** No mapping of STEP's sense letters to OSHB's (see the Design Principle).
- **Tappable scripture references** inside BDB entries. `<ref>` OSIS values are kept in the data so a later spec can link them, but they render as plain text now.
- **A BDB abbreviations key** (Lag BN, Dl, JE, Kö…). Worth a follow-up; not here.
- **Root families** ("other words from this root"). `LexicalIndex.xml`'s `<etym>` data makes this possible later. Not imported now.
- **TWOT numbers.** Not imported.
- **Strong's lexicon for Greek, TFLSJ.** Unchanged; Greek tier 3 stays TBESG.
- **Changes to `language.db`.** No rebuild, no new tables there.
- **Editing or "completing" the source text.** Entries show as transcribed, including partial ones (authenticity principle).

---

## Item 1: Build Script and Schema

`scripts/build_lexicon_hebrew.py`, separate from `build_language.py`.

- Download `BrownDriverBriggs.xml`, `HebrewStrong.xml`, `LexicalIndex.xml`, `AugIndex.xml` from openscriptures/HebrewLexicon, and `wlc/*.xml` from openscriptures/morphhb. **Pin both commits** (`21c9add`, `3d15126`, or later, re-verified at build time) and record per-file sha256 values in the script's header comment and in the `lexicon_meta` table. If either repo has moved past these commits, diff the files and report before building. The counts in this spec are verified only against these commits.
- Parse with a real XML parser in the `http://openscriptures.github.com/morphhb/namespace` namespace. No regex parsing of the XML.

```sql
-- One row per Strong's Hebrew entry (8,674).
CREATE TABLE lexicon_strongs_hebrew (
    strongs_base     INTEGER PRIMARY KEY,  -- 776 for 'H776' (OSHB) / 'H0776G' (STEP)
    headword         TEXT NOT NULL,        -- <w> text, pointed Hebrew/Aramaic
    transliteration  TEXT,                 -- <w xlit>
    pronunciation    TEXT,                 -- <w pron>
    part_of_speech   TEXT,                 -- <w pos>, raw ('n-m', 'v', …)
    language         TEXT NOT NULL,        -- <w xml:lang>: 'heb' | 'arc'
    source_markup    TEXT,                 -- inner markup of <source>
    meaning_markup   TEXT,                 -- inner markup of <meaning>
    usage_markup     TEXT,                 -- inner markup of <usage> (KJV renderings)
    note_markup      TEXT                  -- inner markup of <note>, if any
);

-- One row per BDB entry (11,845), stubs included so links never dangle.
CREATE TABLE lexicon_bdb_hebrew (
    bdb_id       TEXT PRIMARY KEY,         -- 'a.fx.aa'
    headword     TEXT,                     -- first <w> of the entry
    language     TEXT NOT NULL,            -- the <part>'s xml:lang: 'heb' | 'arc'
    status       TEXT NOT NULL,            -- 'base' | 'ref' | 'done' | 'made' | 'new' | 'added'
    bdb_page     INTEGER,                  -- <status p>
    body_markup  TEXT NOT NULL             -- inner markup of <entry>, <status> removed, whitespace collapsed
);

-- Strong's number → BDB entries, in display order.
CREATE TABLE lexicon_hebrew_links (
    strongs_base      INTEGER NOT NULL,
    bdb_id            TEXT NOT NULL,
    display_rank      INTEGER NOT NULL,    -- 0 = shown first (Item 2)
    oshb_occurrences  INTEGER NOT NULL,    -- count used for ranking
    PRIMARY KEY (strongs_base, bdb_id)
) WITHOUT ROWID;

CREATE TABLE lexicon_meta (key TEXT PRIMARY KEY, value TEXT);
-- e.g. 'hebrewlexicon_commit', 'morphhb_commit', per-file sha256, build date
```

### Import rules

- **Strong's key:** OSHB ids are `H1`…`H8674`. Store the integer. Ember looks up a word by parsing the digits of `original_words.strongs_number` (`H0776G` → 776, `H1254A` → 1254). Numbers ≥ 9000 are STEP-only and never looked up.
- **Links come from `LexicalIndex.xml`** `<xref strong="…" bdb="…">`. Skip the 8 letter-valued `strong` attributes. Deduplicate repeated `(strongs, bdb)` pairs.
- **Markup is stored, not flattened.** Keep the inner markup with the namespace declarations removed, so sense numbers, Hebrew runs, and refs survive. Remove `<status>` and `<page>` (page breaks are positional notes for the transcribers, not content). Collapse whitespace runs to one space.
- **Report any element name not in Item 6's allowed list.** Don't drop it silently.
- **Text stays as transcribed.** No spelling fixes, no abbreviation expansion, no placeholder replacement. Display decisions live in the renderer (Item 6).
- **Report:** row counts per table; the number of Strong's numbers with 0, 1, and 2+ BDB links; the status breakdown; and 5 samples (H7307, H2617, H1254, H0426, H2124) showing source XML, stored rows, and links with ranks.

---

## Item 2: Homonym Ordering

Computed once, at build time. Only `display_rank` and `oshb_occurrences` are stored. No OSHB text goes into the file.

1. For every `lemma` attribute in `wlc/*.xml`, split on `/`. Skip pieces that don't start with a digit (prefix letters `b`, `c`, `d`, …). Remove spaces (`1254 a` → `1254a`).
2. Look up the piece in `AugIndex.xml` (`<w aug="1254a">bxy</w>`) to get a `LexicalIndex.xml` entry id, then that entry's `bdb` id. Count occurrences per BDB id.
3. For each Strong's number, sort its BDB links by occurrence count (highest first), breaking ties by `LexicalIndex.xml` document order. Write `display_rank` 0, 1, 2…
4. **Report:** pieces counted, pieces unmapped (expected: about 825, mostly `NNNN+` compound names) with the top 10 by count, the number of homonym sets, sets where frequency order differs from index order (expected: about 242 of 532), ties (expected: about 60), and the final order for H5921, H5869, H2617, H1254, H1121, H7451, H0859, H3651.

If the counts are far from these expectations, stop and report rather than ship.

---

## Item 3: Queries (`db.js`)

- `getHebrewLexiconEntry(strongsNumber)` → `{ strongs: {...} | null, bdb: [{ bdbId, headword, language, status, bodyMarkup, occurrences }] }`, with BDB entries in `display_rank` order. Takes the STEP form (`H0776G`) and parses the base number itself. Returns `null` for numbers ≥ 9000 or with no rows.
- `hasHebrewLexiconEntry(strongsNumber)` or an equivalent cheap check, so tier 2 can decide whether to show the Lexicon link **without** opening the lexicon file just to render tier 2. Acceptable approaches, CC's choice:
  - (a) Show the link for every root Strong's number < 9000 (coverage is 97.9%) and let tier 3 show "No lexicon entry for this word" in the rare miss.
  - (b) Ship a small precomputed set of covered numbers in JS.

  Prefer (a) unless it reads badly in testing. Report the choice.
- The lexicon is fetched **only on a Lexicon tap**, like Greek's `getGreekLexiconEntry()`. No lexicon query in the render loop.

---

## Item 4: Loading and Offline

`data/lexicon-hebrew.db` is a separate file, opened lazily:

- **Same load path as `language.db`:** OPFS first, network fallback, copied into OPFS on first successful fetch. It gets its own sql.js `Database`, opened on the first Lexicon tap for a Hebrew word, never at boot.
- **Offline-first:** if `Offline_Language_And_Stress_Test_Spec.md` has shipped, add this file to its background download. That spec's Open Question 3 anticipated this ("a Hebrew lexicon"). If the download helper is already general, this is one more file name; if it isn't, generalize it only as far as needed for two files. If that spec hasn't shipped, implement the same rules for this file: one download, never two; no cached rejected promise; no truncated file treated as complete.
- **Friendly failure:** if the file is unavailable and can't be downloaded right now, tier 3 shows a calm one-line message in the same tone as the Language tab's offline message (e.g. "The Hebrew lexicon downloads the first time Ember is online."). Tiers 1–2 are unaffected. No console errors (one `console.warn` is acceptable).
- **Service worker:** `/data/` requests are not cached by `sw.js` (since `94ca0fa`), and this file follows that rule. If a new `js/` file is added (e.g. the renderer), follow the precache rule (add it to `PRECACHE`, bump `CACHE_NAME`); the `sw` scenario enforces it.
- **Dev-workflow note:** after rebuilding `lexicon-hebrew.db`, clear its OPFS entry and re-seed, per `OPFS_Reseed_Gap.md`.
- **Git:** committed directly, like `language.db`. At about 7 MB it costs far less per rebuild than `language.db`, but still rebuild only when the source or the schema changes.

---

## Item 5: Word Card — Hebrew Tier 3

### The Lexicon link (bottom of tier 2)

- Shown for Hebrew and Aramaic words whose root Strong's number is < 9000. One link per member word, as for Greek.
- **Multi-piece words:** the link is for the **root** piece (`original_words.strongs_number`). Prefixes and suffixes have no lexicon entry; the anatomy view already gives their glosses. On the 37 two-root rows (Anatomy spec, `original_word_pieces.root_glosses`), show one link per root if the Anatomy spec has shipped. Otherwise, link the first root only and note it in the report.
- **Words whose root is a STEP-only number** (H9030–H9038 pronoun suffixes, e.g. Gen 1:11 #16 `בּוֹ`): no Lexicon link.

### The lexicon view

Expands in place under the Lexicon link, like Greek's tier 3. Order:

1. **Strong's** (subheading "Strong's"). Strong's comes first because every word has it, it's complete, and it's the most approachable.
   - Headword (RTL, Ezra SIL), transliteration, part of speech, and "Aramaic" for `arc` entries (styled like tier 1's Aramaic label).
   - Meaning.
   - Derivation (`source_markup`), labeled e.g. "From".
   - KJV renderings (`usage_markup`), labeled e.g. "KJV translates as". This label matters: these are the KJV's English words for this Hebrew word, not definitions.
   - Note, if present, in secondary style.
2. **Brown-Driver-Briggs** (subheading "Brown-Driver-Briggs").
   - **One BDB entry:** shown in full.
   - **Two or more:** one line first, e.g. *"This Strong's number covers 2 entries in BDB, listed by how often each occurs. Which one applies in this verse isn't marked."* Then the first entry in full, and the others **collapsed** to one line each (headword, part of speech, first `<def>`), each expandable in place. This follows Ember's progressive-disclosure pattern: H0859 אַתָּה has 5 entries and shouldn't open as a wall.
   - **Sense outline:** `<sense n>` renders as an indented, numbered outline using the source's own numbers and letters, not a single paragraph (Item 6).
   - **Partial entries** (`base`, `ref`): one quiet line in secondary style, e.g. *"Abridged in this edition: most references and etymology aren't transcribed yet."* `done` entries get no note. Exact wording can be adjusted during implementation.
   - **Stub entries** (`made`) show their text as-is (e.g. "v. II. אבה"). Not tappable in this spec.
   - **Aramaic entries** get the same "Aramaic" label as above.
3. Nothing in the lexicon view is highlighted or selected based on the current verse.

**Tier 3 must not look like a different app.** Reuse the Greek tier 3 spacing, type sizes, and colors from `css/style.css`. Strong's and BDB sections are separated the same way tier 2's Morphology and General usage are.

---

## Item 6: Safe Rendering

Stored markup is data from a third-party file, so it must never be assigned to `innerHTML`.

- Parse `*_markup` with `DOMParser` (XML mode, wrapped in a root element) or an equally strict parser, then **build DOM nodes from an allowed list**:

  | Source element | Renders as |
  |---|---|
  | `w` | `<span lang="he" dir="rtl">` in Ezra SIL (the verse-line font). `xml:lang="arc"` → `lang="arc"`, same font |
  | `def` | `<span>` with the definition style (e.g. semibold) |
  | `sense` | outline item, labeled with its `n` value; nested `sense` → nested item |
  | `pos`, `stem`, `asp` | `<span>` in secondary/italic style |
  | `em` | `<em>` |
  | `ref` | plain text (keep the `r` value as a `data-ref` attribute for a future linking spec) |
  | `foreign` | `<span lang="…">` from its `xml:lang`, italic |
  | `source`, `meaning`, `usage`, `note` (Strong's) | containers for the sections in Item 5 |

- **Any other element:** render its text content only, and log one `console.warn` per element name per session (this should never fire, because Item 1 reports unknown elements at build time).
- **Attributes:** none copied except those listed above.
- **Bidi:** Hebrew runs inside English text must not reorder surrounding punctuation. Use `dir="rtl"` on the `w` span and check visually against H7307 and H5414 (mixed Hebrew/English lines with counts in parentheses).
- `sanitizeLexiconMeaning()` (Greek) is unchanged. Put the new renderer in its own function (e.g. `renderHebrewLexiconMarkup(markup)`), in `language.js` or a new module.

---

## Item 7: Attribution

- Add an **Open Scriptures Hebrew Bible Project** entry to the Data & Attribution list (`js/global-settings.js`), linked to the project (`https://hb.openscriptures.org` if it resolves, otherwise the GitHub organization), with a note like: *"Hebrew lexicon (Brown-Driver-Briggs and Strong's Hebrew Dictionary) powering the Language tab's Lexicon for Hebrew words. When a word has several BDB entries, their order comes from word frequencies in the OSHB text."* One entry covers both OSHB repositories (HebrewLexicon and morphhb); OSHB asks for the same attribution for both.
- **Update the section's lead sentence.** It currently says "Two sources are licensed CC BY 4.0" (`FEATURE_INVENTORY.md` 236h). That becomes three. Mention that BDB (1906) and Strong's (1890) are public domain in the note or the lead sentence, whichever reads better.
- **Check first** whether any Strong's data from another openscriptures repository (e.g. `openscriptures/strongs`, CC BY-SA 3.0, which Build 6 Item 5 asked to audit) is already bundled. If so, report it. Don't change it in this spec.

---

## Item 8: Verification

Add a `lexicon` scenario to `tests/verify.py`:

| Word | Check |
|---|---|
| Gen 1:1 #02 `בָּרָא` (H1254A) | Lexicon link present; Strong's section shows "create"; BDB lists 2 entries, "shape, create" open, "be fat" collapsed below it; the "covers 2 entries" line shows |
| Gen 1:2 #09 `וְרוּחַ` (H7307G) | Link is for the root, not the `ו` prefix; BDB sense outline renders numbers 1–9 as an outline |
| Exo 34:6 #14 `חֶסֶד` (H2617A) | "goodness, kindness" entry first; "shame, reproach" second and collapsed |
| Gen 1:1 #07 `הָאָרֶץ` (H0776G) | Lexicon for אֶרֶץ; KJV renderings labeled as KJV renderings |
| Dan 2:18 #05 `אֱלָהּ` (H0426) | Aramaic label in both sections; Aramaic BDB entry ("god, God") |
| Gen 1:11 #16 `בּוֹ` (root H9033) | No Lexicon link |
| A `done` entry: Exo 13:4 #05 `הָאָבִיב` (H0024) | No "abridged" note; `base` entries do show it |
| John 1:1 | Greek tier 3 unchanged (TBESG) |
| Offline, lexicon never downloaded | Block `**/data/lexicon-hebrew.db`; tap Lexicon on a Hebrew word: friendly message, tiers 1–2 fine, zero console errors |
| Single download | Tap Lexicon twice quickly on a fresh profile: exactly one request for `lexicon-hebrew.db` |

Plus:

- **Rendering safety:** a unit-style check that `renderHebrewLexiconMarkup('<script>…</script><w>x</w>')` produces no `<script>` element and no event-handler attributes.
- Build-script report from Items 1 and 2 included in the implementation report.
- All existing scenarios still pass; zero console errors apart from the documented FTS5 warning.
- `FEATURE_INVENTORY.md` updated; `USER_MANUAL.md` Language-tab section gains a short note on the Hebrew Lexicon (what Strong's and BDB are, what "KJV translates as" means, that multiple BDB entries are listed by frequency and not chosen for the verse); README's data list includes OSHB.

---

## Item 9: Size Limit

- **Expected:** about 7 MB after `VACUUM` (prototype: 6.7 MB).
- **Limit: 10 MB.** If the built file is larger, stop and report a per-table breakdown before committing. Don't trim content to fit; that's Wayne's decision.
- Report the gzipped size too (what a first download actually costs over GitHub Pages).

---

## What Does Not Change

- `language.db`: no rebuild, no schema change.
- Greek: TBESG, `getGreekLexiconEntry()`, `sanitizeLexiconMeaning()`, Greek tier 3.
- Hebrew tiers 1–2, the anatomy view, Ketiv line, and Aramaic label (Anatomy spec).
- Interlinear view layout, grouping, RTL handling.
- `core.db`: no schema change, no migration.

---

## Definition of Done

- [ ] `scripts/build_lexicon_hebrew.py` builds `data/lexicon-hebrew.db` from pinned openscriptures/HebrewLexicon and morphhb commits; commits and per-file sha256 recorded in the script and `lexicon_meta`; any upstream changes since `21c9add` / `3d15126` diffed and reported
- [ ] Three tables populated; markup kept with `<status>`/`<page>` removed; unknown elements reported; letter-valued `strong` attributes skipped; report with counts and the 5 samples
- [ ] Homonym ranks computed from OSHB frequency with index-order tiebreak; report shows counts close to the Findings (≈825 unmapped, ≈242 of 532 sets reordered, ≈60 ties) and the listed orders
- [ ] `getHebrewLexiconEntry()` added; lexicon queried only on a Lexicon tap; link-visibility approach (a or b) chosen and reported
- [ ] Lexicon file loads lazily from OPFS/network; included in the background download (or the same rules implemented if the offline spec hasn't shipped); friendly offline message; exactly one download
- [ ] Hebrew tier 3: Strong's section (headword, transliteration, part of speech, meaning, derivation, KJV renderings labeled as such, note) then BDB section; multiple entries listed by frequency with the explanatory line, first open, others collapsed; numbered sense outline; abridged note on `base`/`ref` entries; Aramaic labels; nothing marked as this verse's sense
- [ ] Links only for root Strong's numbers < 9000; none for prefixes, suffixes, or STEP-only roots
- [ ] Renderer builds DOM from the allowed list only; no `innerHTML` from data; safety check passes; bidi checked on H7307 and H5414
- [ ] OSHB credited; lead sentence updated; existing Strong's data audited and reported
- [ ] Size ≤ 10 MB after `VACUUM`; raw and gzipped sizes reported
- [ ] `tests/verify.py lexicon` added and passing; all existing scenarios pass
- [ ] `FEATURE_INVENTORY.md`, `USER_MANUAL.md`, and README data list updated
- [ ] Verified live in the browser, zero console errors apart from the documented FTS5 warning

---

## Open Questions for Implementation

1. **`<foreign>` placeholders** ("cf. Ar. Arabic", where the script wasn't transcribed). Options: show as-is; show a neutral mark like "[Arabic]"; or hide the placeholder word when its text equals the language name. Count the cases at build time, look at a few on screen, and decide with Wayne. The data stays as transcribed either way.
2. **Collapsed-entry summary line:** headword + part of speech + first `<def>` is the starting point. Check it against H0834 (אֲשֶׁר, 4 entries) and H0859 (אַתָּה, 5 entries) and adjust if the lines read alike.
3. **Showing occurrence counts** (e.g. "5,774×") beside each BDB entry when there are several. They explain the order, but they're OSHB's tagging counts, not BDB's own. Default: don't show them; the explanatory line is enough. Revisit after seeing it.
4. **Long entries:** the largest `done` entries are about 1,400 characters; with Strong's above, the card can get tall. Check the Inspector spec's auto-scroll fallback against H0776 and H0430.
5. **Help entry** explaining Strong's vs. BDB. Can wait for the Help build (Help copy is stale anyway).

---

## Deferred to Follow-Up Specs

- **Tappable BDB references** (`<ref r="Exod.13.4">`) that open the verse in the reader.
- **BDB abbreviations key** for the scholarly shorthand in `ref`/`done` entries.
- **Root families** from `LexicalIndex.xml`'s `<etym>` data (main/sub word groups).
- **Stub entries (`made`) as links** to the entries they point at.
- **TFLSJ** can reuse this spec's pattern: separate lazily loaded file, same loading and offline rules.
- **Re-checking OSHB progress:** if openscriptures/HebrewLexicon resumes work, a rebuild picks up more `done` entries with no code change.
