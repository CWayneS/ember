// language.js — Language tab: interlinear view + inline word card
// (Language_Panel_Word_Inspector_Spec)
//
// Treats verse selection as an input, the same way reference.js's Tags/Related
// tabs do — no new selection machinery in the reader itself (Build_6_Spec.md's
// "Design Principle"). Word-level interaction (tap a row -> word card) lives
// entirely within this tab.
//
// A tapped gloss row expands a word card in place, directly beneath it,
// instead of replacing the tab with a separate full-page view (the old
// openWordDetail/renderWordDetail flow this file used to have). Every tap
// re-runs the same renderInterlinear rebuild, parameterized by a small piece
// of module state (openCardKey/openTier2Ids/openTier3Ids) — this codebase has
// no existing precedent for manual DOM patching, and a full rebuild keeps
// exactly one source of truth for what's open, with "rows shift down" falling
// out for free as normal document flow.

import {
    formatReference, getOriginalWordsForVerses, getGreekLexiconEntry,
    getHebrewLexiconEntry, getPiecesForWords, getVariantsForWords, getHebrewAffixes,
    isLanguageDownloading, warnLanguageUnavailable, warnHebrewLexiconUnavailable,
    getOccurrenceCounts, getOccurrencesInBook, plainGloss, getBook,
} from './db.js';
import { decodeMorphCode, splitHebrewWord } from './grammar-decode.js';
import { hebrewLexiconRoots, renderHebrewLexiconEntry } from './hebrew-lexicon.js';
import { renderGreekLexiconMeaning } from './greek-lexicon.js';
import { showVerse } from './reader.js';

const EMPTY_MSG        = 'Select a verse to see its original-language text.';
const NO_DATA_MSG      = 'No original-language data for this verse yet.';
const DOWNLOADING_MSG  = 'Downloading original-language data…';
const UNAVAILABLE_MSG  = 'Original-language data downloads the first time Ember is online. Connect once and it stays on this device for good.';
const HEBREW_LEXICON_LOADING_MSG     = 'Loading the Hebrew lexicon…';
const HEBREW_LEXICON_UNAVAILABLE_MSG = 'The Hebrew lexicon downloads the first time Ember is online. Connect once and it stays on this device for good.';
const HEBREW_LEXICON_NO_ENTRY_MSG    = 'No lexicon entry for this word.';

let currentVerseIds      = [];   // last selection this tab was asked to show
let lastInterlinearWords = null; // cached render input, for re-renders on tap

// Hebrew word anatomy (Hebrew_Word_Anatomy_Spec), fetched with the verse words —
// one batched query each for the whole selection, never one per word.
// Empty maps (one-piece words, Greek, or a failed lookup) mean the plain
// single-code display.
let lastPieces   = new Map();   // wordId -> getPiecesForWords() entry
let lastVariants = new Map();   // wordId -> getVariantsForWords() entry
let hebrewAffixes = null;       // getHebrewAffixes(), loaded once

// Which row's card is open, and which of its member words have tier 2/tier 3
// expanded. Invariant: the two sets only ever hold ids belonging to the
// currently-open card — both are cleared whenever openCardKey changes.
let openCardKey    = null;
let openTier2Ids   = new Set();
let openTier3Ids   = new Set();
let renderGeneration = 0; // staleness guard for overlapping async rebuilds

// Hebrew tier 3 (Hebrew_Lexicon_Spec). A word can have two roots, each with its
// own link, so these are keyed `wordId:base` rather than by word id. A rebuild
// never waits on the lexicon: a first tap may have to download the file, so tier 3
// shows a line at once and fills in when the entry arrives. Same invariant as above.
let openHebrewLexicons   = new Set(); // `wordId:base`
let openBdbEntries       = new Set(); // `wordId:base:bdbId`, lower homonym entries
let hebrewLexiconEntries = new Map(); // base -> getHebrewLexiconEntry() result
let hebrewLexiconFailed  = new Set(); // bases whose lookup failed; retried on the next tap
let hebrewLexiconLookups = new Set(); // bases with a lookup in flight
let pendingReveal        = null;      // { lexiconKey, bdbId }: just opened, to glide into view once shown

// "All occurrences" of a word's STEP number. Same invariant: open state is
// for the open card only. The lookups are cached for the session (the data is
// read-only) and never awaited by a rebuild, which shows what it has and is
// called again when a lookup lands.
let openOccurrences      = new Set(); // word ids
let openOccurrenceBooks  = new Set(); // `wordId:book`
const occurrenceCounts   = new Map(); // strongs -> [{ book, count }]
const occurrenceVerses   = new Map(); // `strongs:book` -> [{ verseId, glosses }]
const occurrenceLookups  = new Set(); // keys in flight
let occurrenceRowsShown  = new Map(); // `wordId:book` -> rows shown, past the first page

