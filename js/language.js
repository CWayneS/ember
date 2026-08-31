// language.js — Language tab: interlinear view + word detail view (Build 6)
//
// Treats verse selection as an input, the same way reference.js's Tags/Related
// tabs do — no new selection machinery in the reader itself (Build_6_Spec.md's
// "Design Principle"). Word-level interaction (tap a row -> word detail) lives
// entirely within this tab.

import {
    parseVerseId, getBook,
    getOriginalWordsForVerses, getGreekLexiconEntry
} from './db.js';

const EMPTY_MSG        = 'Select a verse to see its original-language text.';
const NO_DATA_MSG      = 'No original-language data for this verse yet.';
const UNAVAILABLE_MSG  = 'Original-language data is unavailable.';

let currentVerseIds        = [];   // last selection this tab was asked to show
let lastInterlinearWords   = null; // cached render input, for "back" from word detail
let lastInterlinearScroll  = 0;

export async function renderLanguageTab(verseIds) {
    const container = document.getElementById('language-tab');
    currentVerseIds = verseIds || [];

    if (currentVerseIds.length === 0) {
        lastInterlinearWords = null;
        setPlaceholder(container, EMPTY_MSG);
        return;
    }

    const requestIds = currentVerseIds;
    let words;
    try {
        words = await getOriginalWordsForVerses(requestIds);
    } catch (e) {
        console.error('renderLanguageTab: failed to load original-language data:', e);
        if (requestIds === currentVerseIds) setPlaceholder(container, UNAVAILABLE_MSG);
        return;
    }

    // Selection may have changed while the (lazy-loaded) query was in flight —
    // discard a stale result rather than render over a newer selection.
    if (requestIds !== currentVerseIds) return;

    lastInterlinearWords = words;
    renderInterlinear(container, words);
}

// ============================================================
// Interlinear view — Item 3
// ============================================================

function renderInterlinear(container, words) {
    container.innerHTML = '';

    if (words.length === 0) {
        setPlaceholder(container, NO_DATA_MSG);
        return;
    }

    const byVerse = new Map();
    for (const w of words) {
        if (!byVerse.has(w.verse_id)) byVerse.set(w.verse_id, []);
        byVerse.get(w.verse_id).push(w);
    }

    const wrap = document.createElement('div');
    wrap.className = 'language-interlinear';
    for (const [verseId, verseWords] of byVerse) {
        wrap.appendChild(renderVerseBlock(verseId, verseWords));
    }
    container.appendChild(wrap);
}

function renderVerseBlock(verseId, verseWords) {
    const isHebrew = verseWords[0].language === 'hebrew';

    const block = document.createElement('div');
    block.className = 'language-verse-block';

    const parsed = parseVerseId(verseId);
    const book = getBook(parsed.book);
    const heading = document.createElement('div');
    heading.className = 'language-verse-heading';
    heading.textContent = book ? `${book.name} ${parsed.chapter}:${parsed.verse}` : '';
    block.appendChild(heading);

    // Running verse line — decorative, non-interactive, continuous text. RTL
    // as a full block for Hebrew (Item 3's "Layout" section).
    const verseLine = document.createElement('div');
    verseLine.className = `language-verse-line ${isHebrew ? 'language-hebrew' : 'language-greek'}`;
    verseLine.dir = isHebrew ? 'rtl' : 'ltr';
    verseLine.textContent = verseWords.map(w => w.surface_text).join(' ');
    block.appendChild(verseLine);

    // Gloss list — one row per word or grouped-word-unit. Grouped words (per
    // the precomputed group_id) collapse into a single row: one combined
    // original-language text span, one combined gloss, one tap target.
    const list = document.createElement('div');
    list.className = 'language-word-list';

    const seenGroups = new Set();
    for (const w of verseWords) {
        if (w.group_id !== null) {
            if (seenGroups.has(w.group_id)) continue;
            seenGroups.add(w.group_id);
            const members = verseWords.filter(m => m.group_id === w.group_id);
            list.appendChild(renderWordRow(members, isHebrew));
        } else {
            list.appendChild(renderWordRow([w], isHebrew));
        }
    }
    block.appendChild(list);

    return block;
}

// Row layout is fixed LTR regardless of language: original-language column
// always left, gloss always right (Item 3's "RTL and Typography Specifics").
// Grouped words render in their natural reading order within the left cell —
// no reordering needed, per the same section.
function renderWordRow(members, isHebrew) {
    const row = document.createElement('div');
    row.className = 'language-word-row';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;

    const original = document.createElement('span');
    original.className = `language-word-original ${isHebrew ? 'language-hebrew' : 'language-greek'}`;
    original.dir = isHebrew ? 'rtl' : 'ltr';
    original.textContent = members.map(m => m.surface_text).join(' ');

    const gloss = document.createElement('span');
    gloss.className = 'language-word-gloss';
    gloss.textContent = members.map(m => m.gloss_contextual).filter(Boolean).join(' ');

    row.appendChild(original);
    row.appendChild(gloss);

    const open = () => openWordDetail(members);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
        }
    });

    return row;
}

