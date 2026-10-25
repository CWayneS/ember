// hebrew_wording_check.mjs — Every Hebrew decode line the data can produce (Hebrew Word Anatomy U2)
//
// Usage: see hebrew_wording_export.py. Runs js/grammar-decode.js's
// hebrewMorphLines() on every TEHMC code the data's pieces use and prints:
//   - every (category, value) pair used, and how it reaches the screen:
//     its own line with authored wording, folded into another line, left out,
//     or FALLBACK (TEHMC's bare text, no wording);
//   - every distinct line, with how many piece occurrences show it.
// Exits 1 if any line falls back to bare TEHMC text.

import { readFileSync } from 'node:fs';
import { hebrewMorphLines } from '../../../js/grammar-decode.js';

const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const markdown = process.argv.includes('--markdown');
const lineCounts = new Map();
const pairs = new Map();      // "category=value" -> { occurrences, fate: Set }

for (const { code, occurrences, rows } of fixture) {
    const lines = hebrewMorphLines(rows);
    for (const line of lines) lineCounts.set(line, (lineCounts.get(line) || 0) + occurrences);
    const terms = new Set(lines.map(line => line.split(' - ')[0]));
    const fn = rows.find(r => r.category === 'Function')?.value;
    for (const row of rows) {
        const key = `${row.category}=${row.value}`;
        if (!pairs.has(key)) pairs.set(key, { occurrences: 0, fate: new Set() });
        const pair = pairs.get(key);
        pair.occurrences += occurrences;
        const form = rows.find(r => r.category === 'Form')?.value;
        let fate;
        if (row.category === 'Mood' && (row.value === 'Indicative' || row.value === form)) {
            fate = 'left out (default or same as Form)';
        } else if (terms.has(row.value)) {
            const line = lines.find(l => l.split(' - ')[0] === row.value);
            fate = line.includes(' - ') ? 'own line' : 'FALLBACK';
        } else if (row.derived && row.category !== 'Mood') fate = 'folded into Stem/Form wording';
        else if (row.category === 'Form' && row.value === 'Common') fate = 'left out (default)';
        else if (fn === 'Suffix') fate = 'combined into the Suffix line';
        else if (row.category === 'Function') fate = 'replaced by its Form line';
        else fate = 'NOT SHOWN';
        pair.fate.add(fate);
    }
}

const fallbacks = [...lineCounts.keys()].filter(line => !line.includes(' - '));
const notShown = [...pairs].filter(([, p]) => p.fate.has('NOT SHOWN') || p.fate.has('FALLBACK'));
if (markdown) {
    console.log('| Pair | Occurrences | How it shows |\n|---|---|---|');
    for (const [key, p] of [...pairs].sort()) console.log(`| \`${key}\` | ${p.occurrences.toLocaleString('en')} | ${[...p.fate].join('; ')} |`);
    console.log('\n| Line | Occurrences |\n|---|---|');
    for (const [line, n] of [...lineCounts].sort((a, b) => b[1] - a[1])) console.log(`| ${line} | ${n.toLocaleString('en')} |`);
} else {
    for (const [key, p] of [...pairs].sort()) console.log(`${key.padEnd(48)} ${String(p.occurrences).padStart(7)}  ${[...p.fate].join('; ')}`);
    console.log();
    for (const [line, n] of [...lineCounts].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(7)}  ${line}`);
}
console.log(`\n${pairs.size} pairs, ${lineCounts.size} distinct lines, ${fallbacks.length} fallback lines, ${notShown.length} pairs not shown or bare`);
if (fallbacks.length || notShown.length) {
    console.log('FALLBACK / NOT SHOWN:', JSON.stringify(fallbacks), JSON.stringify(notShown.map(([k]) => k)));
    process.exit(1);
}
