# Ember Bible Study — Build 6 Specification

**Purpose:** Add the Language tab — the reference panel's entry point for original-language word study. Selecting a verse (or range) shows the original Hebrew/Greek text of that verse, word by word, each with its contextual English gloss. Selecting a word opens a dedicated detail view with lemma, grammar, and lexicon entry.

**Prerequisite:** Build 5 complete. Reading plans, backup/restore, and study templates shipped and stable.

**Status:** Fully resolved and ready for implementation. Data sourcing (Item 1), versification (Item 2), the interlinear layout and RTL/typography specifics (Item 3), word detail content (Item 4), and attribution (Item 5) are all decided. One upstream dependency (psalm title data completeness) is resolved separately — see below. Ezra SIL rendering verified 2026-08-31 — no remaining pre-implementation blockers.

**Upstream dependency — resolved and implemented, see `Psalm_Title_Fix_Spec.md`:** Verifying TAHOT's versification surfaced that Ember's core `KJV.db` does not store psalm (and likely other) superscriptions/titles as text at all. Investigation found this gap is common across available public-domain KJV digital sources (checked directly, not assumed), not unique to Ember -- so KJV/ASV/Darby's base text remains without title wording for now, matching most other sources. `kjv.db`, `asv.db`, and `darby.db` now carry an empty-text verse=0 placeholder row for each of the 116 titled Psalms (via `scripts/build_translation.py`'s `add_psalm_title_placeholders()`), giving the title a real, addressable `verse_id` ahead of this build. WEB/YLT/BSB were left untouched -- their titles are already merged into verse 1's own text by their source data, and that representation is being kept as-is rather than split out.

**Still open for Build 6 implementation time (Psalm_Title_Fix_Spec.md, last Definition of Done item):** KJV/ASV/Darby's verse=0 rows are empty placeholders, not TAHOT text. When this build's import populates `original_words` for `Psa.X.0`, decide whether those three translations' verse=0 row should then display TAHOT's English gloss as a substitute title, continue showing nothing, or something else. Until that decision is made and implemented, the reader skips rendering those rows entirely (empty title text renders as nothing, not a blank line) -- see `js/reader.js`'s `renderPane()`.

---

## Design Principle: Word Study Without New Selection Machinery

The reader currently supports only verse-level selection (single verse or contiguous range via shift-click). Build 6 deliberately does not add word-level click/drag to the reader — that would touch the most sensitive, highest-traffic surface in the app for a feature that doesn't need it.

Instead, the Language tab treats a verse selection as an *input* to an interlinear display, the same way the Tags and Related tabs already treat selection as an input to their content. Word-level interaction happens entirely within the reference panel, not in the reader.

| Surface | Existing pattern reused | Build 6 addition |
|---|---|---|
| Language tab (interlinear view) | `selection-changed` event, same as Tags/Related | Original-language verse text + word-by-word gloss list, grouped by verse |
| Word detail view | View-swap within a tab, same pattern as Plans → plan detail popover | Full word detail: lemma, transliteration, Strong's #, morphology, lexicon entry |