// Each tap rebuilds the card, so a book's list grows a page at a time: Luke's
// 1,033 verses with the Greek article made every later tap take 164 ms.
const OCCURRENCE_PAGE = 100;

// A selection this tab still owes a render: made while the tab was hidden, or
// whose load failed. language.db stays closed until the tab is actually looked
// at, so a selection on another tab costs nothing.
let renderPending = false;
let wordsLoading  = false; // a load for the current selection is in flight

export function initLanguageTab() {
    document.addEventListener('language-download-started', () => {
        if (wordsLoading) {
            setPlaceholder(document.getElementById('language-tab'), DOWNLOADING_MSG);
        } else if (renderPending && isLanguageTabActive()) {
            renderCurrentSelection();
        }
    });
    window.addEventListener('online', () => {
        if (hebrewLexiconFailed.size === 0) return;
        hebrewLexiconFailed.clear();
        rerenderLexicon();
    });
    // A lexicon's scripture reference (BDB or Greek) opens its verse in the reader without
    // selecting it, so this tab, and the entry being read, stay as they are.
    document.getElementById('language-tab').addEventListener('click', (e) => {
        const occurrence = e.target.closest('.language-occurrence');
        if (occurrence) {
            const verseId = Number(occurrence.dataset.verseId);
            showVerse(Math.floor(verseId / 1_000_000), Math.floor(verseId / 1000) % 1000, verseId);
            return;
        }
        const ref = e.target.closest('.language-lexicon-ref');
        if (!ref) return;
        const verseId = ref.dataset.verseId ? Number(ref.dataset.verseId) : null;
        showVerse(Number(ref.dataset.book), Number(ref.dataset.chapter), verseId);
    });
}

// Called when the tab becomes visible. A selection already rendered is left
// alone, so an open word card survives switching away and back.
export function languageTabShown() {
    if (renderPending) renderCurrentSelection();
}

function isLanguageTabActive() {
    return document.getElementById('language-tab').classList.contains('active');
}

export async function renderLanguageTab(verseIds) {
    const container = document.getElementById('language-tab');
    currentVerseIds = verseIds || [];
    openCardKey = null;
    openTier2Ids.clear();
    openTier3Ids.clear();
    closeHebrewLexicons();
    renderGeneration++; // a rebuild still in flight belongs to the old selection
    lastInterlinearWords = null;
    wordsLoading = false;

    if (currentVerseIds.length === 0) {
        renderPending = false;
        setPlaceholder(container, EMPTY_MSG);
        return;
    }

    if (!isLanguageTabActive()) {
        renderPending = true;
        container.innerHTML = '';
        return;
    }

    await renderCurrentSelection();
}

async function renderCurrentSelection() {
    const container = document.getElementById('language-tab');
    const requestIds = currentVerseIds;
    renderPending = false;
    wordsLoading = true;
    if (isLanguageDownloading()) setPlaceholder(container, DOWNLOADING_MSG);

    let words;
    try {
        words = await getOriginalWordsForVerses(requestIds);
    } catch (e) {
        warnLanguageUnavailable(e);
        if (requestIds === currentVerseIds) {
            wordsLoading = false;
            renderPending = true;
            setPlaceholder(container, UNAVAILABLE_MSG);
        }
        return;
    }
    if (requestIds === currentVerseIds) wordsLoading = false;

    const hebrewIds = words.filter(w => w.language === 'hebrew').map(w => w.id);
    let pieces = new Map(), variants = new Map();
    if (hebrewIds.length > 0) {
        try {
            [pieces, variants, hebrewAffixes] = await Promise.all([
                getPiecesForWords(hebrewIds), getVariantsForWords(hebrewIds), hebrewAffixes || getHebrewAffixes(),
            ]);
        } catch (e) {
            console.error('renderLanguageTab: failed to load Hebrew word pieces/variants:', e);
            pieces = new Map(); variants = new Map();
        }
    }

    // Selection may have changed while the (lazy-loaded) query was in flight —
    // discard a stale result rather than render over a newer selection.
    if (requestIds !== currentVerseIds) return;

    lastInterlinearWords = words;
    lastPieces = pieces;
    lastVariants = variants;
    await renderInterlinear(container, words);
}

// Re-runs the interlinear rebuild against the last-loaded words, preserving
// scroll position — used by every tap (row, "Click for more", "Lexicon")
// that only changes disclosure state, not the underlying verse selection.
async function rerenderInterlinear(opts = {}) {
    const container = document.getElementById('language-tab');
    if (!lastInterlinearWords) return;
    await renderInterlinear(container, lastInterlinearWords, { preserveScroll: true, ...opts });
}

// For opening or closing a Lexicon (Greek or Hebrew) and changes inside a Hebrew
// one. With tier 3 open the card is usually taller than the panel, and the
// card-visibility fallback would then pull its bottom edge into line, moving
// what was just tapped out from under the pointer. revealPendingLexicon()
// brings a newly opened Lexicon into view instead.
function rerenderLexicon() {
    return rerenderInterlinear({ keepCardInPlace: true });
}

