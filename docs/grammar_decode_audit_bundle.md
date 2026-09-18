# Grammar Decode Audit Bundle

Raw extracted material only — no interpretation. Assembled from the live `main` branch (HEAD `0c9172f`) of `/home/wayne/ember`.

---

## 1. Full contents of `docs/Grammar_Decode_Spec_DRAFT.md`

```markdown
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
```

---

## 2. Full contents of `js/grammar-decode.js`

```js
// grammar-decode.js — Greek morphology-code decode (Grammar Decode spec)
//
// Pure functions, no DOM. Turns a raw original_words.morph_code value (e.g.
// "V-PAP-NSM", or a compound like "CONJ + G5104=PRT + G1065=PRT") into a
// plain-English grammatical breakdown, sourced from the TEGMC-derived
// step_morphology_greek table (see scripts/build_language.py).

import { getGreekMorphCategories } from './db.js';

// Matches a compound piece shaped like "G2532=CONJ" — a Strong's number
// fused onto the code via "=". Verified directly against language.db: this
// number already matches step_lexicon_greek.strongs_number exactly (no
// padding/normalization needed) for every such piece in the current data —
// use match[1] as-is with the existing getGreekLexiconEntry().
const STRONGS_PREFIX_RE = /^(G\d+)=(.+)$/;

export function splitMorphCode(morphCode) {
    if (!morphCode) return [];
    return morphCode.split(' + ').map(piece => {
        const trimmed = piece.trim();
        const m = STRONGS_PREFIX_RE.exec(trimmed);
        return m
            ? { code: m[2], strongsNumber: m[1] }
            : { code: trimmed, strongsNumber: null };
    });
}

// Reading order independent of TEGMC's own Key=Value order (which varies
// record to record) — chosen to read naturally for a general audience
// (person/number/gender/case before tense/voice/mood). Covers all 15
// confirmed TEGMC category keys; any future/unknown category falls through
// to the defensive branch in decodeMorphCode below, ordered by its own
// sort_order instead of being silently dropped.
const CATEGORY_DISPLAY_ORDER = [
    'Person', 'Number', 'Gender', 'Case',
    'Tense', 'Voice', 'Mood', 'Form',
    'Function', 'Name type', 'Adj.Numb.', 'Indeclinable',
    'Original language', 'Name in Original language', 'Extra',
];

// Returns [] if nothing decodable at all — callers must not render an
// accordion in that case (e.g. a code TEGMC has no entry for).
export async function decodeMorphCode(morphCode) {
    const pieces = splitMorphCode(morphCode);
    const parts = [];
    for (const piece of pieces) {
        let rows = [];
        try {
            rows = await getGreekMorphCategories(piece.code);
        } catch (e) {
            console.error('decodeMorphCode: category lookup failed:', e);
        }
        if (rows.length === 0) continue;

        // Group by category first — two known real codes repeat a category
        // key (N-NSN-L: "Name type=Title" AND "Name type=Location"; PRT-N:
        // "Extra=Negative" twice, identically). Dedupe identical values, then
        // join genuinely distinct ones, so PRT-N renders "Negative" once (not
        // "Negative / Negative") and N-NSN-L renders both values (not
        // silently dropping one).
        const byCategory = new Map(); // category -> { values: Set, sortOrder }
        rows.forEach((row, i) => {
            if (!byCategory.has(row.category)) {
                byCategory.set(row.category, { values: new Set(), sortOrder: i });
            }
            byCategory.get(row.category).values.add(row.raw_value);
        });

        const orderedCategories = [
            ...CATEGORY_DISPLAY_ORDER.filter(c => byCategory.has(c)),
            ...[...byCategory.keys()]
                .filter(c => !CATEGORY_DISPLAY_ORDER.includes(c))
                .sort((a, b) => byCategory.get(a).sortOrder - byCategory.get(b).sortOrder),
        ];

        const lines = orderedCategories.map(category => {
            const values = [...byCategory.get(category).values];
            return phraseForCategory(category, values, byCategory);
        });

        parts.push({ code: piece.code, strongsNumber: piece.strongsNumber, lines });
    }
    return parts;
}

function phraseForCategory(category, values, byCategory) {
    // Empty raw_value (e.g. "Indeclinable=" on N-OI/N-PRI) is meaningful —
    // the key's presence IS the information. Phrase from the category name,
    // not the (blank) value, rather than rendering an empty line.
    if (values.length === 1 && values[0] === '') {
        return CATEGORY_EMPTY_VALUE_PHRASES[category] || category;
    }
    if (category === 'Tense') return phraseTense(values[0], byCategory);
    if (category === 'Person') return phrasePerson(values[0]);
    return values.map(v => TEGMC_VALUE_PHRASES[v] || v).join(' / ');
}

// A few source Person values embed a Number word inconsistently ("2nd
// Plural", "2nd Singular", "1st Person", "2nd Person", vs. plain "1st"/
// "3rd") — every such code also carries its own separate Number category, so
// stripping the embedded word here loses no information and avoids a
// redundant "2nd Plural · Plural" pair of lines. Canonicalizes to exactly
// {'1st','2nd','3rd'} before the phrase-map lookup.
function phrasePerson(rawValue) {
    const canonical = rawValue.replace(/\s+(Person|Singular|Plural)$/i, '');
    return TEGMC_VALUE_PHRASES[canonical] || canonical;
}

// Mood/Form-aware seam (Grammar_Decode_Spec_DRAFT.md Out-of-Scope note:
// aorist means "past" only in the Indicative — Participle/Infinitive/
// Subjunctive/Optative/Imperative carry aspect only, not a time reference).
// `byCategory` is this one code-piece's full category map, so this can
// consult Mood alongside Tense. Phrase-table content authoring is
// implementation-time editorial work (per the spec); this function is the
// mechanism that makes it mood-aware.
function phraseTense(rawValue, byCategory) {
    const mood = byCategory.has('Mood') ? [...byCategory.get('Mood').values][0] : null;
    const hasTimeReference = mood === 'Indicative';
    const table = hasTimeReference ? TENSE_WITH_TIME_PHRASES : TENSE_ASPECT_ONLY_PHRASES;
    return table[rawValue] || rawValue;
}

// ---- Authored content below: NOT a mechanical transform of TEGMC's own
// text (Grammar_Decode_Spec_DRAFT.md Schema section — TEGMC gives the
// scholarly parsing, Ember's mapping renders it in plain English). Small —
// 102 distinct (category, raw_value) pairs across all 15 categories, not one
// entry per TEGMC code. Generate the authoring worklist from the built
// database (run after scripts/build_language.py):
//
//   sqlite3 data/language.db \
//     "SELECT DISTINCT category, raw_value FROM step_morphology_greek ORDER BY category, raw_value;"
//
// Until authored, phraseForCategory/phraseTense/phrasePerson fall back to
// TEGMC's own raw value text (already reasonably plain in most cases, e.g.
// "Nominative", "Plural") so the accordion is fully functional today; this
// map is where reader-facing wording refinements land, word-form by
// word-form, without touching the decode mechanism above.
const TEGMC_VALUE_PHRASES = {};
const TENSE_WITH_TIME_PHRASES = {};
const TENSE_ASPECT_ONLY_PHRASES = {};
const CATEGORY_EMPTY_VALUE_PHRASES = {
    Indeclinable: 'Indeclinable (does not change form)',
};
```