This design emerged from a deliberate pivot in conversation: the original idea (an English-word list tagged with Strong's numbers) was replaced with a true interlinear — original-language text shown directly, with the English gloss carried per word — after research into how existing word-study tools (STEP Bible, and others) present this to users. The original-language text is the anchor; the English gloss and lexicon are support for reading it.

---

## Scope

### In Scope

1. **Language tab interlinear view** — for a selected verse (or range), show the Hebrew/Greek text word by word, each word paired with its contextual English gloss, grouped by verse
2. **Word grouping** — where multiple original-language words correspond to one English concept (or vice versa), reflect that grouping rather than a naive one-to-one list (data supports this natively — see Item 2)
3. **Word detail view** — tap a word, tab content swaps to a single-word page; back action returns to the interlinear view
4. **Schema** — new tables for TAHOT/TAGNT word-level text and TBESG lexicon entries
5. **Attribution** — CC BY 4.0 requires visible attribution; needs a location in the app (not yet designed anywhere)

### Out of Scope (Explicit)

- Word-level click/drag selection in the reader itself
- Any lookup tied to a specific English translation's word alignment (KJV or otherwise) — superseded by the interlinear approach; the English gloss comes from STEPBible's own contextual translation, not from mapping onto Ember's bundled KJV text
- TFLSJ (full LSJ lexicon) — deferred; see "What Comes Next" below
- TBESH (Hebrew lexicon Meaning field) — dropped; see Item 1 resolution
- "Other occurrences of this word" / cross-reference list on the word detail view — deferred, likely Build 7
- Webster's 1913 dictionary double-click lookup — a separate, later feature; not to be conflated with this Strong's/interlinear feature even though both involve word-level interaction
- Any editing or user-created language data

---

## Item 1: Data Sourcing and Verification — RESOLVED

### Design Pivot

The original plan (English-word list, tagged with Strong's numbers via a KJV-to-Strong's alignment dataset) was abandoned after two things happened in the same research pass:

1. Investigation showed the alignment dataset this depended on doesn't reliably exist in a verified, well-formed shape (scrollmapper's `master` branch is verse-text-only; its `2024` branch and other candidate sources were never confirmed to carry genuine word-level alignment).
2. Wayne researched how other Bible word-study tools present this to users and preferred a true interlinear: original-language verse text with per-word English glosses, not an English word list with Strong's numbers bolted on.

The interlinear approach turned out to be **better supported by available data**, not just better UX — STEPBible-Data's TAHOT/TAGNT files carry contextual (not generic) English glosses natively, per word, which the KJV-alignment approach would have had to construct from scratch.

### Verified Data Sources

All verified directly against real file contents (not repo descriptions) via Claude Code, 2026-08-29.

**TAHOT** (Translators Amalgamated Hebrew OT) and **TAGNT** (Translators Amalgamated Greek NT) — STEPBible-Data, CC BY 4.0.

- One row per original-language word (or prefix/root/suffix cluster printed as one word)
- Every row carries a Strong's number and morphology code
- Every row carries a contextual English gloss specific to that occurrence, not a flat dictionary definition
- Word grouping is natively encoded, not something Ember needs to derive:
  - **Hebrew (`+` continuation marker):** a Strong's tag ending in `+` means it continues onto the next word — used for compound forms split across printed words (e.g. "Tubal-cain" as two Hebrew words sharing one Strong's number)
  - **Greek (`»` conjoin marker):** a field like `#04»05:G3056` means this word is grammatically bound forward to word #05 under Strong's G3056 — used for article-noun and similar bindings (e.g. "the Word" as two Greek words, one concept)
- TAGNT carries three distinct levels of English text per word, useful for different display purposes: a contextual verse translation, a dictionary-form gloss, and a context-sensitive sub-meaning

**TBESG** (Translators Brief lexicon of Extended Strongs for Greek) — STEPBible-Data, CC BY 4.0.

- 8 columns: eStrong# / dStrong / uStrong / Greek / Transliteration / Morph / Gloss / Meaning
- 11,035 entries, Abbott-Smith-derived, brief working definitions (example: G3056/logos entry is 5,646 characters)
- In scope for Build 6 as the lexicon source on the word detail page

**TBESH** (Hebrew counterpart to TBESG) — **dropped from scope.** Its Meaning field is sourced from Larry Pierce's Abridged BDB (Online Bible), carrying its own explicit clause: "Permission should be gained from Online Bible before these definitions are applied in any project." This is a separate rights holder from STEPBible/Tyndale House, not cleared, and not pursued. Hebrew word detail pages will show lemma, transliteration, Strong's number, morphology, and TAHOT's contextual gloss — without a Hebrew lexicon paragraph. This is a known, accepted asymmetry between Hebrew and Greek word detail pages for this build.