// ============================================================
// Interlinear view
// ============================================================

async function renderInterlinear(container, words, opts = {}) {
    const myGeneration = ++renderGeneration;

    if (words.length === 0) {
        container.innerHTML = '';
        setPlaceholder(container, NO_DATA_MSG);
        return;
    }

    const scrollTop = opts.preserveScroll ? container.scrollTop : 0;

    const byVerse = new Map();
    for (const w of words) {
        if (!byVerse.has(w.verse_id)) byVerse.set(w.verse_id, []);
        byVerse.get(w.verse_id).push(w);
    }

    const wrap = document.createElement('div');
    wrap.className = 'language-interlinear';
    for (const [verseId, verseWords] of byVerse) {
        wrap.appendChild(await renderVerseBlock(verseId, verseWords));
    }

    // A newer tap or selection change may have started (and possibly
    // finished) while this rebuild was awaiting query results — don't let a
    // stale rebuild clobber it.
    if (myGeneration !== renderGeneration) return;

    container.innerHTML = '';
    container.appendChild(wrap);
    container.scrollTop = scrollTop;

    if (openCardKey && !opts.keepCardInPlace) {
        const card = container.querySelector('.language-word-card');
        if (card) scrollCardIntoViewIfNeeded(container, card);
    }
    revealPendingLexicon(container);
}

// Fallback only — in-place expansion is what keeps the card visible in the
// normal case. Only scrolls when the newly-opened card isn't fully visible.
function scrollCardIntoViewIfNeeded(container, card) {
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const fullyVisible = cardRect.top >= containerRect.top && cardRect.bottom <= containerRect.bottom;
    if (!fullyVisible) {
        card.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
    }
}

// Scrolling glides, so the eye can follow the page instead of it seeming to
// jump somewhere else; instant when the system asks for reduced motion.
function scrollBehavior() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

async function renderVerseBlock(verseId, verseWords) {
    const isHebrew = verseWords[0].language === 'hebrew';

    const block = document.createElement('div');
    block.className = 'language-verse-block';

    const heading = document.createElement('div');
    heading.className = 'language-verse-heading';
    heading.textContent = formatReference(verseId);
    block.appendChild(heading);

    // Running verse line — decorative, non-interactive, continuous text. RTL
    // as a full block for Hebrew.
    const verseLine = document.createElement('div');
    verseLine.className = `language-verse-line ${isHebrew ? 'language-hebrew' : 'language-greek'}`;
    verseLine.dir = isHebrew ? 'rtl' : 'ltr';
    verseLine.textContent = verseWords.map(w => w.surface_text).join(' ');
    block.appendChild(verseLine);

    // Gloss list — one row per word or grouped-word-unit. Grouped words
    // collapse into a single row: one combined original-language text span,
    // one combined gloss, one tap target. The tapped row's card, if open,
    // renders as the next list item — normal document flow pushes later
    // rows down, no positioning tricks needed.
    const list = document.createElement('div');
    list.className = 'language-word-list';

    const seenGroups = new Set();
    for (const w of verseWords) {
        let members;
        if (w.group_id !== null) {
            if (seenGroups.has(w.group_id)) continue;
            seenGroups.add(w.group_id);
            members = verseWords.filter(m => m.group_id === w.group_id);
        } else {
            members = [w];
        }

        const rowKey = cardKeyFor(members);
        list.appendChild(renderWordRow(members, isHebrew, rowKey));
        if (rowKey === openCardKey) {
            list.appendChild(await renderWordCard(members, isHebrew));
        }
    }
    block.appendChild(list);

    return block;
}

function cardKeyFor(members) {
    const first = members[0];
    return first.group_id != null ? `g${first.group_id}` : `w${first.id}`;
}

// Row layout is fixed LTR regardless of language: original-language column
// always left, gloss always right. Grouped words render in their natural
// reading order within the left cell — no reordering needed.
function renderWordRow(members, isHebrew, rowKey) {
    const row = document.createElement('div');
    row.className = 'language-word-row';
    row.classList.toggle('active', rowKey === openCardKey);
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

    const toggle = async () => {
        openCardKey = (openCardKey === rowKey) ? null : rowKey;
        openTier2Ids.clear();
        openTier3Ids.clear();
        closeHebrewLexicons();
        await rerenderInterlinear();
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
        }
    });

    return row;
}

// ============================================================
// Word card — tier 1 (always visible once tapped), tier 2 ("Click for
// more"), tier 3 ("Lexicon")
// ============================================================

async function renderWordCard(members, isHebrew) {
    const card = document.createElement('div');
    card.className = 'language-word-card';

    for (let i = 0; i < members.length; i++) {
        if (i > 0) {
            const divider = document.createElement('div');
            divider.className = 'language-card-divider';
            card.appendChild(divider);
        }
        card.appendChild(await renderCardMember(members[i], isHebrew));
    }

    return card;
}

