# Ember Bible Study — Hebrew Word Anatomy Spec

**Purpose:** Bring Hebrew up to Greek in the Language tab's word card, done in a way that fits Hebrew. Greek tier 2 shows one decoded morphology code per word. Hebrew tier 2 will show the **word's anatomy** instead: each printed Hebrew word split into its pieces (prefix, word, suffix), and each piece shown with its own Hebrew, gloss, and plain-English parsing from TEHMC. The same rebuild of `language.db` fixes a live dictionary-gloss bug, captures Ketiv/Qere data, and labels Aramaic.

**Prerequisite:** `Language_Panel_Word_Inspector_Spec.md` shipped (inline tiered word card; `decodeMorphCode()` already called for both languages). State per `BUILD_6.1_ACTUAL_STATE.md`.

**Status:** Data verified by Claude Code investigation, 2026-10-24 (see Findings). Ready to hand to Claude Code.

**Separate, not in this spec:** Hebrew lexicon (tier 3). See "Deferred to Follow-Up Specs".

---

## Problem Statement

Three gaps, one rebuild:

1. **Hebrew tier 2 shows only a raw code** (`HR/Ncfsa`). Greek gets plain-English lines from TEGMC. The Hebrew equivalent, TEHMC, exists upstream but has never been imported.
2. **The import flattened Hebrew words.** A printed Hebrew word often holds several pieces: `בְּ/רֵאשִׁ֖ית` is "in" + "beginning", and `וַ/יֹּ֥אמֶר` is "and" + "he said". TAHOT tags every piece with its own Strong's number, morph code, and gloss. `build_language.py` kept only the root piece's Strong's number, lemma, and dictionary gloss, so 163,644 prefix and suffix pieces (H9001–H9049) are gone from the database. The slashes survive in the surface text, English, and morph code, but nothing that would let Ember explain the pieces.
3. **A silent wrong-data bug.** For 69 Strong's numbers, TAHOT's column 12 puts a sub-meaning in the gloss slot, and the real gloss comes after `»`. The parser takes the wrong half, so 7,752 Hebrew rows show the wrong "General usage" gloss today. אֶרֶץ (H0776G) shows "country;_planet" instead of "land" on 2,318 rows.

---

## Design Principle: A Hebrew Word Is Built, Not Just Inflected

Greek grammar mostly lives in word endings, so one code per word reads naturally. Hebrew attaches whole words (conjunction, preposition, article, pronoun) to the front and back of a word. A reader who sees `וַיֹּאמֶר` glossed "and said" can't tell which letter means "and" without the anatomy. Showing the pieces is the most useful thing Ember can teach a beginning Hebrew reader, and an advanced reader expects it.

The word card's three tiers stay as they are (`Language_Panel_Word_Inspector_Spec.md`). Only Hebrew tier 2's morphology section changes shape. Tier 1 gains one small label.

---

## Findings (Verified 2026-10-24)

All findings come from real files: STEPBible-Data master `ed476a8` (2026-10-17), the STEPBible-Data commit Ember's current `language.db` was built from (`faf6a35`, 2026-03-27), and the shipped `data/language.db`. The shipped Hebrew rows match TAHOT at `faf6a35` exactly (305,638 rows, zero mismatches).

> **Which repository each commit hash belongs to:**
> - `faf6a35`, `ed476a8` — **STEPBible-Data** (the upstream data repo), not Ember's.
> - `21c9add` — **openscriptures/HebrewLexicon** (Deferred section only).
> - `94ca0fa` — **Ember**, cited from `BUILD_6.1_ACTUAL_STATE.md` for the service-worker rule.
>
> No Ember commit is pinned as this spec's starting point; the code baseline is `BUILD_6.1_ACTUAL_STATE.md`.

### TEHMC

- **Path (master):** `Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt`. Unlike TEGMC, the filename spells "Morphology" correctly, but the file's own title line still says "Morphhology". If the path is ever hardcoded, an upstream rename would break it.
- **Last changed in STEPBible-Data commit** `faf6a35`, unchanged to master. **sha256** `78779bea824b31d4467dec0161d547481c86f266bc39def12cd11dc7dcbe6da7`. UTF-8 with BOM, LF line endings, 4,780 lines, 394,580 bytes.
- **Format:** the same 4-line, `$`-delimited record as TEGMC, under a `FULL MORPHOLOGY CODES:` section that comes after a `BRIEF LEXICAL MORPHOLOGY CODES` section. 921 records, every record exactly 4 lines. The final record (`HVvw3ms`) has no closing `$`, like TEGMC's. There is no garbled block like TEGMC's `V-PMO-3P`.
- **921 codes:** 617 Hebrew (`H…`) and 304 Aramaic (`A…`). 179 are never used in the data, mostly Aramaic.
- **Category keys:** main keys `Function`, `Form`, `Gender`, `Number`, `Stem`, `Person`, `State`. Derived keys `Action`, `Voice`, `Tense`, `Mood` appear nested inside the main values in `(hence …)` groups, e.g.:
  `HVvw3ms	Function=Verb ; Stem=Hishtaphel (hence Action=Causative/declarative; Voice=Reflexive/iterative); Form=Consecutive Imperfect (hence Tense=Past/present; Mood=Indicative); …`
