# Ember Bible Study — Grammar Decode Specification (Greek) — DRAFT

**Purpose:** On the Greek word detail view, decode the raw morphology code (e.g. `V-PAP-NSM`) already shown there into a plain-English breakdown, revealed via an expand-in-place accordion. Keeps the raw code visible for those who know it, while making the grammar legible to readers who don't.

**Prerequisite:** Build 6 complete and shipped. This spec covers Greek only; Hebrew (TEHMC) is a distinct follow-up, since Hebrew's morphology-code structure (prefix-carry compounds) differs meaningfully from Greek's.

**Status:** Data verified via Claude Code investigation, 2026-09-01 (see Findings below). Ready for schema/implementation planning.

---

## Design Principle: Expansion, Not Interruption

Tooltips were considered and rejected — they're a UI pattern not used anywhere else in Ember, and they risk obscuring text, violating the "text is never obscured during study" principle. An accordion that expands in place, directly beneath the existing raw morphology field, uses the same "tap to reveal more" vocabulary as the rest of the word detail view rather than introducing a new interaction pattern.

The raw code (`V-PAP-NSM`) continues to display as it does today (Build 6, Item 4). The accordion is additive: tapping/expanding it reveals the decoded plain-English breakdown beneath. Nothing is replaced or hidden.

---

## Findings (Verified 2026-09-01, initial pass; confirmed against actual downloaded file 2026-09-13)

