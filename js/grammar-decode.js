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