async function renderCardMember(word, isHebrew) {
    const member = document.createElement('div');
    member.className = 'language-card-member';

    const tier2Open = openTier2Ids.has(word.id);
    const tier3Open = openTier3Ids.has(word.id);

    const row = document.createElement('div');
    row.className = 'language-card-tier1-row';

    const original = document.createElement('span');
    original.className = `language-card-original ${isHebrew ? 'language-hebrew' : 'language-greek'}`;
    original.dir = isHebrew ? 'rtl' : 'ltr';
    original.textContent = word.surface_text;
    row.appendChild(original);

    if (word.gloss_contextual) {
        const gloss = document.createElement('span');
        gloss.className = 'language-card-gloss';
        if (tier2Open) {
            const label = document.createElement('span');
            label.className = 'language-card-gloss-label';
            label.textContent = 'This occurrence';
            gloss.appendChild(label);
        }
        gloss.appendChild(document.createTextNode(word.gloss_contextual));
        row.appendChild(gloss);
    }

    member.appendChild(row);

    if (word.strongs_number) {
        const strongs = document.createElement('div');
        strongs.className = 'language-card-strongs';
        strongs.textContent = word.strongs_number;
        member.appendChild(strongs);
    }

    if (word.morph_code) {
        const morph = document.createElement('div');
        morph.className = 'language-card-morph';
        morph.textContent = word.morph_code;
        member.appendChild(morph);
    }

    // Aramaic words (Daniel 2:4b-7:28, Ezra 4:8-6:18 and 7:12-26, Jer 10:11)
    // are labelled; Hebrew is the default for the OT and gets none. Derived
    // from the tagging as it stands: TAHOT's Aramaic codes begin with "A".
    if (word.language === 'hebrew' && (word.morph_code || '').startsWith('A')) {
        const language = document.createElement('div');
        language.className = 'language-card-language';
        language.textContent = 'Aramaic';
        member.appendChild(language);
    }

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'language-card-more-btn';
    moreBtn.classList.toggle('open', tier2Open);
    moreBtn.textContent = tier2Open ? 'Click for less' : 'Click for more';
    moreBtn.addEventListener('click', async () => {
        if (openTier2Ids.has(word.id)) {
            openTier2Ids.delete(word.id);
            openTier3Ids.delete(word.id);
            closeHebrewLexiconsOf(word);
        } else {
            openTier2Ids.add(word.id);
        }
        await rerenderInterlinear();
    });
    member.appendChild(moreBtn);

    if (tier2Open) {
        member.appendChild(await renderTier2(word, isHebrew, tier3Open));
    }

    return member;
}

async function renderTier2(word, isHebrew, tier3Open) {
    const tier2 = document.createElement('div');
    tier2.className = 'language-card-tier2';

    appendDetailField(tier2, 'Lemma', word.lemma);
    appendDetailField(tier2, 'Transliteration', word.transliteration);

    const morphHeading = document.createElement('div');
    morphHeading.className = 'language-detail-heading';
    morphHeading.textContent = 'Morphology';
    tier2.appendChild(morphHeading);

    if (word.morph_code) {
        const morphCode = document.createElement('div');
        morphCode.className = 'language-detail-value';
        morphCode.textContent = word.morph_code;
        tier2.appendChild(morphCode);
    }

    // Called for both languages: Greek decodes from TEGMC, Hebrew/Aramaic from
    // TEHMC (one entry per piece of the word). A multi-piece Hebrew word gets
    // the anatomy view; a one-piece word, or one splitHebrewWord can't split,
    // gets the plain decoded lines exactly like Greek.
    let parts = [];
    try {
        parts = await decodeMorphCode(word.morph_code);
    } catch (e) {
        console.error('renderTier2: morphology decode failed:', e);
    }
    const anatomy = isHebrew ? splitHebrewWord(word, lastPieces.get(word.id), hebrewAffixes) : null;
    if (anatomy && parts.length === anatomy.reduce((n, subword) => n + subword.pieces.length, 0)) {
        tier2.appendChild(renderAnatomy(anatomy, parts));
    } else if (parts.length > 0) {
        tier2.appendChild(await renderMorphDecodeBody(parts));
    }

    const variant = isHebrew ? lastVariants.get(word.id) : null;
    if (variant && variant.ketivHebrew && !ketivMatchesPrinted(variant.ketivHebrew, word.surface_text)) {
        tier2.appendChild(renderKetiv(variant));
    }

    appendDetailField(tier2, 'General usage', word.gloss_dictionary);

    // Greek: TBESG lexicon entry, gated behind an explicit "Lexicon" tap.
    // Hebrew: Strong's and BDB from their own file, one link per root
    // (Hebrew_Lexicon_Spec; TBESH stays out, see Build_6_Spec.md Item 1).
    if (isHebrew) {
        const roots = hebrewLexiconRoots(word, lastPieces.get(word.id));
        for (const root of roots) {
            appendHebrewLexiconLink(tier2, word, root, roots.length > 1);
        }
    } else if (word.strongs_number) {
        const lexBtn = document.createElement('button');
        lexBtn.type = 'button';
        lexBtn.className = 'language-card-lexicon-btn';
        lexBtn.classList.toggle('open', tier3Open);
        lexBtn.textContent = tier3Open ? 'Hide Lexicon' : 'Show Lexicon';
        lexBtn.addEventListener('click', async () => {
            if (openTier3Ids.has(word.id)) {
                openTier3Ids.delete(word.id);
            } else {
                openTier3Ids.add(word.id);
                pendingReveal = { lexiconKey: greekLexiconKey(word), bdbId: null };
            }
            await rerenderLexicon();
        });
        tier2.appendChild(lexBtn);

        if (tier3Open) {
            tier2.appendChild(await renderTier3(word));
        }
    }

    if (word.strongs_number) appendOccurrencesLink(tier2, word);

    return tier2;
}

