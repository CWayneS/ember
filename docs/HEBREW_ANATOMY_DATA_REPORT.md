# Hebrew Word Anatomy — Data Report

Build record for `docs/Hebrew_Word_Anatomy_Spec.md`: one section per prompt, written as each one ran. The data phase (D1–D6) covers Items 1–5 and 10; the UI phase (U1–U5) covers the rest. Scripts behind these numbers are in `scripts/analysis/hebrew_anatomy/`.

**Status (2026-10-25): implemented.** The data phase (D1–D6) and UI phase (U1–U5) are complete and committed together. All 14 rebuild checks pass, and `language.db` grows 7.82% (limit 10%). Decisions taken along the way:
- D1: braces kept in `piece_strongs`; `#N` normalization.
- D2: gloss option C.
- D4: affix option A and two role rules.
- D6: commit timing.
- U2–U3: wording, layout and display forms approved as built.

Each is recorded in its section below.

---

## D1 — Sources pinned, baseline recorded (2026-10-25)

### Upstream commit

STEPBible-Data master has moved past the spec's `ed476a8` (2026-10-17). It is now at **`be4191f0082aeedddb0eff0c02c966292b2bd641` (2026-10-24)**, one commit ahead. That commit changes only `Proper Nouns/TIPNR …txt` (+7/−17), which Ember does not use. **Every source file the build reads is byte-identical to `ed476a8`**, so the spec's counts still apply. The rebuild is pinned to `be4191f`.

| File (build name) | sha256 | Bytes | Last changed | = `ed476a8` | = `faf6a35` |
|---|---|---|---|---|---|
| TAGNT_Act-Rev.txt | `524e32375361e6d3fa2f7ef00b87605fdc4317a762f395651a05fdc31ad031b7` | 15,939,932 | `5af0326` 2024-12-19 | Y | Y |
| TAGNT_Mat-Jhn.txt | `ab8eaaeb68e17a1dcfa34e1e9350358f22f03bc2a97244d848750ad81044bc8e` | 14,189,032 | `051e2bc` 2024-12-08 | Y | Y |
| TAHOT_Gen-Deu.txt | `e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b` | 18,190,455 | `f35ad49` 2025-01-29 | Y | Y |
| TAHOT_Isa-Mal.txt | `f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5` | 17,977,518 | `8d43f05` 2025-08-16 | Y | Y |
| TAHOT_Job-Sng.txt | `bb508af3af07822fca84cc43a0eba79eb70eecf672aabc0245b8d8cecf329d96` | 9,540,623 | `9592704` 2026-10-06 | Y | **N** |
| TAHOT_Jos-Est.txt | `195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775` | 24,500,317 | `0f60797` 2025-09-02 | Y | Y |
| TBESG.txt | `312f723d7b8ef263bbdfb0451c9b8057125804dfff390b6f8544cff2a84b57f4` | 4,736,912 | `805360e` 2025-04-16 | Y | Y |
| TEGMC.txt | `5f0416f7617019a6082285214903bde569a980d5fd3b88b8d7020d944e94de82` | 467,056 | `faf6a35` 2026-03-27 | Y | Y |
| TEHMC.txt | `78779bea824b31d4467dec0161d547481c86f266bc39def12cd11dc7dcbe6da7` | 394,580 | `faf6a35` 2026-03-27 | Y | Y |

TEHMC's sha256 matches the spec. The upstream paths are in `fetch_sources.sh`. Files are fetched with `git show <pin>:<path>`, never from a branch URL. A second fetch with that script reproduced all nine files byte for byte.

The files in `data/stepbible-prep/raw/` are the `faf6a35` copies (all eight match), so they are left in place. `scripts/analysis/hebrew_parity/tahot_join.py` needs them to line up with the shipped database. **The pinned files are in `data/stepbible-prep/raw/be4191f/`** (gitignored along with the rest of `raw/`; hashes re-checked after copying). Every later build uses `--raw-dir data/stepbible-prep/raw/be4191f`.

### What changed in TAHOT Job–Song (`faf6a35` → `be4191f`)

Raw diff: 25 lines removed and 21 added. Of those, 16 removed and 16 added are `#` verse-summary comment lines, which the parser skips. The data rows:

