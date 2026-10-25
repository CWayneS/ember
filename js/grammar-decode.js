// grammar-decode.js — Morphology-code decode (Grammar Decode spec) and Hebrew
// word splitting (Hebrew Word Anatomy spec)
//
// Pure functions, no DOM. Turns a raw original_words.morph_code value into a
// plain-English grammatical breakdown: Greek ("V-PAP-NSM", or a compound like
// "CONJ + G5104=PRT + G1065=PRT") from the TEGMC-derived step_morphology_greek
// table; Hebrew/Aramaic ("HR/Ncfsa", "Hc/Vqw3ms") from the TEHMC-derived
// step_morphology_hebrew table, one entry per piece of the word. Also splits a
// Hebrew word into its pieces (splitHebrewWord) for the Language tab's anatomy
// view. See scripts/build_language.py and docs/HEBREW_ANATOMY_DATA_REPORT.md.

import { getGreekMorphCategories, getHebrewMorphCategories } from './db.js';

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

// Greek: returns [] if nothing decodable at all — callers must not render an
// accordion in that case (e.g. a code TEGMC has no entry for).
// Hebrew/Aramaic (first letter H or A): one entry per piece in reading order,
// each with subwordIndex; a piece TEHMC doesn't resolve keeps its entry with
// lines: [], so entries stay aligned with splitHebrewWord's pieces.
export async function decodeMorphCode(morphCode) {
    if (isHebrewMorphCode(morphCode)) return decodeHebrewMorphCode(morphCode);
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

// ---- Hebrew ---------------------------------------------------------------

// Hebrew and Aramaic codes begin with their language letter (H/A) and contain
// a lowercase letter or a "/", or are two capitals ("HR", "AC"). No Greek code
// has a lowercase letter or "/", and the only Greek codes starting A/H without
// a hyphen are "ADV" and "ARAM". Checked against every distinct morph_code in
// language.db by scripts/analysis/hebrew_anatomy/split_parity.mjs.
export function isHebrewMorphCode(morphCode) {
    return /^[HA]/.test(morphCode || '') && (/[a-z/]/.test(morphCode) || morphCode.length === 2);
}

async function decodeHebrewMorphCode(morphCode) {
    const parts = [];
    const subwords = splitHebrewMorphCode(morphCode);
    for (let subwordIndex = 0; subwordIndex < subwords.length; subwordIndex++) {
        for (const code of subwords[subwordIndex]) {
            let rows = [];
            try {
                rows = await getHebrewMorphCategories(code);
            } catch (e) {
                console.error('decodeMorphCode: Hebrew category lookup failed:', e);
            }
            parts.push({ code, strongsNumber: null, subwordIndex, lines: hebrewMorphLines(rows) });
        }
    }
    return parts;
}

// TEHMC rows (category, value, derived, position) for one piece -> glossary
// lines in reading order: Function, Stem, Form, Mood, Person, Gender, Number,
// State — TEHMC's own order. What is folded or left out, and why:
//   - Derived Action/Voice (implied by the Stem) and Tense (implied by the
//     Form) are never lines of their own: the Stem and Form wording is written
//     from them (see HEBREW_STEM_PHRASES / HEBREW_VERB_FORM_PHRASES). TEHMC
//     itself calls them likely, not definite.
//   - Mood gets a line only when it says something the Form doesn't: never for
//     plain "Indicative", nor "Imperative" (the Form already is "Imperative").
//   - Form "Common" (an ordinary noun or adjective, not a name or number) is
//     the default and is left out, as the spec's own example shows.
//   - A Particle or Pronoun shows its Form ("Object indicator", "Personal")
//     instead of a bare "Particle"/"Pronoun" line. A Suffix is one line: a
//     pronoun suffix's person/gender/number combined ("third person masculine
//     singular"), any other suffix its Form ("Directional").
//   - A proper name's Gender says whose name it is ("Masculine - A man's name").
// A value with no authored wording renders as TEHMC's own text alone.
export function hebrewMorphLines(rows) {
    const main = new Map();
    for (const row of rows) {
        if (!row.derived) main.set(row.category, row.value);
        else if (row.category === 'Mood') main.set('Mood', row.value);
    }
    const fn = main.get('Function');
    const form = main.get('Form');
    const lines = [];

    if (fn === 'Suffix') {
        if (form === 'Personal') {
            const parts = [`${(main.get('Person') || '').toLowerCase()} person`];
            if (main.get('Gender') && main.get('Gender') !== 'Either gender') parts.push(main.get('Gender').toLowerCase());
            if (main.get('Number')) parts.push(main.get('Number').toLowerCase());
            return [glossaryLine('Suffix', `A pronoun ending: ${parts.join(' ')}`)];
        }
        return [glossaryLine(form || 'Suffix', HEBREW_FORM_PHRASES[form] || HEBREW_FUNCTION_PHRASES.Suffix)];
    }

    if (fn && !((fn === 'Particle' || fn === 'Pronoun') && form)) {
        lines.push(glossaryLine(fn, HEBREW_FUNCTION_PHRASES[fn]));
    }
    if (main.has('Stem')) {
        lines.push(glossaryLine(main.get('Stem'), HEBREW_STEM_PHRASES[main.get('Stem')]));
    }
    if (form && form !== 'Common') {
        const phrase = fn === 'Verb' ? HEBREW_VERB_FORM_PHRASES[form] : HEBREW_FORM_PHRASES[form];
        lines.push(glossaryLine(form, phrase));
    }
    const mood = main.get('Mood');
    if (mood && mood !== 'Indicative' && mood !== form) {
        lines.push(glossaryLine(mood, HEBREW_MOOD_PHRASES[mood]));
    }
    for (const category of ['Person', 'Gender', 'Number', 'State']) {
        if (!main.has(category)) continue;
        const value = main.get(category);
        const phrase = category === 'Gender' && form === 'Proper'
            ? HEBREW_PROPER_GENDER_PHRASES[value]
            : HEBREW_VALUE_PHRASES[`${category}=${value}`];
        lines.push(glossaryLine(value, phrase));
    }
    return lines;
}

// The splitting rules for a Hebrew word — the runtime twin of
// scripts/build_language.py's strip_punctuation_segments / split_tahot_column /
// split_hebrew_morph_code, which the import used to verify, row by row, that
// every column of a stored word splits alike. The two must give identical
// results (scripts/analysis/hebrew_anatomy/split_parity.mjs checks every
// stored word):
//   1. Strip punctuation segments: "\\" up to the next "/" or "\\" (sof
//      pasuq, maqqef, paseq: "\\׃", "\\׀", "\\ \\פ").
//   2. Split on "/". A word-break segment starts a new subword (two written
//      words in one row): "//" (empty), "/ /" (a space), or a maqqef written
//      as its own segment — "־" in the Hebrew, "-" in the English.
//   3. Morph codes write the break "//" and carry the language letter (H/A)
//      only at the start: it is prefixed onto every later piece. An "A" after
//      "/" is an Adjective, not Aramaic ("HR/Ncbsa//Aamsa").
const PUNCTUATION_SEGMENT_RE = /\\[^/\\]*/g;
const WORD_BREAK_SEGMENTS = {
    surface: new Set(['', '־']),
    english: new Set(['', '-']),
};

export function splitTahotColumn(text, column) {
    const breaks = WORD_BREAK_SEGMENTS[column];
    const subwords = [[]];
    for (const segment of (text || '').replace(PUNCTUATION_SEGMENT_RE, '').split('/')) {
        if (breaks.has(segment.trim())) {
            subwords.push([]);
        } else {
            subwords[subwords.length - 1].push(segment);
        }
    }
    return subwords;
}

export function splitHebrewMorphCode(morphCode) {
    const language = morphCode.charAt(0);
    return morphCode.split('//').map((subword, s) =>
        subword.split('/').map((piece, p) => (s === 0 && p === 0 ? piece : language + piece)));
}

function sameShape(a, b) {
    return a.length === b.length && a.every((pieces, i) => pieces.length === b[i].length);
}

// One Hebrew word -> its pieces, for the anatomy view and nothing else.
//   word      an original_words row (surface_text, gloss_contextual,
//             gloss_dictionary, morph_code)
//   pieceRow  its getPiecesForWords() entry, { pieceStrongs, rootGlosses,
//             affixForms }; absent for one-piece words (and for a word whose
//             columns didn't split alike at import, of which there are none)
//   affixes   getHebrewAffixes()
// Returns [{ subwordIndex, surface, pieces: [{ surface, morphCode,
// glossContextual, strongsNumber, role, dictionaryGloss }] }] in reading
// order, or null when there is nothing to split or the columns disagree —
// callers then show the single-code display.
//
// role: 'root' for a braced piece in pieceStrongs; any other piece is a
// 'prefix' if a root follows it in its written word, otherwise a 'suffix'. In a
// written word with no root (2 rows: Isa 3:15, Jer 50:29), a piece whose code
// is a Suffix (function letter S — TEHMC's Function=Suffix exactly) is a
// suffix and any other a prefix. dictionaryGloss: a root's is the word's
// gloss_dictionary, or the matching entry of rootGlosses when the word has
// 2+ roots; an affix's is hebrew_affixes' gloss for its column-12 form — the
// number's usual form unless affixForms names another (the suffixes of לְבַד).
export function splitHebrewWord(word, pieceRow, affixes) {
    if (!pieceRow || !word.morph_code) return null;
    const strongs = pieceRow.pieceStrongs.split('//').map(subword => subword.split('/'));
    const surface = splitTahotColumn(word.surface_text, 'surface');
    const english = splitTahotColumn(word.gloss_contextual, 'english');
    const morph = splitHebrewMorphCode(word.morph_code);
    const forms = pieceRow.affixForms
        ? pieceRow.affixForms.split('//').map(subword => subword.split('/'))
        : null;
    if (!sameShape(strongs, surface) || !sameShape(strongs, english) || !sameShape(strongs, morph)
        || (forms && !sameShape(strongs, forms))) {
        return null;
    }
    const rootGlosses = pieceRow.rootGlosses ? pieceRow.rootGlosses.split('/') : [word.gloss_dictionary];
    let rootCount = 0;

    return strongs.map((subword, s) => {
        const isRoot = subword.map(token => token.startsWith('{'));
        const lastRoot = isRoot.lastIndexOf(true);
        const pieces = subword.map((token, p) => {
            const strongsNumber = token.replace(/[{}]/g, '');
            let role;
            let dictionaryGloss = null;
            if (isRoot[p]) {
                role = 'root';
                dictionaryGloss = rootGlosses[rootCount++] || null;
            } else {
                role = lastRoot >= 0
                    ? (p < lastRoot ? 'prefix' : 'suffix')
                    : (morph[s][p].charAt(1) === 'S' ? 'suffix' : 'prefix');
                const affix = affixes && affixes.get(strongsNumber);
                if (affix) {
                    const form = forms && forms[s][p] !== '*' ? forms[s][p] : affix.form;
                    dictionaryGloss = affix.glossByForm.get(form) ?? null;
                }
            }
            return {
                surface: surface[s][p],
                morphCode: morph[s][p],
                glossContextual: english[s][p].trim(),
                strongsNumber,
                role,
                dictionaryGloss,
            };
        });
        return { subwordIndex: s, surface: surface[s].join(''), pieces };
    });
}

// ---- Shared ------------------------------------------------------------------

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
// data (docs/tegmc_value_domain.md cross-tab) and are included defensively only.
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

// ---- Authored content: Hebrew and Aramaic (Hebrew Word Anatomy spec, Item 6).
// Like the Greek tables, Ember's plain-English rendering of TEHMC's parsing —
// git-tracked here, not stored in language.db. Keys are TEHMC's values
// verbatim, including its own spellings ("transtive", "Hé"). Worklist — the
// (category, value) pairs the data's pieces actually use:
//
//   scripts/analysis/hebrew_anatomy/hebrew_wording_check.mjs
//
// Two editorial rules from the spec, both following TEHMC's own caution that
// Stem-implied Action/Voice and Form-implied Tense/Mood "are not definite and
// depend on context":
//   - Stems: don't overstate. "Piel = intensive" is a classroom simplification
//     that is often wrong. Each stem's wording comes from TEHMC's derived
//     Action/Voice for it, hedged with "often"/"usually" as TEHMC hedges.
//   - Verb forms: the form alone doesn't fix the time. No form is phrased as
//     a certain past or future; TEHMC's likely time is given as typical use.
// Where the meaning really matches, the Greek wording is reused as is.
const HEBREW_FUNCTION_PHRASES = {
    'Verb': TEGMC_VALUE_PHRASES['Verb'],
    'Noun': TEGMC_VALUE_PHRASES['Noun'],
    'Adjective': TEGMC_VALUE_PHRASES['Adjective'],
    'Adverb': TEGMC_VALUE_PHRASES['Adverb'],
    'Conjunction': TEGMC_VALUE_PHRASES['Conjunction'],
    'Preposition': TEGMC_VALUE_PHRASES['Preposition'],
    'Pronoun': 'A word standing in for a noun (I, you, he, this, who)',
    'Particle': 'Small function word that shapes the sentence',
    'Suffix': 'An ending attached to the word',
};

// Stem (binyan). Derived Action/Voice per stem, from TEHMC:
//   Simple+Active: Qal, Peal · Simple+Passive: Niphal, Peil
//   Intensive/resultive/transtive+Active: Piel, Pael
//   Intensive/resultive/transtive+Passive: Pual, Hothpaal, Nithpael, Hitpael (Aramaic)
//   Intensive/resultive/transtive+Reflexive/iterative: Hithpael, Hitpaal
//   Causative/declarative+Active: Hiphil, Haphel, Aphel, Shaphel, Tiphil
//   Causative/declarative+Passive: Hophal · Causative/declarative+Reflexive: Hishtaphel, Ishtaphel
//   Hitpeel: Intensive/…+Passive in 2 codes, Simple+Reflexive in 3 — phrased to cover both.
// Active stems don't say "done by the subject": Qal also has a passive
// participle (TEHMC marks those 8 codes Passive; the Form wording says so).
// TEHMC also marks one Pual participle (HVPrmpa) Active; Pual's "often"
// covers it.
const HEBREW_STEM_PHRASES = {
    'Qal': 'The basic stem: the plain meaning of the verb',
    'Niphal': 'Often passive: the subject receives the plain meaning ("was sent")',
    'Piel': 'Often brings about a result, strengthens the plain meaning, or makes it act on someone',
    'Pual': 'Often the passive of Piel: the result or action is done to the subject',
    'Hiphil': 'Often causes the plain meaning ("make reign", "bring up") or declares it ("declare righteous")',
    'Hophal': 'Often the passive of Hiphil: the subject is caused to do or be the plain meaning',
    'Hithpael': 'Often the subject acts on or for itself, or repeatedly ("walk about", "consecrate oneself"); sometimes causative instead',
    'Hishtaphel': 'A rare stem, used almost only for "bow down, worship": the subject brings itself low',
    'Hothpaal': 'A rare stem: often the passive of Hithpael',
    'Nithpael': 'A rare stem: often the passive of Hithpael',
    'Tiphil': 'A rare stem: often causes the plain meaning, like Hiphil',
    // Aramaic
    'Peal': 'The basic Aramaic stem: the plain meaning of the verb (like Hebrew Qal)',
    'Peil': 'Often passive of the basic Aramaic stem: the subject receives the plain meaning',
    'Pael': 'Often brings about a result, strengthens the plain meaning, or makes it act on someone (like Hebrew Piel)',
    'Haphel': 'Often causes the plain meaning or declares it (like Hebrew Hiphil)',
    'Aphel': 'Often causes the plain meaning or declares it (like Hebrew Hiphil)',
    'Shaphel': 'Often causes the plain meaning (like Hebrew Hiphil)',
    'Hitpaal': 'Often the subject acts on or for itself, or repeatedly (like Hebrew Hithpael)',
    'Hitpael': 'Often passive: a result or action done to the subject',
    'Hitpeel': 'Often passive or reflexive of the basic Aramaic stem: done to the subject, or by it to itself',
    'Ishtaphel': 'A rare stem: often the subject causes itself to do the plain meaning',
};

// Verb Form (conjugation). Derived Tense per form, from TEHMC: Perfect and
// Consecutive Imperfect Past/present; Imperfect, Conjunction+Imperfect and
// Consecutive Perfect Future/present; Imperative Present/future; participles
// and infinitives none. TEHMC: imperfective is "incomplete", perfective
// "complete", and a sequential (consecutive) verb follows the completeness of
// the one before; the first-listed time is only the most likely.
const HEBREW_VERB_FORM_PHRASES = {
    'Perfect': 'A complete action: usually past ("he said"), sometimes a present state ("he knows"); context decides',
    'Imperfect': 'An action not seen as complete: often future or present ("he will say", "he says"), sometimes repeated in the past; context decides',
    'Consecutive Imperfect': 'Usually tells the next event in a story (past): "and he said"',
    'Consecutive Perfect': 'Usually continues a series of actions still to come, or of instructions: "and you shall say"',
    'Conjunction+Imperfect': 'Joined to "and" without moving the story on: an action not seen as complete; context decides the time',
    'Imperative': TEGMC_VALUE_PHRASES['Imperative'],
    'Infinitive': 'The verb used as a noun or "to ..." form ("to say", "saying"); no person or time of its own',
    'Participle': 'A verb form used like a describing word or noun ("the one going"), often for an ongoing action ("is going")',
    'Participle passive': 'A verb form used like a describing word, for something the action is done to ("written", "blessed")',
};

// Mood — a line only for jussive/cohortative readings (see hebrewMorphLines).
// TEHMC: "should" for cohortative, "may" for jussive; an Imperfect often can't
// show whether it is a statement or a wish, hence the "/" values.
const HEBREW_MOOD_PHRASES = {
    'Jussive': 'A wish or mild command, usually about someone else ("may he ...", "let it ...")',
    'Cohortative': 'The speaker\u2019s resolve or wish ("let me ...", "let us ...", "I should ...")',
    'Indicative/jussive': 'Either a statement or a wish ("he will ..." or "may he ..."): the form is the same, so context decides',
    'Indicative/cohortative': 'Either a statement or a resolve ("I will ..." or "let me ..."): the form is the same, so context decides',
};

// Form of a non-verb (Particle and Pronoun show this line in place of their
// Function line; "Common" is never shown).
const HEBREW_FORM_PHRASES = {
    'Consecutive': 'The "and" that ties this verb to the one before it as the next step',
    'Definite': 'With "the" included (as בַּ, "in the")',
    'Definite article (Hebrew)': TEGMC_VALUE_PHRASES['Definite article'],
    'Definite article (Aramaic)': 'The word "the" (in Aramaic, written as an ending)',
    'Object indicator': 'Marks the next word as the definite object of the verb; not translated in English',
    'Conditional': 'Introduces a condition or its result ("if", "for")',
    'Negative': TEGMC_VALUE_PHRASES['Negative'],
    'Interrogative': 'A question word (who? what? is it ...?)',
    'Interjection': TEGMC_VALUE_PHRASES['Interjection'],
    'Demonstrative': TEGMC_VALUE_PHRASES['Demonstrative pronoun'],
    'Relative': TEGMC_VALUE_PHRASES['Relative pronoun'],
    'Personal': TEGMC_VALUE_PHRASES['Personal pronoun'],
    'Proper': 'A proper name',
    'Gentilic': TEGMC_VALUE_PHRASES['Gentilic'],
    'Title': 'The name of a deity, rank, or month, used as a title',
    'Numerical': 'A number (one, two, three ...)',
    'Numerical position': 'A position in order (first, second, third ...)',
    'Directional': 'An ending meaning "toward" (as in "homeward")',
    'Paragogic Hé': 'An extra ending that adds emphasis or feeling; usually not translated',
    'Paragogic Nun': 'An extra ending that adds emphasis or feeling; usually not translated',
};

// Person / Gender / Number / State, keyed "Category=Value".
const HEBREW_VALUE_PHRASES = {
    'Person=First': TEGMC_VALUE_PHRASES['1st'],
    'Person=Second': TEGMC_VALUE_PHRASES['2nd'],
    'Person=Third': TEGMC_VALUE_PHRASES['3rd'],
    'Gender=Masculine': TEGMC_VALUE_PHRASES['Masculine'],
    'Gender=Feminine': TEGMC_VALUE_PHRASES['Feminine'],
    'Gender=Either gender': 'The same form serves for male or female',
    'Number=Singular': TEGMC_VALUE_PHRASES['Singular'],
    'Number=Plural': TEGMC_VALUE_PHRASES['Plural'],
    'Number=Dual': 'Two of something, or a natural pair (eyes, hands)',
    'State=Absolute': 'Standing on its own',
    'State=Construct': 'Read with the next word: "X of ..."',
    'State=Definite': 'Has the Aramaic ending that means "the"',
};

// A proper name's Gender (TEHMC: masculine/feminine individual, location,
// or "other title" — deities, ranks, months).
const HEBREW_PROPER_GENDER_PHRASES = {
    'Masculine': 'A man\u2019s name',
    'Feminine': 'A woman\u2019s name',
    'Location': TEGMC_VALUE_PHRASES['Location'],
    'Title': 'The name of a deity, rank, or month',
};