// ---- Hebrew word anatomy (Hebrew_Word_Anatomy_Spec, Item 7) ----------------

const ROLE_LABELS = { prefix: 'Prefix', root: 'Word', suffix: 'Suffix' };

// Column 12 writes a few affix glosses as symbols or abbreviations; these are
// display forms only — hebrew_affixes keeps TAHOT's text (H9001 "&", H9008
// "¿", H9012/H9013 "emph.").
const AFFIX_GLOSS_DISPLAY = { '&': 'and', '¿': '(question)', 'emph.': '(emphasis)' };

// One block per piece in reading order: the piece's Hebrew, its role, this
// occurrence's gloss for it, and its decoded lines. A word written as two
// words in one row ("//", mostly Qere readings) shows one group per written
// word, each under its own Hebrew. `parts` is decodeMorphCode's output for the
// same word — one entry per piece, in the same order.
function renderAnatomy(anatomy, parts) {
    const body = document.createElement('div');
    body.className = 'language-anatomy';
    const singleRoot = anatomy.flatMap(s => s.pieces).filter(p => p.role === 'root').length === 1;
    let partIndex = 0;

    for (const subword of anatomy) {
        const group = document.createElement('div');
        group.className = 'language-anatomy-subword';
        if (anatomy.length > 1) {
            const heading = document.createElement('div');
            heading.className = 'language-anatomy-subword-heading language-hebrew';
            heading.dir = 'rtl';
            heading.textContent = subword.surface;
            group.appendChild(heading);
        }
        for (const piece of subword.pieces) {
            group.appendChild(renderPiece(piece, parts[partIndex++], singleRoot));
        }
        body.appendChild(group);
    }
    return body;
}

function renderPiece(piece, part, singleRoot) {
    const block = document.createElement('div');
    block.className = `language-piece language-piece-${piece.role}`;

    const header = document.createElement('div');
    header.className = 'language-piece-header';

    const hebrew = document.createElement('span');
    hebrew.className = 'language-piece-hebrew language-hebrew';
    hebrew.dir = 'rtl';
    hebrew.textContent = piece.surface;
    header.appendChild(hebrew);

    const role = document.createElement('span');
    role.className = 'language-piece-role';
    role.textContent = ROLE_LABELS[piece.role];
    header.appendChild(role);

    if (piece.glossContextual) {
        const gloss = document.createElement('span');
        gloss.className = 'language-piece-gloss';
        gloss.textContent = `“${piece.glossContextual}”`;
        header.appendChild(gloss);
    }
    block.appendChild(header);

    // A piece's general gloss, when it says something this occurrence's
    // doesn't (בַּ used here as "with the", generally "in"). A one-root word's
    // root gloss is already the word's own "General usage" field below.
    const general = piece.role === 'root' ? piece.dictionaryGloss
        : (AFFIX_GLOSS_DISPLAY[piece.dictionaryGloss] ?? piece.dictionaryGloss);
    if (general && !(piece.role === 'root' && singleRoot)
        && general.toLowerCase() !== (piece.glossContextual || '').toLowerCase()) {
        const generalEl = document.createElement('div');
        generalEl.className = 'language-piece-general';
        generalEl.textContent = `General usage: ${general}`;
        block.appendChild(generalEl);
    }

    if (part.lines.length === 0) {
        const code = document.createElement('div');
        code.className = 'language-morph-decode-line';
        code.textContent = part.code;
        block.appendChild(code);
    }
    for (const line of part.lines) {
        const lineEl = document.createElement('div');
        lineEl.className = 'language-morph-decode-line';
        lineEl.textContent = line;
        block.appendChild(lineEl);
    }
    return block;
}

