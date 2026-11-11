// manuscript-variants.js — what the Hebrew word card says about manuscripts:
// the Ketiv (written form) where the text follows the Qere, readings other
// sources give for the word, and words that aren't in the Hebrew manuscripts
// at all. From TAHOT via original_word_variants (getVariantsForWords). Builds
// DOM only, with textContent.
//
// TAHOT's spelling-only variants (accents, vowel points; column 8 apart from
// the Ketiv) aren't shown: TAHOT itself says they don't affect the meaning and
// leaves them out of its own interlinear.

import { plainGloss } from './db.js';

const KETIV_NOTES = {
    meaning: 'The text is read as shown above (Qere); the written consonants differ and give a different reading.',
    spelling: 'Spelling difference only.',
};

// TAHOT's source letters (its header's list), in full.
const SOURCE_NAMES = {
    A: 'Aleppo Codex',
    B: 'BHS',
    C: 'Cairo Codex',
    D: 'Dead Sea Scrolls',
    E: 'Scholarly emendation',
    F: 'Different word division',
    H: 'Ben Chaim edition',
    L: 'Leningrad Codex',
    P: 'Different punctuation',
    S: 'Scribal tradition',
    V: 'Other manuscripts',
};

// What a reading means, by its first source letter. The default covers the
// manuscripts and editions (A, B, C, D, H).
const READING_NOTES = {
    E: 'A scholarly reconstruction, where the Hebrew seems to have been damaged in copying.',
    F: 'The same letters, divided into words or pointed differently.',
    L: 'The Leningrad Codex reads this; the text above follows other manuscripts.',
    P: 'The same words, punctuated differently.',
    S: 'A reading recorded by the ancient scribes (Tiqqune Sopherim and related traditions).',
    V: 'Some other manuscripts read this.',
};
const DEFAULT_READING_NOTE = 'The text above follows the Leningrad Codex; this source reads the word differently.';

const ADDED_NOTES = {
    X: 'Not in the Hebrew manuscripts: supplied from the Greek Septuagint, as reconstructed in BHS.',
    // The only restored passages: Joshua 21:36–37 and Nehemiah 7:67b.
    R: {
        6: 'Not in the Leningrad Codex: restored from the parallel in 1 Chronicles 6:63–64.',
        16: 'Not in the Leningrad Codex: restored from the parallel in Ezra 2:66.',
    },
};

// TAHOT column 7 segment: `SRC= translit (hebrew) "gloss" (strongs=morph)`.
const READING = /^([A-Z]+)=\s*\S+\s*\(([^)]*)\)\s*"([^"]*)"/;

// Hebrew as the Ketiv line shows it: '\' punctuation segments dropped, '/'
// piece breaks kept.
function displayHebrew(hebrew) {
    return hebrew.replace(/\\[^/\\]*/g, '').trim();
}

// One row (Dan 4:32 #22) gives a Ketiv identical to the printed word; a Ketiv
// line there would show the same word twice under "differ", so it is skipped.
function ketivMatchesPrinted(ketiv, surface) {
    const bare = text => text.replace(/\\[^/\\]*/g, '').replace(/[/\s]/g, '');
    return bare(ketiv) === bare(surface);
}

// What the card says about one word, or null when there's nothing to say:
// { ketiv: { hebrew, kind } | null, readings: [{ sources, hebrew, gloss, note }],
//   added: note | null }.
export function manuscriptNotes(word, variant) {
    if (!variant) return null;
    const ketiv = variant.ketivHebrew && !ketivMatchesPrinted(variant.ketivHebrew, word.surface_text)
        ? { hebrew: variant.ketivHebrew, kind: variant.ketivKind } : null;

    const readings = [];
    for (const segment of (variant.meaningVariants || '').split('¦')) {
        const match = READING.exec(segment.trim());
        if (!match || match[1] === 'K') continue; // the Ketiv has its own line
        const letters = [...match[1]];
        readings.push({
            sources: letters.map(letter => SOURCE_NAMES[letter] ?? letter).join(', '),
            hebrew: displayHebrew(match[2]),
            gloss: plainGloss(match[3]),
            note: READING_NOTES[letters[0]] ?? DEFAULT_READING_NOTE,
        });
    }

    const book = Math.floor(word.verse_id / 1_000_000);
    const added = variant.textType === 'X' ? ADDED_NOTES.X
        : variant.textType === 'R' ? ADDED_NOTES.R[book] ?? null : null;

    return ketiv || readings.length || added ? { ketiv, readings, added } : null;
}

// LXX-supplied and restored words, which the interlinear marks on the row too.
export function isAddedWord(variant) {
    return variant?.textType === 'X' || variant?.textType === 'R';
}

export function renderManuscriptNotes(notes) {
    const wrap = document.createElement('div');
    wrap.className = 'language-ketiv language-manuscripts';

    if (notes.added) {
        const added = document.createElement('div');
        added.className = 'language-manuscript-added';
        added.textContent = notes.added;
        wrap.appendChild(added);
    }
    if (notes.ketiv) {
        wrap.appendChild(hebrewField('Written (Ketiv)', notes.ketiv.hebrew));
        wrap.appendChild(noteLine(KETIV_NOTES[notes.ketiv.kind]));
    }
    for (const reading of notes.readings) {
        const field = hebrewField(reading.sources, reading.hebrew);
        if (reading.gloss) {
            const gloss = document.createElement('span');
            gloss.className = 'language-manuscript-gloss';
            gloss.textContent = `“${reading.gloss}”`;
            field.appendChild(gloss);
        }
        wrap.appendChild(field);
        wrap.appendChild(noteLine(reading.note));
    }
    return wrap;
}

function hebrewField(labelText, hebrew) {
    const field = document.createElement('div');
    field.className = 'language-detail-field';
    const label = document.createElement('span');
    label.className = 'language-detail-label';
    label.textContent = labelText;
    const value = document.createElement('span');
    value.className = 'language-detail-value language-ketiv-hebrew language-hebrew';
    value.dir = 'rtl';
    value.textContent = hebrew;
    field.append(label, value);
    return field;
}

function noteLine(text) {
    const note = document.createElement('div');
    note.className = 'language-ketiv-note';
    note.textContent = text;
    return note;
}