**TFLSJ** (full LSJ lexicon, Greek) — verified, genuinely excellent (full classical Liddell-Scott-Jones scholarly entries, ~13x TBESG's depth), but **deferred**, not dropped. At ~32.2 MB combined (main + extra files) versus TBESG's 4.7 MB, bundling it now is a real weight decision that shouldn't be made blind. Revisit once `core.db`'s baseline size (post-Build-6) is known. See "What Comes Next."

### License — Resolved

All four files (TAHOT, TAGNT, TBESG, TFLSJ) carry the same STEPBible CC BY 4.0 terms, including a repeated line: *"Refer others to github.com/STEPBible as the source of the data. Please do not redistribute it yourself."*

This was initially flagged as a possible conflict with bundling. **Resolved by Wayne's own reading, confirmed correct:** this is a provenance/attribution control, not a use restriction — comparable to "anyone may use and adapt my recipe, but if someone else wants the recipe itself, point them to me rather than becoming a second distribution point for it." STEPBible's own README states data may be included "in any software or publications without requesting permission," and separately expresses interest in hearing about projects that use it once available. Ember bundling a reformatted copy of this data to power an in-app feature is covered by that permission; it is not the kind of raw-file redistribution the "don't redistribute it yourself" line is aimed at.

**Action taken:** none required now. Wayne will notify STEPBible of Ember's existence once it's available, consistent with their stated interest, rather than requesting permission that their own terms say isn't required.

**Still required regardless of the above:** visible in-app attribution to STEPBible (linked to stepbible.org), per CC BY 4.0's actual requirement — see Item 5.

---

## Item 2: Schema

```sql
-- Original-language word-level text with Strong's, morphology, and gloss
-- Populated from TAHOT (Hebrew) and TAGNT (Greek)
CREATE TABLE IF NOT EXISTS original_words (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id            INTEGER NOT NULL,       -- BBCCCVVV, matches existing verse ID convention
    word_position       INTEGER NOT NULL,       -- order within the verse, 0-indexed
    language            TEXT NOT NULL,          -- 'hebrew' | 'greek'
    surface_text        TEXT NOT NULL,          -- original-language word as printed (with pointing/accents)
    transliteration     TEXT,
    gloss_contextual     TEXT,                  -- verse-specific English translation (TAHOT col 4 / TAGNT col 3)
    gloss_dictionary     TEXT,                  -- stable dictionary-style gloss. Greek: straight copy of TAGNT col 5. Hebrew: parsed out of TAHOT col 12's {dStrong=Form=Gloss»SubMeaning} structure -- take text after 2nd '=', before any '»'
    strongs_number       TEXT,                  -- e.g. 'H1254', 'G3056'; nullable
    morph_code            TEXT,                 -- raw morphology code from source data
    group_id              INTEGER               -- precomputed at import time from the raw '+'/'»' markers; NULL for ungrouped words, shared ID across rows that form one display unit
);

CREATE INDEX IF NOT EXISTS idx_original_words_verse ON original_words(verse_id);
CREATE INDEX IF NOT EXISTS idx_original_words_strongs ON original_words(strongs_number);

-- Bare Strong's lexicon -- already exists per Build 2-era bundling; confirm rather than recreate
-- (existing `strongs` table, if present, from openscriptures/strongs -- CC BY-SA 3.0)

-- STEPBible brief Greek lexicon -- NEW this build
CREATE TABLE IF NOT EXISTS step_lexicon_greek (
    strongs_number  TEXT PRIMARY KEY,       -- links to original_words.strongs_number
    lemma           TEXT,
    transliteration TEXT,
    morph           TEXT,
    gloss           TEXT,
    meaning         TEXT                    -- full TBESG entry
);
```

### Versification -- Verified 2026-08-30

Confirmed directly against Ember's actual `build_db.py` and `KJV.db` (not assumed):

- **Ember's book scheme:** standard Protestant 66-book canon, Genesis=1 through Revelation=66, no Apocrypha. `bbcccvvv(book, chapter, verse) = book*1_000_000 + chapter*1_000 + verse`.
- **STEPBible's book codes:** same 66 books, same order, no Apocrypha in TAHOT/TAGNT -- but different abbreviation spelling (UBS-style: `Sng` not `Song`, `Psa` not `Ps`, `1Sa`/`2Sa` not `1Sam`/`2Sam`, `Ezk` not `Ezek`, etc.). A static 66-row code-to-book-number lookup table is sufficient -- no missing, extra, or split books.
- **Chapter/verse numbers are NOT a safe straight pass-through.** Two distinct, verified special-casing rules are required, and they are opposite conventions -- easy to invert by accident:
  - **TAHOT (Hebrew/OT):** reference format is `primary(Hebrew)`, e.g. `Mal.4.1(3.19)`. The primary (pre-parenthesis) number is the English/KJV-aligned verse; the parenthetical is Masoretic/Hebrew-only numbering and should be **ignored** for KJV alignment. Verified correct at Malachi 4 vs. 3:19-24.
  - **TAGNT (Greek/NT):** reference format is `primary[KJV]`, e.g. `Php.1.16[1.17]`. The primary number is NRSV-based; when a `[bracketed]` number is present, that bracketed number is the actual KJV verse and **must be used instead of the primary**. Verified concretely at Philippians 1:16-17, where parsing TAGNT the same way as TAHOT (always take the pre-bracket number) would silently import the Greek content for KJV verse 17 under the label "verse 16" -- wrong data, no error thrown. STEPBible's own `Versification/TVTMS` file catalogs every NT verse where this applies (Acts 19:40-41, 2Cor 13:12-14, Php 1:16-17, 3Jn 1:14-15, Rev 12:17-13:1, and others) and should be used as the authoritative list rather than re-deriving it by scanning for brackets.
- **Psalm (and similar) superscriptions -- flagged, deferred, tracked separately.** TAHOT tags psalm titles as verse 0 (e.g. `Psa.3.0`). Ember's `KJV.db` currently has no verse-0 row for these -- Psalm 3 in Ember's existing text starts directly at "Lord, how are they increased..." with no title text stored anywhere, even though the KJV itself does contain these titles as real text (confirmed independently). This is a gap in Ember's core KJV text, upstream of Build 6, not a Language-tab-specific problem. **Do not decide Build 6's handling of `Psa.X.0` rows until the core-text question is resolved** -- see new tracked item below. If titles get added to `KJV.db` as real verse-0 rows, TAHOT's data has a natural home and Build 6 needs no special-casing. If not, Build 6 must decide standalone (drop title tagging, or attach it elsewhere) as a fallback.

### Other Open Questions for Implementation

- **Group marker parsing -- DECIDED: import-time, not query-time.** The `+`/`»` grouping is parsed into an explicit `group_id` at import, not re-derived on every render. This is a fixed structural fact about the text (it never changes per-query), so precomputing it once keeps the render query simple ("group rows by `group_id`") and avoids re-running parsing logic on every verse selection.
- **Hebrew's gloss_dictionary equivalent — RESOLVED 2026-08-30.** TAHOT does carry a stable, non-contextual dictionary gloss equivalent to TAGNT's column 5 — it's just nested inside column 12 ("Expanded Strong tags") rather than given its own column. Column 12's documented structure is `{dStrong=HebrewForm=Gloss[»SubMeaning]}`; the `Gloss` segment (text after the second `=`, before any `»`) is the stable dictionary-style gloss — confirmed via H1961 ("to be"), which stayed constant across 5 different contextual renderings in column 4 within the same chapter. Unlike TAGNT (straight column copy for `gloss_dictionary`), TAHOT's import needs a real parse step: split the relevant `{...}` segment on `=` (gloss is the text after the 2nd `=`), then split on `»` if present and take the part before it.
- **Column 7 ("Meaning Variants") — checked, not a gloss field.** This turned out to be Ketiv/Qere textual-variant apparatus (documenting rejected alternate manuscript readings, e.g. Ruth 3:14's "foot" vs. "feet"), not an alternate-gloss field. Populated rarely (empty in most rows). Not part of the `gloss_contextual`/`gloss_dictionary` pair. If Ember wants to surface textual variants later, that's a separate, distinct schema decision — out of scope for Build 6.
- **TAHOT/TAGNT file split:** TAHOT ships as 4 files (Gen-Deu, Jos-Est, Job-Sng, Isa-Mal) and TAGNT as 2 (Mat-Jhn, Act-Rev). Import script needs to process all of them, not just the samples already pulled.

---

## Item 3: Language Tab -- Interlinear View

### Behavior

- Listens to `selection-changed`, same as Tags and Related tabs.
- For each selected verse, query `original_words` and render the original-language text with its word-by-word gloss beneath/alongside it.
- No translation restriction -- unlike the original KJV-only plan, this works for any active pane, since the interlinear is keyed to the verse itself (via original-language text), not to a specific English translation's wording.

### Layout (Settled, refined 2026-08-30 from comparable-tool research)

Two parts per verse, stacked:

1. **Running verse line** — the full verse in the original language, continuous text, decorative only (not interactive). Gives reading context before the list fragments it. RTL for Hebrew, LTR for Greek.
2. **Gloss list** — below the verse line, one row per word or grouped-word-unit, two columns: original-language text | English gloss. Every row is fully clickable (not just the word) and opens the word detail view.

**Visual style, decided after reviewing several comparable tools:** Wayne reviewed a range of existing interlinear/word-study presentations, from dense card-based per-word layouts to Sefaria's clean two-line (original text, then a plain English translation line, no per-word pairing at all) style. His clear preference is Sefaria's clean, uncluttered feel. Weighed against that: Ember's design already keeps the verse line and the gloss list functionally separate (context vs. drill-down), which is worth preserving — the per-word list is what makes tap-to-detail possible and is core to the feature, not incidental clutter. **Decision: keep the two-part structure (verse line + per-word list), but style the list plainly** — rows as simple text lines, not boxy cards with borders/backgrounds/padding-heavy containers (avoid the dense, box-per-word treatment seen in some reviewed tools). The goal is Sefaria's visual calm applied to Ember's existing functional structure, not a wholesale switch to Sefaria's simpler (but less drillable) model.

Grouped words (per the `+`/`»` markers, now precomputed into `group_id` at import — see Item 2) collapse into a **single row** — one combined original-language text span, one gloss, one tap target. Never rendered as separate fragmented rows for what is grammatically one unit (e.g. Greek "ho logos" renders as one row: "the Word," not two rows for "the" and "Word").

```
Ecclesiastes 2:6 (Hebrew -- right-to-left, decorative verse line)
  [full verse text, continuous, right-to-left]

  [word]         gloss
  [word]         gloss
  [word]         gloss
  ...

John 1:1 (Greek -- decorative verse line)
  En arche en ho logos, kai ho logos en pros ton theon, ...

  En              in
  arche           [the] beginning
  en              was
  ho logos        the Word,      <- collapsed group, one row
  kai              and
  ho logos        the Word       <- collapsed group, one row
  en               was
  pros theon      with God,      <- collapsed group, one row
  ...
```

Exact spacing/typography/dividers between rows to be finalized during implementation, but the direction is: plain text rows, minimal visual weight, no per-word card/box treatment.

### RTL and Typography Specifics (Settled 2026-08-30)

Confirmed via mockup review:

- **Row layout is fixed LTR regardless of language: original-language column always on the left, gloss always on the right.** The Hebrew text itself is never flipped or altered — it renders normally, right-to-left, exactly as a Hebrew reader would expect (confirmed via mockup: the verse line's יַ֖עַר צוֹמֵ֥חַ עֵצִֽים and the list row's יַ֖עַר צוֹמֵ֥חַ עֵצִֽים are identical). What's fixed is only the row's left/right column arrangement — Greek and Hebrew both sit in the same (left) position, so the list has one consistent shape regardless of which original language is showing.
- **The running verse line is RTL as a full block** for Hebrew (right-aligned, right-to-left flow) — genuinely different from the list rows, since the verse line has no gloss column to sit beside; it's just continuous Hebrew, displayed the way continuous Hebrew is normally displayed.
- **Grouped words (collapsed rows) need no special reordering.** When multiple Hebrew words collapse into one row (e.g. a `+`-continuation cluster), the words simply render in their natural Hebrew reading order inside that row's left-hand original-language cell — same as any other Hebrew text. There is no flip step to get right or wrong here.
- **Gloss column is right-justified**, original-language column left-justified, in each row. Confirmed via mockup as a clean side effect worth keeping deliberately — it gives the whole list block a clean rectangular silhouette rather than ragged edges on both sides.
- **Verse line gets extra line-height** (informed by the 150–180% niqqud-clearance standard) relative to the gloss list rows, since it's the highest-density Hebrew vowel-pointing text on the page; list rows can be slightly tighter since gloss text carries no niqqud.
- **Hebrew font: verified 2026-08-31.** Ezra SIL confirmed as the bundled Hebrew font, via direct test: real TAHOT sample text (Genesis 1:1, Ecclesiastes 2:6, and Psalm 3's title — the exact dense-niqqud case relevant to the Psalm Title Fix) rendered in a standalone HTML test page, comparing Ezra SIL against the system/browser default Hebrew font. Result: niqqud (vowel points) positioned identically between the two, no overlap or misplacement in either, and Ezra SIL noticeably more legible than the system fallback. Source: official web-fonts package at `https://software.sil.org/downloads/r/ezra/EzraSIL-2.51-web.zip` (glyphs under SIL Open Font License; Hebrew layout intelligence separately under MIT/X11 — both permissive, compatible with Ember's Apache 2.0 licensing). File to bundle: `SILEOT.woff`.

**Explicitly deferred, not built this pass:** an English (smooth-translation) verse line beneath the original, with hover/tap highlight-sync down to the matching gloss row(s). The idea is good, but the source data doesn't carry a real English-word-to-gloss-row alignment — the gloss list's English is per-original-word, while a smooth English translation reorders, merges, and supplies words the original doesn't have one-to-one. Building the highlight-sync now would mean fabricating an alignment the data doesn't actually support. Revisit if/when a suitable alignment source is found. See "What Comes Next."

### Definition of Done (Item 3)

- [ ] Language tab responds to `selection-changed` with new `verseIds`, for any active translation
- [ ] Renders the running original-language verse line (decorative, non-interactive) above the gloss list
- [ ] Gloss list shows original-language text + English gloss per row, grouped by verse
- [ ] Grouped words (per `+`/`»` markers) collapse into a single row -- one combined text span, one gloss, one tap target
- [ ] Every gloss row is fully clickable (not just the word text) and opens the word detail view
- [ ] Hebrew renders correctly right-to-left; Greek renders left-to-right
- [ ] Clearing selection shows the existing neutral "Select a verse..." state (consistent with other tabs)

---

## Item 4: Word Detail View

### Behavior

Tapping a word swaps the Language tab's content from the interlinear view to a dedicated word detail view. A back action returns to the interlinear view, preserving the prior selection/scroll position.

### Content

- Original-language word and its verse reference
- Strong's number
- Lemma
- Transliteration
- Morphology (raw code at minimum; parsed/human-readable if it can be done cleanly -- decide during implementation)
- Contextual gloss (this specific occurrence) and dictionary-form gloss (general usage), shown as distinct fields, not merged
- Lexicon entry: TBESG (Greek) or none (Hebrew -- see Item 1's TBESH resolution)

The panel is roughly a quarter of the window by default and resizable (confirmed via screenshot) -- there's real room here, not a cramped sidebar. Layout (stacked sections vs. sub-tabs within the detail view) to be decided during implementation.

### Definition of Done (Item 4)

- [ ] Tapping a word swaps tab content to the word detail view
- [ ] Detail view shows lemma, transliteration, Strong's number, morphology, contextual gloss, dictionary gloss
- [ ] Greek words additionally show the TBESG lexicon entry
- [ ] Hebrew words show available data without a lexicon paragraph (documented gap, not a bug)
- [ ] Back action returns to the interlinear view at the prior scroll position

---

## Item 5: Attribution

STEPBible-Data (TAHOT, TAGNT, TBESG) is CC BY 4.0 -- a license obligation not previously carried by Ember's bundled data (existing sources are public domain or CC BY-SA). CC BY 4.0 requires visible attribution, linked to stepbible.org.

Ember does not currently have an About/credits screen. This item needs a landing spot for attribution text before Build 6 ships -- likely a new section in the global settings popover (built additively in Build 4 for exactly this kind of extension) or a new dedicated About section.

### Definition of Done (Item 5)

- [ ] A location for data attribution exists in the app
- [ ] STEPBible-Data is credited per CC BY 4.0 (link to stepbible.org)
- [ ] Any other CC-licensed sources already bundled but not yet credited (e.g. openscriptures/strongs, CC BY-SA 3.0) are audited and added at the same time -- don't ship partial attribution
- [ ] Once Ember is available, send STEPBible a heads-up per their stated interest (not a permission request -- see Item 1)

---

## Definition of Done (Build 6 Overall)

- [x] Ezra SIL rendering verified against real TAHOT sample text (Genesis 1:1, Ecclesiastes 2:6, Psalm 3 title) — niqqud positioning confirmed clean, more legible than system fallback. `SILEOT.woff` is the file to bundle.
- [x] Psalm Title Fix (`Psalm_Title_Fix_Spec.md`) implemented -- verse=0 rows exist in kjv.db/asv.db/darby.db for the 116 affected psalms (empty placeholders; WEB/YLT/BSB unchanged). Open sub-decision carried into this build: whether those placeholder rows show TAHOT's gloss once populated -- see spec's last Definition of Done item.
- [ ] `original_words` populated from TAHOT (all 4 files) and TAGNT (both files)
- [ ] `step_lexicon_greek` populated from TBESG
- [ ] Versification mapping between source data and Ember's verse ID convention confirmed correct
- [ ] Language tab shows interlinear view grouped by verse, for any selected verse/range, any active translation
- [ ] Word grouping (`+`/`»`) renders correctly, not as fragmented single words
- [ ] Word detail view shows full available data, Greek includes TBESG entry
- [ ] Attribution location exists and credits all CC-licensed bundled data
- [ ] `FEATURE_INVENTORY.md` updated to reflect Build 6 additions
- [ ] `BUILD_5_ACTUAL_STATE.md` superseded by `BUILD_6_ACTUAL_STATE.md` after build ships

---

## What Comes Next: Build 7+ Preview (Tentative)

- **TFLSJ integration** -- full LSJ Greek lexicon as an expandable "full entry" option on the word detail view, once `core.db`'s post-Build-6 size is known and the ~32.2 MB weight can be evaluated against it
- **"Other occurrences of this word"** -- cross-reference list on the word detail view; needs either a precomputed index (Strong's number -> verse list) or a runtime scan against `original_words`, plus its own design pass
- **Webster's 1913 dictionary double-click lookup** -- separate feature, English-word definitions, not Strong's-based
- **TBESH alternative** -- if a cleanly-licensed Hebrew lexicon Meaning source surfaces later, revisit the Hebrew/Greek asymmetry noted in Item 1
- **English verse line with highlight-sync** -- a smooth English translation line beneath the original-language verse line, with hover/tap highlighting synced to the matching gloss row(s) below. Good idea, deferred because it needs a real English-word-to-gloss-row alignment that current source data doesn't provide (a smooth translation reorders/merges words in ways that don't map cleanly to per-original-word gloss rows). Worth revisiting if a suitable alignment dataset is ever found.
