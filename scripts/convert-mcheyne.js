#!/usr/bin/env node
// convert-mcheyne.js
// Converts khornberg/readingplans mcheyne.json to Ember plan format.
// Usage: node convert-mcheyne.js mcheyne.json > mcheyne-1year.json

const fs = require('fs');

// --- Book name normalization ---
// Maps the various forms in this source to USFM 3-letter codes.
const BOOK_MAP = {
  'Genesis': 'GEN', 'Exodus': 'EXO', 'Leviticus': 'LEV', 'Numbers': 'NUM',
  'Deuteronomy': 'DEU', 'Joshua': 'JOS', 'Judges': 'JDG', 'Ruth': 'RUT',
  '1Samuel': '1SA', '2Samuel': '2SA', '1Kings': '1KI', '2Kings': '2KI',
  '1Chronicles': '1CH', '2Chronicles': '2CH', 'Ezra': 'EZR', 'Nehemiah': 'NEH',
  'Esther': 'EST', 'Job': 'JOB', 'Psalm': 'PSA', 'Proverbs': 'PRO',
  'Ecclesiastes': 'ECC', 'SongOfSongs': 'SNG', 'Song of Solomon': 'SNG',
  'Isaiah': 'ISA', 'Jeremiah': 'JER', 'Lamentations': 'LAM', 'Ezekiel': 'EZK',
  'Daniel': 'DAN', 'Hosea': 'HOS', 'Joel': 'JOL', 'Amos': 'AMO',
  'Obadiah': 'OBA', 'Jonah': 'JON', 'Micah': 'MIC', 'Nahum': 'NAH',
  'Habakkuk': 'HAB', 'Zephaniah': 'ZEP', 'Haggai': 'HAG', 'Zechariah': 'ZEC',
  'Malachi': 'MAL',
  'Matthew': 'MAT', 'Mark': 'MRK', 'Luke': 'LUK', 'John': 'JHN',
  'Acts': 'ACT', 'Romans': 'ROM',
  '1Corinthians': '1CO', '2Corinthians': '2CO',
  '1 Corinthians': '1CO', '2 Corinthians': '2CO',
  'Galatians': 'GAL', 'Ephesians': 'EPH', 'Philippians': 'PHP',
  'Colossians': 'COL',
  '1 Thes': '1TH', '2 Thes': '2TH',
  '1Thessalonians': '1TH', '2Thessalonians': '2TH',
  '1Timothy': '1TI', '2Timothy': '2TI',
  'Titus': 'TIT', 'Philemon': 'PHM', 'Hebrews': 'HEB',
  'James': 'JAS',
  '1Peter': '1PE', '2Peter': '2PE',
  '1Peter ': '1PE', '2Peter ': '2PE',
  '1John': '1JN', '2John': '2JN', '3John': '3JN',
  '1 John': '1JN', '2 John': '2JN', '3 John': '3JN',
  'Jude': 'JUD', 'Revelation': 'REV',
};

// Normalize a book name string to its USFM code.
function bookCode(name) {
  const trimmed = name.trim();
  if (BOOK_MAP[trimmed]) return BOOK_MAP[trimmed];
  // Try case-insensitive fallback
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(BOOK_MAP)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

// Parse a passage string like "Genesis 1", "Luke 1:1-38", "Psalm 78:40-72",
// "Genesis 9-10" into a USFM ref and a display string.
function parsePassage(raw) {
  const str = raw.trim();

  // Split on first space to get book vs location
  // Handle multi-word books: "1 Thes", "Song of Songs", etc.
  // Strategy: try progressively longer prefixes until we find a known book name.
  let bookName = null;
  let location = null;

  const parts = str.split(' ');
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(0, i).join(' ');
    const rest = parts.slice(i).join(' ');
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
  const display = str; // keep original as display

  if (!location || location === '') {
    // Whole book? Shouldn't happen in M'Cheyne but handle gracefully
    return { ref: `${code}`, display };
  }

  // location formats:
  //   "1"           → whole chapter 1
  //   "1-10"        → chapters 1 through 10
  //   "1:1-38"      → chapter 1, verses 1-38
  //   "78:40-72"    → chapter 78, verses 40-72
  //   "119:1-24"    → chapter 119, verses 1-24
  //   "9-10"        → chapters 9 through 10

  if (location.includes(':')) {
    // Verse-level reference
    const [chStr, verseRange] = location.split(':');
    const ch = chStr.trim();
    const ref = `${code}.${ch}.${verseRange.trim()}`;
    return { ref, display };
  } else if (location.includes('-')) {
    // Chapter range
    const [startCh, endCh] = location.split('-').map(s => s.trim());
    const ref = `${code}.${startCh}-${endCh}`;
    return { ref, display };
  } else {
    // Single chapter
    const ref = `${code}.${location.trim()}`;
    return { ref, display };
  }
}

// --- Main ---

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node convert-mcheyne.js <path-to-mcheyne.json>');
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
    id: 'mcheyne-1year',
    title: "M'Cheyne One-Year Reading Plan",
    description: "Robert Murray M'Cheyne's classic 1842 plan covering the New Testament and Psalms twice, and the Old Testament once, in four daily readings.",
    author: "Robert Murray M'Cheyne",
    language: 'en',
    duration_days: convertedDays.length,
    tags: ['whole-bible', 'classic', 'one-year'],
    schema_version: 1,
  },
  days: convertedDays,
};

process.stdout.write(JSON.stringify(output, null, 2));
console.error(`\nDone. ${warnings} passages could not be fully parsed (check warnings above).`);