**Note on the phrase tables:** `TEGMC_VALUE_PHRASES`, `TENSE_WITH_TIME_PHRASES`, and `TENSE_ASPECT_ONLY_PHRASES` are all defined as **empty objects** (`{}`) in the current file. Per the code's own trailing comment, lookups fall through to TEGMC's raw value text until these are authored. This is raw fact, not interpretation — presented for the auditing AI to weigh against the spec's Definition-of-Done bullets.

---

## 3. `js/db.js` — `getGreekMorphCategories` + `step_morphology_greek` schema

### Function (`js/db.js:1764-1783`)

```js
// TEGMC grammatical categories for one raw Greek morphology-code fragment
// (e.g. "V-PAP-NSM" or "CONJ") — NOT the full original_words.morph_code
// value, which may be an N-way " + " compound; callers split that first (see
// grammar-decode.js's splitMorphCode). Returns [] (never throws) when the
// fragment has no TEGMC entry — two known raw-file codes (V-PMO-1S/V-PMO-3P)
// are absent by design and neither appears in current data; callers must
// treat [] as "nothing to decode," not an error.
export async function getGreekMorphCategories(code) {
    if (!code) return [];
    const langDb = await getLanguageDb();
    const stmt = langDb.prepare(
        `SELECT category, raw_value FROM step_morphology_greek
         WHERE code = ? ORDER BY sort_order ASC`
    );
    stmt.bind([code]);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}
```

### Schema (`scripts/build_language.py:512-526`)

