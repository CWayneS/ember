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

// Every decoded line renders glossary-style: the raw TEGMC term, a plain
// hyphen, then the authored plain-English phrase ("Singular - Just one").
// The term is the phrase-table key verbatim — TEGMC's own odd labels
// ("indefinite tense", "IRRegular or impure form") and "2nd "-prefixed tense
// values included, never normalized. A plain hyphen, not an em dash: space
// is tight in the word card. When no phrase has been authored for a term,
// the term stands alone rather than rendering "Term - Term".
function glossaryLine(term, phrase) {
    return phrase ? `${term} - ${phrase}` : term;
}

function phraseForCategory(category, values, byCategory) {
    // Empty raw_value (e.g. "Indeclinable=" on N-OI/N-PRI) is meaningful —
    // the key's presence IS the information. Phrase from the category name,
    // not the (blank) value, rather than rendering an empty line. No term
    // prefix here: there is no real term value to show.
    if (values.length === 1 && values[0] === '') {
        return CATEGORY_EMPTY_VALUE_PHRASES[category] || category;
    }
    if (category === 'Tense') return phraseTense(values[0], byCategory);
    if (category === 'Person') return phrasePerson(values[0]);
    return values.map(v => glossaryLine(v, TEGMC_VALUE_PHRASES[v])).join(' / ');
}

