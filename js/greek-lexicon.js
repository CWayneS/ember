// greek-lexicon.js — Greek tier 3 of the word card: the TBESG entry (Abbott-
// Smith). Builds DOM only, never innerHTML: the stored `meaning` is tokenized,
// known tags are rebuilt from an allowed list, and every piece of text goes in
// as a text node, so nothing in the data can become markup.
//
// The entry is an outline written as lines (<BR />) that start with markers:
// "__I.", "__1.", "__(a)", "__(α)". Each becomes a sense with its label, nested
// by marker kind, in the same elements and classes as the Hebrew lexicon's BDB
// senses, so both read alike.
//
// New Testament references become links (see resolveGreekReference). The Old
// Testament ones cite the Septuagint, whose names and numbers differ from
// English Bibles ("1Ki.28" is 1 Samuel 28; LXX Psalm 48 is English 49), so they
// stay text.

import { getChapterVerseCount } from './db.js';

const HEBREW_RUN = /[֐-׿][֐-׿\s]*/g;

// ---- Tokens -------------------------------------------------------------------

const TAG = /<(\/?)([A-Za-z]+)((?:\s*=\s*'[^']*'[^>]*?)|(?:\s+[^>]*?))?\s*\/?>/g;

function decodeEntities(text) {
    return text
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

// [{ text } | { tag, close, attrs }], text decoded. A '<' that doesn't start a
// recognizable tag (or a truncated one) stays text.
function tokenize(raw) {
    const tokens = [];
    let last = 0;
    for (const match of raw.matchAll(TAG)) {
        if (match.index > last) tokens.push({ text: decodeEntities(raw.slice(last, match.index)) });
        tokens.push({ tag: match[2].toLowerCase(), close: match[1] === '/', attrs: match[3] ?? '' });
        last = match.index + match[0].length;
    }
    if (last < raw.length) tokens.push({ text: decodeEntities(raw.slice(last)) });
    return tokens;
}

// ---- Outline markers ------------------------------------------------------------

// A few lines carry a stray "{" or a doubled "__" before the marker.
const MARKER = /^\s*(\{\s*)?(?:__\s*)+(\((?:[a-z]+|[α-ω]|\d+)\)|[IVX]+\.|\d+\.?|[α-ω]\.?)\s*/;

// Nesting: I. > 1. > (a) > (α), (ii), (1).
function markerLevel(label) {
    if (/^[IVX]+\.$/.test(label)) return 0;
    if (/^\d+\.?$/.test(label)) return 1;
    if (/^\([a-z]\)$/.test(label)) return 2;
    return 3;
}

// STEPBible expanded Abbott-Smith's abbreviation "c." (Latin cum, "with")
// everywhere, the outline letter "(c)" included: "__(c)" never occurs, while
// all 191 "__(with)" markers are the letter after "(b)", and 79 are followed
// by "(d)". So "(with)" is read back as "(c)" there, and only there.
function markerLabel(label, previousLetter) {
    if (label === '(with)') return previousLetter === '(b)' ? '(c)' : null;
    if (/^\([a-z]{2,}\)$/.test(label) && !/^\([ivx]+\)$/.test(label)) return null;
    return label.replace(/\.$/, '') + (/^[IVX\d]+\.$/.test(label) ? '.' : '');
}

// ---- New Testament references ------------------------------------------------------

const NT_BOOKS = ['Mat', 'Mrk', 'Luk', 'Jhn', 'Act', 'Rom', '1Co', '2Co', 'Gal', 'Eph', 'Php', 'Col',
    '1Th', '2Th', '1Ti', '2Ti', 'Tit', 'Phm', 'Heb', 'Jas', '1Pe', '2Pe', '1Jn', '2Jn', '3Jn', 'Jud', 'Rev'];
const NT_BOOK_IDS = new Map(NT_BOOKS.map((code, index) => [code, 40 + index]));
for (const [alias, code] of Object.entries({ Matt: 'Mat', Mark: 'Mrk', Luke: 'Luk', John: 'Jhn', Acts: 'Act',
    '1Cor': '1Co', '1Pet': '1Pe', '1Tim': '1Ti', Phil: 'Php', Jude: 'Jud' })) {
    NT_BOOK_IDS.set(alias, NT_BOOK_IDS.get(code));
}
const ONE_CHAPTER_BOOKS = new Set([57, 63, 64, 65]); // Philemon, 2 John, 3 John, Jude

// The 73 verses that NA/NRSV and the KJV split differently, from the [KJV]
// brackets in TAGNT (STEPBible-Data be4191f): TBESG's numbering there isn't
// known, so a reference to one isn't linked (366 of about 34,500).
const DIFFERENTLY_NUMBERED = new Set([
    40017014, 40017015, 40020004, 40020005, 41003019, 41003020, 42001073, 42001074, 42006017, 42006018,
    42007018, 42007019, 44002010, 44002011, 44003019, 44003020, 44004005, 44004006, 44005039, 44005040,
    44009028, 44009029, 44024018, 44024019, 45001009, 45001010, 45007009, 45007010, 45009011, 45009012,
    47008013, 47008014, 47010004, 47010005, 47013012, 47013013, 47013014, 48002019, 48002020, 49002014,
    49002015, 49005013, 49005014, 50001016, 50001017, 50002007, 50002008, 51001021, 51001022, 52001002,
    52001003, 52002006, 52002007, 52002011, 52002012, 58003009, 58003010, 58007020, 58007021, 58012022,
    58012023, 60003015, 60003016, 62002013, 62002014, 64001014, 64001015, 66002027, 66002028, 66012018,
    66013001, 66017009, 66017010,
]);

const verseCounts = new Map();
function verseExists(book, chapter, verse) {
    const key = book * 1000 + chapter;
    if (!verseCounts.has(key)) verseCounts.set(key, getChapterVerseCount(book, chapter));
    return verse >= 1 && verse <= verseCounts.get(key);
}

// The verses a ref attribute names, in order, as { book, chapter, verse }:
// "Rom.15.5, 13, 33", "Heb.11.4; 12.24", "Mat.8.30-32" (its first verse),
// "3Jn.11" (a one-chapter book), "Luk.4.34." Null for a book outside the New
// Testament or a shape it can't read.
function referenceTargets(attribute) {
    const parts = attribute.trim().replace(/\.$/, '').split(';').map(part => part.trim());
    const head = /^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?(.*)$/.exec(parts[0]);
    if (!head) return null;
    const book = NT_BOOK_IDS.get(head[1]);
    if (!book) return null;
    const targets = [];
    const addList = (chapter, firstVerse, rest) => {
        targets.push({ book, chapter, verse: firstVerse });
        for (const extra of rest.split(',').slice(1)) {
            const verse = /^\s*(\d+)/.exec(extra);
            if (!verse) return false;
            targets.push({ book, chapter, verse: Number(verse[1]) });
        }
        return true;
    };
    if (head[3] === undefined) {
        if (!ONE_CHAPTER_BOOKS.has(book) || parts.length > 1) return null;
        targets.push({ book, chapter: 1, verse: Number(head[2]) });
        return targets;
    }
    if (!addList(Number(head[2]), Number(head[3]), head[4].replace(/^\s*-\s*\d+/, ''))) return null;
    for (const part of parts.slice(1)) {
        const more = /^(\d+)\.(\d+)(.*)$/.exec(part);
        if (!more || !addList(Number(more[1]), Number(more[2]), more[3].replace(/^\s*-\s*\d+/, ''))) return null;
    }
    return targets;
}

function linkable(target) {
    const verseId = target.book * 1_000_000 + target.chapter * 1000 + target.verse;
    return verseExists(target.book, target.chapter, target.verse) && !DIFFERENTLY_NUMBERED.has(verseId);
}

// The printed label split into its numbers ("Heb.11:4, 12:24" → 11:4 and 12:24;
// "III Jo 11" → 11), skipping a book's own digit ("1Co"). Each piece is
// { start, end, chapter, verse }, chapter null when only a verse is printed.
function labelNumbers(label) {
    const pieces = [];
    for (const match of label.matchAll(/(?<![\w:])(?:(\d+):)?(\d+)(?:\s*[-–]\s*\d+)?(?![\w:])/g)) {
        pieces.push({
            start: match.index, end: match.index + match[0].length,
            chapter: match[1] ? Number(match[1]) : null, verse: Number(match[2]),
        });
    }
    return pieces;
}

// How a <ref> renders: [{ text, target? }] in order, a target only where the
// printed number agrees with the verse it would open. Exported for tests.
export function resolveGreekReference(attribute, label) {
    const targets = referenceTargets(attribute);
    if (!targets) return [{ text: label }];
    const pieces = labelNumbers(label);
    // A printed verse alone ("Rom.15:5, 13") keeps the chapter before it.
    const agrees = (piece, target) => piece.verse === target.verse
        && (piece.chapter === null || piece.chapter === target.chapter);

    if (pieces.length === targets.length && pieces.every((piece, i) => agrees(piece, targets[i]))) {
        const parts = [];
        let at = 0;
        pieces.forEach((piece, i) => {
            if (piece.start > at) parts.push({ text: label.slice(at, piece.start) });
            const target = targets[i];
            // A book name printed before the first number belongs to its link.
            const start = i === 0 ? 0 : piece.start;
            if (i === 0 && parts.length) parts.pop();
            parts.push(linkable(target) ? { text: label.slice(start, piece.end), target } : { text: label.slice(start, piece.end) });
            at = piece.end;
        });
        if (at < label.length) parts.push({ text: label.slice(at) });
        return parts;
    }
    return [{ text: label }];
}

// ---- Rendering ----------------------------------------------------------------------

// The TBESG meaning as a fragment: lines before the first marker as plain
// lines, then nested senses.
export function renderGreekLexiconMeaning(raw) {
    const fragment = document.createDocumentFragment();
    const tokens = tokenize(raw);

    // Levels are relative to the entry's shallowest marker, so an entry
    // that starts at "1." isn't indented as if an "I." were above it.
    let minimum = 3;
    for (const token of tokens) {
        const match = token.text !== undefined && MARKER.exec(token.text);
        if (match) minimum = Math.min(minimum, markerLevel(match[2]));
    }

    const open = [];          // senses still open, outermost first: { level, body }
    let container = fragment; // where the next line goes
    let line = null;          // the current line, created on first content
    let inline = [];          // open <b>/<i>, outermost first: { tag, element }
    let previousLetter = null; // the last (a)-level label
    let reference = null;     // { attribute, label } inside a <ref>

    const current = () => {
        if (!line) {
            line = document.createElement('div');
            line.className = 'language-lexicon-line';
            container.appendChild(line);
            // Bold or italic running across a line break carries on.
            let parent = line;
            inline = inline.map(({ tag }) => {
                const element = document.createElement(tag === 'b' ? 'strong' : 'em');
                parent.appendChild(element);
                parent = element;
                return { tag, element };
            });
        }
        return inline.length ? inline.at(-1).element : line;
    };

    const startSense = (rawLabel) => {
        const label = markerLabel(rawLabel, previousLetter);
        const level = Math.max(0, markerLevel(label) - minimum);
        while (open.length && open.at(-1).level >= level) open.pop();
        const sense = document.createElement('div');
        sense.className = 'language-lexicon-sense';
        const labelElement = document.createElement('span');
        labelElement.className = 'language-lexicon-sense-label';
        labelElement.textContent = label;
        const body = document.createElement('div');
        body.className = 'language-lexicon-sense-body';
        sense.append(labelElement, body);
        (open.length ? open.at(-1).body : fragment).appendChild(sense);
        open.push({ level, body });
        container = body;
        // Letters start again under each new "1." or "I.".
        if (markerLevel(label) === 2) previousLetter = label;
        else if (markerLevel(label) < 2) previousLetter = null;
        if (line && !line.textContent.trim()) line.remove();
        line = null;
    };

    const appendReference = (attribute, label) => {
        for (const part of resolveGreekReference(attribute, label)) {
            if (!part.target) {
                current().appendChild(document.createTextNode(part.text));
                continue;
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'language-lexicon-ref';
            button.dataset.book = part.target.book;
            button.dataset.chapter = part.target.chapter;
            button.dataset.verseId = part.target.book * 1_000_000 + part.target.chapter * 1000 + part.target.verse;
            button.textContent = part.text;
            current().appendChild(button);
        }
    };

    // Text at a line's start may open a sense. Untagged refs ("Act_2:19")
    // read with a space and link like tagged ones; any other "__" is dropped.
    const addText = (text) => {
        if (!line || !line.textContent.trim()) {
            const match = MARKER.exec(text);
            const label = match && markerLabel(match[2], previousLetter);
            if (label) {
                startSense(match[2]);
                text = (match[1] ? '{' : '') + text.slice(match[0].length);
            }
        }
        text = text.replace(/__\s*/g, '');
        let at = 0;
        for (const match of text.matchAll(/\b([1-3]?[A-Z][a-z]{1,3})_(\d+):(\d+)/g)) {
            if (match.index > at) appendWithHebrew(current(), text.slice(at, match.index));
            appendReference(`${match[1]}.${match[2]}.${match[3]}`, `${match[1]} ${match[2]}:${match[3]}`);
            at = match.index + match[0].length;
        }
        if (at < text.length && (line || text.slice(at).trim())) appendWithHebrew(current(), text.slice(at));
    };

    for (const token of tokens) {
        if (token.text !== undefined) {
            if (reference) reference.label += token.text;
            else addText(token.text);
            continue;
        }
        const { tag, close, attrs } = token;
        if (tag === 'br' || tag === 'lb') {
            line = null;
        } else if (tag === 'ref') {
            if (!close) {
                // A ref inside a ref (a slip in a few entries): what the outer one
                // has so far stays as text, and the inner one is the reference.
                if (reference) addText(reference.label);
                reference = { attribute: (/'([^']*)'/.exec(attrs) ?? [])[1] ?? '', label: '' };
            } else if (reference) {
                appendReference(reference.attribute, reference.label);
                reference = null;
            }
        } else if (tag === 'b' || tag === 'i') {
            if (!close) {
                const element = document.createElement(tag === 'b' ? 'strong' : 'em');
                current().appendChild(element);
                inline.push({ tag, element });
            } else if (inline.at(-1)?.tag === tag) {
                inline.pop();
            }
        }
        // Everything else (re, author, date, greek, note, def, corr, a) keeps
        // only its text, which arrives as text tokens.
    }
    if (reference) addText(reference.label);
    return fragment;
}

// Hebrew words inside an entry ("for אֱלֹהִים, also for אֵל") in their own
// right-to-left run, as the Hebrew lexicon shows them.
function appendWithHebrew(parent, text) {
    let at = 0;
    for (const match of text.matchAll(HEBREW_RUN)) {
        const word = match[0].trimEnd();
        if (match.index > at) parent.appendChild(document.createTextNode(text.slice(at, match.index)));
        const span = document.createElement('span');
        span.className = 'language-lexicon-hebrew';
        span.lang = 'he';
        span.dir = 'rtl';
        span.textContent = word;
        parent.appendChild(span);
        at = match.index + word.length;
    }
    if (at < text.length) parent.appendChild(document.createTextNode(text.slice(at)));
}
