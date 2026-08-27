#!/usr/bin/env node
// convert-canonical.js
// Converts bibleplan.org "Bible in a Year" PDF text to Ember plan format.
// Input: plain text extracted from the PDF (one day per line, format: "Jan 1 Book Ch, Book Ch, ...")
// Usage: node convert-canonical.js canonical.txt > bible-in-a-year-canonical.json
//
// To extract text from the PDF on Linux:
//   pdftotext -layout "Bible in a Year - Print View.pdf" canonical.txt

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
  'Ecclesiastes': 'ECC', 'Song Of Solomon': 'SNG', 'Song of Solomon': 'SNG',
  'Song of Songs': 'SNG', 'SongOfSongs': 'SNG',
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

// Sort keys longest-first so "1 Chronicles" matches before "1"
const SORTED_BOOKS = Object.keys(BOOK_MAP).sort((a, b) => b.length - a.length);

function bookCode(name) {
  const trimmed = name.trim();
  if (BOOK_MAP[trimmed]) return BOOK_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const k of SORTED_BOOKS) {
    if (k.toLowerCase() === lower) return BOOK_MAP[k];
  }
  return null;
}

// Parse a single passage like "Genesis 1", "1 Corinthians 3", "2 John 1"
function parsePassage(raw) {
  const str = raw.trim();
  if (!str) return null;

  // Try progressively shorter book name prefixes
  const words = str.split(' ');
  for (let i = words.length - 1; i >= 1; i--) {
    const bookCandidate = words.slice(0, i).join(' ');
    const rest = words.slice(i).join(' ').trim();
    const code = bookCode(bookCandidate);
    if (code) {
      if (!rest) return { ref: code, display: str };
      if (rest.includes('-')) {
        const [s, e] = rest.split('-').map(x => x.trim());
        return { ref: `${code}.${s}-${e}`, display: str };
      }
      return { ref: `${code}.${rest}`, display: str };
    }
  }

  console.error(`  WARNING: Could not parse: "${str}"`);
  return { ref: str, display: str };
}

// Month prefixes used in the PDF
const MONTH_PREFIXES = [
  'Jan ', 'Feb ', 'Mar ', 'Apr ', 'May ', 'Jun ',
  'Jul ', 'Aug ', 'Sep ', 'Oct ', 'Nov ', 'Dec '
];

function startsWithMonth(line) {
  return MONTH_PREFIXES.some(m => line.startsWith(m));
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node convert-canonical.js <path-to-txt>');
  process.exit(1);
}

const text = fs.readFileSync(inputPath, 'utf8');

// Join lines and normalize whitespace.
// pdftotext -layout preserves column spacing with many spaces — collapse them.
const joined = text
  .replace(/\r/g, '')
  .split('\n').join(' ')
  .replace(/\s{2,}/g, ' ');  // collapse multiple spaces to one

// Split on date pattern: month abbreviation + space + 1-2 digit number + space
const dayPattern = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+/g;
const matches = [...joined.matchAll(dayPattern)];

if (matches.length === 0) {
  console.error('No date patterns found. Check your input file.');
  process.exit(1);
}

console.error(`Found ${matches.length} day entries (before dedup)...`);

let warnings = 0;
const convertedDays = [];
const seenLabels = new Set();

for (let i = 0; i < matches.length; i++) {
  const dateLabel = matches[i][0].trim();
  if (seenLabels.has(dateLabel)) {
    console.error(`  Skipping duplicate: ${dateLabel}`);
    continue;
  }
  seenLabels.add(dateLabel);
  const start = matches[i].index + matches[i][0].length;
  const end = i + 1 < matches.length ? matches[i + 1].index : joined.length;
  let passageText = joined.slice(start, end).trim();

  // Remove trailing noise (month headers, footer text)
  passageText = passageText
    .replace(/January \d{4}.*$/i, '')
    .replace(/February \d{4}.*$/i, '')
    .replace(/March \d{4}.*$/i, '')
    .replace(/April \d{4}.*$/i, '')
    .replace(/May \d{4}.*$/i, '')
    .replace(/June \d{4}.*$/i, '')
    .replace(/July \d{4}.*$/i, '')
    .replace(/August \d{4}.*$/i, '')
    .replace(/September \d{4}.*$/i, '')
    .replace(/October \d{4}.*$/i, '')
    .replace(/November \d{4}.*$/i, '')
    .replace(/December \d{4}.*$/i, '')
    .replace(/Free daily Bible.*$/i, '')
    .replace(/Read the entire.*$/i, '')
    .replace(/bibleplan\.org.*$/i, '')
    .trim();

  // Split on commas to get individual passages
  const rawPassages = passageText.split(',').map(s => s.trim()).filter(Boolean);
  const scripture = rawPassages
    .map(parsePassage)
    .filter(Boolean);

  if (scripture.length === 0) {
    console.error(`  WARNING: No passages found for day ${i + 1}: "${passageText}"`);
    warnings++;
    continue;
  }

  convertedDays.push({ day_number: convertedDays.length + 1, scripture });
}

const output = {
  plan_metadata: {
    id: 'bible-in-a-year-canonical',
    title: 'Bible in a Year (Canonical)',
    description: 'Read the entire Bible in one year, following the canonical book order from Genesis to Revelation.',
    language: 'en',
    duration_days: convertedDays.length,
    tags: ['whole-bible', 'one-year', 'canonical'],
    schema_version: 1,
  },
  days: convertedDays,
};

process.stdout.write(JSON.stringify(output, null, 2));
console.error(`\nDone. ${convertedDays.length} days converted. ${warnings} warnings.`);