- `original_words.morph_code` is already populated for 100% of rows (447,734/447,734), sourced from TAHOT/TAGNT during Build 6's `build_language.py`. It is already rendered on the word detail view as a raw code (`js/language.js:206`). This spec adds a decode step; it does not require new sourcing of `morph_code` itself.
- **TEGMC** (Translators Expansion of Greek Morphology Codes), STEPBible-Data, CC BY 4.0. Source path: `Morphology codes/TEGMC - Translators Expansion of Greek Morphhology Codes - STEPBible.org CC BY.txt` (note: upstream filename itself has a typo, "Morphhology" — if this path is ever hardcoded, an upstream rename/fix would break it). Verified commit `faf6a35` (2026-03-27), sha256 `5f0416f7...4e94de82`. 1,644 codes — confirmed.
- **Not a flat 2-column TSV.** It's a 4-line record per code (parse string, plain-English summary, description, example sentence), delimited by lines containing just `$`. Line 1 of each record is 2 tab-separated columns (code, `Function=...;Tense=...;...`), but the full record spans 4 physical lines. A record parser is needed, not a simple TSV reader.
- **Coverage confirmed at 100.0%** (142,096/142,096) — but only with an extra step beyond naive `" + "` splitting. Some compound pieces are shaped like `G2532=CONJ` — a Strong's number fused onto the code with `=`. Naive split-and-lookup gets 99.82% (255 rows / 31 distinct codes fail); stripping the leading `G\d+=` before lookup closes the gap to 100%. The stripped Strong's number is not noise — it's a real cross-reference to the other word in the compound, joinable against `step_lexicon_greek.strongs_number`.
- **Compounds are not always 2-piece.** At least two distinct codes are 3-piece (`CONJ + G5104=PRT + G1065=PRT`, `PREP + G1537=PREP + G4057=ADV`). Compound handling must be N-way, not assume exactly two parts.
- **One malformed record pair in the raw file**: `V-PMO-1S` is missing its closing `$` delimiter and is immediately followed by a corrupted `V-PMO-3P` record with a non-standard line structure (likely a spreadsheet-export artifact). Neither code appears in `language.db`'s current Greek `morph_code` values, so it doesn't affect the coverage number — but a parser must handle this defensively rather than assume uniform 4-line structure throughout.
- **Text normalization needed on source content**: 260 of the 1,644 records use `‚` (U+201A, a comma lookalike) in place of a real comma in their description/summary fields, and are wrapped in stray literal quote characters — both need cleanup before this text is reader-facing. (The source file's own last line is an editorial note flagging this as a known quirk, not a misread.)
- **Trailing appendix** past the 1,644 core records: a short list of KJV/Robinson-apparatus-specific codes (`HEB`, `KJV`, `Robinson`, `N-NSM-C`, `S-1PASM`, `S-2P*`, `V-RAP-GSM-ATT`) not needed for current coverage — see Out of Scope.

---

## Scope

### In Scope

1. **TEGMC sourcing** — TEGMC downloaded from STEPBible-Data (same repo, same CC BY 4.0 terms as existing bundled sources); requires a 4-line-record parser, not a TSV reader (see Findings)
2. **Decode step** — split `morph_code` on `" + "` if compound (N-way, not assumed 2-way); for any piece shaped like `G\d+=CODE`, strip the `G\d+=` prefix before lookup against TEGMC (the stripped number cross-references `step_lexicon_greek.strongs_number` — worth retaining as a link, not discarding); render as a plain-English breakdown (e.g. "3rd person · Singular · Aorist · Active · Indicative")
3. **Accordion UI** — expand-in-place element beneath the existing raw morphology field on the Greek word detail view; collapsed by default
4. **Compound code handling** — when `morph_code` contains multiple codes joined by `" + "` (two or more), decode and display all parts stacked in the accordion, clearly distinguished from each other (not merged into one confusing line)
5. **Attribution** — TEGMC is CC BY 4.0 like the rest of the STEPBible corpus already bundled; covered by Ember's existing attribution location (Build 6, Item 5) — confirm TEGMC is included in that credited list, not a new attribution surface

### Out of Scope (Explicit)

- Hebrew (TEHMC) — separate follow-up spec; Hebrew's morph codes use `/`-joined segments with a prefix-carry rule (the H/A language prefix is dropped on segments after the first and must be carried forward before lookup), a different decode logic than Greek's `+`-joined compounds
- Aspect-vs-tense nuance across moods (e.g. aorist meaning "past" only in the indicative, not in participles/infinitives/subjunctive) — the plain-English mapping table must be mood-aware, not a fixed template assuming "tense" always maps to a time reference. Flagged here as a correctness requirement for whoever authors the mapping table, not resolved by this spec.
- Any semantic-domain or word-group tagging — confirmed absent from TBESG/TFLSJ; unrelated to this feature
- Any change to how the raw `morph_code` field itself is displayed or sourced (unchanged from Build 6)
- The trailing KJV/Robinson-apparatus appendix codes in the TEGMC file (not needed for current coverage) — future item, same treatment as Hebrew: relevant only if Ember ever ingests TR/KJV-based Greek tagging

---

## Schema

New lookup table for TEGMC, keyed on the raw code fragment. Exact column shape to be finalized during implementation (matches Ember's "new rows, not schema changes" additive pattern — this is a wholly new table, not a modification to `original_words`).

Minimum needed per entry:
- Raw code fragment (lookup key)
- Category/function label
- Plain-English value for that category

Real category-key domain, confirmed from the actual file, is 15 keys — not a short illustrative list: `Function`, `Number`, `Case`, `Gender`, `Tense`, `Voice`, `Person`, `Form`, `Mood`, `Name type`, `Extra`, `Original language`, `Adj.Numb.`, `Indeclinable`, `Name in Original language`. The lookup table and decode logic must accommodate any of these 15, not a fixed subset.

The exact plain-English phrasing per code (the editorial "translation layer" from scholarly abbreviation to reader-facing words) is authored content, not a mechanical transform of TEGMC's own text — TEGMC gives the scholarly parsing; Ember's mapping table renders it in plain English. This authoring work happens during implementation, word-form by word-form, not specified line-by-line here.

**Source text normalization required before use**: 260 of 1,644 records contain `‚` (U+201A) standing in for a real comma, plus stray literal quote characters, in their description/summary fields. Clean up during ingestion, before any of this text is reader-facing.

---

## Word Detail View: Behavior

- Raw morphology code displays as today (Build 6, unchanged)
- Beneath it, a collapsed accordion element (e.g. labeled "What does this mean?" or similar — exact copy TBD at implementation)
- Tapping/expanding it reveals the plain-English breakdown, one line per grammatical category present in the code
- For compound codes, both decoded parts display, stacked and visually distinguished (e.g. under two sub-headers, or separated by a divider) — not merged into a single ambiguous line
- Collapsing returns to the compact state; text elsewhere on the page is never obscured by the expansion (page grows/scrolls, nothing overlays)

---

## Definition of Done

- [ ] TEGMC downloaded and verified against current `language.db` Greek `morph_code` coverage (100% confirmed; parser must handle the known malformed `V-PMO-1S`/`V-PMO-3P` record pair without crashing, even though neither appears in current data)
- [ ] New lookup table populated from TEGMC, accommodating the full 15-key category domain
- [ ] Source text normalized during ingestion (`‚` → `,`, stray literal quotes stripped) before any TEGMC text is reader-facing
- [ ] Decode step implemented: single codes resolve to a plain-English breakdown; compound codes (`" + "`-joined, N-way) resolve all parts independently, with `G\d+=` Strong's-number prefixes stripped before lookup and retained separately as a cross-reference
- [ ] Accordion UI added to Greek word detail view, collapsed by default, expand-in-place (no overlay, no text obscured)
- [ ] Compound-code rows display all decoded parts, clearly distinguished
- [ ] Plain-English mapping table is mood-aware for tense-like categories (does not assert a time reference for moods where the code doesn't carry one)
- [ ] TEGMC added to Ember's existing attribution list (Build 6, Item 5 location)
- [ ] `FEATURE_INVENTORY.md` updated
- [ ] Verified live in browser (Playwright), zero console errors, consistent with prior build verification standard

---

## Deferred to Follow-Up Spec

- Hebrew (TEHMC) grammar decode — same concept, different compound-code logic (prefix-carry on `/`-joined segments)