```python
-- One row per (code, category) pair from TEGMC's "Full Morphology Codes"
-- section, e.g. ('A-APF-C', 'Extra', 'Comparative'). No UNIQUE(code, category)
-- constraint — two real codes legitimately repeat a category key within one
-- record ("N-NSN-L" has two distinct "Name type" values; "PRT-N" has two
-- identical "Extra" values). raw_value can legitimately be the empty string
-- (e.g. "N-OI"/"N-PRI" carry "Indeclinable=" with nothing after "=" — the
-- key's presence alone is the signal) and must never be coerced to NULL.
CREATE TABLE step_morphology_greek (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL,
    category    TEXT NOT NULL,
    raw_value   TEXT NOT NULL,
    sort_order  INTEGER NOT NULL
);
CREATE INDEX idx_step_morphology_greek_code ON step_morphology_greek(code);
```

Related lexicon table it joins against for the Strong's cross-reference (`scripts/build_language.py:503-510`):

```python
CREATE TABLE step_lexicon_greek (
    strongs_number  TEXT PRIMARY KEY,
    lemma           TEXT,
    transliteration TEXT,
    morph           TEXT,
    gloss           TEXT,
    meaning         TEXT
);
```

---

## 4. `js/language.js` — `renderMorphDecodeBody` and surrounding context

Import (`js/language.js:22`):

```js
import { decodeMorphCode } from './grammar-decode.js';
```

Caller context — `renderTier2`, `js/language.js:316-350`:

```js
async function renderTier2(word, isHebrew, tier3Open) {
    const tier2 = document.createElement('div');
    tier2.className = 'language-card-tier2';

    appendDetailField(tier2, 'Lemma', word.lemma);
    appendDetailField(tier2, 'Transliteration', word.transliteration);

    const morphHeading = document.createElement('div');
    morphHeading.className = 'language-detail-heading';
    morphHeading.textContent = 'Morphology';
    tier2.appendChild(morphHeading);

    if (word.morph_code) {
        const morphCode = document.createElement('div');
        morphCode.className = 'language-detail-value';
        morphCode.textContent = word.morph_code;
        tier2.appendChild(morphCode);
    }

    // Called unconditionally for both languages — decodeMorphCode is
    // Greek-only by data source (TEGMC) and returns [] for anything it can't
    // decode, so Hebrew rows fall back to showing just the raw code above
    // with no parsed lines. Hebrew's own decode (TEHMC) is a documented,
    // separate follow-up (Grammar_Decode_Spec_DRAFT.md) — not implemented
    // here, and not blocked on anything in this file.
    let parts = [];
    try {
        parts = await decodeMorphCode(word.morph_code);
    } catch (e) {
        console.error('renderTier2: morphology decode failed:', e);
    }
    if (parts.length > 0) {
        tier2.appendChild(await renderMorphDecodeBody(parts));
    }

    appendDetailField(tier2, 'General usage', word.gloss_dictionary);
    ...
```

`renderMorphDecodeBody` itself (`js/language.js:381-425`):

```js
// Parsed-morphology lines — same content the old collapsed "What does this
// mean?" accordion rendered, now unfolded directly into tier 2 with no
// separate toggle.
async function renderMorphDecodeBody(parts) {
    const body = document.createElement('div');
    body.className = 'language-morph-decode-body';
    const multi = parts.length > 1;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (multi) {
            const heading = document.createElement('div');
            heading.className = 'language-morph-decode-part-heading';
            heading.textContent = part.code;
            body.appendChild(heading);
        }
        for (const line of part.lines) {
            const lineEl = document.createElement('div');
            lineEl.className = 'language-morph-decode-line';
            lineEl.textContent = line;
            body.appendChild(lineEl);
        }
        if (part.strongsNumber) {
            let lex = null;
            try {
                lex = await getGreekLexiconEntry(part.strongsNumber);
            } catch (e) {
                console.error('renderMorphDecodeBody: cross-ref lookup failed:', e);
            }
            const refEl = document.createElement('div');
            refEl.className = 'language-morph-decode-crossref';
            refEl.textContent = lex && lex.gloss
                ? `Also joined with ${part.strongsNumber} (${lex.gloss})`
                : `Also joined with ${part.strongsNumber}`;
            body.appendChild(refEl);
        }
        if (multi && i < parts.length - 1) {
            const divider = document.createElement('div');
            divider.className = 'language-morph-decode-divider';
            body.appendChild(divider);
        }
    }

    return body;
}
```

---

## 5. Mood-awareness for tense-like categories — fixed template or mood-aware?

**Mood-aware, confirmed in code.** From `js/grammar-decode.js` (full text in section 2 above):

