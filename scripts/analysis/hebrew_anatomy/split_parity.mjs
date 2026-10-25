// split_parity.mjs — JS splitter vs. the import's Python splitter (Hebrew Word Anatomy U1)
//
// Usage (from project root), after split_parity_export.py has written FIXTURE.json:
//     node scripts/analysis/hebrew_anatomy/split_parity.mjs FIXTURE.json
//
// Imports js/grammar-decode.js itself (its db.js import does nothing at load
// time) and checks, for every Hebrew word in language.db:
//   - splitTahotColumn / splitHebrewMorphCode give exactly the Python split of
//     the surface text, English and morph code;
//   - splitHebrewWord returns null for one-piece words, and for multi-piece
//     words gives each piece's Strong's number, role (approved rules) and
//     dictionary gloss as expected from raw column 12;
//   - isHebrewMorphCode is true for exactly the Hebrew morph codes.
// Exits 1 on any mismatch.

import { readFileSync } from 'node:fs';
import {
    isHebrewMorphCode, splitHebrewMorphCode, splitHebrewWord, splitTahotColumn,
} from '../../../js/grammar-decode.js';

const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const failures = [];
const fail = (what, detail) => { if (failures.length < 40) failures.push([what, detail]); failures.count = (failures.count || 0) + 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const affixes = new Map();
for (const [strongs, form, gloss, usual] of fixture.affixes) {
    if (!affixes.has(strongs)) affixes.set(strongs, { form: null, gloss: null, glossByForm: new Map() });
    const affix = affixes.get(strongs);
    affix.glossByForm.set(form, gloss);
    if (usual) { affix.form = form; affix.gloss = gloss; }
}

let codesChecked = 0;
for (const [code, language] of fixture.morphCodes) {
    codesChecked++;
    if (isHebrewMorphCode(code) !== (language === 'hebrew')) fail('isHebrewMorphCode', [code, language]);
}

let wordsChecked = 0, multiPiece = 0, piecesChecked = 0;
const roles = { prefix: 0, root: 0, suffix: 0 };
for (const word of fixture.words) {
    wordsChecked++;
    if (!same(splitTahotColumn(word.surface_text, 'surface'), word.pySurface)) fail('surface split', [word.ref, word.surface_text]);
    if (!same(splitTahotColumn(word.gloss_contextual, 'english'), word.pyEnglish)) fail('english split', [word.ref, word.gloss_contextual]);
    if (!same(splitHebrewMorphCode(word.morph_code), word.pyMorph)) fail('morph split', [word.ref, word.morph_code]);

    const split = splitHebrewWord(word, word.pieceRow, affixes);
    if (!word.pieceRow) {
        if (split !== null) fail('one-piece word did not return null', word.ref);
        continue;
    }
    multiPiece++;
    if (split === null) { fail('multi-piece word returned null', word.ref); continue; }
    const flat = split.flatMap(subword => subword.pieces);
    if (flat.length !== word.expected.length) { fail('piece count', word.ref); continue; }
    flat.forEach((piece, i) => {
        piecesChecked++;
        roles[piece.role]++;
        const expected = word.expected[i];
        for (const key of ['strongsNumber', 'role', 'dictionaryGloss']) {
            if (piece[key] !== expected[key]) fail(key, [word.ref, i, piece[key], expected[key]]);
        }
    });
    const pySurfaces = word.pySurface.flat(), pyEnglish = word.pyEnglish.flat().map(e => e.trim()), pyMorph = word.pyMorph.flat();
    flat.forEach((piece, i) => {
        if (piece.surface !== pySurfaces[i] || piece.glossContextual !== pyEnglish[i] || piece.morphCode !== pyMorph[i]) {
            fail('piece columns', [word.ref, i]);
        }
    });
}

console.log(`morph codes checked: ${codesChecked}`);
console.log(`Hebrew words checked: ${wordsChecked} (${multiPiece} multi-piece, ${piecesChecked} pieces: ` +
            `${roles.prefix} prefix, ${roles.root} root, ${roles.suffix} suffix)`);
if (failures.count) {
    console.log(`FAIL: ${failures.count} mismatches`);
    for (const f of failures) console.log('   ', JSON.stringify(f));
    process.exit(1);
}
console.log('PASS: JS splitting matches the import on every word');