- **Irregular records the parser must handle:**
  - `Hc` has a trailing `;` (`Function=Conjunction; Form=Consecutive;  `). `Hc` is the vav-consecutive prefix and starts 50,304 rows.
  - 33 records have trailing whitespace on the first line (`AC`, `HC`, `AD`, `HR`, `ARd`, …).
  - `ATa`/`HTd` contain literal parentheses inside a value that isn't a `(hence …)` group: `Form=Definite article (Aramaic)`.
  - `AVPj3mp`/`HVPj3mp` use lowercase `Mood=jussive`; every other record uses `Jussive`.
  - The misspelling `transtive` (also in TEGMC) appears in 248 `Action` values.
- **The existing `parse_tegmc_file` cannot be reused as-is.** On this file it drops `Hc` (empty piece after the trailing `;`) and splits inside `(hence …)` groups, producing values like `('Stem', 'Hishtaphel (hence Action=Causative/declarative')`. It yields 920 codes, not 921.

### Coverage

Each `morph_code` was split on `/`, with the language letter carried forward onto later pieces (`HR/Ncfsa` → `HR`, `HNcfsa`):

- 469,294 of 469,321 piece occurrences resolve (**99.994%**). 742 of 743 distinct pieces resolve.
- 305,611 of 305,638 words resolve completely (**99.991%**).
- **The only miss is `//`**, which produces an empty piece (27 occurrences). `//` joins **two written words in one row**: 25 of the 27 are Q(K) rows, joined by a space or maqqef. The other two are Num 7:59 (text type `L(AH+B)`) and Song 6:12 (`L(a+V)`). Examples: `HVqp3ms//Ncmsa` (Gen 30:11), `HPi//Tm` (Exo 4:2), `HC/Npm//Ncmpc/Sp3ms` (2Ki 19:37). **`//` is a word break, not a code.**
- Pieces per word: 1 → 159,954 words; 2 → 128,436; 3 → 16,499; 4 → 747; 5 → 2.

### Pieces in the source vs. what's stored

- `surface_text`, `transliteration`, `gloss_contextual`, `morph_code` are byte-identical to TAHOT columns 2, 3, 4, 6 (1-based). 145,684 rows have `/` in the surface text, English, and morph code alike. 68,095 rows also keep a `\` punctuation segment (sof pasuq, maqqef, paseq).
- **Lost at import:** every prefix/suffix Strong's piece (H9001–H9049; 163,644 pieces across 145,675 rows), the 71,165 `\H90xx` punctuation tags, and the extra root on the 37 rows that have two `{root}` tags (only the first is kept).
- **Alignment:** pieces line up one-to-one across surface text, dStrongs, morph, and column 12 in **305,636 of 305,638 rows**. The two exceptions (1Ch 27:12, Neh 2:13) have a `\׀` paseq before a `/`.

Real examples, raw TAHOT (Hebrew · dStrongs · grammar · column 12):

| Ref | Raw | Stored today |
|---|---|---|
| Gen 1:1 #01 | `בְּ/רֵאשִׁ֖ית` · `H9003/{H7225G}` · `HR/Ncfsa` · `H9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first:1_beginning}` | strongs `H7225G`, gloss_dictionary "beginning"; H9003 "in" gone |
| Gen 1:1 #07 | `הָ/אָֽרֶץ\׃` · `H9009/{H0776G}\H9016` · `HTd/Ncfsa` · `…{H0776G=אֶ֫רֶץ=: country;_planet»land:2_country;_planet}\H9016=׃=verseEnd` | strongs `H0776G`, gloss_dictionary **"country;_planet" (wrong — see below)** |
| Gen 1:3 #01 | `וַ/יֹּ֥אמֶר` · `H9001/{H0559}` · `Hc/Vqw3ms` · `H9001=ו=&/{H0559=אָמַר=to say}` | strongs `H0559`, "to say"; H9001 "&" gone |
| Gen 2:2 #05 | `מְלַאכְתּ֖/וֹ` · `{H4399}/H9023` · `HNcfsc/Sp3ms` · `{H4399=מְלָאכָה=work}/H9023=Ps3m=his` | strongs `H4399`, "work"; "his" survives only inside the contextual "work/ his" |

### The `gloss_dictionary` bug

For some entries, column 12's gloss slot holds the sub-meaning (it begins with `: `), and the real gloss comes after `»`, before the next `:` — e.g. `=: country;_planet»land:2_country;_planet` → real gloss **"land"**. The current parser takes the text before `»`. This affects **7,752 Hebrew rows across 69 Strong's numbers**, including H0776G (2,318 rows), H1931 "he;_she;_it" (1,878), and H5650 "servant;_slave" (801).

### Aramaic

4,827 Hebrew rows have morph codes starting with `A`: Daniel 2:4–7:28 (3,600), Ezra 4:8–6:18 and 7:12–26 (1,212), Jeremiah 10:11 (15). Daniel 2:4 is mixed: its first 4 words (through "in Aramaic") are tagged `H`. Genesis 31:47's יְגַ֖ר שָׂהֲדוּתָ֑א is tagged `HNpl`, not Aramaic. Per Ember's authenticity principle, Ember shows the data as tagged and doesn't patch it by hand.

### Ketiv/Qere and other text types

- The text type follows `=` in the reference field. TAHOT's text follows the Qere (the form read aloud) and records the Ketiv (the form written in the consonants) as a variant: in **column 7 (Meaning variant)** or **column 8 (Spelling variant)**, with Leningrad's own form in column 8 as `L=`.
- **Q(K)** — the Ketiv changes the meaning: 1,013 rows. All have `K=` in column 7, and 1,012 have `L=` in column 8. Example: Gen 9:21, column 7 `K= 'o.ho.Lo/h (אָהֳלֹ/ה\׃)`.
- **Q(k)** — the Ketiv differs only in spelling: 310 rows. All have `K=` and `L=` in column 8. Example: Gen 8:17, `L= הַוְצֵ֣א ¦ ;K= הוֹצֵא`.
- **Other text types:** `L` 303,861; `X` 152; `R` 27; plus 29 more variant-letter types (`L(p)` 115, `L(abh)` 76, `LA(bh)` 25, …). 1,791 rows have something other than plain `L`.
- **Lost at import:** the text type on every row; all of columns 7 and 8 (1,035 Meaning-variant rows, 1,592 Spelling-variant rows), so every Ketiv form (1,323) and every Aleppo/BHS/LXX variant.
- **14 "ghost" rows** (Q(K), empty Hebrew column, English `[ ]`) are skipped at import. Their only content is an `L=` form in column 8 (e.g. Rut 3:12 `L= אם`).