// The Ketiv: the consonants as written, where the text follows the Qere (the
// reading aloud). Q(K) — the written form reads differently; Q(k) — spelling
// only.
const KETIV_NOTES = {
    meaning: 'The text is read as shown above (Qere); the written consonants differ and give a different reading.',
    spelling: 'Spelling difference only.',
};

function renderKetiv(variant) {
    const wrap = document.createElement('div');
    wrap.className = 'language-ketiv';

    const field = document.createElement('div');
    field.className = 'language-detail-field';
    const label = document.createElement('span');
    label.className = 'language-detail-label';
    label.textContent = 'Written (Ketiv)';
    const value = document.createElement('span');
    value.className = 'language-detail-value language-ketiv-hebrew language-hebrew';
    value.dir = 'rtl';
    value.textContent = variant.ketivHebrew;
    field.appendChild(label);
    field.appendChild(value);
    wrap.appendChild(field);

    const note = document.createElement('div');
    note.className = 'language-ketiv-note';
    note.textContent = KETIV_NOTES[variant.ketivKind];
    wrap.appendChild(note);
    return wrap;
}

// One row (Dan 4:32 #22) gives a Ketiv identical to the printed word; a Ketiv
// line there would show the same word twice under "differ", so it is skipped.
function ketivMatchesPrinted(ketiv, surface) {
    const bare = text => text.replace(/\\[^/\\]*/g, '').replace(/[/\s]/g, '');
    return bare(ketiv) === bare(surface);
}

// Parsed-morphology lines — same content the old collapsed "What does this
// mean?" accordion rendered, now unfolded directly into tier 2 with no
// separate toggle.
async function renderMorphDecodeBody(parts) {
    const body = document.createElement('div');
    body.className = 'language-morph-decode-body';
    const multi = parts.length > 1;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (multi) {
            const heading = document.createElement('div');
            heading.className = 'language-morph-decode-part-heading';
            heading.textContent = part.code;
            body.appendChild(heading);
        }
        for (const line of part.lines) {
            const lineEl = document.createElement('div');
            lineEl.className = 'language-morph-decode-line';
            lineEl.textContent = line;
            body.appendChild(lineEl);
        }
        if (part.strongsNumber) {
            let lex = null;
            try {
                lex = await getGreekLexiconEntry(part.strongsNumber);
            } catch (e) {
                console.error('renderMorphDecodeBody: cross-ref lookup failed:', e);
            }
            const refEl = document.createElement('div');
            refEl.className = 'language-morph-decode-crossref';
            refEl.textContent = lex && lex.gloss
                ? `Also joined with ${part.strongsNumber} (${lex.gloss})`
                : `Also joined with ${part.strongsNumber}`;
            body.appendChild(refEl);
        }
        if (multi && i < parts.length - 1) {
            const divider = document.createElement('div');
            divider.className = 'language-morph-decode-divider';
            body.appendChild(divider);
        }
    }

    return body;
}

function greekLexiconKey(word) {
    return `greek:${word.id}`;
}

async function renderTier3(word) {
    const tier3 = document.createElement('div');
    tier3.className = 'language-card-lexicon';
    tier3.dataset.lexiconKey = greekLexiconKey(word);

    let lex = null;
    try {
        lex = await getGreekLexiconEntry(word.strongs_number);
    } catch (e) {
        console.error('renderTier3: lexicon lookup failed:', e);
    }

    const heading = document.createElement('div');
    heading.className = 'language-detail-heading';
    heading.textContent = 'Lexicon (TBESG)';
    tier3.appendChild(heading);

    const body = document.createElement('div');
    body.className = 'language-detail-lexicon';
    if (lex && lex.meaning) {
        body.appendChild(renderGreekLexiconMeaning(lex.meaning));
    } else {
        // Rare (~0.2% of Greek codes, per db.js) — a disambiguation-suffix
        // mismatch between TAGNT and TBESG in the source data itself.
        body.textContent = 'No lexicon entry available.';
    }
    tier3.appendChild(body);

    return tier3;
}

// ---- All occurrences --------------------------------------------------------