// ============================================================
// Word detail view — Item 4
// ============================================================

function openWordDetail(members) {
    const container = document.getElementById('language-tab');
    lastInterlinearScroll = container.scrollTop;
    renderWordDetail(container, members);
}

async function renderWordDetail(container, members) {
    container.innerHTML = '';

    const backBtn = document.createElement('button');
    backBtn.className = 'language-back-btn';
    backBtn.type = 'button';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => {
        if (!lastInterlinearWords) return;
        renderInterlinear(container, lastInterlinearWords);
        container.scrollTop = lastInterlinearScroll;
    });
    container.appendChild(backBtn);

    // A grouped row taps to more than one lexical word (e.g. "ho logos") — show
    // each member's full data as its own stacked section rather than picking
    // one arbitrarily (Item 4's layout is left open; this keeps every word's
    // data available honestly instead of guessing which member is "the" word).
    for (const word of members) {
        container.appendChild(await renderWordSection(word));
    }
}

async function renderWordSection(word) {
    const isHebrew = word.language === 'hebrew';
    const section = document.createElement('div');
    section.className = 'language-word-detail';

    const parsed = parseVerseId(word.verse_id);
    const book = getBook(parsed.book);
    const ref = document.createElement('div');
    ref.className = 'language-detail-ref';
    ref.textContent = book ? `${book.name} ${parsed.chapter}:${parsed.verse}` : '';
    section.appendChild(ref);

    const original = document.createElement('div');
    original.className = `language-detail-original ${isHebrew ? 'language-hebrew' : 'language-greek'}`;
    original.dir = isHebrew ? 'rtl' : 'ltr';
    original.textContent = word.surface_text;
    section.appendChild(original);

    appendDetailField(section, 'Lemma', word.lemma);
    appendDetailField(section, 'Transliteration', word.transliteration);
    appendDetailField(section, 'Strong’s number', word.strongs_number);
    appendDetailField(section, 'Morphology', word.morph_code);
    appendDetailField(section, 'Contextual gloss', word.gloss_contextual);
    appendDetailField(section, 'Dictionary gloss', word.gloss_dictionary);

    // Greek: TBESG lexicon entry. Hebrew: none — TBESH's Meaning field carries
    // its own unresolved rights-holder restriction (Build_6_Spec.md Item 1); a
    // documented gap, not a bug.
    if (!isHebrew && word.strongs_number) {
        let lex = null;
        try {
            lex = await getGreekLexiconEntry(word.strongs_number);
        } catch (e) {
            console.error('renderWordSection: lexicon lookup failed:', e);
        }
        if (lex && lex.meaning) {
            const lexHeading = document.createElement('div');
            lexHeading.className = 'language-detail-heading';
            lexHeading.textContent = 'Lexicon (TBESG)';
            section.appendChild(lexHeading);

            const lexBody = document.createElement('div');
            lexBody.className = 'language-detail-lexicon';
            lexBody.innerHTML = sanitizeLexiconMeaning(lex.meaning);
            section.appendChild(lexBody);
        }
    }

    return section;
}

function appendDetailField(container, label, value) {
    if (!value) return;
    const field = document.createElement('div');
    field.className = 'language-detail-field';

    const labelEl = document.createElement('span');
    labelEl.className = 'language-detail-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'language-detail-value';
    valueEl.textContent = value;

    field.appendChild(labelEl);
    field.appendChild(valueEl);
    container.appendChild(field);
}

// TBESG's `meaning` field carries a small, known set of formatting tags
// (<b>, <i>, <BR/>, <ref='Bk.C.V'>label</ref>, <re>, <author>, <greek>,
// <note>, <lb/>) rather than plain text. The whole string is escaped first,
// so nothing from the source data can ever produce a live tag other than the
// ones explicitly allow-listed below — unrecognized markup stays inert text.
function sanitizeLexiconMeaning(raw) {
    let s = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s
        .replace(/&lt;(\/?)b&gt;/gi,  (_, close) => close ? '</strong>' : '<strong>')
        .replace(/&lt;(\/?)i&gt;/gi,  (_, close) => close ? '</em>' : '<em>')
        .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
        .replace(/&lt;lb\s*\/?&gt;/gi, '<br>')
        .replace(/&lt;ref='[^']*'&gt;/gi, '')
        .replace(/&lt;\/(ref|re|author|greek|note)&gt;/gi, '')
        .replace(/&lt;(re|author|greek|note)&gt;/gi, '');
    return s;
}

// ============================================================
// Helpers
// ============================================================

function setPlaceholder(container, text) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'ref-placeholder';
    p.textContent = text;
    container.appendChild(p);
}