// A few source Person values embed a Number word inconsistently ("2nd
// Plural", "2nd Singular", "1st Person", "2nd Person", vs. plain "1st"/
// "3rd") — every such code also carries its own separate Number category, so
// stripping the embedded word here loses no information and avoids a
// redundant "2nd Plural · Plural" pair of lines. Canonicalizes to exactly
// {'1st','2nd','3rd'} before the phrase-map lookup.
function phrasePerson(rawValue) {
    const canonical = rawValue.replace(/\s+(Person|Singular|Plural)$/i, '');
    return glossaryLine(canonical, TEGMC_VALUE_PHRASES[canonical]);
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
    return glossaryLine(rawValue, table[rawValue]);
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
//
// Authoring rules (all three tables):
//   - Plain English for a reader with no Greek-grammar training. The raw
//     TEGMC code is already shown above these lines for anyone who wants
//     the scholarly label, so the scholarly term itself (aorist, deponent,
//     gentilic, nominative...) never appears here.
//   - Each phrase is rendered as its own line, prefixed by its raw TEGMC
//     term and a hyphen (see glossaryLine above): "Singular - Just one".
//     A phrase therefore never restates its own term.
//   - Keys are TEGMC's raw_value strings verbatim, including its own
//     inconsistencies ("IRRegular or impure form", "indefinite voice").
//   - Values prefixed "2nd " (2nd Aorist, 2nd Perfect...) name a different
//     Greek conjugation pattern, not a different meaning — they are phrased
//     identically to their plain counterpart. Keep each pair in sync.
//   - "indefinite tense" / "indefinite voice" are TEGMC's own labels for
//     forms where that category cannot be determined — phrased honestly as
//     "not distinguishable", never guessed.
//   - Person keys are the canonical '1st'/'2nd'/'3rd' that phrasePerson
//     produces. Phrased without singular/plural so the line stays true for
//     possessive pronouns, where TEGMC's embedded number word (the
//     possessor's number: my vs our) is inconsistently labelled at source.
const TEGMC_VALUE_PHRASES = {
    // ---- Person (canonical, see phrasePerson)
    '1st': 'The one speaking (I, we)',
    '2nd': 'The one being spoken to (you)',
    '3rd': 'Someone or something being talked about (he, she, it, they)',

    // ---- Number
    'Singular': 'Just one',
    'Plural': 'More than one',

    // ---- Gender
    'Masculine': 'A grammatical gender; not always a male',
    'Feminine': 'A grammatical gender; not always a female',
    'Neuter': 'A grammatical gender: neither masculine nor feminine',

    // ---- Case
    'Nominative': 'Used as the subject (the one doing or being something)',
    'Accusative': 'Used as the object (the one acted on, or the destination of motion)',
    'Genitive': 'Used to show possession, source, or connection ("of ...", "from ...")',
    'Dative': 'Used for the one something is given or done to, or the means ("to", "for", "by", "with", "in")',
    'Vocative': 'Used to address someone directly ("O Lord!", "friends!")',

    // ---- Voice
    'Active': 'The subject does the action',
    'Passive': 'The subject receives the action (it is done to them)',
    'Middle': 'The subject acts on, for, or with special involvement of itself',
    'Middle or Passive': 'Either the subject acts on or for itself, or the subject receives the action (the form is the same for both)',
    'Middle Deponent': 'The subject does the action (this verb only ever uses a form that looks reflexive, but its meaning is active)',
    'Passive Deponent': 'The subject does the action (this verb only ever uses a form that looks passive, but its meaning is active)',
    'Middle or Passive Deponent': 'The subject does the action (this verb only ever uses a form that looks reflexive or passive, but its meaning is active)',
    'impersonal active': 'No particular person does it ("it is necessary", "it happened")',
    'indefinite voice': 'Not distinguishable in this form: the verb does not mark whether the subject does or receives the action',

    // ---- Mood
    'Indicative': 'Stated as a fact, or as something that really happens',
    'Subjunctive': 'Not stated as fact: something possible, intended, or hoped for ("might", "should", "let us")',
    'Imperative': 'A command or request ("do this!")',
    'Optative': 'A wish or a remote possibility ("may it be so", "would that")',

    // ---- Form
    'Participle': 'A verb form used like a describing word or to add a side action ("-ing" / "-ed": "the man teaching", "having gone")',
    'Infinitive': 'The "to ..." form of the verb ("to go", "to see")',

    // ---- Function
    'Verb': 'An action, event, or state of being',
    'Noun': 'A person, place, thing, or idea',
    'Adjective': 'Describes a person or thing',
    'Adverb': 'Tells how, when, where, or how much',
    'Definite article': 'The word "the"',
    'Personal pronoun': 'I, you, he, she, it, we, they',
    'Possessive pronoun': 'My, your, our, their',
    'Reflexive pronoun': 'Myself, yourself, himself, themselves',
    'Reciprocal pronoun': 'One another, each other',
    'Demonstrative pronoun': 'Pointing word (this, that, these, those)',
    'Demonstrative pronoun+Conjunction': 'Pointing word fused with "and" ("and that one", "and these")',
    'Relative pronoun': 'Linking word that introduces a clause (who, which, that)',
    'Interrogative pronoun': 'Question word (who? what? which?)',
    'Indefinite pronoun': 'Someone, anyone, something, a certain one',
    'Correlative pronoun': 'Matching or comparing word ("as many as", "such as", "as great as")',
    'Correlative or Interrogative pronoun': 'A word asking or answering "what kind?" or "how much?" ("what sort of?", "such a kind", "how many?")',
    'Conjunction': 'Joining word (and, but, or, for, because)',
    'Preposition': 'In, on, to, from, with, through',
    'Particle or Disjunctive': 'Small function word that shapes the sentence (like "indeed", "then", "or", "than")',
    'Negative Particle': 'The word "not" / "no"',
    'Interrogative Particle': 'Small word that marks a question',
    'Adverb or adverb and particle combined': 'Tells how, when, or where; possibly fused with a small joining word',
    'Interjection': 'An exclamation ("O!", "Look!", "Woe!")',
    'Indeclinable Proper Noun': 'A proper name that never changes its form',
    'Indeclinable Noun of Other type': 'A noun that never changes its form',
    'Aramaic transliterated word': 'An Aramaic word spelled out in Greek letters',

    // ---- Name type
    // TEGMC uses "Individual" and "Person" for the same code letter (P);
    // "Individual Gentilic" and "Person Gentilic" are both code -PG.
    'Individual': 'The name of a specific person',
    'Location': 'The name of a place',
    'Title': 'A designation or honorific used as a name',
    'Gentilic': 'The name of a people or group (a member of a named group)',
    'Location Gentilic': 'A people or person named after their place of origin (as "Galilean", "Roman")',
    'Person Gentilic': 'A people or person named after an ancestor or founder (as "Israelite", "Levite")',
    'Individual Gentilic': 'A people or person named after an ancestor or founder (as "Israelite", "Levite")',
    'Title Gentilic': 'A group named after a title or office',
    // "Type" occurs on exactly one record (A-DSF-T); its -T code letter is
    // the Title letter everywhere else in TEGMC, so it is phrased as Title.
    'Type': 'A designation or honorific used as a name',
    'Person name Transcribed from Aramaic': 'A person’s name carried over from Aramaic and spelled in Greek letters',

    // ---- Original language / Name in Original language
    'Transcribed from Hebrew': 'A Hebrew word spelled out in Greek letters',
    'Transcribed from Aramaic': 'An Aramaic word spelled out in Greek letters',
    'Title Transcribed from Hebrew': 'A title carried over from Hebrew and spelled in Greek letters',
    'Title Transcribed from Aramaic': 'A title carried over from Aramaic and spelled in Greek letters',

    // ---- Adj.Numb.
    'Indeclinable Numeral': 'A number word that never changes its form',

    // ---- Extra
    'Comparative': 'Expresses "more ...", "...-er", or "rather"',
    'Superlative': 'Highest degree ("most ...", "...-est")',
    'Numeral': 'A number word',
    'Abbreviated Numeral': 'A number written in a shortened form',
    'Abbreviated': 'Written in a shortened form',
    'Negative': 'Expresses "not" / "no"',
    'Interrogative': 'Asks a question',
    'Transitive': 'Acts on a direct object (does something to someone or something)',
    'Indeclinable Letter': 'A letter of the alphabet used as a word (as "Alpha", "Omega"); never changes form',
    'Contracted form': 'Shortened spelling (two vowels merged into one)',
    'Apocopated form': 'Shortened spelling (the ending is clipped off)',
    'Attic Greek form': 'Spelled the way classical Athenian Greek spelled it, rather than the usual New Testament way',
    'Aeolic': 'Spelled in a regional dialect of Greek rather than the usual form',
    'IRRegular or impure form': 'Does not follow the normal spelling pattern',
};

// Used ONLY when Mood = Indicative — the one mood where a Greek tense form
// carries a real time reference (past / present / future).
const TENSE_WITH_TIME_PHRASES = {
    'Present': 'Happening now, ongoing or repeated ("is doing", "does")',
    '2nd Present': 'Happening now, ongoing or repeated ("is doing", "does")',
    'Imperfect': 'Past time: was going on or kept happening ("was doing", "used to do")',
    'Aorist': 'Past time: a simple, completed action ("did")',
    '2nd Aorist': 'Past time: a simple, completed action ("did")',
    'Future': 'Still to come: will happen ("will do")',
    '2nd Future': 'Still to come: will happen ("will do")',
    'Perfect': 'Completed action whose result still stands now ("has done", and it remains so)',
    '2nd Perfect': 'Completed action whose result still stands now ("has done", and it remains so)',
    'Pluperfect': 'Completed action whose result stood at an earlier time ("had done")',
    '2nd Pluperfect': 'Completed action whose result stood at an earlier time ("had done")',
    'indefinite tense': 'Time not distinguishable in this form',
};

// Used for every non-Indicative case (Subjunctive / Imperative / Optative
// Mood, or a Participle / Infinitive Form with no Mood at all). These
// describe only the KIND of action and never claim a past/present/future.
// Imperfect and Pluperfect never occur outside the Indicative in the current
// data (tegmc_value_domain.md cross-tab) and are included defensively only.
const TENSE_ASPECT_ONLY_PHRASES = {
    'Present': 'Ongoing or repeated action, seen as in progress (no time stated)',
    '2nd Present': 'Ongoing or repeated action, seen as in progress (no time stated)',
    'Imperfect': 'Ongoing or repeated action, seen as in progress (no time stated)',
    'Aorist': 'Simple action, seen as a single whole event (no time stated)',
    '2nd Aorist': 'Simple action, seen as a single whole event (no time stated)',
    'Future': 'Action still to come, later than the main verb, often expressing purpose ("in order to")',
    '2nd Future': 'Action still to come, later than the main verb, often expressing purpose ("in order to")',
    'Perfect': 'Completed action with a lasting result or state (no time stated)',
    '2nd Perfect': 'Completed action with a lasting result or state (no time stated)',
    'Pluperfect': 'Completed action whose result held at an earlier point (no time stated)',
    '2nd Pluperfect': 'Completed action whose result held at an earlier point (no time stated)',
    'indefinite tense': 'Kind of action not distinguishable in this form',
};

const CATEGORY_EMPTY_VALUE_PHRASES = {
    Indeclinable: 'Never changes its form',
    // Four N-*-T records carry "Name type=" with nothing after it; the -T
    // code letter is TEGMC's Title letter, but the source left it blank, so
    // this says only what the key's presence guarantees.
    'Name type': 'A proper name (type not specified in the source)',
};