// Everywhere this word's STEP number occurs: books with counts, each opening to
// its verses. This verse is among them, marked in its book.
function appendOccurrencesLink(tier2, word) {
    const strongs = word.strongs_number;
    const counts = occurrenceCounts.get(strongs);
    if (!counts) lookUpOccurrences(strongs, null);
    const total = counts?.reduce((sum, row) => sum + row.count, 0);
    const open = openOccurrences.has(word.id);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'language-occurrences-btn';
    button.classList.toggle('open', open);
    button.textContent = counts ? `All occurrences (${total.toLocaleString()})` : 'All occurrences';
    button.addEventListener('click', async () => {
        if (!openOccurrences.delete(word.id)) {
            openOccurrences.add(word.id);
            pendingReveal = { lexiconKey: occurrencesKey(word), bdbId: null };
        }
        await rerenderLexicon();
    });
    tier2.appendChild(button);
    if (!open) return;

    const list = document.createElement('div');
    list.className = 'language-occurrences';
    list.dataset.lexiconKey = occurrencesKey(word);
    if (!counts) {
        list.dataset.loading = 'true';
        list.appendChild(hebrewLexiconMessage('Finding occurrences…'));
    }
    for (const { book, count } of counts ?? []) {
        const bookKey = `${word.id}:${book}`;
        const bookOpen = openOccurrenceBooks.has(bookKey);
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'language-occurrences-book';
        toggle.classList.toggle('open', bookOpen);
        const name = document.createElement('span');
        name.textContent = getBook(book)?.name ?? `Book ${book}`;
        const number = document.createElement('span');
        number.className = 'language-occurrences-count';
        number.textContent = count.toLocaleString();
        toggle.append(name, number);
        toggle.addEventListener('click', async () => {
            if (!openOccurrenceBooks.delete(bookKey)) {
                openOccurrenceBooks.add(bookKey);
                pendingReveal = { lexiconKey: `${occurrencesKey(word)}:${book}`, bdbId: null };
            }
            await rerenderLexicon();
        });
        list.appendChild(toggle);
        if (bookOpen) list.appendChild(renderOccurrenceVerses(word, book));
    }
    tier2.appendChild(list);
}

function occurrencesKey(word) {
    return `occurrences:${word.id}`;
}

function renderOccurrenceVerses(word, book) {
    const strongs = word.strongs_number;
    const verses = occurrenceVerses.get(`${strongs}:${book}`);
    const wrap = document.createElement('div');
    wrap.className = 'language-occurrences-verses';
    wrap.dataset.lexiconKey = `${occurrencesKey(word)}:${book}`;
    if (!verses) {
        lookUpOccurrences(strongs, book);
        wrap.dataset.loading = 'true';
        wrap.appendChild(hebrewLexiconMessage('Finding occurrences…'));
        return wrap;
    }
    const shownKey = `${word.id}:${book}`;
    const shown = occurrenceRowsShown.get(shownKey) ?? OCCURRENCE_PAGE;
    for (const { verseId, glosses } of verses.slice(0, shown)) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'language-occurrence';
        row.dataset.verseId = verseId;
        const reference = document.createElement('span');
        reference.className = 'language-occurrence-ref';
        reference.textContent = formatReference(verseId);
        const gloss = document.createElement('span');
        gloss.className = 'language-occurrence-gloss';
        gloss.textContent = [...new Set(glosses.map(plainGloss).filter(Boolean))].join(' · ');
        row.append(reference, gloss);
        if (glosses.length > 1) {
            const times = document.createElement('span');
            times.className = 'language-occurrence-times';
            times.textContent = `×${glosses.length}`;
            row.appendChild(times);
        }
        if (verseId === word.verse_id) {
            row.classList.add('current');
            const here = document.createElement('span');
            here.className = 'language-occurrence-here';
            here.textContent = 'this verse';
            row.appendChild(here);
        }
        wrap.appendChild(row);
    }
    if (verses.length > shown) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'language-occurrences-more';
        more.textContent = `Show ${Math.min(OCCURRENCE_PAGE, verses.length - shown)} more of ${verses.length.toLocaleString()} verses`;
        more.addEventListener('click', async () => {
            occurrenceRowsShown.set(shownKey, shown + OCCURRENCE_PAGE);
            await rerenderLexicon();
        });
        wrap.appendChild(more);
    }
    return wrap;
}

// `book` null: the book counts. Only a lookup that succeeds redraws: a failed
// one is logged and stays a loading line, and the next tap's redraw tries again
// (redrawing on failure would retry in a loop).
async function lookUpOccurrences(strongs, book) {
    const key = book === null ? strongs : `${strongs}:${book}`;
    if (occurrenceLookups.has(key)) return;
    occurrenceLookups.add(key);
    try {
        if (book === null) occurrenceCounts.set(strongs, await getOccurrenceCounts(strongs));
        else occurrenceVerses.set(key, await getOccurrencesInBook(strongs, book));
    } catch (e) {
        warnLanguageUnavailable(e);
        return;
    } finally {
        occurrenceLookups.delete(key);
    }
    if (openCardKey) await rerenderLexicon();
}

// ---- Hebrew tier 3 (Hebrew_Lexicon_Spec) ------------------------------------

function hebrewLexiconKey(word, root) {
    return `${word.id}:${root.base}`;
}

function closeHebrewLexicons() {
    pendingReveal = null;
    openOccurrences.clear();
    openOccurrenceBooks.clear();
    occurrenceRowsShown.clear();
    openHebrewLexicons.clear();
    openBdbEntries.clear();
    hebrewLexiconEntries.clear();
    hebrewLexiconFailed.clear();
}