### Upstream drift since STEPBible-Data `faf6a35`

Of 119 STEPBible-Data commits between `faf6a35` and `ed476a8`, only TAHOT Job–Song changed (+21/−25 lines). In **Psa 44:14, 57:9, 108:3, 149:7**, the two `L` rows `בַּל\־ אֻמִּֽים` were replaced by one row with a **new text type `V`**: `בָּ/לְאֻמִּים\׃`, strongs `H3816`, morph `HRd/Ncfpa`. A rebuild from master removes 4 Hebrew rows net and shifts word positions in those four verses. Nothing in Ember depends on word positions today (`note_anchors.word_position` is schema-only, no runtime code; see `BUILD_6.1_ACTUAL_STATE.md` §7). TAGNT is unchanged.

---

## Scope

### In Scope

1. **Rebuild `language.db` from STEPBible-Data master**, recording the STEPBible-Data commit (`ed476a8` or later, re-verified at build time). Handle the new `V` text type.
2. **Fix the `gloss_dictionary` bug** (7,752 rows, 69 Strong's numbers).
3. **Two small new tables for the anatomy view, storing only what isn't already stored**: `original_word_pieces` (per-piece Strong's numbers for multi-piece words) and `hebrew_affixes` (the fixed set of prefix/suffix glosses). Each piece's Hebrew, morph code, and contextual gloss are split at display time from the `/`-separated columns `original_words` already has.
4. **New table `original_word_variants`**: text type and raw variant columns, with the Ketiv parsed out, for every Hebrew row that isn't plain `L` or has a variant.
5. **New TEHMC parser + `step_morphology_hebrew` table.**
6. **Hebrew decode path** in `grammar-decode.js`.
7. **Authored Hebrew wording tables** (stem, conjugation, state, and the Hebrew values of shared categories).
8. **Tier 2 anatomy view** for Hebrew; **Aramaic label** in tier 1; **Ketiv line** in tier 2.
9. **Attribution:** add TEHMC to the existing credits list.
10. **Verification:** a new `hebrew` scenario in `tests/verify.py`; `FEATURE_INVENTORY.md` updated.
11. **Size limit:** `language.db` may grow by no more than about 10% (see Item 10).

### Out of Scope (Explicit)

- **Hebrew lexicon (tier 3).** Separate spec; see Deferred.
- **Root families** ("other words from this root"). Needs lexicon data first.
- **Showing Aleppo/BHS/LXX and other non-Ketiv variants.** Captured in `original_word_variants` at import so a later spec needs no rebuild, but not shown.
- **The 14 ghost rows.** Still skipped. Their `L=` forms are Ketiv-only words with no Qere to attach to, so they need their own display design. Documented, unchanged.
- **Hand corrections to upstream tagging** (e.g. Gen 31:47 tagged Hebrew).
- **Greek.** No change to TAGNT import, `step_morphology_greek`, the Greek decode path, or Greek tier 2. Greek rows must be identical after the rebuild (see Definition of Done).
- **Interlinear view layout, grouping, RTL handling.** Unchanged.
- **Punctuation/accent toggle.** Still tracked separately.

---

## Item 1: Rebuild from Master

