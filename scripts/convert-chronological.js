#!/usr/bin/env node
// convert-chronological.js
// Converts oneyearchronological.json (data2 format with verse-level refs)
// to Ember plan format.
// Usage: node convert-chronological.js oneyearchronological.json > bible-in-a-year-chronological.json

const fs = require('fs');

const BOOK_MAP = {
  'Genesis': 'GEN', 'Exodus': 'EXO', 'Leviticus': 'LEV', 'Numbers': 'NUM',
  'Deuteronomy': 'DEU', 'Joshua': 'JOS', 'Judges': 'JDG', 'Ruth': 'RUT',
  '1 Samuel': '1SA', '2 Samuel': '2SA', '1 Kings': '1KI', '2 Kings': '2KI',
  '1Samuel': '1SA', '2Samuel': '2SA', '1Kings': '1KI', '2Kings': '2KI',
  '1 Chronicles': '1CH', '2 Chronicles': '2CH',
  '1Chronicles': '1CH', '2Chronicles': '2CH',
  'Ezra': 'EZR', 'Nehemiah': 'NEH', 'Esther': 'EST',
  'Job': 'JOB', 'Psalm': 'PSA', 'Psalms': 'PSA', 'Proverbs': 'PRO',
  'Ecclesiastes': 'ECC', 'Song of Solomon': 'SNG', 'Song Of Solomon': 'SNG',
  'SongOfSongs': 'SNG', 'Song of Songs': 'SNG',
  'Isaiah': 'ISA', 'Jeremiah': 'JER', 'Lamentations': 'LAM',
  'Ezekiel': 'EZK', 'Daniel': 'DAN', 'Hosea': 'HOS', 'Joel': 'JOL',
  'Amos': 'AMO', 'Obadiah': 'OBA', 'Jonah': 'JON', 'Micah': 'MIC',
  'Nahum': 'NAH', 'Habakkuk': 'HAB', 'Zephaniah': 'ZEP', 'Haggai': 'HAG',
  'Zechariah': 'ZEC', 'Malachi': 'MAL',
  'Matthew': 'MAT', 'Mark': 'MRK', 'Luke': 'LUK', 'John': 'JHN',
  'Acts': 'ACT', 'Romans': 'ROM',
  '1 Corinthians': '1CO', '2 Corinthians': '2CO',
  '1Corinthians': '1CO', '2Corinthians': '2CO',
  'Galatians': 'GAL', 'Ephesians': 'EPH', 'Philippians': 'PHP',
  'Colossians': 'COL',
  '1 Thessalonians': '1TH', '2 Thessalonians': '2TH',
  '1Thessalonians': '1TH', '2Thessalonians': '2TH',
  '1 Thes': '1TH', '2 Thes': '2TH',
  '1 Timothy': '1TI', '2 Timothy': '2TI',
  '1Timothy': '1TI', '2Timothy': '2TI',
  'Titus': 'TIT', 'Philemon': 'PHM', 'Hebrews': 'HEB',
  'James': 'JAS',
  '1 Peter': '1PE', '2 Peter': '2PE',
  '1Peter': '1PE', '2Peter': '2PE',
  '1 John': '1JN', '2 John': '2JN', '3 John': '3JN',
  '1John': '1JN', '2John': '2JN', '3John': '3JN',
  'Jude': 'JUD', 'Revelation': 'REV',
};

function bookCode(name) {
  const trimmed = name.trim();
  if (BOOK_MAP[trimmed]) return BOOK_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(BOOK_MAP)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function parsePassage(raw) {
  const str = raw.trim();
  let bookName = null;
  let location = null;

  const parts = str.split(' ');
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(0, i).join(' ');
    const rest = parts.slice(i).join(' ').trim();
    if (bookCode(candidate)) {
      bookName = candidate;
      location = rest;
      break;
    }
  }

  if (!bookName) {
    console.error(`  WARNING: Could not parse book from: "${str}"`);
    return { ref: str, display: str };
  }

  const code = bookCode(bookName);
  const display = str;

  if (!location || location === '') {
    return { ref: code, display };
  }

  if (location.includes(':')) {
    const startCh = location.split(':')[0].trim();
    const fullAfterColon = location.slice(location.indexOf(':') + 1);
    const dashIdx = fullAfterColon.indexOf('-');

    if (dashIdx === -1) {
      // Single verse: "1:4"
      return { ref: `${code}.${startCh}.${fullAfterColon}`, display };
    }

    const startVerse = fullAfterColon.slice(0, dashIdx);
    const endPortion = fullAfterColon.slice(dashIdx + 1);

    if (endPortion.includes(':')) {
      // Cross-chapter range: "1:1-3:24"
      const [endCh, endV] = endPortion.split(':');
      return { ref: `${code}.${startCh}.${startVerse}-${endCh}.${endV}`, display };
    } else {
      // Same-chapter verse range: "1:1-4"
      return { ref: `${code}.${startCh}.${startVerse}-${endPortion}`, display };
    }
  } else if (location.includes('-')) {
    const [s, e] = location.split('-').map(s => s.trim());
    return { ref: `${code}.${s}-${e}`, display };
  } else {
    return { ref: `${code}.${location}`, display };
  }
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node convert-chronological.js <path-to-json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const days = raw.data2;

if (!Array.isArray(days) || days.length === 0) {
  console.error('Could not find data2 array in input file.');
  process.exit(1);
}

console.error(`Converting ${days.length} days...`);

let warnings = 0;
const convertedDays = days.map((passages, index) => {
  const dayNumber = index + 1;
  const scripture = passages.map(p => {
    const result = parsePassage(p);
    if (result.ref === p) warnings++;
    return result;
  });
  return { day_number: dayNumber, scripture };
});

const output = {
  plan_metadata: {
    id: 'bible-in-a-year-chronological',
    title: 'Bible in a Year (Chronological)',
    description: 'Read the entire Bible in one year with passages ordered by historical sequence rather than canonical book order.',
    language: 'en',
    duration_days: convertedDays.length,
    tags: ['whole-bible', 'one-year', 'chronological'],
    schema_version: 1,
  },
  days: convertedDays,
};

process.stdout.write(JSON.stringify(output, null, 2));
console.error(`\nDone. ${warnings} passages could not be fully parsed (check warnings above).`);