- **Psa 44:14, 57:9, 108:3, 149:7:** the two `L` rows `בַּל\־` (H1077 "not", `HTn`) + `אֻמִּֽים\׃` (H0523, `HNcmpa`) become one `V` row `בָּ/לְאֻמִּים\׃`, `H9003/{H3816}\H9016`, `HRd/Ncfpa`, English "among the/ peoples". Leningrad's own two-word form is kept in **column 7** as `L= bal/-/'u.Mim (בַּל/־/אֻמִּֽים\׃) "not// peoples" (H1077//H0523=Hn//Ncfpa)`. That's a meaning variant, so D5 will see these 4 rows as `V` + column 7.
- **Psa 42:4 #08:** column 7 changed from empty to a single space. No other column changed. **Consequence for D5:** a whitespace-only column 7/8 must count as empty, or this row gets a variants row it shouldn't.

That accounts for every changed data line.

### New finding: a `#N` form of column 12 the current parser can't read

The 4 new `V` rows write column 12 with instance numbers inside each tag: `H9003#1=ב=in/{H3816#4=לְאֹם=people}\H9016#7=׃=verseEnd`. The current `EXPANDED_TAG_RE` (`\{[HG]\d+[A-Za-z]?=…`) doesn't allow `#4` there, so these rows would be imported with **`lemma` and `gloss_dictionary` NULL**. The pinned-source test build below confirms it.

Exactly 5 rows in the pinned TAHOT use this form: the 4 `V` rows and **1Ch 18:10 #09** `ל֨/וֹ` (`H9005#1=ל=to/{H9033#6=Os3m=him}`). That last row is in the `faf6a35` files too, so **it is already broken in the shipped database**: `lemma` and `gloss_dictionary` are NULL (the only NULL lemma/gloss among 305,638 Hebrew rows). Fixing it changes this row's `lemma`/`gloss_dictionary` from NULL to `Os3m` / `him`. That is a Hebrew difference **outside the spec's allowed set** (the 4 Psalm verses, the 7,752 gloss rows, underscores). D2 will propose the fix and list this row explicitly for your decision.

The fix goes in as **one normalization of the whole of column 12**: drop the `#\d+` after every Strong's number before any parsing. It shouldn't be only a change to the root regex, because D4 reads the affix tags from the same column. Without the normalization, `H9003#1` wouldn't match `H9003` and those 5 rows would fail the affix check.

### Decision needed before D4: an H90xx number can be the root

1Ch 18:10's root is `{H9033}`, a pronoun-suffix number in braces. That is TAHOT's normal tagging when a pronoun stands alone after a preposition: the pronoun is the root. **6,081 Hebrew rows** have an H90xx number as their braced root:

Column 12's form and gloss for each, as written:

| Root | Col 12 | Rows | | Root | Col 12 | Rows |
|---|---|---|---|---|---|---|
| H9033 | `Os3m` him | 1,551 | | H9035 | `Op1c` us | 272 |
| H9038 | `Op3m` them | 1,125 | | H9039 | `Op3f` them | 54 |
| H9030 | `Os1c` me | 909 | | H9005 | `ל` to | 25 |
| H9031 | `Os2m` you | 728 | | H9007 | `ש` which | 1 |
| H9036 | `Op2m` you | 591 | | H9008 | `ה` ¿ | 1 |
| H9034 | `Os3f` her | 490 | | H9037 | `Op2f` you | 1 |
| H9032 | `Os2f` you | 333 | | **Total** | | **6,081** |

Typical shapes: `H9005/{H9033}` `HR/Sp3ms` לוֹ "to him" (1,112 rows across `HR`/`HRd`); `H9003/{H9038}` בָּהֶם "in them". Other shapes:
- **22 rows** of Aramaic `H9004/{H9005}` כְּל.
- **One number can play both roles in one word:** 1Sa 2:3 `וְ/ל֥/וֹ` is `H9002/{H9005}/H9033`, with H9005 as the root and H9033 as a suffix.
- **Deu 32:6** is a one-piece `{H9008}` interrogative הֲ.

**What this breaks in the spec.** Item 3 says the importer drops the braces from `piece_strongs`, and that at runtime "a piece whose Strong's number is in `hebrew_affixes` is a prefix or suffix … anything else is a root." On these 6,081 words that rule finds no root and labels the pronoun as a suffix. Once the braces are gone, nothing stored marks which piece is the root.

**Recommendation: keep the braces in `piece_strongs`**, e.g. `H9005/{H9033}`, `H9003/{H7225G}`. The role then comes straight from the data, as it does at import: the braced piece is the root, earlier pieces are prefixes, later ones are suffixes. It covers the 37 two-root rows with no extra rule. It costs about 2 bytes per multi-piece word (~0.3 MB before page packing; D6 will measure it).

The alternatives:
- **A `root_index` column:** cheaper per row but a second representation of the same fact.
- **Matching against `original_words.strongs_number`:** no extra storage, but ambiguous whenever the root's number also appears elsewhere in the word.

A side note for D4: H9032 is `Os2f` ("you", feminine) in column 12, but 153 of its 333 root occurrences have a masculine `Sp2ms` morph code. That is upstream tagging, recorded here and not corrected. The anatomy view will show TEHMC's reading of the morph code next to the column-12 gloss.

This needs your decision before D4 writes the table. D2 and D3 don't depend on it.

### Decisions (Wayne, 2026-10-25, after D1 review)

1. **`#N` normalization approved**, including 1Ch 18:10 #09's `lemma`/`gloss_dictionary` going from NULL to `Os3m`/`him`. That row joins the allowed Hebrew differences in D6.
2. **Braces are kept in `piece_strongs`** (`H9005/{H9033}`). The braced piece is the root, earlier pieces are prefixes, later ones are suffixes, at import and at runtime alike. This replaces the spec's "drop the braces" and the "in `hebrew_affixes` means affix" runtime rule.

### Baseline (`data/language.db` at `8169e14`, untouched)

| | |
|---|---|
| Size | **59,740,160 bytes** (57.0 MiB). A copy vacuumed with `VACUUM` is the same size: the build already ends with `VACUUM`. This measured number replaces the conflicting 56.5 MB / 51.3 MB project records. |
| sha256 | `df2b8394c8a31fd0d106118bbf629c1e98cb13b2f41ef4054336e4053e27557c` |
| **Size limit (Item 10)** | +10% = **65,714,176 bytes** (≤ 5,974,016 bytes of growth) |
| `original_words` | 447,734 = 305,638 Hebrew (ids 1–305,638) + 142,096 Greek (ids 305,639–447,734) |
| Groups | Hebrew 766 (`group_id` 1–767, one orphan cleared), Greek 34,213 (`group_id` 768–34,980) |
| `step_lexicon_greek` | 11,035 |
| `step_morphology_greek` | 9,214 rows, 1,644 codes |
| NULL lemma / gloss_dictionary | Greek 0 / 0; Hebrew 1 / 1 (1Ch 18:10 #09, above) |
| `(language, verse_id, word_position)` | unique (0 duplicates), so it can serve as the comparison key |

Per-table size (dbstat, bytes): `original_words` 41,730,048; `idx_original_words_strongs` 6,418,432; `idx_original_words_verse` 5,718,016; `step_lexicon_greek` 5,238,784; `step_morphology_greek` 319,488; `idx_step_morphology_greek_code` 155,648; `sqlite_autoindex_step_lexicon_greek_1` 151,552.

The baseline can always be recovered from git (`git show 8169e14:data/language.db`). The build no longer overwrites it (below).

### Why the comparison doesn't use row ids

Hebrew rows are inserted before Greek ones. With 4 fewer Hebrew rows, every Greek `original_words.id` shifts by 4. `group_id` comes from one global counter, so a change in the Hebrew group count would renumber every Greek group. `compare_language_db.py` therefore:
- keys rows by `(language, verse_id, word_position)`;
- compares the seven content columns;
- compares `group_id` as **membership** (the set of keys sharing a group);
- compares `step_lexicon_greek` by key and `step_morphology_greek` as an ordered list without ids.

### Build-script changes (D1 only; no data logic touched)

- `--raw-dir DIR`: where to read the sources from (default unchanged: `data/stepbible-prep/raw/`).
- `--output PATH`: the build artifact path (default unchanged).
- **`--ship`**: copy the build to `data/language.db`. Without it, nothing is copied. Before this change, every run overwrote the tracked shipped file. README's build line now says `--ship`.
- The sha256 of every source file is printed at the start of each run (Item 1's output log).

### Checks of the build and the comparison tool

| Build | Result vs. baseline |
|---|---|
| A: current code + `faf6a35` sources | **Byte-identical** (sha256 `df2b8394…`). The build is reproducible, so any difference in D6 comes from the code or source changes, not from the build itself. |
| B: current code + `be4191f` sources | Greek identical: 142,096 rows, all content, all 34,213 group memberships, lexicon, morphology in order. Hebrew: 305,634 rows (−4, as the spec expects). Differences only in Psa 44:14, 57:9, 108:3, 149:7 (4 removed keys, plus 4 changed rows at the merged position). **Lemma and gloss are NULL on the 4 new rows** (the `#N` finding). Group memberships unchanged (766). |

Build B shows the comparison tool reports a real difference correctly, not just an empty one.

---

## D2 — `gloss_dictionary` fix: stopped, decision needed (2026-10-25)

**Result: the spec's stop condition fired.** The spec's 69 Strong's numbers don't all fit its rule, and the rule, applied to every row of the shape it describes, changes **56,676 rows across 598 Strong's numbers**, not 7,752. STEP's own Hebrew lexicon (TBESH, below) shows the dictionary gloss for a sense number is neither the value stored today nor the spec's value, but the two combined. No build code has been changed for D2. Scripts: `scripts/analysis/hebrew_anatomy/gloss_slot_survey.py` and `tbesh_gloss_check.py` (both use the pinned sources and build_language.py's own row rules).

### What "69 Strong's numbers / 7,752 rows" actually counts

It is exactly the set of stored Hebrew `gloss_dictionary` values that contain `;` or `_` (69 / 7,752 in the shipped database, reproduced to the row). It mixes two unrelated things:

- **Values the spec's rule changes** (51 of the 69, 4,902 rows): 50 colon-form glosses (e.g. H0776G `country;_planet`) plus Pro 26:17's malformed H5674C slot.
- **Plain glosses that contain `;_` or `_`** (18 of the 69, 2,850 rows), e.g. H1931 `he;_she;_it` and H5650 `servant;_slave`, two of the spec's three examples. These have no `»` at all. Today's parser reads them exactly as TAHOT writes them; the only issue is the underscores.

### What column 12's gloss slot really holds

Every root tag's gloss slot (text after the 2nd `=`) has one of three shapes (305,634 rows, pinned sources):

| Shape | Rows | Example |
|---|---|---|
| plain | 194,607 | `{H1254A=בָּרָא=to create}` |
| plain with `»` | 39,845 | `{H0430G=…=God»LORD@Gen.1.1-Heb}` (name IDs), `{H1121H=…=son»son:9_youngAnimal)}` |
| **`:`-form** | **71,182** (667 Strong's numbers) | `{H6440J=פָּנֶה=: surface»face:4_surface;_land}` |

The `:`-form reads as **`: <this sense's gloss>»<base word's gloss>:<sense number>_<sense label>`**. STEP's extended Strong's numbers (the letter suffix: H6440**J**) each mark one sense of a word. The `:`-form tag gives that sense's own gloss first, then the gloss of the undivided base word with the sense number. Evidence:
- every sense of one word shares the text after `»`: H7121G/H/I/J are `call_to` / `call_by` / `call_out` / `read_out` before `»` and all `to call` after it;
- H1004B/M/Q are all `house` after `»`;
- the number after the second `:` is the sense number within the base word.

TAHOT's own header says column 12 carries "an English gloss, and its sub-meaning after » where appropriate". That is accurate for the plain-with-`»` shape. For the `:`-form, the leading `:` turns the order around.

Today's parser takes the **sense gloss** (before `»`). The spec's rule takes the **base gloss** (after `»`). Neither is a parsing error. They are two different, deliberate values.

### What the spec's rule would do

Rule as tested: if the slot starts with `:`, take the text after `»`. In every shape, cut a trailing `:<digits>_…`. Every one of the 71,182 `:`-form slots fits this pattern: no empty results and no leftover `:` (the 34 values still containing `:` are untouched place names such as `(KJV: the great sea; …)`).

Largest changes:

| Strong's | Old (stored today) | New | Rows |
|---|---|---|---|
| H1121A | child | son | 3,053 |
| H0776G | country;_planet | land | 2,318 |
| H0935G | come | to come (in) | 1,937 |
| H3117G | day | day;_when | 1,936 |
| H6213A | do | to make | 1,751 |
| H1121G | descendant | son | 1,560 |
| H6440G | before | face | 1,387 |
| H5414G | give | to give | 1,315 |
| H7200G | see | to see | 1,198 |
| H1696G | speak | to speak | 1,058 |
| H8085G | hear | to hear | 965 |
| H1980G | went | to go | 944 |
| H1004B | home | house | 898 |
| H3947G | take | to take | 771 |
| H6213H | make(OBJECT) | to make | 740 |
| H7971G | depart | to send | 669 |
| H1004M | home | house | 664 |
| H7725G | return | to return | 628 |
| H3318G | come | to come out | 623 |
| H5927G | rise | to ascend | 618 |
| H3027H | power | hand | 580 |
| H0935P | bring | to come (in) | 555 |
| H0376I | anyone | man | 546 |
| H1419A | large | great | 497 |
| H5674A | pass | to pass | 495 |
| H5975G | stand | to stand | 452 |
| H2022G | mount | mountain | 451 |
| H0802H | wife | woman | 442 |
| H1004Q | home | house | 398 |
| H5414H | put | to give | 395 |

A sample of the senses that would be lost, by row count: H6440G לִפְנֵי `before` → `face` (1,387); H1121G `descendant` → `son` (1,560); H3027H `power` → `hand` (580); H0376I `anyone` → `man` (546); H7971G `depart` → `to send` (669); H7901I `have_sex` → `to lie down` (50); H7901J `be_dead` → `to lie down` (45); H5414M `cry_out` → `to give` (26); H5414Q `if_only[wishing]` → `to give` (25); H0518H `surely_no` → `if` (104); H8478J `because_of` → `underneath` (23); H6310L `one_third` → `lip` (2). In each case the dStrong exists to mark the sense that the rule replaces with the base word.

The rule's gains are real but narrower: H0776G/H0127I/H7704G `country;_planet` → `land` (2,638), and verbs gaining the dictionary-style "to …" (`see` → `to see`).

### The spec's 69, one by one

| Strong's | Slot form | Old (stored today) | New | Rows | Changes? |
|---|---|---|---|---|---|
| H0127I | ':' | country;_planet | land | 23 | yes |
| H0241I | ':' | to[ears_of](PERSON) | ear | 34 | yes |
| H0518A | ':' | surely_no | if | 1 | yes |
| H0518H | ':' | surely_no | if | 104 | yes |
| H0518H | ':' | surely_yes | if | 1 | yes |
| H0518I | ':' | surely_yes | if | 80 | yes |
| H0776G | ':' | country;_planet | land | 2,318 | yes |
| H0935N | ':' | come_under(siege) | to come (in) | 7 | yes |
| H1167K | ':' | [master_of](DESCRIPTOR) | master | 13 | yes |
| H1354 | plain | back;_rim;_brow | back;_rim;_brow | 13 | no |
| H1419J | plain | Great( Sea) (KJV: the great sea; NIV: Mediterranean Sea) | Great( Sea) (KJV: the great sea; NIV: Mediterranean Sea) | 13 | no |
| H1518 | plain | to burst;_come out | to burst;_come out | 6 | no |
| H1730I | ':' | male_relative | beloved | 18 | yes |
| H1814 | plain | to burn;_pursue | to burn;_pursue | 9 | no |
| H1931 | plain | he;_she;_it | he;_she;_it | 1,878 | no |
| H1932 | plain | he;_she;_it | he;_she;_it | 22 | no |
| H1984I | ':' | rave_madly | to boast | 5 | yes |
| H2022H | ':' | hill_country | mountain | 93 | yes |
| H2100H | ':' | bodily_discharge | to flow | 17 | yes |
| H2100I | ':' | waste_away | to flow | 1 | yes |
| H2132G | plain | (Mount_of )Olives | (Mount_of )Olives | 3 | no |
| H2320H | ':' | new_moon | month | 27 | yes |
| H2342H | ':' | give_birth | to twist | 9 | yes |
| H2342I | ':' | writh_in_pain | to twist | 22 | yes |
| H2342K | ':' | wait_anxiously | to twist | 5 | yes |
| H2388J | ':' | prevail_over | to strengthen | 12 | yes |
| H2403H | ':' | sin_offering | sin | 120 | yes |
| H2763A | plain | to devote;_destroy | to devote;_destroy | 51 | no |
| H2790A | plain | to plow;_plot | to plow;_plot | 25 | no |
| H2953 | plain | nail;_claw | nail;_claw | 2 | no |
| H3117I | ':' | year[of_days] | day | 32 | yes |
| H3176G | ':' | wait[for_time] | to wait | 15 | yes |
| H3332H | ':' | cast_metal | to pour | 14 | yes |
| H3332I | ':' | set_down | to pour | 3 | yes |
| H4150G | ':' | time_appointed | meeting | 39 | yes |
| H4150J | ':' | signal_appointed | meeting | 1 | yes |
| H4483 | plain | to reckon;_appoint | to reckon;_appoint | 5 | no |
| H4662G | plain | Muster( Gate) (KJV: gate Miphkad; NIV: Inspection gate) | Muster( Gate) (KJV: gate Miphkad; NIV: Inspection gate) | 1 | no |
| H5414M | ':' | cry_out | to give | 26 | yes |
| H5414Q | ':' | if_only[wishing] | to give | 25 | yes |
| H5493I | ':' | turn_aside | to turn aside | 84 | yes |
| H5649 | plain | servant;_slave | servant;_slave | 7 | no |
| H5650 | plain | servant;_slave | servant;_slave | 801 | no |
| H5656G | ':' | service[as_servant | service | 25 | yes |
| H5656H | ':' | ministry[for_God | service | 87 | yes |
| H5674C | ':'/plain | to pass:3_bring | to pass | 1 | yes |
| H5709 | plain | to pass on;_over;_away | to pass on;_over;_away | 9 | no |
| H5769I | ':' | any_time | forever | 5 | yes |
| H5869J | ':' | before(the_eyes) | eye | 31 | yes |
| H5927I | ':' | offer_up | to ascend | 85 | yes |
| H6160K | plain | (Sea of the )Arabah (KJV: sea of the plain; NIV: Dead Sea) | (Sea of the )Arabah (KJV: sea of the plain; NIV: Dead Sea) | 2 | no |
| H6267 | plain | ancient;_taken | ancient;_taken | 2 | no |
| H6310L | ':' | one_third | lip | 2 | yes |
| H6963K | ':' | [sound_of](THING) | voice | 7 | yes |
| H7070I | ':' | measuring_rod | branch | 6 | yes |
| H7121G | ':' | call_to | to call | 365 | yes |
| H7121H | ':' | call_by | to call | 223 | yes |
| H7121I | ':' | call_out | to call | 106 | yes |
| H7121J | ':' | read_out | to call | 39 | yes |
| H7130H | ':' | inner_parts | entrails | 28 | yes |
| H7704G | ':' | country;_planet | land | 297 | yes |
| H7725I | ':' | turn_back | to return | 92 | yes |
| H7901G | ':' | lay_down | to lie down | 102 | yes |
| H7901I | ':' | have_sex | to lie down | 50 | yes |
| H7901J | ':' | be_dead | to lie down | 45 | yes |
| H7971H | ':' | let_go | to send | 97 | yes |
| H8104I | ':' | look_at | to keep | 29 | yes |
| H8210I | ':' | build_siege_mound | to pour | 8 | yes |
| H8478J | ':' | because_of | underneath | 23 | yes |
| H8577B | plain | Dragon( Spring) (KJV: dragon well; NIV: Jackal Well) | Dragon( Spring) (KJV: dragon well; NIV: Jackal Well) | 1 | no |

### Underscores (and other display marks)

- **Underscores reach the screen today.** `language.js:appendDetailField` sets `textContent` from the stored value with no replacement, so tier 2 shows `he;_she;_it` and `call_by` literally. Hebrew: 7,735 rows / 65 Strong's numbers contain `_`. Greek: one row (`to_step_out`). Greek must stay identical, so it is left alone and reported here.
- **After either rule**, `_` and `;_` remain in plain glosses:

| Strong's | Gloss after the rule | Rows |
|---|---|---|
| H3117G | day;_when | 1,936 |
| H1931 | he;_she;_it | 1,878 |
| H5650 | servant;_slave | 801 |
| H2490H | to profane;_begin | 75 |
| H2490C | to profane;_begin | 55 |
| H2763A | to devote;_destroy | 51 |
| H2790A | to plow;_plot | 25 |
| H1932 | he;_she;_it | 22 |
| H1354 | back;_rim;_brow | 13 |
| H1419J | Great( Sea) (KJV: the great sea; NIV: Mediterranean Sea) | 13 |
| H1814 | to burn;_pursue | 9 |
| H5709 | to pass on;_over;_away | 9 |
| H5649 | servant;_slave | 7 |
| H1518 | to burst;_come out | 6 |
| H4483 | to reckon;_appoint | 5 |
| H2490I | to profane;_begin | 4 |
| H2132G | (Mount_of )Olives | 3 |
| H6160K | (Sea of the )Arabah (KJV: sea of the plain; NIV: Dead Sea) | 2 |
| H6267 | ancient;_taken | 2 |
| H2953 | nail;_claw | 2 |
| H8577B | Dragon( Spring) (KJV: dragon well; NIV: Jackal Well) | 1 |
| H4662G | Muster( Gate) (KJV: gate Miphkad; NIV: Inspection gate) | 1 |

- **Other annotation marks** STEP uses in sense glosses: 20,477 Hebrew rows (118 Strong's numbers) contain `[…]` or `(…)`, e.g. `[Obj.]` (10,946, the object marker אֵת), `serve[someone]`, `to[ears_of](PERSON)`. **Two upstream glosses are missing their closing bracket**: `ministry[for_God` (87 rows) and `service[as_servant` (25 rows). Kept as written; recorded here.

### Fixes that apply whichever way the decision goes

1. **`#N` normalization** (approved after D1): 5 rows gain `lemma` + `gloss_dictionary` (1Ch 18:10 #09 → `Os3m` / `him`; the 4 Psalm `V` rows → `לְאֹם` / `people`).
2. **Pro 26:17 #04** has a malformed slot, `to pass:3_bring` (upstream dropped `: bring»`). It is stored literally today. Cutting the `:<n>_…` suffix gives `to pass` under the spec's rule. Under the sense-gloss rule, the other 26 H5674C rows say `bring`, but this row's slot has no sense gloss, so it would also get `to pass`. 1 row.
3. **`lemma` is unaffected** by either rule. Old vs new parse over all 305,634 rows: identical except the 5 `#N` rows (NULL → filled).

### STEP's own dictionary gloss: TBESH

STEP-Data publishes a Hebrew counterpart of TBESG: **TBESH** (`Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt`, last changed `48b7cfb` 2026-03-22, sha256 `464dccadd95fd8620dd05fa0d7a4caba58ec3c4d5db3ebf38e43d046ca25b591`, 11,682 entries). It is not a build input. It was read here only as STEP's own statement of each extended Strong's number's gloss. A copy is kept in `data/stepbible-prep/raw/be4191f/reference/` (gitignored) so `tbesh_gloss_check.py` can be rerun. **Its Gloss column writes a sense of a word as `<base>: <sense>`**:

| dStrong | Column 12 slot | Today (sense) | Spec (base) | TBESH Gloss |
|---|---|---|---|---|
| H0776G | `: country;_planet»land:2_…` | country;_planet | land | **land: country/planet** |
| H6440G | `: before»face:…` | before | face | **face: before** |
| H6440J | `: surface»face:4_…` | surface | face | **face: surface** |
| H1121G | `: descendant»son:…` | descendant | son | **son: descendant/people** |
| H7121H | `: call_by»to call:2_…` | call_by | to call | **to call: call by** |

Each candidate rule compared with TBESH over all 305,634 rows (normalizing `_`→space, `;`→`/`, case):

| Rule for `:`-form slots | Rows equal to TBESH's gloss | `:`-form rows equal (of 71,182) | Strong's numbers with >1 value (stability) | Rows changed vs. stored (incl. `_`→space) |
|---|---|---|---|---|
| sense only (today) | 246,558 (80.7%) | 16,482 | 36 | 7,735 |
| base only (spec, option A) | 246,401 (80.6%) | 16,325 | **17** | 59,509 |
| **`base: sense`, dropping a repeat** | **284,623 (93.1%)** | **54,547** | 36 | 59,509 |

- **Plain slots** (234,452 rows) are the same under every rule: 10,331 of 10,785 (dStrong, slot) pairs equal TBESH exactly.
- **"Dropping a repeat"**: when the sense only restates the base, ignoring `to `, `[…]` and `(…)`, the result is just the base: H5971A `people: people` → `people`; H7200G `to see: see` → `to see`. Without that step the composed rule matches 48,589 `:`-form rows.
- **The remaining `:`-form differences from TBESH** (16,619 rows, 106 dStrongs) are mostly TBESH writing verbs as `to give: give` where the composed rule gives `to give`. A few are real wording differences between TAHOT and TBESH: H1004M `house: home` vs TBESH `house: household`; H1004Q `house: home` vs `house: temple`; H1121L `son: age` vs `son: aged`; H3117G `day; when` vs `day`.
- **Stability.** Build_6_Spec defined `gloss_dictionary` as the stable gloss (H1961 constant across occurrences). The base-only rule is the most stable (17 Strong's numbers with more than one value, nearly all names: Beth-shan/Beth-shean, Sabbath/sabbath). The sense-only and composed rules give 36. The extra 19 are dStrongs where TAHOT tags occurrences with different sense glosses, e.g. H1697O (`thing`, `deed`, `word`, …). The composed rule doesn't make that worse, and the base half stays constant.

### Options

| | `:`-form `gloss_dictionary` | Rows changed | Gen 1:1 #07 אֶרֶץ | Gen 1:2 פְּנֵי | Gen 1:5 קָרָא |
|---|---|---|---|---|---|
| **A. Spec as written** | base | 59,509 | land | face | to call |
| **B. Today's rule** + `_`→space | sense | 7,735 | country; planet | surface | call by |
| **C. `base: sense`**, dropping a repeat, + `_`→space | both, in TBESH's form | 59,509 | land: country; planet | face: surface | to call: call by |
| D. Read TBESH's Gloss column directly | TBESH | not measured | land: country/planet | face: surface | to call: call by |

**Recommendation: C.**
- It's the form STEP's own lexicon uses and matches it on 93% of rows, against about 81% for either half.
- It loses nothing: the base meaning ("face") and the sense ("before") both reach the reader.
- It gives the spec's "land" without discarding the sense.
- It needs no new source file and no new table, since everything comes from column 12, which the build already reads.

D would be STEP's gloss exactly, but it adds a build input (and the start of the deferred Hebrew lexicon), and it would also change some plain-slot rows where TBESH and TAHOT word things differently.

Under every option:
- underscores become spaces in Hebrew `gloss_dictionary`;
- STEP's `[…]`/`(…)` marks stay as written;
- the `#N` and Pro 26:17 fixes apply;
- Greek is untouched.

The chosen rule is written once, as one function in `build_language.py`, and D4 calls the same function for `root_glosses` on the 37 two-root rows.

**Carry-forwards:**
- Under B or C, Item 9's check "Gen 1:1 #07 reads 'land'" changes: under C to "land: country; planet". Noted for U4.
- The D6 Hebrew diff will list the chosen rule's changed rows as an allowed category, in place of the spec's 7,752.

### Decision (Wayne, 2026-10-25, after D2 review)

**Option C.** `:`-form slots become `<base>: <sense>`, or just `<base>` when the sense only restates it. Every Hebrew gloss gets underscores replaced by spaces, and the `#N` and Pro 26:17 fixes apply. The same function produces `root_glosses` in D4.

### Implemented and checked

The build has three new pieces: `tahot_dictionary_gloss()`, `normalize_expanded_tags()` and `parse_tahot_lemma_and_gloss()`, which uses both. A build from the pinned sources, compared with the baseline:

- **Greek:** identical (rows, content, all 34,213 group memberships, lexicon, morphology).
- **Hebrew `gloss_dictionary`:** 59,514 rows differ. That is the 59,509 predicted for option C, plus the 5 `#N` rows (4 Psalm `V` rows → `people`, 1Ch 18:10 → `him`). Examples: H0776G → `land: country; planet` (2,318); H6440J → `face: surface`; H1931 → `he; she; it`; Pro 26:17 → `to pass`.
- **Hebrew `lemma`:** 5 rows differ, exactly the `#N` rows.
- **Everything else:** confined to the 4 Psalm verses. Group memberships are unchanged.
- **Size:** 60,133,376 bytes (+393,216 over the baseline, from the longer glosses). That comes out of the 5,974,016-byte budget.

<details><summary>Full before/after table for option A (every changed (Strong's, old, new) triple, 614 rows)</summary>

| Strong's | Old | New | Rows |
|---|---|---|---|
| H0047G | ox | mighty | 5 |
| H0047H | stallion | mighty | 4 |
| H0047I | strong | mighty | 7 |
| H0047J | angel | mighty | 1 |
| H0068H | weight | stone | 13 |
| H0127G | soil | land | 199 |
| H0127H | country | land | 3 |
| H0127I | country;_planet | land | 23 |
| H0157G | lover | to love | 198 |
| H0157H | friend | to love | 13 |
| H0168H | home | tent | 14 |
| H0205G | wickedness | evil | 66 |
| H0205H | trouble | evil | 11 |
| H0226G | miraculous | sign | 47 |
| H0226H | indicator | sign | 33 |
| H0241H | hearing | ear | 34 |
| H0241I | to[ears_of](PERSON) | ear | 34 |
| H0251G | male-sibling | brother | 363 |
| H0251H | male-relative | brother | 134 |
| H0251I | compatriot | brother | 133 |
| H0376H | husband | man | 69 |
| H0376I | anyone | man | 546 |
| H0410L | power | god | 5 |
| H0505H | clan | thousand | 10 |
| H0518A | surely_no | if | 1 |
| H0518B | except | if | 150 |
| H0518H | surely_no | if | 104 |
| H0518H | surely_yes | if | 1 |
| H0518I | surely_yes | if | 80 |
| H0518J | until | if | 17 |
| H0571G | faithful | truth | 66 |
| H0571H | true | truth | 50 |
| H0571I | certain | truth | 11 |
| H0639G | anger | face | 225 |
| H0639H | nose | face | 27 |
| H0759G | palace | citadel | 13 |
| H0759H | fortress | citadel | 19 |
| H0772G | soil | earth | 4 |
| H0772H | inferior | earth | 1 |
| H0772I | planet | earth | 16 |
| H0776G | country;_planet | land | 2,318 |
| H0776H | soil | land | 186 |
| H0802H | wife | woman | 442 |
| H0802I | another | woman | 15 |
| H0905G | each | alone | 1 |
| H0905G | pole | alone | 41 |
| H0905I | each | alone | 2 |
| H0905J | besides | alone | 40 |
| H0935G | come | to come (in) | 1,937 |
| H0935I | towards | to come (in) | 23 |
| H0935J | advanced | to come (in) | 8 |
| H0935K | (sun)set | to come (in) | 13 |
| H0935L | marry | to come (in) | 6 |
| H0935M | fulfill | to come (in) | 11 |
| H0935N | come_under(siege) | to come (in) | 7 |
| H0935P | bring | to come (in) | 555 |
| H0990G | abdomen | belly | 16 |
| H0990H | womb | belly | 46 |
| H0990I | hump | belly | 1 |
| H0990J | body | belly | 9 |
| H0996H | among | between | 26 |
| H1004A | home | house | 1 |
| H1004B | home | house | 898 |
| H1004M | home | house | 664 |
| H1004N | container | house | 9 |
| H1004O | inside | house | 25 |
| H1004P | home | house | 39 |
| H1004Q | home | house | 398 |
| H1100G | worthless | Belial | 16 |
| H1100H | destruction | Belial | 3 |
| H1100I | worthless | Belial | 8 |
| H1121A | child | son | 3,053 |
| H1121G | descendant | son | 1,560 |
| H1121I | description | son | 47 |
| H1121J | [inheriting]son | son | 1 |
| H1121K | warrior | son | 9 |
| H1121L | age | son | 178 |
| H1167H | husband | master | 14 |
| H1167I | men | master | 13 |
| H1167J | owning | master | 9 |
| H1167K | [master_of](DESCRIPTOR) | master | 13 |
| H1197A | burn | to burn | 65 |
| H1197H | destroy | to burn | 4 |
| H1197I | purge | to burn | 16 |
| H1214H | to end | to cut off | 3 |
| H1214I | to gain | to cut off | 9 |
| H1247G | descendant | son | 1 |
| H1247I | description | son | 8 |
| H1247J | child | son | 7 |
| H1323H | village | daughter | 45 |
| H1350A | redeem | to redeem | 88 |
| H1350H | avenge | to redeem | 13 |
| H1350I | relative | to redeem | 2 |
| H1366G | boundary | border | 149 |
| H1366H | area | border | 91 |
| H1419A | large | great | 497 |
| H1419K | old | great | 15 |
| H1530H | wave | heap | 16 |
| H1540H | reveal[information] | to reveal | 43 |
| H1540I | uncover[things] | to reveal | 66 |
| H1540J | proclaim[message] | to reveal | 2 |
| H1540K | remove | to reveal | 74 |
| H1644G | drive out | to drive out | 38 |
| H1644H | divorce | to drive out | 9 |
| H1696G | speak | to speak | 1,058 |
| H1696H | subdue | to speak | 3 |
| H1696I | promise | to speak | 81 |
| H1697G | thing | word | 2 |
| H1697H | speaking | word | 41 |
| H1697I | thing | word | 295 |
| H1697J | promised | word | 24 |
| H1697K | deed | word | 75 |
| H1697L | case | word | 26 |
| H1697M | because | word | 33 |
| H1697N | portion | word | 8 |
| H1697O | deed | word | 3 |
| H1697O | promised | word | 2 |
| H1697O | speaking | word | 1 |
| H1697O | thing | word | 14 |
| H1730H | love | beloved | 10 |
| H1730I | male_relative | beloved | 18 |
| H1826A | stationary | to silence | 9 |
| H1826H | silent | to silence | 15 |
| H1826I | destroyed | to silence | 5 |
| H1870G | conduct | way | 327 |
| H1870G | journey | way | 1 |
| H1870H | road | way | 1 |
| H1870I | road | way | 2 |
| H1870J | direction | way | 76 |
| H1870K | journey | way | 1 |
| H1870K | road | way | 144 |
| H1870L | journey | way | 156 |
| H1964H | palace | temple | 12 |
| H1964I | nave | temple | 12 |
| H1965H | palace | temple | 5 |
| H1980G | went | to go | 944 |
| H1980H | come[nearer] | to go | 49 |
| H1980I | walk | to go | 329 |
| H1980J | take | to go | 37 |
| H1980K | come[hortative] | to go | 53 |
| H1980L | continue | to go | 41 |
| H1980M | journey | to go | 11 |
| H1980N | follow | to go | 82 |
| H1980O | send | to go | 3 |
| H1984B | praise | to boast | 122 |
| H1984H | boast | to boast | 24 |
| H1984I | rave_madly | to boast | 5 |
| H2022G | mount | mountain | 451 |
| H2022H | hill_country | mountain | 93 |
| H2022H | mount | mountain | 2 |
| H2100G | flowing | to flow | 24 |
| H2100H | bodily_discharge | to flow | 17 |
| H2100I | waste_away | to flow | 1 |
| H2205G | elder | old | 128 |
| H2233H | children | seed | 176 |
| H2233H | semen | seed | 1 |
| H2233I | semen | seed | 8 |
| H2320H | new_moon | month | 27 |
| H2342A | tremble | to twist | 11 |
| H2342H | give_birth | to twist | 9 |
| H2342I | writh_in_pain | to twist | 22 |
| H2342J | dance | to twist | 9 |
| H2342K | wait_anxiously | to twist | 5 |
| H2388G | strengthen | to strengthen | 201 |
| H2388H | hold | to strengthen | 71 |
| H2388I | ensure | to strengthen | 3 |
| H2388J | prevail_over | to strengthen | 12 |
| H2388K | persevere | to strengthen | 4 |
| H2403H | sin_offering | sin | 120 |
| H2403I | punishment | sin | 4 |
| H2428A | soldiers | strength | 110 |
| H2428G | strong | strength | 91 |
| H2428H | rich | strength | 37 |
| H2428I | worthy | strength | 7 |
| H2436G | embrace | bosom | 20 |
| H2436H | garment | bosom | 6 |
| H2436I | lap | bosom | 10 |
| H2436J | secret | bosom | 2 |
| H2470A | weak | be weak | 10 |
| H2470H | ill | be weak | 38 |
| H2470I | grieved | be weak | 12 |
| H2490C | begin | to profane;_begin | 55 |
| H2490H | profane | to profane;_begin | 75 |
| H2490I | fruit | to profane;_begin | 4 |
| H2491A | killed | slain | 83 |
| H2491H | wounded | slain | 7 |
| H2706G | decree | statute | 100 |
| H2706H | portion | statute | 20 |
| H2706I | allotment | statute | 7 |
| H2803G | design | to devise | 20 |
| H2803H | count | to devise | 34 |
| H2803I | devise | to devise | 44 |
| H2803J | count | to devise | 17 |
| H2803J | think | to devise | 9 |
| H3027H | power | hand | 580 |
| H3027I | themselves | hand | 75 |
| H3027J | by | hand | 73 |
| H3027K | to | hand | 70 |
| H3027L | times | hand | 6 |
| H3027M | monument | hand | 5 |
| H3027N | penis | hand | 1 |
| H3027O | tool | hand | 2 |
| H3027P | bank | hand | 3 |
| H3027Q | spacious | hand | 5 |
| H3027R | donate | hand | 17 |
| H3027S | vow | hand | 18 |
| H3027T | expend | hand | 6 |
| H3027U | undertake | hand | 5 |
| H3027V | certainly | hand | 3 |
| H3027W | owner | hand | 18 |
| H3027X | swear | hand | 5 |
| H3117G | day | day;_when | 1,936 |
| H3117H | old | day | 5 |
| H3117I | year[of_days] | day | 32 |
| H3117J | daily | day | 74 |
| H3117K | always | day | 38 |
| H3117L | today | day | 221 |
| H3176G | wait[for_time] | to wait | 15 |
| H3176H | hope | to wait | 26 |
| H3220H | west | sea | 75 |
| H3225H | south | right | 16 |
| H3233H | south | right | 8 |
| H3254G | again | to add | 121 |
| H3254H | add | to add | 91 |
| H3318G | come | to come out | 623 |
| H3318H | send | to come out | 262 |
| H3318I | extends | to come out | 24 |
| H3318J | casting(lot) | to come out | 11 |
| H3318K | (sun)rise | to come out | 3 |
| H3318L | issue | to come out | 53 |
| H3318M | produce | to come out | 43 |
| H3318N | regular | to come out | 21 |
| H3318O | speak | to come out | 21 |
| H3318P | surrender | to come out | 6 |
| H3332G | pour | to pour | 29 |
| H3332H | cast_metal | to pour | 14 |
| H3332I | set_down | to pour | 3 |
| H3332J | firm | to pour | 4 |
| H3335G | formed | to form | 38 |
| H3335H | potter | to form | 18 |
| H3335I | plan | to form | 6 |
| H3372G | frightening(DANGER) | to fear | 205 |
| H3372H | awesome(god) | to fear | 110 |
| H3423G | possess | to possess | 36 |
| H3423H | take | to possess | 189 |
| H3423I | poor | to possess | 6 |
| H3513G | honour | to honor | 74 |
| H3513H | heavy | to honor | 33 |
| H3513I | many | to honor | 3 |
| H3513J | dull | to honor | 3 |
| H3559A | prepare | to establish | 88 |
| H3559H | establish | to establish | 99 |
| H3559I | make | to establish | 14 |
| H3559J | commit | to establish | 3 |
| H3559K | right | to establish | 12 |
| H3615G | finish | to end | 105 |
| H3615H | destroy | to end | 54 |
| H3615I | decides | to end | 10 |
| H3615J | expend | to end | 39 |
| H3618G | bride | daughter-in-law | 17 |
| H3678I | seat | throne | 10 |
| H3701G | money | silver | 391 |
| H3701H | price | silver | 12 |
| H3709H | sole | palm | 21 |
| H3709I | dish | palm | 31 |
| H3772G | cut | to cut | 52 |
| H3772H | make(covenant) | to cut | 88 |
| H3772I | eliminate | to cut | 137 |
| H3772J | lack | to cut | 11 |
| H3899G | food(eating) | food | 72 |
| H3899H | bread | food | 221 |
| H3899I | allowance | food | 5 |
| H3925G | teach | to learn | 63 |
| H3925H | learn | to learn | 23 |
| H3947G | take | to take | 771 |
| H3947H | recieve | to take | 77 |
| H3947I | marry | to take | 64 |
| H3947J | bring | to take | 49 |
| H3947K | buy | to take | 3 |
| H3947L | fire | to take | 2 |
| H3956H | language | tongue | 17 |
| H3956I | bar | tongue | 6 |
| H4148H | instruction | discipline | 19 |
| H4148I | bonds | discipline | 2 |
| H4150G | time_appointed | meeting | 39 |
| H4150H | festival | meeting | 31 |
| H4150J | signal_appointed | meeting | 1 |
| H4294G | rod | tribe | 56 |
| H4294I | arrow | tribe | 2 |
| H4294J | rod | tribe | 3 |
| H4294J | stick | tribe | 2 |
| H4294K | supply | tribe | 5 |
| H4397H | angel | messenger | 110 |
| H4503H | gift | offering | 20 |
| H4503I | tribute | offering | 15 |
| H4639G | work | deed | 186 |
| H4941G | judgement | justice | 216 |
| H4941I | rule | justice | 16 |
| H4941J | custom | justice | 24 |
| H5066G | approach | to approach | 87 |
| H5066H | bring | to approach | 38 |
| H5081G | willing | noble | 5 |
| H5145H | crown | consecration | 10 |
| H5145I | hair | consecration | 1 |
| H5158A | river | torrent | 70 |
| H5158I | valley | torrent | 1 |
| H5158N | valley | torrent | 53 |
| H5162G | comfort | to be sorry | 73 |
| H5162H | relent | to be sorry | 35 |
| H5254G | tempt | to test | 1 |
| H5254G | test | to test | 31 |
| H5254H | try | to test | 4 |
| H5307G | fall | to fall | 277 |
| H5307H | deserting | to fall | 17 |
| H5307I | allot | to fall | 26 |
| H5307J | kill | to fall | 98 |
| H5307K | angry | to fall | 2 |
| H5307L | fail | to fall | 5 |
| H5307M | fell(trees) | to fall | 6 |
| H5307N | presenting | to fall | 4 |
| H5315H | life | soul | 207 |
| H5315I | myself | soul | 130 |
| H5315J | person | soul | 96 |
| H5315K | animal | soul | 13 |
| H5315L | appetite | soul | 47 |
| H5315M | dead | soul | 13 |
| H5315N | neck | soul | 2 |
| H5375G | raise | to lift | 131 |
| H5375H | bear | to lift | 220 |
| H5375I | forgive | to lift | 25 |
| H5375J | guilt | to lift | 39 |
| H5375K | aid | to lift | 8 |
| H5375L | exalt | to lift | 13 |
| H5375M | look | to lift | 48 |
| H5375N | loud | to lift | 40 |
| H5375O | trust | to lift | 9 |
| H5375P | vow | to lift | 26 |
| H5375Q | kindness | to lift | 41 |
| H5375R | fight | to lift | 6 |
| H5375S | enthuse | to lift | 5 |
| H5375T | journey | to lift | 2 |
| H5375U | marry | to lift | 10 |
| H5375V | count | to lift | 10 |
| H5375W | bearing(armour) | to lift | 22 |
| H5375X | give(gift) | to lift | 1 |
| H5414G | give | to give | 1,315 |
| H5414H | put | to give | 395 |
| H5414I | make | to give | 128 |
| H5414J | turn | to give | 1 |
| H5414K | allow | to give | 30 |
| H5414L | throw | to give | 6 |
| H5414M | cry_out | to give | 26 |
| H5414N | pay | to give | 28 |
| H5414O | give(marriage) | to give | 45 |
| H5414P | do | to give | 12 |
| H5414Q | if_only[wishing] | to give | 25 |
| H5415G | give | to give | 5 |
| H5415H | put | to give | 1 |
| H5415I | pay | to give | 1 |
| H5437G | turn | to turn | 78 |
| H5437H | surround | to turn | 74 |
| H5437I | again | to turn | 2 |
| H5437J | repell | to turn | 3 |
| H5437K | changed | to turn | 4 |
| H5439H | side | around | 42 |
| H5439I | whole | around | 6 |
| H5439J | neighours | around | 3 |
| H5493G | remove | to turn aside | 147 |
| H5493H | depart | to turn aside | 69 |
| H5493I | turn_aside | to turn aside | 84 |
| H5612A | document | scroll | 53 |
| H5612H | book | scroll | 130 |
| H5612I | read | scroll | 2 |
| H5647G | serve[someone] | to serve | 97 |
| H5647H | minister | to serve | 157 |
| H5647I | labour | to serve | 32 |
| H5647J | burden | to serve | 2 |
| H5656G | service[as_servant | service | 25 |
| H5656H | ministry[for_God | service | 87 |
| H5656I | work | service | 33 |
| H5674A | flow | to pass | 3 |
| H5674A | pass | to pass | 495 |
| H5674C | bring | to pass | 26 |
| H5674C | to pass:3_bring | to pass | 1 |
| H5674D | trespass | to pass | 22 |
| H5676G | ahead | side | 4 |
| H5676H | ahead | side | 56 |
| H5676I | west | side | 2 |
| H5769G | enduring | forever | 388 |
| H5769I | any_time | forever | 5 |
| H5769J | old | forever | 44 |
| H5771G | crime | iniquity | 182 |
| H5771H | guilt | iniquity | 28 |
| H5771I | punishment | iniquity | 23 |
| H5800A | forsake | to leave | 195 |
| H5800C | release | to leave | 11 |
| H5800H | neglect | to leave | 7 |
| H5869H | seeing | eye | 210 |
| H5869I | appearance | eye | 156 |
| H5869J | before(the_eyes) | eye | 31 |
| H5869K | sin | eye | 2 |
| H5927G | rise | to ascend | 618 |
| H5927H | establish | to ascend | 153 |
| H5927I | offer_up | to ascend | 85 |
| H5927J | attack | to ascend | 12 |
| H5927K | copulate | to ascend | 6 |
| H5927L | dawn | to ascend | 7 |
| H5927M | regurgitate | to ascend | 9 |
| H5971K | soldiers | people | 77 |
| H5971L | creatures | people | 1 |
| H5975G | stand | to stand | 452 |
| H5975H | appoint | to stand | 40 |
| H5975I | rise | to stand | 24 |
| H5975J | put | to stand | 5 |
| H6086G | wood | tree | 152 |
| H6086I | stick | tree | 18 |
| H6086J | stake | tree | 13 |
| H6086K | carpenter | tree | 4 |
| H6106H | same | bone | 19 |
| H6106I | body | bone | 2 |
| H6213A | do | to make | 1,751 |
| H6213H | make(OBJECT) | to make | 740 |
| H6213I | offer | to make | 105 |
| H6213J | [do](ACTION) | to make | 30 |
| H6310H | edge | lip | 45 |
| H6310I | word | lip | 83 |
| H6310J | opening | lip | 11 |
| H6310K | according | lip | 32 |
| H6310L | one_third | lip | 2 |
| H6440G | before | face | 1,387 |
| H6440G | kindness | face | 1 |
| H6440I | because | face | 85 |
| H6440J | surface | face | 100 |
| H6440K | east | face | 11 |
| H6440L | PERSON | face | 96 |
| H6440M | angry | face | 2 |
| H6440N | PERSON | face | 2 |
| H6440N | kindness | face | 28 |
| H6485A | list | to reckon | 127 |
| H6485H | punish | to reckon | 51 |
| H6485I | visit | to reckon | 47 |
| H6485J | overseer | to reckon | 54 |
| H6485K | missing | to reckon | 19 |
| H6485L | put | to reckon | 4 |
| H6635H | war | army | 42 |
| H6635I | duty | army | 13 |
| H6918H | saint | holy | 7 |
| H6924G | east | front | 22 |
| H6924H | old | front | 32 |
| H6924I | forward | front | 1 |
| H6931H | older | eastern | 4 |
| H6942G | consecate | to consecrate | 127 |
| H6942H | dedicate | to consecrate | 26 |
| H6942I | forfeit | to consecrate | 1 |
| H6942J | prepare | to consecrate | 7 |
| H6942K | holiness | to consecrate | 10 |
| H6963H | sound | voice | 134 |
| H6963I | thunder | voice | 13 |
| H6963J | message | voice | 13 |
| H6963K | [sound_of](THING) | voice | 7 |
| H6963L | listen | voice | 3 |
| H6965B | rise | to arise | 376 |
| H6965H | raise | to arise | 40 |
| H6965I | establish | to arise | 174 |
| H6965J | attack | to arise | 35 |
| H6965K | [stand]guard | to arise | 2 |
| H6966G | rise | to stand | 8 |
| H6966H | raise | to stand | 1 |
| H6966I | establish | to stand | 26 |
| H6996H | young | small | 19 |
| H6999A | burn | to offer | 59 |
| H6999H | offer | to offer | 54 |
| H6999I | perfume | to offer | 1 |
| H7032G | sound | voice | 6 |
| H7070H | stem | branch | 30 |
| H7070I | measuring_rod | branch | 6 |
| H7070J | shoulder | branch | 1 |
| H7070K | scales | branch | 1 |
| H7070L | calamus | branch | 2 |
| H7121G | call_to | to call | 365 |
| H7121H | call_by | to call | 223 |
| H7121I | call_out | to call | 106 |
| H7121J | read_out | to call | 39 |
| H7122G | meet | to encounter | 87 |
| H7122H | toward | to encounter | 39 |
| H7122I | happen[unexpectedly] | to encounter | 13 |
| H7126G | come | to present | 112 |
| H7126H | bring | to present | 168 |
| H7130G | among | entrails | 199 |
| H7130H | inner_parts | entrails | 28 |
| H7200G | see | to see | 1,198 |
| H7200H | examine | to see | 24 |
| H7200I | behold! | to see | 46 |
| H7200J | select | to see | 11 |
| H7200K | enjoy | to see | 8 |
| H7200L | seer | to see | 9 |
| H7200M | approach | to see | 3 |
| H7218H | leader | head | 178 |
| H7218I | top | head | 95 |
| H7218J | first | head | 18 |
| H7218K | group | head | 16 |
| H7218L | count | head | 7 |
| H7223H | previous | first | 50 |
| H7223I | chief | first | 4 |
| H7225G | beginning | first | 41 |
| H7225H | best | first | 10 |
| H7307H | breath | spirit | 145 |
| H7307I | side | spirit | 7 |
| H7307J | temper | spirit | 10 |
| H7323G | run | to run | 87 |
| H7323H | guard | to run | 15 |
| H7323I | pieces | to run | 1 |
| H7342H | wide | broad | 17 |
| H7342I | arrogant | broad | 2 |
| H7364 | wash | to wash | 72 |
| H7393H | millstone | chariot | 3 |
| H7451A | harmful | bad | 66 |
| H7451C | harm | distress | 157 |
| H7451H | evil | bad | 180 |
| H7451I | evil | distress | 147 |
| H7620I | seven | week | 8 |
| H7626G | staff | tribe | 52 |
| H7626I | javelin | tribe | 1 |
| H7626J | ruler | tribe | 1 |
| H7704B | soil | land | 6 |
| H7704G | country;_planet | land | 297 |
| H7704I | wild(animals | land | 15 |
| H7723G | false | vanity | 26 |
| H7723H | vain | vanity | 27 |
| H7725G | return | to return | 628 |
| H7725H | rescue | to return | 108 |
| H7725I | turn_back | to return | 92 |
| H7725J | again | to return | 75 |
| H7725K | pay | to return | 32 |
| H7725L | refuse | to return | 4 |
| H7725M | reply | to return | 29 |
| H7725N | recall | to return | 7 |
| H7725O | repent | to return | 82 |
| H7760A | make | to set | 273 |
| H7760H | put | to set | 239 |
| H7760I | take | to set | 9 |
| H7760J | accuse | to set | 3 |
| H7760K | consider | to set | 29 |
| H7760L | appoint | to set | 26 |
| H7760M | name | to set | 5 |
| H7761G | make | to set | 19 |
| H7761H | put | to set | 6 |
| H7761I | appoint | to set | 1 |
| H7896G | make | to set | 49 |
| H7896H | put | to set | 21 |
| H7896I | appoint | to set | 5 |
| H7896J | accuse | to set | 1 |
| H7896K | consider | to set | 7 |
| H7901G | lay_down | to lie down | 102 |
| H7901H | sleep | to lie down | 15 |
| H7901I | have_sex | to lie down | 50 |
| H7901J | be_dead | to lie down | 45 |
| H7965I | well-being | peace | 54 |
| H7965J | friendship | peace | 5 |
| H7965K | greeting | peace | 12 |
| H7965L | completely | peace | 1 |
| H7971G | depart | to send | 669 |
| H7971H | let_go | to send | 97 |
| H7971I | divorce | to send | 11 |
| H7971J | marriage | to send | 1 |
| H7971K | reach | to send | 64 |
| H7971L | burn | to send | 4 |
| H7971M | exile | to send | 1 |
| H8042H | north | left | 4 |
| H8047G | destroyed | horror | 22 |
| H8047H | appalled | horror | 17 |
| H8074G | destroyed | be desolate | 57 |
| H8074H | appalled | be desolate | 29 |
| H8085G | hear | to hear | 965 |
| H8085H | obey | to hear | 134 |
| H8085I | proclaim | to hear | 49 |
| H8085J | understand | to hear | 9 |
| H8085K | judge | to hear | 2 |
| H8085L | welcome | to hear | 1 |
| H8104G | obey | to keep | 202 |
| H8104H | guard | to keep | 161 |
| H8104I | look_at | to keep | 29 |
| H8104J | careful | to keep | 77 |
| H8127H | ivory | tooth | 10 |
| H8127I | crag | tooth | 4 |
| H8127J | prong | tooth | 1 |
| H8179H | town | gate | 26 |
| H8193G | lips | lip | 101 |
| H8193H | words | lip | 23 |
| H8193I | edge | lip | 28 |
| H8193J | shore | lip | 18 |
| H8193K | language | lip | 6 |
| H8210G | pour | to pour | 69 |
| H8210H | kill | to pour | 34 |
| H8210I | build_siege_mound | to pour | 8 |
| H8210J | scatter | to pour | 4 |
| H8248G | watering(ANIMALS | to water | 22 |
| H8248H | drink(PEOPLE) | to water | 39 |
| H8421G | return | to return | 3 |
| H8421H | rescue | to return | 1 |
| H8421I | reply | to return | 4 |
| H8478G | under | underneath | 240 |
| H8478H | instead | underneath | 195 |
| H8478I | stand | underneath | 29 |
| H8478J | because_of | underneath | 23 |
| H8478K | owning | underneath | 14 |
| H8478L | swear | underneath | 4 |
| H8549H | blameless | unblemished | 27 |
| H8549I | complete | unblemished | 6 |
| H8549J | Thummim | unblemished | 1 |
| H8577M | snake | serpent | 5 |
| H8577N | monster | serpent | 8 |
| H8668G | salvation | deliverance | 22 |
| H8668H | victory | deliverance | 12 |

</details>

## D3 — TEHMC parser and `step_morphology_hebrew` (2026-10-25)

**Result: no stop condition.** 921 codes (617 `H`, 304 `A`), `Hc` included. **7,550 rows**, of which 2,440 are derived (`(hence …)`). Every one of the 469,294 Hebrew morph pieces in the data resolves. `parse_tegmc_file` is untouched, and Greek rows, `step_lexicon_greek` and `step_morphology_greek` are identical to the D2 build.

### What was added to `build_language.py`

- **`parse_tehmc_file(path, problems)`**: reads only the `FULL MORPHOLOGY CODES:` section, opened with BOM stripping (`utf-8-sig`). Records are split on `\n$\n`. The section starts with header prose, each record is preceded by a `$` line, and the final record (`HVvw3ms`) runs to the end of the file with no `$`. Only each record's line 1 is read.
  - Pairs are split on `;` **only at parenthesis depth 0** (`split_at_depth_zero`), so `(hence A=x; B=y)` stays whole.
  - A pair's value ending in `(hence …)` is unwrapped into its own `derived = 1` rows. **Only `(hence` counts as a group**: `Form=Definite article (Aramaic)` / `(Hebrew)` keep their parentheses.
  - Empty pairs are dropped (`Hc`'s trailing `;`), and keys and values are trimmed (33 records have trailing whitespace on line 1).
  - `position` is the 1-based order in the source line, counting derived rows where they appear: `HVvw3ms` → Function 1, Stem 2, Action 3, Voice 4, Form 5, Tense 6, Mood 7, Person 8, Gender 9, Number 10.
  - A record that fails to parse is reported through `problems` and printed as a warning, not silently dropped. **None fail.**
- **`step_morphology_hebrew`** with `idx_morph_hebrew_code`, exactly as the spec's DDL.
- **`split_hebrew_morph_code()`**: the Python twin of the JS splitter U1 will write. `//` first, then `/`. The language letter is the code's **first character only**, prefixed onto every later piece:
  - **No subword after `//` restates its letter.** All 27 `//` codes are `H…` and none has `H` after `//`.
  - `A` can't serve as a language marker after `/` or `//`, because it is also the Adjective function letter: `HR/Ncbsa//Aamsa`.
- **Build output** now prints TEHMC's row/code counts, a floor warning (<900 codes or no `Hc`), and a piece-coverage line, like the TEGMC check.
- TEHMC is a required source file; its sha256 is printed with the others (`78779bea…`).

### Normalizations: which fired

| Clean-up | Fired? |
|---|---|
| `Mood=jussive` → `Jussive` | **Yes, 2 records** (`AVPj3mp`, `HVPj3mp`). The compound values `Indicative/jussive` (77) and `Indicative/cohortative` (17) are lowercase in every record, so they collide with nothing and are kept as written. |
| `‚` (U+201A) → `,`, stray `"` (shared `normalize_tegmc_value`, defensive) | **No.** 0 of 921 line-1s contain either. Both occur only in lines 2–4 (e.g. `"giving to‚ rich _and_ poor"`), which aren't read. |
| `transtive` | **Kept as written**, 248 Action values (`Intensive/resultive/transtive`). The spec says to handle it "the same way the Greek path does", **but TEGMC has no `transtive` at all** (0 occurrences in the file or in `step_morphology_greek`), so there is no Greek handling to copy. U2's wording table keys on TEHMC's exact text, so the typo never reaches the screen. |
| Case collisions (same category/value differing only in case) | None after the `Jussive` fix. |

### Checks

- **Cross-check against the investigation's independent parser** (`scripts/analysis/hebrew_parity/tehmc_parse.py`): the same 921 codes with the same `(category, value, main/derived)` multiset per code. The only differences are the 2 intended `Jussive` fixes. (Order differs because that script lists derived values last; this one keeps source order, as the spec asks.)
- **Category counts:** Function 921, Form 915, Gender 866, Number 858, Stem 670, Person 604, State 276. Derived: Action 670, Voice 670, Tense 550, Mood 550. **Action/Voice/Tense/Mood occur only as derived values.**
- **90 distinct (category, value) pairs**, 89 of them used by the data. U2's wording tables need to cover those 89.
- **Coverage:** 742 distinct pieces in the data, all resolve. 179 codes are never used (83 `H`, 96 `A`). 469,294 of 469,294 piece occurrences resolve. The spec's 469,321 total counted the 27 empty pieces that splitting `//` codes on `/` produces; splitting on `//` first removes them.

### The BRIEF LEXICAL MORPHOLOGY CODES section (not imported)

It has two parts:
1. **37 lexicon-style codes** for a word rather than an occurrence, e.g. `H:N-M` "Hebrew Noun (Masculine)", `H:Prep+H:RelP`, `N:N--LG` "Proper Name of a Location in Gentilic sense". This is the format TBESH's Morph column uses, so the deferred Hebrew lexicon spec may want it.
2. **A 36-row suffix table** (`Ps1c`/`Pp`/`Os`/`Op`/`Ss`/`Sp` × person/gender), e.g. `Ps3m | his | Possessive suffix: 3rd person masculine singular`. These are the forms column 12 writes on suffix tags (`H9023=Ps3m=his`, `H9033=Os3m=him`), so it explains D4's `hebrew_affixes.form` values. It isn't imported (the spec keeps the Brief section out), but U2 can use it as the source for the authored affix wording.

### Size

`step_morphology_hebrew` 258,048 bytes + `idx_morph_hebrew_code` 118,784 = **376,832 bytes**. Build total 60,510,208 bytes, **+770,048 over the baseline** (D2's longer glosses + D3), 12.9% of the 5,974,016-byte budget.

## D4 — Pieces: affix constancy and alignment: stopped, decision needed (2026-10-25)

**Result: alignment is clean; the affix constancy check fired the spec's stop condition.**
- **Alignment:** every one of the 145,688 multi-piece rows splits identically across the five columns, with 0 skipped.
- **Affixes:** 7 suffix numbers have more than one (form, gloss) pair across their 87 occurrences, all in one word, לְבַד "alone".
- **Not wired in yet:** the two tables aren't in `build()`, pending your decision. The splitting functions are in `build_language.py` and the analysis below runs them.

Script: `scripts/analysis/hebrew_anatomy/piece_alignment.py`.

### How the columns split (added to `build_language.py`)

`strip_punctuation_segments`, `split_tahot_column`, `align_tahot_pieces`, `piece_strongs_text`, plus D3's `split_hebrew_morph_code`. The rules:

1. **Strip punctuation segments:** a `\` up to the next `/` or `\`. Examples: `\׃`, `\׀`, `\ \פ`; in dStrongs `\H9016`; in column 12 `\H9016=׃=verseEnd`. A `\` occurs only in the surface, dStrongs and column-12 columns (0 rows in English, transliteration or grammar).
2. **Split on `/`.** A segment that is a **word break** starts a new subword. That covers the 27 `//` rows, and the grammar column always writes the break `//`. The other columns write it three ways:

| Break (rows) | Surface | English | dStrongs | Column 12 |
|---|---|---|---|---|
| plain or space (19) | `//` or `/ /` | `//` or `/ /` | `//` or `/ /` | `//` or `/ /` |
| maqqef (7) | `/־/` | `/-/` | `/H9014/` | `/H9014=־=link/` |
| maqqef, English space (1, Exo 4:2) | `/־/` | `/ /` | `/H9014/` | `/H9014=־=link/` |

   The maqqef in these rows is a `/`-segment, not a `\` punctuation segment, so it has to be recognised as a break, never as a piece. Per column, a segment is a break when it is empty after trimming, or is `־` (surface), `-` (transliteration, English), `H9014` (dStrongs) or `H9014=־=link` (column 12).
3. **Only stored when every column agrees.** Surface, English, dStrongs, grammar and column 12 must give the same subword/piece shape, and each piece's Strong's number and braces must match between dStrongs and column 12.

A `+` after a root's closing brace (785 rows; it flags a word continued in the next row, which `group_id` already records) is dropped from `piece_strongs`. Column-12 root tags never contain a `/` (0 rows), so splitting column 12 on `/` is safe.

### Alignment results

| | Rows |
|---|---|
| Hebrew rows | 305,634 |
| One piece (no row written) | 159,946 |
| **Multi-piece, all columns agree (row written)** | **145,688** |
| Skipped (columns disagree) | **0** |

145,688 is the spec's 145,684 rows with `/`, plus the 4 Psalm `V` rows, which replace 8 one-piece rows.

- **Paseq rows pass:** 1Ch 27:12 #06 and Neh 2:13 #17. Both are also `//` rows, with a `\׀` paseq before a space break (`לַ/בֵּ֣ן\׀/ /יְמִינִ֑י`).
- **English column:** 0 rows where the English splits differently from the pieces, so it has no `/` that isn't a piece break. In the 27 `//` rows the English writes the break as `//`, `/ /` or `/-/`, which the rules above already cover.
- **Transliteration** (not split at runtime, so not a gate): 16 rows split differently, all a trailing maqqef written as its own segment (`li/-` for `HR/Sp1bs`, Gen 31:43 and 15 more). Reported only.
- **Strong's agreement:** dStrongs and column 12 agree on every piece's number and root braces in all 145,688 rows.
- **Ids:** `original_words.id` follows row order exactly (Hebrew rows 1–305,634, checked against `surface_text` for all of them), so the import writes `word_id` from its own counter instead of reading ids back.

### Samples (raw TAHOT → stored → runtime split)

| Row | Raw (dStrongs · grammar · English) | `piece_strongs` (+ `root_glosses`) | Runtime split: surface · morph · English · role |
|---|---|---|---|
| Gen 1:1 #01 | `H9003/{H7225G}` · `HR/Ncfsa` · `in/ beginning` | `H9003/{H7225G}` | בְּ · HR · in · prefix ‖ רֵאשִׁ֖ית · HNcfsa · beginning · root |
| Gen 1:1 #07 | `H9009/{H0776G}\H9016` · `HTd/Ncfsa` · `the/ earth` | `H9009/{H0776G}` | הָ · HTd · the ‖ אָֽרֶץ · HNcfsa · earth (sof pasuq stripped, not a piece) |
| Gen 1:3 #01 | `H9001/{H0559}` · `Hc/Vqw3ms` · `and/ he said` | `H9001/{H0559}` | וַ · Hc · and ‖ יֹּ֥אמֶר · HVqw3ms · he said |
| Gen 2:2 #05 | `{H4399}/H9023` · `HNcfsc/Sp3ms` · `work/ his` | `{H4399}/H9023` | מְלַאכְתּ֖ · HNcfsc · work · root ‖ וֹ · HSp3ms · his · suffix |
| 2Ki 19:37 #08 (`//`) | `H9002/{H8272G}/ /{H1121A}/H9023` · `HC/Npm//Ncmpc/Sp3ms` | `H9002/{H8272G}//{H1121A}/H9023` + `Sharezer/son: child` | [וְ · HC · and ‖ שַׂרְאֶ֤צֶר · HNpm · Sharezer] // [בָּנָי · HNcmpc · sons ‖ ו֙ · HSp3ms · his] |
| 1Ch 27:12 #06 (paseq + `//`) | `H9005/{H1121G}\H9015/ /{H3227B}` · `HRd/Ncmsa//Ngmsa` | `H9005/{H1121G}//{H3227B}` + `son: descendant/[Ben]jaminite` | [לַ · HRd · of the ‖ בֵּ֣ן · HNcmsa · Ben] // [יְמִינִ֑י · HNgmsa · jaminite[s]] |
| Neh 2:13 #17 (paseq + `//`) | `{H1992}\H9015/ /{H6555}` · `HPp3mp//Vqsmpa` | `{H1992}//{H6555}` + `they(masc.)/to break through` | [הֵ֣ם · HPp3mp · they] // [פְּרוּצִ֔ים · HVqsmpa · [were] broken down] |
| Exo 4:2 #04 (maqqef `//`) | `{H4100}/H9014/{H2088}` · `HPi//Tm` | `{H4100}//{H2088}` + `what?/this` | [מַה · HPi · what] // [זֶּ֣ה · HTm · [is] this?] |
| Psa 44:14 #06 (`V`) | `H9003/{H3816}\H9016` · `HRd/Ncfpa` | `H9003/{H3816}` | בָּ · HRd · among the ‖ לְאֻמִּים · HNcfpa · peoples |

### Rows with more than one root: 37

These carry `root_glosses` (`/`-joined, from `tahot_dictionary_gloss()`; no gloss contains `/`). **25 are `//` rows**, one root per written word: all 27 `//` rows except Isa 3:15 and Jer 50:29, whose second word has no root. **12 have two roots in one written word**, e.g. 1Ch 20:4 `{H0310A}/{H3651C}` אַחֲרֵי־כֵן "after so", Psa 106:1 `{H1984B}/{H3050}` הַלְלוּ־יָהּ, Isa 9:6 `{H0001G}/{H5703}`. Num 7:59 `{H6301}//{H6301}` is one name split in two (`Pedahzur/Pedahzur`).

### Affix constancy: the stop

The check covers every H90xx number appearing as a piece in column 12 (after `normalize_expanded_tags`), in every role: prefix, suffix, root, rootless. It finds **43 numbers**: H9001–H9013 and H9020–H9049. H9014–H9019 occur only as punctuation (H9014 also as the `//` maqqef break), never as a piece.

**36 numbers are constant.** The constant pair also holds where the number is the root (H9005 `ל`/`to` ×25 as root; H9032 `Os2f`/`you` ×333; H9035 `Op1c`/`us` ×272). **7 vary**:

| Number | Usual pair (count) | Other pair(s) (count) |
|---|---|---|
| H9030 | `Os1c` me (3,266) | `Ss1c` I (16) |
| H9031 | `Os2m` you (2,402) | `Ss2m` you (17) |
| H9033 | `Os3m` him (5,393) | `Ss3m` he (37) |
| H9034 | `Os3f` her (1,703) | `Ss3f` she (5) |
| H9036 | `Op2m` you (1,257) | `Sp2m` you (2) |
| H9038 | `Op3m` them (3,578) | `Sp3m` they (7); `Pp3m` their (1) |
| H9039 | `Op3f` them (113) | `Pp3f` their (2) |

**All 87 of the other-pair occurrences are the same word: לְבַד "alone" + suffix** (`לְ/בַדּ/וֹ` "by himself", `לְ/בַדְּ/ךָ`, `לְ/בַדָּ/ם`, …; Gen 2:18, Exo 18:14, Deu 4:35, Job 1:15, …). In this word TAHOT writes the suffix with the subject form (`Ss3m` "he": "he alone") or, three times, the possessive (`Pp3m`/`Pp3f`). Elsewhere these numbers get the object form (`Os3m` "him").
- The grammar column is the same in both (`HSp3ms`), and the English column says "him"/"it" in both.
- So this is a consistent upstream convention for one word, not scattered errors.
- Every occurrence is listed in the script's output.

The spec says not to pick one, and `hebrew_affixes` as specified (one `(form, gloss)` per number) can't hold both.

### Options

| | `hebrew_affixes` | Where a piece's form comes from | Extra size |
|---|---|---|---|
| **A. Usual form + exceptions** | key `(strongs_number, form)`, 51 rows (43 + 8), with a `usual` flag | the number's usual form, unless the word's new nullable `original_word_pieces.affix_forms` gives another: set on **87 rows**. Same `//`/`/` structure as `piece_strongs`, with **`*`** for every piece at its usual form or a root, e.g. `*/*/Ss3m` for `H9005/{H0905}/H9033` | a few KB |
| B. Store every affix piece's form | key `(strongs_number, form)` | `affix_forms` on all 145,688 rows | **+1.89 MB**, which takes the build past the size limit together with the rest |
| C. Usual pair only | key `strongs_number`, 43 rows | always the usual pair; the 87 לְבַד suffixes would show "him" instead of TAHOT's "he" | 0, but loses data, which is what the spec's rule forbids |

**Why `*` and not empty entries:** joining empty entries with `/` would give `//Ss3m`, and `//` is the word break, so it would mis-split. Checked on all 87 exception rows: `affix_forms` splits into exactly the same shape as `piece_strongs`, and every non-`*` form equals column 12's form at that position (0 failures). The shapes: 86 × `*/*/S…` and 1 × `*/*/*/Ss3m` (Deu 4:35 מִ/לְ/בַדּ/וֹ).

**Recommendation: A.** Nothing is lost: each piece's column-12 form and gloss is recoverable exactly. Runtime cost is one lookup, and the exception column is empty on all but 87 rows. The "usual" pair isn't a choice between readings, only a default that the stored exceptions override. Note that the English piece already reads "him"/"it" in these words, so the anatomy line looks the same either way. The difference is only the dictionary gloss of the suffix.

### Also for your confirmation: how roles are worked out in 5 words

The spec's rule ("pieces before the root are prefixes, after it suffixes") assumes one root per subword. Five words don't fit:

| Row | Pieces | Under the spec's rule | Proposed |
|---|---|---|---|
| 1Ch 15:13 #02 לְ/מַ/בָּ/רִ֥אשׁוֹנָ֖ה | `H9005/{H4100}/H9003/{H7223G}` | H9003 between two roots: ambiguous | **A non-root piece is a prefix if a root follows it in its subword, otherwise a suffix.** H9003 "at the" → prefix of רִאשֹׁנָה (correct); identical to the spec's rule everywhere else. |
| Ecc 8:17 #17 בְּ/שֶׁ/ל | `H9003/{H9007}/H9005` | H9005 ל after the root → suffix | same rule → suffix (follows the data's own root placement) |
| 2Sa 2:26 #10 יָדַ֔עְתָּ/ה | `{H3045}/H9008` (`Ti`, "?") | suffix | suffix |
| Isa 3:15 #01, 2nd word | `{H4100}//H9005/H9046` (לָּכֶם "to you") | no root in the subword: undefined | **In a subword with no root, a piece whose TEHMC Function is Suffix is a suffix and any other is a prefix**: ל prefix, כֶם suffix. (`step_morphology_hebrew`: `HR`, `HRd` → Function=Preposition; `HSp2mp`, `HSp3fs` → Function=Suffix.) |
| Jer 50:29 #12, 2nd word | `{H1961}//H9005/H9034` (לָהּ) | same | same: ל prefix, הּ suffix |

### Decisions (Wayne, 2026-10-25, after D4 review)

1. **Option A.** `hebrew_affixes` is keyed by `(strongs_number, form)` with a `usual` flag. `original_word_pieces.affix_forms` holds the column-12 form for each piece not at its number's usual form, `*` elsewhere, on the 87 לְבַד rows only.
2. **Role rules** (runtime, U1):
   - A non-root piece is a prefix if a root follows it in its subword, otherwise a suffix.
   - In a subword with no root, a piece whose TEHMC Function is Suffix is a suffix, and any other is a prefix.

### Implemented and checked (after the decisions)

`build_language.py` now writes both tables (`write_piece_tables`).
- **Ids:** `original_words` ids are written explicitly, the same values AUTOINCREMENT gave (Hebrew 1–305,634, Greek 305,635–447,730). `parse_tahot_file` also returns each row's aligned pieces.
- **Stop rules in code:** the build exits rather than guess if a number has no single most-common pair, if one `(number, form)` has two glosses, or if a root gloss contains `/`. None fire.
- **Build output:** `original_word_pieces: 145,688 multi-piece words (37 with root_glosses, 87 with affix_forms); 159,946 one-piece words; 0 skipped`, and `hebrew_affixes: 51 rows for 43 numbers (7 with more than one form)`.
- **No collateral change:** compared with the D3 build, `original_words` and every Greek table are identical.
- **Size:** `original_word_pieces` measures 3,694,592 bytes in the real build (the `affix_forms` column adds about 147 KB of per-row overhead over the probe).

### Size measured (scratch build, not shipped)

| Table | Bytes |
|---|---|
| `original_word_pieces` as specified (`piece_strongs` with braces, `root_glosses`) | **3,547,136** |
| Same, with the first root written `{}` (its number is already `original_words.strongs_number`) | 2,748,416 |
| B's every-piece `affix_forms` | 1,892,352 |

`original_word_pieces` is larger than the spec's estimate, at about 14 characters per row plus around 10 bytes of row overhead. With D2+D3's 770,048 bytes, the specified version gives about 4.3 MB of growth before D5's variants table, inside the 5.97 MB limit. **The `{}` form saves 0.8 MB.** It follows the spec's "don't store anything twice" principle, but makes `piece_strongs` depend on `original_words` to be read. I'd keep the specified form unless D6 shows the budget is tight. No decision is needed on this now.
## D5 — `original_word_variants` (2026-10-25)

**Result: no stop condition.**
- **1,782 rows.** Every Ketiv parses: **999 meaning (Q(K)) + 310 spelling (Q(k)) = 1,309**, with 0 left NULL.
- **Against the spec's target of 1,323:** the spec counted the 14 ghost rows, which are all Q(K) and are still not imported (out of scope). 1,323 − 14 = 1,309.
- **Unchanged elsewhere:** `original_words` and the Greek tables are identical to the D3 build.

### Which rows get a variants row

A Hebrew word gets a row when its text type isn't plain `L`, or its column 7 / column 8 has non-whitespace text. **Checked against raw TAHOT for all 305,634 rows: 0 missing, 0 extra, 0 mismatched** (text type and both raw columns).

- **Text types:** 34, every one kept verbatim: `Q(K)` 999, `Q(k)` 310, `X` 152, `L(p)` 115, `L(abh)` 76, `R` 27, `LA(bh)` 25, `LB(ah)` 13, `LAH(b)` 10, `LAB(h)` 9, `L(b+p)` 6, `LBH(a)` 5, `L(S)` 5, **`V` 4** (the Psalm rows), plus 20 more with 1–3 rows each.
- **One plain-`L` row** has a variant only: Job 18:15 #02 מִ/בְּלִי, column 8 `BH= מִ/בְּלִי\־`.
- **Whitespace-only is empty:** Psa 42:4 #08 (column 7 is a single space since `be4191f`) gets no row.
- **Raw columns are stored as written:** `meaning_variants` 1,025 rows, `spelling_variants` 1,578. The spec's 1,035 / 1,592 were counted at `faf6a35` including the 14 ghost rows, which have **both** columns, not only column 8 as the spec says. At `be4191f`: column 7 = 1,035 + 4 Psalm `V` rows − 14 ghosts = 1,025; column 8 = 1,592 − 14 = 1,578.

### Ketiv parsing (`parse_ketiv`)

| Kind | Source | Format | Rule |
|---|---|---|---|
| Q(K), `meaning` | column 7 | `K= 'o.ho.Lo/h (אָהֳלֹ/ה\׃) "tent/ his" (H0168G/H9023\H9016=HNcbsc/Sp3ms)` | Split on `¦`; in the one segment starting `K=`, the first `(…)` after the transliteration |
| Q(k), `spelling` | column 8 | `L= הַוְצֵ֣א ¦ ;K= הוֹצֵא` | Split on `¦`/`;`; the one segment starting `K=` |

- **The result must be Hebrew only:** Hebrew letters and marks, `/`, `\`, spaces. Then `\` punctuation segments are stripped and `/` piece breaks kept: 802 Ketiv forms keep a `/`, and none keeps a `\`.
- **A row that doesn't fit would be left NULL and listed.** None don't.
- **Formats checked across all rows:**
  - Every Q(K) has its Ketiv in column 7 and every Q(k) in column 8. `K=` appears in no other text type.
  - One Q(K) has another variant first: Neh 2:13 #17, `B= … ¦ K= ha/me.for.va.tzim (הַ/מְפֹרוָצִים) …` → `הַ/מְפֹרוָצִים`. Splitting on `¦` handles it.
  - 4 rows that seemed to contain `K=` twice only have it inside a Strong's number (`H2342K=`), so they parse normally.

| Row | Printed (Qere) | `ketiv_hebrew` | Kind |
|---|---|---|---|
| Gen 9:21 #07 | אָהֳלֽ/וֹ | אָהֳלֹ/ה | meaning |
| Gen 8:17 #14 | הַיְצֵ֣א | הוֹצֵא | spelling |
| Gen 30:11 #03 (`//` row) | בָּ֣א//גָ֑ד | בְּ/גָד | meaning |
| Neh 2:13 #17 | הֵ֣ם\׀/ /פְּרוּצִ֔ים | הַ/מְפֹרוָצִים | meaning |

The spec's Item 9 refers to Gen 9:21 and Gen 8:17 without word numbers; the Ketiv words are #07 and #14.

**One upstream oddity, recorded and not changed:** Dan 4:32 #22 (Q(k)) gives a Ketiv identical to the printed word, character for character (`עִלָּיָ/א֙`), while its `L=` form differs (`עִלָּי/אָ֙`). The tier-2 Ketiv line would show the same word twice. U3 could skip the line when `ketiv_hebrew` equals the printed word with slashes and punctuation removed. Checked across all 1,309 parsed Ketiv forms, comparing both sides with `\\` punctuation segments, `/` and spaces removed: this is the only such row.

### Size

`original_word_variants` 200,704 bytes.

### Build totals so far (D2–D5, scratch build `E_d5.db`)

**64,413,696 bytes**, which is **+4,673,536 over the baseline (78% of the 5,974,016-byte limit)**, leaving 1,300,480. Per new table: `original_word_pieces` 3,694,592; `step_morphology_hebrew` + index 376,832; `original_word_variants` 200,704; `hebrew_affixes` + its key index 8,192; plus 393,216 from D2's longer glosses in `original_words`. D6 measures the final build formally.

## D6 — Final build, comparisons, size (2026-10-25)

**Result: all 14 checks pass, and the build is within the size limit.** The final build is `data/stepbible-prep/output/language.db`, sha256 `4ef40609f280f1755acf0149edc3833c0fac8f965c8fbed19e654177e5928c5c`, 64,413,696 bytes. **It is not shipped.** `data/language.db` is still the `8169e14` baseline (`df2b8394…`). Nothing is committed.

**Commit timing (Wayne, 2026-10-25):** after this review the build is shipped to the working copy with `--ship` for the UI phase. **`language.db` is committed once, after `verify.py hebrew` passes**, so any data change the UI work turns up still lands in the single commit.

### Build-script header

`build_language.py`'s docstring now records:
- STEPBible-Data `be4191f0082aeedddb0eff0c02c966292b2bd641`, with the fetch script and the source directory;
- all nine sha256 values;
- that `faf6a35` differed only in TAHOT Job–Song;
- the seven tables written, pointing to this report for the decisions;
- the TAHOT columns now used: text type, columns 7/8, and column 12 per piece.

### Pass/fail comparison against the baseline: `check_rebuild.py`

`python3 -I scripts/analysis/hebrew_anatomy/check_rebuild.py data/language.db data/stepbible-prep/output/language.db data/stepbible-prep/raw/be4191f` checks the allowed differences in both directions. Every Hebrew difference has to be one of the allowed kinds, and every allowed gloss change has to actually be present. Anything else fails.

```
PASS  Greek original_words identical (142,096 rows, content + group membership)
PASS  step_lexicon_greek identical
PASS  step_morphology_greek identical, in order
PASS  every new Hebrew row has its raw TAHOT row (305,634)
PASS  rows added/removed only in the 4 Psalm verses
PASS  Hebrew row count 305,638 -> 305,634 (expected -4)
PASS  no Hebrew difference outside the allowed set
PASS  gloss_dictionary differs on exactly the rows where the rules disagree (59,508 outside the Psalm verses; expected 59,508)
PASS  lemma differs only on #N rows (1 outside the Psalm verses)
        (Psalm verses: 4 keys added/removed, 6 shared keys changed)
PASS  original_word_pieces: 145,688 rows, each a multi-piece Hebrew word whose surface and morph split to the stored shape; root_glosses iff 2+ roots; affix_forms shaped alike
PASS  every multi-piece Hebrew word has a pieces row (145,688)
PASS  hebrew_affixes: 51 rows, 43 numbers, exactly one usual form each; covers every affix number in piece_strongs
PASS  original_word_variants: 1,782 rows on Hebrew words; ketiv_kind matches text type; every Q(K)/Q(k) has a Ketiv (1,309)
PASS  step_morphology_hebrew: 921 codes, Hc present

ALL CHECKS PASSED (14/14)
```

- **How the gloss check works:** it re-runs the previous build's parser on each row's raw column 12 and requires old value = previous rule and new value = `tahot_dictionary_gloss()`.
- **The gloss counts add up:** 59,508 outside the Psalm verses, plus 6 inside them, makes D2's 59,514. The 59,508 include 1Ch 18:10 #09.
- **The lemma change is the approved one:** the only lemma change outside the Psalm verses is 1Ch 18:10 #09, the approved `#N` row.

**The checker catches real defects (negative test).** On a copy of the build with one Greek gloss, one Hebrew transliteration and one Hebrew gloss changed and one pieces row deleted, it reported exactly those four and exited 1 (11/14 passed).

**The build is deterministic.** A second build from the same sources is byte-identical (same sha256), so the `--ship` build will be exactly what was checked here.

### Size (Item 10)

The build ends with `VACUUM`. Vacuuming a copy again leaves it at 64,413,696 bytes, so there are no free pages.

| Table / index | Baseline | Final | Change |
|---|---|---|---|
| `original_words` | 41,730,048 | 42,123,264 | +393,216 (D2's longer glosses) |
| `idx_original_words_strongs` | 6,418,432 | 6,418,432 | 0 |
| `idx_original_words_verse` | 5,718,016 | 5,718,016 | 0 |
| `step_lexicon_greek` (+ key index 151,552) | 5,390,336 | 5,390,336 | 0 |
| `step_morphology_greek` (+ index 155,648) | 475,136 | 475,136 | 0 |
| **`original_word_pieces`** | — | 3,694,592 | +3,694,592 |
| **`step_morphology_hebrew`** (+ `idx_morph_hebrew_code` 118,784) | — | 376,832 | +376,832 |
| **`original_word_variants`** | — | 200,704 | +200,704 |
| **`hebrew_affixes`** (+ key index 4,096) | — | 8,192 | +8,192 |
| `sqlite_schema`, `sqlite_sequence` | 8,192 | 8,192 | 0 |
| **File** | **59,740,160** | **64,413,696** | **+4,673,536 (+7.82%)** |

**Limit: +10% = 65,714,176 bytes. Met, with 1,300,480 bytes to spare.** `original_word_pieces` is 79% of the growth. If the space is ever needed, writing the first root as `{}` (its number is already `original_words.strongs_number`) would save about 0.8 MB (D4).

### What the final build contains, against the spec's checks

| Spec item | Status |
|---|---|
| Rebuilt from STEPBible-Data master, commit and sha256 recorded, changes since `ed476a8` reported | `be4191f`; no source file changed since `ed476a8` (D1) |
| Hebrew 305,634 / Greek 142,096 | ✓ |
| `V` text type imported as main text | ✓ 4 rows, text type kept in `original_word_variants` |
| `gloss_dictionary` fix | Option C, `<base>: <sense>` (D2); H0776G reads `land: country; planet` |
| `original_word_pieces` | 145,688 rows, 0 skipped; braces mark roots (D1 decision); `affix_forms` for 87 rows (D4 decision) |
| `hebrew_affixes` | 51 rows / 43 numbers; the 7 numbers whose pair varies are kept with a usual flag (D4 decision, option A) |
| `original_word_variants` | 1,782 rows; 1,309 Ketiv parsed (the spec's 1,323 counted 14 ghost rows, still skipped) |
| `step_morphology_hebrew` | 921 codes, 7,550 rows, `Hc` present, `(hence …)` unwrapped, `jussive` normalized |
| Greek identical | ✓ every Greek table |
| Size ≤ ~10% | ✓ +7.82% |
| One `language.db` commit | Deferred until `verify.py hebrew` passes (decision above) |

### Shipped to the working copy (after Wayne's review, 2026-10-25)

Rebuilt with `--ship`: `data/language.db` is sha256 `4ef40609f280f1755acf0149edc3833c0fac8f965c8fbed19e654177e5928c5c`, byte-identical to the checked build above. Not committed: it is committed once, after `verify.py hebrew` passes.

### Build log

```
Sources: /home/wayne/ember/data/stepbible-prep/raw/be4191f
  e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b  TAHOT_Gen-Deu.txt
  195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775  TAHOT_Jos-Est.txt
  bb508af3af07822fca84cc43a0eba79eb70eecf672aabc0245b8d8cecf329d96  TAHOT_Job-Sng.txt
  f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5  TAHOT_Isa-Mal.txt
  ab8eaaeb68e17a1dcfa34e1e9350358f22f03bc2a97244d848750ad81044bc8e  TAGNT_Mat-Jhn.txt
  524e32375361e6d3fa2f7ef00b87605fdc4317a762f395651a05fdc31ad031b7  TAGNT_Act-Rev.txt
  312f723d7b8ef263bbdfb0451c9b8057125804dfff390b6f8544cff2a84b57f4  TBESG.txt
  5f0416f7617019a6082285214903bde569a980d5fd3b88b8d7020d944e94de82  TEGMC.txt
  78779bea824b31d4467dec0161d547481c86f266bc39def12cd11dc7dcbe6da7  TEHMC.txt
Parsing TAHOT_Gen-Deu.txt ...
  79990 words
Parsing TAHOT_Jos-Est.txt ...
  107252 words
Parsing TAHOT_Job-Sng.txt ...
  39086 words
Parsing TAHOT_Isa-Mal.txt ...
  79306 words
Parsing TAGNT_Mat-Jhn.txt ...
  66984 words
Parsing TAGNT_Act-Rev.txt ...
  75112 words
Total original_words rows: 447730
original_word_pieces: 145,688 multi-piece words (37 with root_glosses, 87 with affix_forms); 159,946 one-piece words; 0 skipped (columns disagree)
hebrew_affixes: 51 rows for 43 numbers (7 with more than one form)
original_word_variants: 1,782 rows; Ketiv parsed: 999 meaning (Q(K)), 310 spelling (Q(k)); 0 Q(K)/Q(k) rows unparsed
Parsing TBESG.txt ...
  11035 lexicon entries
Parsing TEGMC.txt ...
  9214 category rows across 1644 codes
TEGMC coverage: 100% of distinct Greek morph_code pieces resolved
Parsing TEHMC.txt ...
  7550 category rows across 921 codes (617 H, 304 A; 2440 derived)
TEHMC coverage: 469,294 of 469,294 Hebrew morph pieces resolve
Cleared 1 orphaned single-member group_id(s)

Built /home/wayne/ember/data/stepbible-prep/output/language.db (64,413,696 bytes, 61.4 MiB)
Not copied to /home/wayne/ember/data/language.db (pass --ship to ship this build)
```

---

## UI phase

### U1 — Splitter, Hebrew decode path, `db.js` queries (2026-10-25)

- **`js/grammar-decode.js`:**
  - `splitTahotColumn()` and `splitHebrewMorphCode()`: the runtime twins of the import's splitters.
  - `splitHebrewWord(word, pieceRow, affixes)`: pieces with surface, morph code, contextual gloss, Strong's number, role (the approved rules) and dictionary gloss. Pure and synchronous. A rootless subword's Suffix test reads the code's function letter `S`, which matches TEHMC `Function=Suffix` on all 921 codes.
  - `isHebrewMorphCode()`.
  - `decodeMorphCode()` now has a Hebrew branch returning one entry per piece with `subwordIndex`. Lines are TEHMC's own value text until the authored tables land in U2. The Greek path is unchanged.
- **`js/db.js`:** `getHebrewMorphCategories()`, `getPiecesForWords()` and `getVariantsForWords()` (batched, 500 ids per query), plus `getHebrewAffixes()` (cached for the session; `{ form, gloss, glossByForm }` per number, per option A).
- **Parity test** (`split_parity_export.py` + `split_parity.mjs`; Node imports `grammar-decode.js` directly):
  - **What passes:** all 305,634 Hebrew words split identically in JS and Python (surface, English, morph). 145,688 multi-piece words give 309,348 pieces whose Strong's numbers, roles (121,800 prefix, 145,725 root, 41,823 suffix) and dictionary glosses match raw column 12. One-piece words return `null`. `isHebrewMorphCode` is right on all 4,247 distinct morph codes.
  - **Negative test:** a corrupted fixture fails on all four planted errors.
- **`tests/verify.py hebrew`** (new; U3/U4 extend it): 10 checks against the live app, all passing. They cover every one of the 3,080 Hebrew morph codes (one entry per piece, in order, each with lines), the affix map and its cache, Gen 1:1's pieces and split, the Ketiv rows, and chunked lookup over Psalm 119 (1,064 words). Expected Hebrew comes from the database, not typed literals: the data orders combining marks differently (shin dot before hiriq in רֵאשִׁית).
- **`smoke`'s Hebrew check** now expects decode lines.
- **Every scenario passes, with 0 console errors:** `hebrew`, `smoke`, `popovers`, `notes`, `indicators`, `sw`.

**Open, for U3–U5:**
- **`sw.js` serves `js/` cache-first**, so the changed modules reach existing installs only after a `CACHE_NAME` bump. One bump, with the final UI change.
- **Dev install: re-seed `language.db` in OPFS** (spec Item 1; `OPFS_Reseed_Gap.md`, kept outside the repo, records this as an expected dev step, not a product gap). Until then the old copy is read and Hebrew tier 2 logs `no such table: step_morphology_hebrew`. From the browser console: `await (await navigator.storage.getDirectory()).removeEntry('language.db')`, then reload ("Clear site data" doesn't wipe OPFS in Firefox).
- **Hebrew tier 2 is interim until U2.** It shows TEHMC's raw values, e.g. `Intensive/resultive/transtive` and `Future/present`; D3's "never reaches the screen" holds once U2's wording tables land.

### U2 — Hebrew wording tables (2026-10-25): for review before U3

**Result:** every one of the 89 (category, value) pairs the data uses is accounted for. The data can produce **90 distinct lines, every one with authored wording (0 fall back to TEHMC's bare text)**. Checked by `hebrew_wording_check.mjs` over all 742 codes / 469,294 piece occurrences, and in the browser by `verify.py hebrew` (all 3,080 morph codes). `smoke` passes, and Greek decoding is unchanged.

**Interim display:** until U3, the word card shows these lines under each piece's code in the Greek layout. The anatomy view comes next.

#### How a piece's lines are built (`hebrewMorphLines`)

Order follows TEHMC's own: Function, Stem, Form, Mood, Person, Gender, Number, State.
- **Folded into the Stem and Form wording, never their own line:** TEHMC's derived values (Action/Voice implied by the Stem, Tense implied by the Form). TEHMC calls them likely, not definite.
- **Mood:** a line only for the jussive/cohortative readings: `Jussive`, `Cohortative`, `Indicative/jussive` (the common Imperfect case) and `Indicative/cohortative`. Never for plain `Indicative`, nor for `Imperative`, since the Form already says it.
- **Left out as defaults:** `Form=Common` (an ordinary noun or adjective), as in the spec's own example.
- **Particles and pronouns** show their Form line (`Object indicator`, `Personal`) in place of a bare "Particle"/"Pronoun".
- **Suffixes** are one line: a pronoun suffix's person/gender/number combined (`Suffix - A pronoun ending: third person masculine singular`), any other suffix its Form (`Directional`, `Paragogic Hé`). This keeps prefix and suffix pieces to one or two lines, as the spec asks.
- **A proper name's gender** says whose name it is (`Masculine - A man's name`, `Location - The name of a place`).

#### Editorial rules (spec Item 6)

- **Stems are hedged and written from TEHMC's derived Action/Voice**, not from classroom labels:
  - Piel is "Often brings about a result, strengthens the plain meaning, or makes it act on someone". That is TEHMC's own "Intensive/resultive/transtive", never "Piel = intensive".
  - Active stems don't say "done by the subject", because Qal also has a passive participle (8 codes TEHMC marks Passive).
- **Verb forms make no certain time claim:**
  - Imperfect is "An action not seen as complete: often future or present … context decides". It is never phrased as future.
  - Consecutive Imperfect follows the spec's example, "Usually tells the next event in a story (past)"; Consecutive Perfect gets the matching treatment.
- **Greek wording is reused where the meaning really matches:** Verb, Noun, Singular, Masculine, the persons, Imperative, the definite article, Negative, Demonstrative, Relative, Personal, Gentilic, Location.

#### Samples

**Gen 1:1 #01 prefix בְּ** `HR` (48,979 occurrences)

- Preposition - In, on, to, from, with, through

**Gen 1:1 #01 root רֵאשִׁית** `HNcfsa` (12,236 occurrences)

- Noun - A person, place, thing, or idea
- Feminine - A grammatical gender; not always a female
- Singular - Just one
- Absolute - Standing on its own

**Gen 1:3 #01 prefix וַ** `Hc` (21,327 occurrences)

- Conjunction - Joining word (and, but, or, for, because)
- Consecutive - The "and" that ties this verb to the one before it as the next step

**Gen 1:3 #01 root יֹּאמֶר** `HVqw3ms` (7,322 occurrences)

- Verb - An action, event, or state of being
- Qal - The basic stem: the plain meaning of the verb
- Consecutive Imperfect - Usually tells the next event in a story (past): "and he said"
- Third - Someone or something being talked about (he, she, it, they)
- Masculine - A grammatical gender; not always a male
- Singular - Just one

**Gen 2:2 #05 suffix וֹ** `HSp3ms` (13,530 occurrences)

- Suffix - A pronoun ending: third person masculine singular

**article הַ** `HTd` (23,948 occurrences)

- Definite article (Hebrew) - The word "the"

**בַּ "in the"** `HRd` (12,176 occurrences)

- Preposition - In, on, to, from, with, through
- Definite - With "the" included (as בַּ, "in the")

**אֵת** `HTo` (10,977 occurrences)

- Object indicator - Marks the next word as the definite object of the verb; not translated in English

**Qal imperfect** `HVqi3ms` (3,113 occurrences)

- Verb - An action, event, or state of being
- Qal - The basic stem: the plain meaning of the verb
- Imperfect - An action not seen as complete: often future or present ("he will say", "he says"), sometimes repeated in the past; context decides
- Indicative/jussive - Either a statement or a wish ("he will ..." or "may he ..."): the form is the same, so context decides
- Third - Someone or something being talked about (he, she, it, they)
- Masculine - A grammatical gender; not always a male
- Singular - Just one

**Qal jussive** `HVqj3ms` (248 occurrences)

- Verb - An action, event, or state of being
- Qal - The basic stem: the plain meaning of the verb
- Imperfect - An action not seen as complete: often future or present ("he will say", "he says"), sometimes repeated in the past; context decides
- Jussive - A wish or mild command, usually about someone else ("may he ...", "let it ...")
- Third - Someone or something being talked about (he, she, it, they)
- Masculine - A grammatical gender; not always a male
- Singular - Just one

**Niphal perfect** `HVNp3ms` (425 occurrences)

- Verb - An action, event, or state of being
- Niphal - Often passive: the subject receives the plain meaning ("was sent")
- Perfect - A complete action: usually past ("he said"), sometimes a present state ("he knows"); context decides
- Third - Someone or something being talked about (he, she, it, they)
- Masculine - A grammatical gender; not always a male
- Singular - Just one

**Qal passive participle** `HVqsmsa` (392 occurrences)

- Verb - An action, event, or state of being
- Qal - The basic stem: the plain meaning of the verb
- Participle passive - A verb form used like a describing word, for something the action is done to ("written", "blessed")
- Masculine - A grammatical gender; not always a male
- Singular - Just one
- Absolute - Standing on its own

**man's name** `HNpm` (14,802 occurrences)

- Noun - A person, place, thing, or idea
- Proper - A proper name
- Masculine - A man’s name

**Aramaic Haphel perfect** `AVhp3ms` (31 occurrences)

- Verb - An action, event, or state of being
- Haphel - Often causes the plain meaning or declares it (like Hebrew Hiphil)
- Perfect - A complete action: usually past ("he said"), sometimes a present state ("he knows"); context decides
- Third - Someone or something being talked about (he, she, it, they)
- Masculine - A grammatical gender; not always a male
- Singular - Just one

#### Every line the data can produce (90), by occurrences

| Line | Occurrences |
|---|---|
| Noun - A person, place, thing, or idea | 150,886 |
| Singular - Just one | 145,103 |
| Masculine - A grammatical gender; not always a male | 140,884 |
| Absolute - Standing on its own | 76,525 |
| Verb - An action, event, or state of being | 73,732 |
| Construct - Read with the next word: "X of ..." | 70,604 |
| Preposition - In, on, to, from, with, through | 62,104 |
| Plural - More than one | 54,100 |
| Conjunction - Joining word (and, but, or, for, because) | 51,845 |
| Qal - The basic stem: the plain meaning of the verb | 50,206 |
| Third - Someone or something being talked about (he, she, it, they) | 40,898 |
| Feminine - A grammatical gender; not always a female | 38,415 |
| Proper - A proper name | 33,907 |
| Definite article (Hebrew) - The word "the" | 23,948 |
| Either gender - The same form serves for male or female | 22,727 |
| Consecutive - The "and" that ties this verb to the one before it as the next step | 21,327 |
| Imperfect - An action not seen as complete: often future or present ("he will say", "he says"), sometimes repeated in the past; context decides | 15,102 |
| Masculine - A man’s name | 15,030 |
| Consecutive Imperfect - Usually tells the next event in a story (past): "and he said" | 14,981 |
| Perfect - A complete action: usually past ("he said"), sometimes a present state ("he knows"); context decides | 14,793 |
| Adjective - Describes a person or thing | 13,809 |
| Suffix - A pronoun ending: third person masculine singular | 13,748 |
| Second - The one being spoken to (you) | 12,298 |
| Definite - With "the" included (as בַּ, "in the") | 12,184 |
| Indicative/jussive - Either a statement or a wish ("he will ..." or "may he ..."): the form is the same, so context decides | 11,497 |
| Object indicator - Marks the next word as the definite object of the verb; not translated in English | 10,977 |
| Location - The name of a place | 10,719 |
| Hiphil - Often causes the plain meaning ("make reign", "bring up") or declares it ("declare righteous") | 9,415 |
| Participle - A verb form used like a describing word or noun ("the one going"), often for an ongoing action ("is going") | 8,420 |
| First - The one speaking (I, we) | 8,342 |
| Suffix - A pronoun ending: first person singular | 7,791 |
| Infinitive - The verb used as a noun or "to ..." form ("to say", "saying"); no person or time of its own | 7,508 |
| Title - The name of a deity, rank, or month | 7,443 |
| Suffix - A pronoun ending: third person masculine plural | 7,156 |
| Suffix - A pronoun ending: second person masculine singular | 7,140 |
| Piel - Often brings about a result, strengthens the plain meaning, or makes it act on someone | 6,819 |
| Consecutive Perfect - Usually continues a series of actions still to come, or of instructions: "and you shall say" | 6,344 |
| Numerical - A number (one, two, three ...) | 6,319 |
| Negative - Expresses "not" / "no" | 6,051 |
| Conditional - Introduces a condition or its result ("if", "for") | 5,976 |
| Relative - Linking word that introduces a clause (who, which, that) | 5,657 |
| Personal - I, you, he, she, it, we, they | 5,014 |
| Adverb - Tells how, when, where, or how much | 4,440 |
| Imperative - A command or request ("do this!") | 4,305 |
| Niphal - Often passive: the subject receives the plain meaning ("was sent") | 4,148 |
| Suffix - A pronoun ending: third person feminine singular | 3,381 |
| Dual - Two of something, or a natural pair (eyes, hands) | 2,823 |
| Suffix - A pronoun ending: second person masculine plural | 2,667 |
| Demonstrative - Pointing word (this, that, these, those) | 2,664 |
| Interrogative - A question word (who? what? is it ...?) | 2,316 |
| Interjection - An exclamation ("O!", "Look!", "Woe!") | 2,022 |
| Indicative/cohortative - Either a statement or a resolve ("I will ..." or "let me ..."): the form is the same, so context decides | 1,974 |
| Gentilic - The name of a people or group (a member of a named group) | 1,863 |
| Suffix - A pronoun ending: first person plural | 1,630 |
| Suffix - A pronoun ending: second person feminine singular | 1,307 |
| Participle passive - A verb form used like a describing word, for something the action is done to ("written", "blessed") | 1,280 |
| Jussive - A wish or mild command, usually about someone else ("may he ...", "let it ...") | 1,090 |
| Directional - An ending meaning "toward" (as in "homeward") | 1,078 |
| Hithpael - Often the subject acts on or for itself, or repeatedly ("walk about", "consecrate oneself"); sometimes causative instead | 1,001 |
| Conjunction+Imperfect - Joined to "and" without moving the story on: an action not seen as complete; context decides the time | 999 |
| Definite - Has the Aramaic ending that means "the" | 867 |
| Definite article (Aramaic) - The word "the" (in Aramaic, written as an ending) | 866 |
| Numerical position - A position in order (first, second, third ...) | 762 |
| Feminine - A woman’s name | 715 |
| Title - The name of a deity, rank, or month, used as a title | 674 |
| Peal - The basic Aramaic stem: the plain meaning of the verb (like Hebrew Qal) | 629 |
| Cohortative - The speaker’s resolve or wish ("let me ...", "let us ...", "I should ...") | 543 |
| Pual - Often the passive of Piel: the result or action is done to the subject | 515 |
| Hophal - Often the passive of Hiphil: the subject is caused to do or be the plain meaning | 431 |
| Paragogic Hé - An extra ending that adds emphasis or feeling; usually not translated | 407 |
| Paragogic Nun - An extra ending that adds emphasis or feeling; usually not translated | 309 |
| Suffix - A pronoun ending: third person feminine plural | 239 |
| Haphel - Often causes the plain meaning or declares it (like Hebrew Hiphil) | 161 |
| Hishtaphel - A rare stem, used almost only for "bow down, worship": the subject brings itself low | 131 |
| Pael - Often brings about a result, strengthens the plain meaning, or makes it act on someone (like Hebrew Piel) | 88 |
| Peil - Often passive of the basic Aramaic stem: the subject receives the plain meaning | 65 |
| Hitpael - Often passive: a result or action done to the subject | 53 |
| Suffix - A pronoun ending: first person feminine singular | 52 |
| Suffix - A pronoun ending: first person masculine singular | 48 |
| Hitpaal - Often the subject acts on or for itself, or repeatedly (like Hebrew Hithpael) | 30 |
| Suffix - A pronoun ending: second person feminine plural | 19 |
| Shaphel - Often causes the plain meaning (like Hebrew Hiphil) | 15 |
| Suffix - A pronoun ending: first person masculine plural | 8 |
| Hothpaal - A rare stem: often the passive of Hithpael | 8 |
| Suffix - A pronoun ending: first person feminine plural | 7 |
| Hitpeel - Often passive or reflexive of the basic Aramaic stem: done to the subject, or by it to itself | 5 |
| Aphel - Often causes the plain meaning or declares it (like Hebrew Hiphil) | 4 |
| Nithpael - A rare stem: often the passive of Hithpael | 3 |
| Tiphil - A rare stem: often causes the plain meaning, like Hiphil | 3 |
| Ishtaphel - A rare stem: often the subject causes itself to do the plain meaning | 2 |

<details><summary>Every (category, value) pair used (89) and how it shows</summary>

| Pair | Occurrences | How it shows |
|---|---|---|
| `Action=Causative/declarative` | 10,162 | folded into Stem/Form wording |
| `Action=Intensive/resultive/transtive` | 8,519 | folded into Stem/Form wording |
| `Action=Simple` | 55,051 | folded into Stem/Form wording |
| `Form=Common` | 121,170 | left out (default) |
| `Form=Conditional` | 5,976 | own line |
| `Form=Conjunction+Imperfect` | 999 | own line |
| `Form=Consecutive Imperfect` | 14,981 | own line |
| `Form=Consecutive Perfect` | 6,344 | own line |
| `Form=Consecutive` | 21,327 | own line |
| `Form=Definite article (Aramaic)` | 866 | own line |
| `Form=Definite article (Hebrew)` | 23,948 | own line |
| `Form=Definite` | 12,184 | own line |
| `Form=Demonstrative` | 2,664 | own line |
| `Form=Directional` | 1,078 | own line |
| `Form=Gentilic` | 1,863 | own line |
| `Form=Imperative` | 4,305 | own line |
| `Form=Imperfect` | 15,102 | own line |
| `Form=Infinitive` | 7,508 | own line |
| `Form=Interjection` | 2,022 | own line |
| `Form=Interrogative` | 2,316 | own line |
| `Form=Negative` | 6,051 | own line |
| `Form=Numerical position` | 762 | own line |
| `Form=Numerical` | 6,319 | own line |
| `Form=Object indicator` | 10,977 | own line |
| `Form=Paragogic Hé` | 407 | own line |
| `Form=Paragogic Nun` | 309 | own line |
| `Form=Participle passive` | 1,280 | own line |
| `Form=Participle` | 8,420 | own line |
| `Form=Perfect` | 14,793 | own line |
| `Form=Personal` | 50,207 | own line; combined into the Suffix line |
| `Form=Proper` | 33,907 | own line |
| `Form=Relative` | 5,657 | own line |
| `Form=Title` | 674 | own line |
| `Function=Adjective` | 13,809 | own line |
| `Function=Adverb` | 4,440 | own line |
| `Function=Conjunction` | 51,845 | own line |
| `Function=Noun` | 150,886 | own line |
| `Function=Particle` | 59,276 | replaced by its Form line |
| `Function=Preposition` | 62,104 | own line |
| `Function=Pronoun` | 6,215 | replaced by its Form line |
| `Function=Suffix` | 46,987 | own line; combined into the Suffix line |
| `Function=Verb` | 73,732 | own line |
| `Gender=Either gender` | 32,148 | own line; combined into the Suffix line |
| `Gender=Feminine` | 44,135 | own line; combined into the Suffix line |
| `Gender=Location` | 10,719 | own line |
| `Gender=Masculine` | 186,681 | own line; combined into the Suffix line |
| `Gender=Title` | 7,443 | own line |
| `Mood=Cohortative` | 543 | own line |
| `Mood=Imperative` | 4,305 | left out (default or same as Form) |
| `Mood=Indicative` | 37,115 | left out (default or same as Form) |
| `Mood=Indicative/cohortative` | 1,974 | own line |
| `Mood=Indicative/jussive` | 11,497 | own line |
| `Mood=Jussive` | 1,090 | own line |
| `Number=Dual` | 2,823 | own line |
| `Number=Plural` | 65,826 | own line; combined into the Suffix line |
| `Number=Singular` | 178,570 | own line; combined into the Suffix line |
| `Person=First` | 17,878 | own line; combined into the Suffix line |
| `Person=Second` | 23,431 | own line; combined into the Suffix line |
| `Person=Third` | 65,422 | own line; combined into the Suffix line |
| `State=Absolute` | 76,525 | own line |
| `State=Construct` | 70,604 | own line |
| `State=Definite` | 867 | own line |
| `Stem=Aphel` | 4 | own line |
| `Stem=Haphel` | 161 | own line |
| `Stem=Hiphil` | 9,415 | own line |
| `Stem=Hishtaphel` | 131 | own line |
| `Stem=Hithpael` | 1,001 | own line |
| `Stem=Hitpaal` | 30 | own line |
| `Stem=Hitpael` | 53 | own line |
| `Stem=Hitpeel` | 5 | own line |
| `Stem=Hophal` | 431 | own line |
| `Stem=Hothpaal` | 8 | own line |
| `Stem=Ishtaphel` | 2 | own line |
| `Stem=Niphal` | 4,148 | own line |
| `Stem=Nithpael` | 3 | own line |
| `Stem=Pael` | 88 | own line |
| `Stem=Peal` | 629 | own line |
| `Stem=Peil` | 65 | own line |
| `Stem=Piel` | 6,819 | own line |
| `Stem=Pual` | 515 | own line |
| `Stem=Qal` | 50,206 | own line |
| `Stem=Shaphel` | 15 | own line |
| `Stem=Tiphil` | 3 | own line |
| `Tense=Future/present` | 22,445 | folded into Stem/Form wording |
| `Tense=Past/present` | 29,774 | folded into Stem/Form wording |
| `Tense=Present/future` | 4,305 | folded into Stem/Form wording |
| `Voice=Active` | 66,368 | folded into Stem/Form wording |
| `Voice=Passive` | 6,197 | folded into Stem/Form wording |
| `Voice=Reflexive/iterative` | 1,167 | folded into Stem/Form wording |

</details>

#### TEHMC anomalies recorded, not changed

- **`HVPrmpa`** (Pual participle) is marked Active; every other Pual code is Passive. Pual's "often" wording covers it.
- **`AVvi3mp`** (Ishtaphel, 2 occurrences) is coded imperfect (`i`) but labelled `Form=Perfect` with `Mood=Indicative/jussive`. It shows TEHMC's Perfect wording plus the Indicative/jussive line. (`HVvi3mp` has the same labels but is unused.)
- **Hitpeel** (5 occurrences) has two different Action/Voice pairs, so its wording covers both ("passive or reflexive").
- **The section header and the values disagree on Hothpaal:** the header says it is classified Reflexive, but its code values say Passive. The wording follows the values.

#### Review (Wayne, 2026-10-25)

Items 1–3 below approved as written. Item 4 is taken up in U3.

#### Open for your review

1. **The stem and verb-form wording:** the lines above.
2. **The suffix as one combined line** rather than separate Person/Gender/Number lines (Greek-style).
3. **Leaving out `Form=Common` and plain `Indicative`.**
4. **Affix display glosses** (spec Item 6, optional), such as `&` → "and": deferred to U3, where you'll see them on screen, per the spec's Open Question 3.

### U3 — Word card: anatomy view, Aramaic label, Ketiv line (2026-10-25)

`js/language.js` and `css/style.css`. The word card follows spec Item 7.

- **Data loading:** pieces, variants and the affix table are fetched once per selection, alongside the verse words. That is one batched query each (affixes cached for the session), never one per word. If the lookup fails, the card falls back to the plain display and logs the error.
- **Tier 1:** Aramaic-coded words get an **"Aramaic"** line under the morph code, styled like the Strong's line. Only Hebrew-tab words qualify (Greek codes such as `ADV` also start with A).
- **Tier 2, multi-piece words:** the raw code, then one block per piece in reading order:
  - the piece's Hebrew (Ezra SIL, RTL);
  - its role (**Prefix / Word / Suffix**);
  - this occurrence's gloss for it, in quotes;
  - its decoded lines.

  Pieces are separated by a dotted rule, lighter than the solid divider between the member words of a grouped row (Open Question 1).
- **`//` words:** one group per written word, each under its own Hebrew (2Ki 19:37 #08 shows וְשַׂרְאֶצֶר and בָּנָיו).
- **A piece's general gloss:** a small "General usage: …" line under a piece when its general gloss says something this occurrence's doesn't:
  - בַּ here "with the", generally "in";
  - the לְבַד suffixes here "him", generally "he";
  - the second root of a two-root word.

  A one-root word's root gloss stays in the word's own "General usage" field, as before.
- **Affix display forms** (Open Question 3, `AFFIX_GLOSS_DISPLAY` in `language.js`): `&` → "and", `¿` → "(question)", `emph.` → "(emphasis)". These are display only; `hebrew_affixes` keeps TAHOT's text. Because the line appears only when it differs from this occurrence's gloss, `&` rarely shows (it reads "and" in both).
- **Ketiv line:**
  - "Written (Ketiv): <Hebrew>", followed by the meaning note (Q(K)) or "Spelling difference only." (Q(k)).
  - **Skipped for Dan 4:32 #22**, whose Ketiv is identical to the printed word (D5).
- **One-piece words and any word that can't be split:** the plain decoded lines, exactly like Greek.

**Visual check** (Playwright screenshots, fresh profile, light and dark):
- **Cases:** Gen 1:1 #01 and #07, Gen 3:1 #01, Gen 2:2 #05, Gen 8:17 and Gen 9:21 (Ketiv), 2Ki 19:37 #08 (`//` + Ketiv), 1Ch 27:12 #06 (paseq + `//`), Dan 2:4 #01 and #05, Dan 3:1, Psa 44:14 #06, Deu 4:35 (לְבַד), and a one-piece word. Zero console errors.
- **Tallest cards (Open Question 2):** 1Ki 7:11 וּמִלְמַעְלָה (5 pieces, 852 px), and the 2Sa 20:15 three-word group with all members expanded (6 pieces, 1,589 px). In a 432 px panel, the member just expanded stays in view after each of three expansions, so the existing scroll fallback needs no change.

**Tests:** `hebrew` and `smoke` pass, with 0 console errors. The spec's Item 9 word-card checks are added to `hebrew` in U4.

**Review (Wayne, 2026-10-25): all four approved as built.**

**For Wayne to judge on screen:**
1. The piece layout.
2. The "General usage" line under pieces.
3. The three affix display forms.
4. Skipping the identical Ketiv at Dan 4:32.

### U4 — Verification, attribution, service worker (2026-10-25)

- **`verify.py hebrew` now has all of spec Item 9: 27 checks (11 data-level from U1–U2, 16 word-card), all passing.** The word-card checks open each word's card in the running app and read back what's shown. Each row of Item 9 has a check:
  - **Gen 1:1 #01:** Prefix "in" + Word "beginning", each with lines.
  - **Gen 1:1 #07:** General usage `land: country; planet`; 2 pieces, the sof pasuq not a piece.
  - **Gen 1:3 #01:** the `Hc` prefix decodes, and the verb-form line is hedged ("Usually …", no "will").
  - **Gen 2:2 #05:** a Suffix "his".
  - **Gen 8:17 #14 / Gen 9:21 #07:** the Ketiv, with the spelling and meaning notes.
  - **2Ki 19:37 #08:** two written-word groups, 4 pieces.
  - **1Ch 27:12 #06:** the paseq row's pieces and roles match the data.
  - **Dan 2:4:** no Aramaic label on words 1–4, a label on words 5–12.
  - **Dan 3:1:** the Aramaic label and Peal wording.
  - **Psa 44:14 #06:** the `V` row.
  - **A one-piece word:** Greek-style lines, no piece blocks.
  - **John 1:1:** Greek tier 2 unchanged.
  - **The credit:** TEHMC listed next to TEGMC.

  Expected Hebrew always comes from the database, never typed literals.
- **Attribution (spec Item 8):** the STEPBible-Data credit in **Settings → Data & Attribution** now names its datasets: "…and Greek and Hebrew grammar decoding: the TAHOT, TAGNT, TBESG, TEGMC and TEHMC datasets…". This follows the precedent from when TEGMC was added (FEATURE_INVENTORY 236h): extend that entry's note rather than add a new one, which would contradict the section's "Two sources are licensed CC BY 4.0". The README's attribution table had already drifted from the in-app text (it lacked "grammar decoding") and now matches it again.
- **`sw.js`:** `CACHE_NAME` `ember-v9` → `ember-v10`. No `js/` file was added, but `db.js`, `grammar-decode.js`, `language.js`, `global-settings.js` and `style.css` changed, and the worker serves them cache-first.
- **All scenarios pass, with 0 console errors:** `hebrew`, `smoke`, `popovers`, `notes`, `indicators`, `sw`. The JS/Python split parity and the wording check pass again on the final code. `data/language.db` is still the checked build (`4ef40609…`).

### U5 — Documentation (2026-10-25)

- **`FEATURE_INVENTORY.md`:**
  - 142n rewritten: Hebrew now decodes.
  - New 142o–142v: the wording rules, anatomy view, splitting and roles, `//` groups, piece "General usage" lines and affix display forms, the Ketiv line, the Aramaic label, and batched loading.
  - 247–250 updated: row counts, pinned sources, size, `--ship` and the rebuild check.
  - New 252–256: `step_morphology_hebrew`, `original_word_pieces`, `hebrew_affixes`, `original_word_variants`, and the `gloss_dictionary` rule.
  - 236h extended: TEHMC credit.
- **`USER_MANUAL.md`:** a Language-tab section on Hebrew word anatomy, the careful verb wording, the Aramaic label, and Ketiv/Qere. The Language tab's download size is now about 64 MB.
- **`docs/Hebrew_Word_Anatomy_Spec.md`:** marked implemented. The Definition of Done is checked off, with notes where a recorded decision changed an item.
- **`CLAUDE.md`, `README.md`:** `language.db`'s contents, `grammar-decode.js`'s role, `scripts/analysis/`, and this report in the documentation index.
