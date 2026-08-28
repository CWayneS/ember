// usfm.js — USFM 3-letter book code mapping and reference resolution.
//
// Reading plans store passages as USFM refs (e.g. "GEN.1.1-2.17"). This module
// resolves those refs once at import/seed time into the internal book number
// (1-66, matching the `books` table order) plus chapter/verse components, so
// runtime navigation never re-parses USFM.

// Nahum is 'NAH' here (not the stricter USFM 'NAM') to match the code used
// throughout the bundled plan data in data/plans/.
export const USFM_BOOK_CODES = [
    'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
    '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
    'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
    'OBA', 'JON', 'MIC', 'NAH', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT',
    'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP',
    'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
    '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'
];

const USFM_BOOK_MAP = Object.fromEntries(
    USFM_BOOK_CODES.map((code, i) => [code, i + 1])
);

// Resolves a USFM ref into { book, chapter, verseStart, verseEnd, approximate }.
// verseEnd is null for a single verse, a whole chapter, or a cross-chapter /
// cross-book range (the exact end is not resolvable to a single chapter's
// verse number). `approximate` is true for those chapter-range and
// cross-chapter cases — callers should log a single summary rather than one
// line per ref, and navigation should rely on the plan's `display` string in
// those cases. Returns null if the ref cannot be parsed at all.
export function resolveUsfmRef(ref) {
    let m;

    // BOOK.CHAP.VERSE-CHAP.VERSE — cross-chapter verse range
    m = ref.match(/^([0-9A-Z]+)\.(\d+)\.(\d+)-(\d+)\.(\d+)$/);
    if (m) {
        const book = USFM_BOOK_MAP[m[1]];
        if (!book) return null;
        return { book, chapter: Number(m[2]), verseStart: Number(m[3]), verseEnd: null, approximate: true };
    }

    // BOOK.CHAP-CHAP — chapter range
    m = ref.match(/^([0-9A-Z]+)\.(\d+)-(\d+)$/);
    if (m) {
        const book = USFM_BOOK_MAP[m[1]];
        if (!book) return null;
        return { book, chapter: Number(m[2]), verseStart: 1, verseEnd: null, approximate: true };
    }

    // BOOK.CHAP.VERSE-VERSE — verse range within one chapter
    m = ref.match(/^([0-9A-Z]+)\.(\d+)\.(\d+)-(\d+)$/);
    if (m) {
        const book = USFM_BOOK_MAP[m[1]];
        if (!book) return null;
        return { book, chapter: Number(m[2]), verseStart: Number(m[3]), verseEnd: Number(m[4]), approximate: false };
    }

    // BOOK.CHAP.VERSE — single verse
    m = ref.match(/^([0-9A-Z]+)\.(\d+)\.(\d+)$/);
    if (m) {
        const book = USFM_BOOK_MAP[m[1]];
        if (!book) return null;
        return { book, chapter: Number(m[2]), verseStart: Number(m[3]), verseEnd: null, approximate: false };
    }

    // BOOK.CHAP — whole chapter
    m = ref.match(/^([0-9A-Z]+)\.(\d+)$/);
    if (m) {
        const book = USFM_BOOK_MAP[m[1]];
        if (!book) return null;
        return { book, chapter: Number(m[2]), verseStart: 1, verseEnd: null, approximate: false };
    }

    return null;
}