function closeHebrewLexiconsOf(word) {
    const prefix = `${word.id}:`;
    openOccurrences.delete(word.id);
    for (const keys of [openHebrewLexicons, openBdbEntries, openOccurrenceBooks, occurrenceRowsShown]) {
        for (const key of [...keys.keys()]) {
            if (key.startsWith(prefix)) keys.delete(key);
        }
    }
}

// A word with two roots says which root each link opens.
function appendHebrewLexiconLink(tier2, word, root, namesRoot) {
    const key = hebrewLexiconKey(word, root);
    const open = openHebrewLexicons.has(key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'language-card-lexicon-btn';
    button.classList.toggle('open', open);
    button.textContent = `${open ? 'Hide' : 'Show'} Lexicon${namesRoot ? ` (${root.strongs})` : ''}`;
    button.addEventListener('click', async () => {
        if (openHebrewLexicons.has(key)) {
            openHebrewLexicons.delete(key);
        } else {
            openHebrewLexicons.add(key);
            hebrewLexiconFailed.delete(root.base);
            pendingReveal = { lexiconKey: key, bdbId: null };
        }
        await rerenderLexicon();
    });
    tier2.appendChild(button);
    if (open) tier2.appendChild(renderHebrewTier3(word, root));
}

function renderHebrewTier3(word, root) {
    const tier3 = document.createElement('div');
    tier3.className = 'language-card-lexicon';
    tier3.dataset.lexiconKey = hebrewLexiconKey(word, root);

    if (hebrewLexiconFailed.has(root.base)) {
        tier3.appendChild(hebrewLexiconMessage(HEBREW_LEXICON_UNAVAILABLE_MSG));
    } else if (!hebrewLexiconEntries.has(root.base)) {
        tier3.appendChild(hebrewLexiconMessage(HEBREW_LEXICON_LOADING_MSG));
        tier3.dataset.loading = 'true';
        lookUpHebrewLexiconEntry(root);
    } else if (hebrewLexiconEntries.get(root.base) === null) {
        tier3.appendChild(hebrewLexiconMessage(HEBREW_LEXICON_NO_ENTRY_MSG));
    } else {
        const keyOf = bdbId => `${hebrewLexiconKey(word, root)}:${bdbId}`;
        tier3.appendChild(renderHebrewLexiconEntry(hebrewLexiconEntries.get(root.base), {
            isOpen: bdbId => openBdbEntries.has(keyOf(bdbId)),
            toggle: async bdbId => {
                const key = keyOf(bdbId);
                if (!openBdbEntries.delete(key)) {
                    openBdbEntries.add(key);
                    pendingReveal = { lexiconKey: hebrewLexiconKey(word, root), bdbId };
                }
                await rerenderLexicon();
            },
        }));
    }
    return tier3;
}

// A Lexicon or BDB entry just opened below the panel's bottom edge glides up
// into view, but never so far that the link just tapped (the element above it)
// leaves the top. Waits while the entry is still loading: the rebuild that
// fills it comes back here.
const REVEAL_MARGIN = 12;

function revealPendingLexicon(container) {
    if (!pendingReveal) return;
    const tier3 = [...container.querySelectorAll('[data-lexicon-key]')]
        .find(element => element.dataset.lexiconKey === pendingReveal.lexiconKey);
    if (tier3?.dataset.loading) return;
    const target = tier3 && pendingReveal.bdbId
        ? [...tier3.querySelectorAll('.language-lexicon-bdb-entry')]
            .find(element => element.dataset.bdbId === pendingReveal.bdbId)
        : tier3;
    pendingReveal = null;
    if (!target) return;

    const panel = container.getBoundingClientRect();
    const hiddenBelow = target.getBoundingClientRect().bottom - panel.bottom + REVEAL_MARGIN;
    if (hiddenBelow <= 0) return;
    const tapped = target.previousElementSibling || target;
    const roomAbove = tapped.getBoundingClientRect().top - panel.top - REVEAL_MARGIN;
    const distance = Math.min(hiddenBelow, roomAbove);
    if (distance > 0) container.scrollBy({ top: distance, behavior: scrollBehavior() });
}

function hebrewLexiconMessage(text) {
    const message = document.createElement('div');
    message.className = 'language-lexicon-quiet';
    message.textContent = text;
    return message;
}

async function lookUpHebrewLexiconEntry(root) {
    if (hebrewLexiconLookups.has(root.base)) return;
    hebrewLexiconLookups.add(root.base);
    try {
        hebrewLexiconEntries.set(root.base, await getHebrewLexiconEntry(root.strongs));
    } catch (e) {
        warnHebrewLexiconUnavailable(e);
        hebrewLexiconFailed.add(root.base);
    }
    hebrewLexiconLookups.delete(root.base);
    if (openHebrewLexicons.size > 0) await rerenderLexicon();
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