```js
function phraseTense(rawValue, byCategory) {
    const mood = byCategory.has('Mood') ? [...byCategory.get('Mood').values][0] : null;
    const hasTimeReference = mood === 'Indicative';
    const table = hasTimeReference ? TENSE_WITH_TIME_PHRASES : TENSE_ASPECT_ONLY_PHRASES;
    return table[rawValue] || rawValue;
}
```

This function reads the code's own `Mood` category (via `byCategory`, the same per-code category map built in `decodeMorphCode`) and branches between two separate phrase tables — `TENSE_WITH_TIME_PHRASES` (used only when `Mood === 'Indicative'`) vs. `TENSE_ASPECT_ONLY_PHRASES` (used for every other mood, or when no Mood is present). This is the mechanism the spec's Out-of-Scope note called for ("the plain-English mapping table must be mood-aware, not a fixed template").

**Caveat found during extraction (raw fact, not interpretation):** both `TENSE_WITH_TIME_PHRASES` and `TENSE_ASPECT_ONLY_PHRASES` are defined as empty objects (`{}`) at the bottom of the file (section 2 above). The mood-aware *branching mechanism* exists and runs; the *content* of the two tables it selects between is currently empty, so at runtime `table[rawValue] || rawValue` always falls through to `rawValue` (TEGMC's raw text) regardless of which table was selected. Whether "mood-aware" is satisfied depends on whether the requirement is read as "the mechanism must be mood-aware" (yes) or "the displayed phrases must currently differ by mood" (not yet, since both tables are empty).

---

## 6. Strong's-number stripping — implemented, and is the number retained/joined or discarded?

**Implemented, and retained/joined — not discarded.**

- Stripping: `STRONGS_PREFIX_RE = /^(G\d+)=(.+)$/` in `splitMorphCode` (section 2 above) splits each `" + "`-joined piece and, when it matches `G\d+=CODE`, returns `{ code: m[2], strongsNumber: m[1] }` — the code fragment used for the TEGMC lookup has the `G\d+=` prefix stripped.
- Retention: `decodeMorphCode` carries `strongsNumber` through into each returned part: `parts.push({ code: piece.code, strongsNumber: piece.strongsNumber, lines })`.
- Join: in `renderMorphDecodeBody` (section 4 above), when `part.strongsNumber` is truthy, it's passed to `getGreekLexiconEntry(part.strongsNumber)` (queries `step_lexicon_greek` by `strongs_number`, schema in section 3 above) and rendered as `` `Also joined with ${part.strongsNumber} (${lex.gloss})` `` (or without the gloss parenthetical if no lexicon match). This is a real join against `step_lexicon_greek.strongs_number`, displayed to the reader — matching the spec's "worth retaining as a link, not discarding."

---

## 7. Source-text normalization (U+201A / stray quotes) — present in ingestion, or skipped?

**Present as a function, but the specific damage the spec flagged (in description/summary fields) is never reached by it — because those fields are never parsed/persisted at all.**

Normalization function, `scripts/build_language.py:410-416`:

```python
def normalize_tegmc_value(s):
    # Defensive only: verified the current file's line-1 Key=Value strings (the
    # only line persisted) never contain these — the '‚' (U+201A) comma-lookalike
    # and stray literal '"' quoting only ever occur in lines 2-4 (summary/
    # description/example), which this parser doesn't persist. Kept in case a
    # future re-download introduces either into line 1.
    return s.replace('‚', ',').strip().strip('"').strip()
```

The parser it belongs to, `parse_tegmc_file` (`scripts/build_language.py:419` onward), reads each `$`-delimited 4-line record but — per its own docstring — "only each chunk's first non-blank line is read (the `CODE\tKey=Value; ...` line) — lines 2-4 (summary/description/example) are TEGMC's own prose... so they're never parsed."

Cross-check in `FEATURE_INVENTORY.md:305`:

```
251b. TEGMC's own summary/description/example prose (lines 2-4 of each record) is intentionally not persisted — the reader-facing phrasing is authored content, not a mechanical transform of TEGMC's text (per the Grammar Decode spec). The `‚`/stray-quote text damage the source file is known to carry lives entirely in that unpersisted text — verified zero of the 1,644 persisted `code\tKey=Value` lines need normalization — scripts/build_language.py:normalize_tegmc_value
```

**Raw fact for the auditing AI to weigh:** the spec's Finding and Definition-of-Done both describe the `‚`/stray-quote issue as living in the "description/summary fields" and call for normalizing it "before any of this text is reader-facing." The implementation's own comments state those exact fields (lines 2-4 of each record) are never persisted or rendered at all — only line 1 (code + Key=Value pairs, which the implementation verified is clean) feeds `step_morphology_greek.raw_value`. `normalize_tegmc_value` is applied defensively to that clean line-1 data, not to the described damaged fields, because the damaged fields aren't part of the ingested/reader-facing pipeline.

---

## 8. TEGMC in Ember's attribution list (Build 6, Item 5 location)?

**Partially — covered under an umbrella credit, but the literal string "TEGMC" does not appear in the attribution UI.**

Attribution list source, `js/global-settings.js:46-91` (the `data-attribution` / "Data & Attribution" settings section):

```js
{
    id: 'data-attribution',
    title: 'Data & Attribution',
    render(container) {
        const desc = document.createElement('p');
        desc.className = 'settings-section-desc';
        desc.textContent = 'Ember bundles data from several sources. The six Bible translations and Nave’s Topical Bible are public domain. Two sources are licensed CC BY 4.0 and credited here as required:';
        container.appendChild(desc);

        const list = document.createElement('ul');
        list.className = 'settings-credits-list';

        for (const credit of [
            {
                name: 'STEPBible-Data',
                url: 'https://www.stepbible.org',
                note: 'Original-language word data (Hebrew/Greek text, glosses, lexicon entries, and grammar decoding) powering the Language tab, from Tyndale House, Cambridge.'
            },
            {
                name: 'OpenBible.info',
                url: 'https://www.openbible.info',
                note: 'Cross-reference data powering the Related tab.'
            }
        ]) {
            ...
```

There is **no separate "TEGMC" list entry**. `grep -rn "TEGMC" js/ index.html` finds no match in `js/global-settings.js` or `index.html`. The credited entry is the umbrella `STEPBible-Data` source, whose `note` text was edited to include the phrase "...and grammar decoding..." to cover TEGMC's addition without adding a new list item.

Confirmed by `FEATURE_INVENTORY.md:521`:

```
236h. The STEPBible-Data credit's note was extended (not given a new list entry) to mention grammar decoding when TEGMC was added — same repo, same CC BY 4.0 terms, already linked to stepbible.org; a new entry would have broken the section's lead sentence ("Two sources are licensed CC BY 4.0") — global-settings.js:SECTIONS
```

So: the spec's requirement — "confirm TEGMC is included in that credited list, not a new attribution surface" — is satisfied in the sense that no new attribution surface was created and the existing STEPBible-Data credit's note text does reference "grammar decoding." It is not satisfied in the sense of TEGMC appearing as its own named, separately-identifiable credit line.

---

## 9. Does `FEATURE_INVENTORY.md` reflect this feature as done?

**Yes — found and documented in detail.**

Relevant entries (line numbers as currently in the file):

- `FEATURE_INVENTORY.md:278-279` — word card tier 1/tier 2 UI, including the morphology display and Strongs/lexicon button.
- `FEATURE_INVENTORY.md:283` — parsed morphology unfolded into tier 2, referencing `language.js:renderTier2/renderMorphDecodeBody` and the exact CSS classes used.
- `FEATURE_INVENTORY.md:284` — compound `morph_code` decode at runtime, N-way, Strong's-prefix stripping and lexicon cross-reference join, referencing `js/grammar-decode.js:splitMorphCode/decodeMorphCode`, `db.js:getGreekMorphCategories`.
- `FEATURE_INVENTORY.md:285` — Hebrew is explicitly noted as unimplemented (TEHMC follow-up), confirmed not a bug in this pass.
- `FEATURE_INVENTORY.md:291` — `original_words` row counts (447,734 total, 305,638 Hebrew + 142,096 Greek).
- `FEATURE_INVENTORY.md:301` — `language.db` storage note, including TEGMC's size contribution (~0.5MB).
- `FEATURE_INVENTORY.md:303-304` — `step_morphology_greek` table description (9,214 rows across 1,644 codes) and the two known raw-file irregularities, matching the spec's Findings section.
- `FEATURE_INVENTORY.md:305` — the normalization/non-persistence note quoted in full in section 7 above.
- `FEATURE_INVENTORY.md:306` — confirms the authored phrase-map lives in git-tracked `js/grammar-decode.js` rather than the (rebuilt-from-scratch, gitignored-source) `language.db`.
- `FEATURE_INVENTORY.md:521` — the attribution-note extension, quoted in full in section 8 above.

This satisfies the spec's Definition-of-Done checklist item "`FEATURE_INVENTORY.md` updated."