- Download TAHOT (4 files), TAGNT (2), TBESG, TEGMC, and TEHMC from the recorded STEPBible-Data master commit. Record that commit and per-file sha256 values in `build_language.py`'s header comment or output log, as was done for STEPBible-Data `faf6a35`.
- **If STEPBible-Data master has moved past `ed476a8`** by build time, diff the source files between the two commits and report any changes before rebuilding. The counts in this spec are verified only against `ed476a8`.
- **`V` text type:** import like `L` (main text). Store the type in `original_word_variants` (Item 4) so it stays visible in the data.
- **Expected counts** (re-verify against the actual run; don't hardcode): Hebrew rows = 305,638 − 4 = 305,634, before any change to ghost-row handling; Greek rows 142,096, unchanged.
- **Dev-workflow note:** an existing dev install has the old `language.db` seeded in OPFS. Clear that OPFS entry and re-seed after the rebuild, per `OPFS_Reseed_Gap.md`. This is the expected dev step, not a product gap.
- **Git history:** `language.db` is committed directly, not through Git LFS. That was decided when Build 6 shipped, on the basis that the file would be rebuilt only rarely. Each rebuild adds another full copy to repository history, so **every data change in this spec lands in this one rebuild.** Don't split it into several commits of `language.db`.

---

## Item 2: `gloss_dictionary` Fix

- When the column 12 gloss slot (text after the 2nd `=`) begins with `:`, the real gloss is the text after `»` and before the next `:`.
- **Derive the exact rule from all 69 affected Strong's numbers, not from the one example.** Before shipping, report a before/after table: Strong's number, old value, new value, row count. Confirm H0776G → "land".
- If any of the 69 doesn't fit the rule, stop and report it rather than guess.
- `lemma` comes from column 12's middle segment and is not affected; confirm with a count.
- **Underscores:** values like `servant;_slave` contain `_` for spaces. Check whether correctly parsed glosses elsewhere also contain `_`, and report how they're displayed today. If underscores currently reach the screen, replace them with spaces in the same rebuild and list the counts. Only display formatting changes; the source text stays authentic.

---

## Item 3: Piece Data — Store Only What's Missing

**Principle: don't store anything twice.** Each piece's Hebrew, morph code, and contextual gloss are already in `original_words`, separated by `/` in `surface_text`, `morph_code`, and `gloss_contextual`. The app splits them when it renders. Only two things are actually missing per piece: **its Strong's number** and **its dictionary gloss**. Prefixes and suffixes come from a small fixed set (H9001–H9049), so their glosses go in a lookup table instead of being repeated on every word.

Both tables are new, so `original_words` keeps its columns and meaning, per Ember's "new rows, not schema changes" principle.

```sql
-- One row per multi-piece Hebrew word only (~145,700 rows). One-piece words get no row.
CREATE TABLE original_word_pieces (
    word_id        INTEGER PRIMARY KEY,  -- original_words.id (rowid alias: no separate index)
    piece_strongs  TEXT NOT NULL,        -- per-piece Strong's in reading order, same '//' and '/' structure as the
                                         --   split columns, punctuation stripped, braces dropped:
                                         --   'H9003/H7225G', 'H9001/H0559', 'H4399/H9023'
    root_glosses   TEXT                  -- NULL except the 37 two-root rows: '/'-joined dictionary glosses of the
                                         --   roots in order (the first root's gloss also stays in original_words)
);

-- The fixed set of prefix/suffix Strong's numbers (~49 rows).
CREATE TABLE hebrew_affixes (
    strongs_number  TEXT PRIMARY KEY,    -- 'H9001' … 'H9049'
    form            TEXT,                -- column 12's middle segment as written ('ו', 'ב', 'Ps3m', …)
    gloss           TEXT                 -- column 12's gloss as written ('&', 'in', 'his', …)
);
```

### Import rules

- **Hebrew only.** Greek words have no rows in either table.
- **The piece's role comes from the data.** The root is the `{…}` piece in column 6/dStrongs; pieces before it are prefixes, pieces after it are suffixes. The importer uses the braces to identify the root, then drops them from `piece_strongs`. At runtime the role is identified the same way: a piece whose Strong's number is in `hebrew_affixes` is a prefix or suffix, depending on its position relative to the root; anything else is a root.
- **Affix glosses must be constant.** Before writing `hebrew_affixes`, check that every H90xx number has exactly one `(form, gloss)` pair across all its occurrences. **If any affix varies, stop and report** the variants with counts. Don't pick the most common one.
- **Punctuation segments (`\…`) are not pieces.** Strip them from every column before splitting, so they never shift the alignment. They stay in `original_words.surface_text`, unchanged. The 71,165 punctuation tags (H9016 etc.) are not stored.
- **Split order:** `//` first (two written words in one row), then `/` (pieces).
- **Write a row only when every column agrees.** For each multi-piece word, `surface_text`, `morph_code`, `gloss_contextual`, dStrongs, and column 12 must split into the same number of subwords and pieces, after punctuation is stripped. If they don't, **write no row for that word** and list it in the report. The UI then falls back to the raw code. This check at import is what makes it safe to split the columns at display time.
- **The two paseq rows** (1Ch 27:12, Neh 2:13) must pass once `\׀` is stripped. Verify them explicitly.
- **Check `gloss_contextual` splits cleanly.** CC confirmed the slashes match across surface text, English, and morph code on 145,684 rows. Also confirm the English column contains no `/` that isn't a piece break, and check how `//` rows look in the English column. Report the results.
- **Glosses are stored as TAHOT wrote them** (e.g. `&` for H9001). Display changes go in Item 6's authored tables, not in the data.
- **Report:** rows written, rows skipped and why, the full `hebrew_affixes` table, and 5 samples (Gen 1:1 #01, Gen 1:3 #01, Gen 2:2 #05, 2Ki 19:37's `//` row, 1Ch 27:12's paseq row) showing raw TAHOT, the stored row, and what the runtime split produces.

### Runtime split — one implementation

A pure function in `grammar-decode.js`, e.g. `splitHebrewWord(word, pieceRow)` → `[{ subwordIndex, pieces: [{ surface, morphCode, glossContextual, strongsNumber, role }] }]`. It applies exactly the import's rules: strip `\` punctuation segments, split on `//` then `/`, carry the language letter forward on morph codes. **Both the anatomy view and the Hebrew decode path (Item 6) call this one function.** Don't write a second copy of the splitting rules. If the split counts don't match at runtime (they shouldn't, given the import check), return `null` so the caller shows the raw-code fallback.

---

## Item 4: `original_word_variants`

```sql
CREATE TABLE original_word_variants (
    word_id            INTEGER PRIMARY KEY,  -- original_words.id
    text_type          TEXT NOT NULL,        -- raw, e.g. 'Q(K)', 'Q(k)', 'X', 'R', 'V', 'L(p)'
    meaning_variants   TEXT,                 -- TAHOT col 7, raw
    spelling_variants  TEXT,                 -- TAHOT col 8, raw
    ketiv_hebrew       TEXT,                 -- parsed Ketiv Hebrew, only for Q(K)/Q(k), when it parses cleanly
    ketiv_kind         TEXT                  -- 'meaning' (Q(K)) | 'spelling' (Q(k)) | NULL
);
```

- **One row per Hebrew word whose text type isn't plain `L`, or whose column 7 or 8 is non-empty.** Plain-`L` rows with no variants get no row; absence means "plain Leningrad text".
- **Raw columns are stored verbatim.** A later spec can show Aleppo/BHS/LXX variants without a rebuild.
- **Ketiv parsing:** from column 7's `K=` for Q(K), and column 8's `K=` for Q(k). The two formats differ (column 7 gives a transliteration followed by Hebrew in parentheses; column 8 gives Hebrew directly, `¦`/`;`-separated). Parse only what's verifiably the Ketiv Hebrew. Keep its slashes if present; strip `\` punctuation for display. **If a row doesn't parse cleanly, leave `ketiv_hebrew` NULL and report it** rather than guess. Target: all 1,323 parse; report the actual count.
- `L=` (Leningrad's own form) is not extracted into its own column. It's available in the raw column if a later spec needs it.

---

## Item 5: TEHMC Parser and `step_morphology_hebrew`

A separate parser function, `parse_tehmc_file`. Don't modify `parse_tegmc_file`; the Greek path must not change. Shared low-level helpers (record splitting on `$`, comma/quote normalization) may be factored out only if Greek output stays identical (see Definition of Done).

```sql
CREATE TABLE step_morphology_hebrew (
    code       TEXT NOT NULL,     -- e.g. 'HVvw3ms', 'HR', 'Hc', 'AVPj3mp'
    category   TEXT NOT NULL,     -- 'Function', 'Stem', 'Form', 'Action', ...
    value      TEXT NOT NULL,     -- normalized value
    derived    INTEGER NOT NULL,  -- 1 if it came from a '(hence …)' group, else 0
    position   INTEGER NOT NULL   -- order in the source line, so decode can respect source order where useful
);
CREATE INDEX idx_morph_hebrew_code ON step_morphology_hebrew(code);
```

Parser requirements, each from a real finding:

- Parse only the `FULL MORPHOLOGY CODES:` section. The `BRIEF LEXICAL MORPHOLOGY CODES` section is not imported; report what it contains.
- Strip the BOM. Handle the missing final `$`.
- **Split pairs on `;` only at nesting depth 0,** so `(hence A=x; B=y)` stays whole. Then unwrap each `(hence …)` group into its own `derived = 1` rows.
- **Only `(hence …)` counts as a nested group.** `Definite article (Aramaic)` is a plain value; keep its parentheses.
- **Drop empty pairs** (`Hc`'s trailing `;`), and trim whitespace on every key and value.
- **Normalize case on known values:** `jussive` → `Jussive`. Handle the `transtive` typo the same way the Greek path does today; check `grammar-decode.js`/`build_language.py` and match.
- Apply the same `‚` (U+201A) → `,` and stray-quote cleanup as TEGMC, defensively; report whether any occur.
- **Expected:** 921 codes (617 `H`, 304 `A`); report the row count. `Hc` must be present.

Read by one new query in `db.js`, `getHebrewMorphCategories(code)`, the counterpart of `getGreekMorphCategories(code)`.

---

## Item 6: Hebrew Decode and Wording Tables

### Decode (`grammar-decode.js`)

`decodeMorphCode(morphCode)` keeps its signature and return shape `[{ code, strongsNumber, lines }]`. The Greek path is untouched.

For a Hebrew or Aramaic code (first letter `H` or `A`):

1. Split the code with the **same splitting rules as Item 3's `splitHebrewWord()`**: strip `\…` punctuation, split on `//` then `/`. Factor the morph-code part into a shared helper that both call, so the rules exist in one place.
2. **Carry the language letter:** the first piece of each subword starts with `H`/`A`; prefix it onto every later piece that doesn't (`HR/Ncfsa` → `HR`, `HNcfsa`). Check against the data whether a subword after `//` restates its own letter, and handle both cases.
3. Look up each piece via `getHebrewMorphCategories()`. Return one entry per piece, in reading order (`strongsNumber: null`; the anatomy view gets Strong's numbers from `original_word_pieces`). Add `subwordIndex` to each entry; Greek entries simply don't have it.
4. A piece that doesn't resolve returns `lines: []`, the existing behavior, so the UI shows its raw code.

`decodeMorphCode` is synchronous or async exactly as it is today; don't change its call pattern.

### Authored wording tables

Like Greek's, these are **git-tracked authored content in `grammar-decode.js`**, not stored in `language.db`. TEHMC provides the scholarly parsing; Ember's tables say it in plain English, glossary-style (`"Singular - Just one"`), matching the Greek line style.

Tables needed:

- **Stem** (Hebrew and Aramaic: Qal, Niphal, Piel, Pual, Hiphil, Hophal, Hithpael, Hishtaphel, Peal, Pael, Haphel, Aphel, Ithpeel, …: the full set found in the data). **Requirement:** don't overstate stem meaning. "Piel = intensive" is a classroom simplification that's often wrong. Base the wording on TEHMC's own derived `Action`/`Voice` values, and hedge where they hedge ("often causative").
- **Form / conjugation.** **Requirement, the Hebrew counterpart of Greek's mood-aware tense rule:** the conjugation alone doesn't fix the time. "Imperfect" must not be phrased as future. Wording comes from TEHMC's derived `Tense`/`Mood` where TEHMC gives them, and is phrased as typical use, not certainty. Example: Consecutive Imperfect (*wayyiqtol*) → "Usually tells the next event in a story (past)". Consecutive Perfect (*weqatal*) gets the matching treatment.
- **State** — Absolute, Construct, Determined (Aramaic). Construct gets a plain-reading hint: "Construct - Read with the next word: 'X of …'".
- **Hebrew values of shared categories** (Function, Gender, Number, Person) — reuse Greek phrases where the meaning really matches; add Hebrew-only values (e.g. Gender "both", Number "dual").
- **Prefix and suffix pieces** (`HR`, `HC`, `Hc`, `HTd`, `HSp3ms`, …) usually decode to one or two lines. Keep them short. The anatomy line already shows the piece's gloss.
- **Display gloss map for H9001–H9049** (optional, small): if a stored prefix gloss reads badly on screen (`&`), map it to a display form ("and") here. Stored data stays as TAHOT wrote it.

The phrase tables cover every `(category, value)` pair actually used by the 742 resolving pieces. Report any pair left without wording and how it displays. The fallback is TEHMC's own value text, not a blank.

---

## Item 7: Word Card — Hebrew Display

### Tier 1

Unchanged, except: **Aramaic words get a small "Aramaic" label**, on its own line next to the morph code and styled like the Strong's line (secondary). Derived per word: the label shows when the word's morph code starts with `A`. Hebrew words show no language label (Hebrew is the default for the OT).

### Tier 2 (Hebrew)

Order, per member word:

1. **Lemma**, **Transliteration** — unchanged.
2. **Morphology** subheading, then:
   - **One-piece word:** decoded lines for its single code, exactly like Greek (raw code, then lines).
   - **Multi-piece word — the anatomy view:** the raw code, then one block per piece in reading order:
     ```
     HR/Ncfsa

     בְּ   Prefix · "in"
          Preposition

     רֵאשִׁית   Word · "beginning"
          Noun - Names a person, place, or thing
          Feminine
          Singular - Just one
          Absolute - Standing on its own
     ```
     Each piece shows its Hebrew (RTL, Ezra SIL, the same font as the verse line), its role label (Prefix / Word / Suffix), its contextual piece gloss, then its decoded lines. Piece blocks are visually separated (spacing or a light rule, per existing style), lighter than the divider between member words so the two levels read differently.
   - **`//` rows (two written words in one row):** the subwords render as two groups of pieces, each under the subword's own Hebrew.
   - **A word with no pieces stored** (alignment failure, Item 3): raw code plus whatever `decodeMorphCode()` returns, i.e. the same fallback as today.
3. **Ketiv line** — only for words with `ketiv_hebrew`:
   - Q(K): **"Written (Ketiv): הוֹצֵא"**, followed by a one-line note: *"The text is read as shown above (Qere); the written consonants differ and give a different reading."*
   - Q(k): the same line, with the note *"Spelling difference only."*
   - Exact wording can be adjusted during implementation. The two kinds must be distinguishable.
4. **Dictionary gloss ("General usage")** — unchanged, now with the Item 2 fix.

No Lexicon link for Hebrew (unchanged until the lexicon spec).

### Data access

- New `db.js` query: `getPiecesForWords(wordIds)` → `Map<wordId, { pieceStrongs, rootGlosses }>`, one query for all words in the rendered verse(s), batched like `getOriginalWordsForVerses`. No per-word query in the render loop. A word with no entry is either a one-piece word or an alignment skip; both use the single-code display.
- New `db.js` query: `getHebrewAffixes()` → `Map<strongsNumber, { form, gloss }>`. About 49 rows; load once and cache for the session, like `getBooks()`.
- **Each piece's dictionary gloss** at display time: from `hebrew_affixes` for prefixes and suffixes; for the root, from `original_words.gloss_dictionary` (or from `root_glosses` on the 37 two-root rows). Each piece's Hebrew, morph code, and contextual gloss come from `splitHebrewWord()` (Item 3).
- New `db.js` query: `getVariantsForWords(wordIds)` → `Map<wordId, variant>`, batched the same way.
- `getOriginalWordsForVerses()` keeps its signature. Whether pieces and variants are fetched eagerly with the verse or lazily on tier 2 expansion is the implementer's choice. Lazy is fine as long as `renderGeneration` guards against stale results.

---

## Item 8: Attribution

Add **TEHMC** (STEPBible.org, CC BY 4.0) to the existing credits list, next to TEGMC. No new attribution surface.

---

## Item 9: Verification

Add a `hebrew` scenario to `tests/verify.py`, checking at least:

| Verse | Check |
|---|---|
| Gen 1:1 #01 `בְּרֵאשִׁית` | Tier 2 shows 2 pieces: Prefix "in" + Word "beginning", each with decoded lines |
| Gen 1:1 #07 `הָאָרֶץ` | "General usage" reads "land" (bug fix); 2 pieces; sof pasuq not shown as a piece |
| Gen 1:3 #01 `וַיֹּאמֶר` | Prefix piece (`Hc`) decodes (proves the `Hc` parser fix); verb wording does not claim future/past as certain |
| Gen 2:2 #05 `מְלַאכְתּוֹ` | Suffix piece "his" |
| Gen 8:17 | Ketiv line, spelling-only note |
| Gen 9:21 | Ketiv line, meaning note |
| 2Ki 19:37 | `//` row renders two subword groups |
| 1Ch 27:12 | Paseq row aligns; pieces correct |
| Dan 2:4 | First 4 words have no Aramaic label; later words do |
| Dan 3:1 | Aramaic label; Aramaic stem wording (e.g. Peal/Haphel) present |
| Psa 44:14 | Upstream-changed `V` row renders correctly |
| Any one-piece word | Tier 2 looks like Greek's: no piece blocks |
| John 1:1 | Greek tier 2 unchanged |

Plus, at the data level (the build script's own report, not the browser):

- Greek rows and `step_morphology_greek` are **identical** to before the rebuild. Use `dbsnapshot`/`dbcompare` or a direct table diff.
- Hebrew `original_words` differs from the old database **only** in: the 4 Psalm verses (upstream change), `gloss_dictionary` on the 7,752 bug rows, and underscore display if Item 2 changes it. Report any other difference as a defect.
- Zero console errors except the documented FTS5→LIKE fallback warning. All existing scenarios still pass.

---

## Item 10: Size Limit

`language.db` should only grow when there's real value to add. Most of this spec adds features without adding data, so it should be cheap.

- **Measure the current `language.db` first** and record the baseline in the rebuild report. Project records disagree (56.5 MB at Build 6 ship, 51.3 MB later), so measure rather than assume.
- **Limit: no more than ~10% growth (≈5 MB) over the baseline.** The expected cost is small: `original_word_pieces` (~145,700 short rows on a rowid key), `original_word_variants` (a few thousand rows), `step_morphology_hebrew` (~7,000 rows, comparable to Greek's 9,214), and `hebrew_affixes` (~49 rows). Before the final commit, report the size after, plus each new table's size (e.g. via `dbstat` or by comparing builds with and without each table).
- **If the limit is exceeded, stop and report before committing `language.db`**, with the per-table breakdown and which table is responsible. Don't trim data to fit, and don't commit an oversized file. That's a decision for Wayne.
- Run `VACUUM` before measuring, so free pages from the build don't inflate the number.

---

## What Does Not Change

- Greek: TAGNT import, `step_lexicon_greek`, `step_morphology_greek`, `parse_tegmc_file`, the Greek decode path, Greek tier 1–3 display.
- `original_words` columns and meaning; `step_lexicon_greek`.
- `getOriginalWordsForVerses()`, `getGreekLexiconEntry()`, `getGreekMorphCategories()` signatures.
- Interlinear view: verse line, gloss list, grouping, RTL/LTR handling.
- Word card structure: tiers, one card open at a time, per-member expand/collapse, "This occurrence"/"General usage" labels.
- `core.db`: no schema change, no migration.
- `sw.js`: data files under `/data/` are not cached (since `94ca0fa`). If a new `js/` file is added, follow the precache rule (add to `PRECACHE`, bump `CACHE_NAME`); the `sw` scenario enforces it.

---

## Definition of Done

- [ ] `language.db` rebuilt from STEPBible-Data master; STEPBible-Data commit and per-file sha256 recorded (any changes since `ed476a8` diffed and reported); `V` text type imported as main text
- [ ] Hebrew row count matches the expected count (305,634 unless the rebuild report explains a difference); Greek rows 142,096
- [ ] `gloss_dictionary` fix applied; before/after table for all 69 affected Strong's numbers reported; H0776G reads "land"; underscore handling checked and reported
- [ ] `original_word_pieces` populated for multi-piece Hebrew words only, storing per-piece Strong's numbers (plus `root_glosses` on two-root rows) and nothing that's already in `original_words`; rows written only where every column splits identically; alignment report (rows written, rows skipped with reasons, 5 samples showing raw, stored, and runtime split); both paseq rows pass; `//` rows split into subwords
- [ ] `hebrew_affixes` populated; every affix confirmed to have one constant `(form, gloss)`, or the build stopped and reported the variants
- [ ] `splitHebrewWord()` is the single implementation of the splitting rules, shared with the Hebrew decode path
- [ ] `original_word_variants` populated; all raw text types and columns 7/8 kept; `ketiv_hebrew` parsed for Q(K)/Q(k) with a count reported (target 1,323); unparsed rows left NULL and listed
- [ ] `parse_tehmc_file` written; `parse_tegmc_file` unchanged; 921 codes in `step_morphology_hebrew`, including `Hc`; `(hence …)` groups unwrapped as `derived` rows; `Definite article (Aramaic)` kept whole; `jussive` normalized
- [ ] `getHebrewMorphCategories()`, `getPiecesForWords()`, `getVariantsForWords()`, `getHebrewAffixes()` (cached) added to `db.js`; batched, no per-word queries in the render loop
- [ ] Size limit met: baseline and final `language.db` sizes (after `VACUUM`) reported with a per-table breakdown; growth ≤ ~10%, or the build stopped and reported before committing
- [ ] All data changes landed in one `language.db` commit
- [ ] `decodeMorphCode()` Hebrew path: punctuation stripped, `//` and `/` split, language letter carried, one entry per piece; Greek output unchanged
- [ ] Wording tables cover every used `(category, value)` pair, or fall back to TEHMC's text, with a list of the fallbacks; stem wording hedged; conjugation wording makes no certain time claims
- [ ] Tier 1: Aramaic label on `A`-coded words only
- [ ] Tier 2: one-piece Hebrew words decode like Greek; multi-piece words show the anatomy view (piece Hebrew, role, piece gloss, decoded lines); Ketiv line with distinct meaning/spelling notes; "General usage" fixed
- [ ] TEHMC credited in the existing attribution list
- [ ] `tests/verify.py hebrew` scenario added and passing; all existing scenarios still pass; Greek data identical before and after
- [ ] `FEATURE_INVENTORY.md` updated; `USER_MANUAL.md` Language-tab section updated for the anatomy view, the Aramaic label, and the Ketiv line
- [ ] Verified live in the browser, zero console errors apart from the documented FTS5 warning

---

## Open Questions for Implementation

1. **Piece block styling**: indent, rule, or spacing, decided against `css/style.css`. It must read as lighter than the divider between member words.
2. **Long anatomy cards**: a grouped row of several 3–4-piece words could get tall. Check the auto-scroll fallback from the Inspector spec against the tallest real case.
3. **Display glosses for H9001–H9049**: whether any besides `&` need a display form. Decide after seeing them on screen.
4. **Whether the Ketiv note text should link to a short Help entry** explaining Ketiv/Qere. Help copy is stale anyway (`BUILD_6.1_ACTUAL_STATE.md` §7); a pointer can wait for the Help build.

---

## Deferred to Follow-Up Specs

- **Hebrew lexicon (tier 3)** — candidate source: openscriptures/HebrewLexicon (`21c9add`, CC BY 4.0 per its readme; BDB and Strong's text public domain; about 3 MB for BDB + Strong's). Verified 2026-10-24: 93.0% of word occurrences reach a BDB entry with a `<def>`, but definitions are short (median 48 characters). STEP's sense letters and OSHB's are **different schemes**: 38 coinciding letters point to different senses, and 254 STEP codes don't map. The safe approach is to match on the **base Strong's number only** and show the complete Strong's Hebrew entry plus every BDB definition under that number, never guessing a sense letter. Decision pending: read a sample of real entries to judge whether the depth is worth it, the same approach as TFLSJ. **If it goes ahead, consider a separate file** (e.g. `data/lexicon-hebrew.db`, loaded lazily like `language.db`) rather than adding to `language.db`. That keeps an optional lexicon from forcing another full `language.db` copy into git history, and would serve TFLSJ equally well if that ever goes ahead.
- **Root families** — after the lexicon.
- **Displaying non-Ketiv variants** (Aleppo, BHS, LXX) — data already captured in `original_word_variants`.
- **Ghost rows** (14 Ketiv-only words) — need their own display design.
