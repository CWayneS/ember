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

import { formatReference, getOriginalWordsForVerses, getGreekLexiconEntry } from './db.js';
import { decodeMorphCode } from './grammar-decode.js';

const EMPTY_MSG        = 'Select a verse to see its original-language text.';
const NO_DATA_MSG      = 'No original-language data for this verse yet.';
const UNAVAILABLE_MSG  = 'Original-language data is unavailable.';

let currentVerseIds      = [];   // last selection this tab was asked to show
let lastInterlinearWords = null; // cached render input, for re-renders on tap

// Which row's card is open, and which of its member words have tier 2/tier 3
// expanded. Invariant: the two sets only ever hold ids belonging to the
// currently-open card — both are cleared whenever openCardKey changes.
let openCardKey    = null;
let openTier2Ids   = new Set();
let openTier3Ids   = new Set();
let renderGeneration = 0; // staleness guard for overlapping async rebuilds

export async function renderLanguageTab(verseIds) {
    const container = document.getElementById('language-tab');
    currentVerseIds = verseIds || [];
    openCardKey = null;
    openTier2Ids.clear();
    openTier3Ids.clear();

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
    await renderInterlinear(container, words);
}

// Re-runs the interlinear rebuild against the last-loaded words, preserving
// scroll position — used by every tap (row, "Click for more", "Lexicon")
// that only changes disclosure state, not the underlying verse selection.
async function rerenderInterlinear() {
    const container = document.getElementById('language-tab');
    if (!lastInterlinearWords) return;
    await renderInterlinear(container, lastInterlinearWords, { preserveScroll: true });
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

    if (openCardKey) {
        const card = container.querySelector('.language-word-card');
        if (card) scrollCardIntoViewIfNeeded(container, card);
    }
}

// Fallback only — in-place expansion is what keeps the card visible in the
// normal case. Only scrolls when the newly-opened card isn't fully visible.
function scrollCardIntoViewIfNeeded(container, card) {
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const fullyVisible = cardRect.top >= containerRect.top && cardRect.bottom <= containerRect.bottom;
    if (!fullyVisible) {
        card.scrollIntoView({ block: 'nearest' });
    }
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

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'language-card-more-btn';
    moreBtn.classList.toggle('open', tier2Open);
    moreBtn.textContent = tier2Open ? 'Click for less' : 'Click for more';
    moreBtn.addEventListener('click', async () => {
        if (openTier2Ids.has(word.id)) {
            openTier2Ids.delete(word.id);
            openTier3Ids.delete(word.id);
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

    // Called unconditionally for both languages — decodeMorphCode is
    // Greek-only by data source (TEGMC) and returns [] for anything it can't
    // decode, so Hebrew rows fall back to showing just the raw code above
    // with no parsed lines. Hebrew's own decode (TEHMC) is a documented,
    // separate follow-up (Grammar_Decode_Spec_DRAFT.md) — not implemented
    // here, and not blocked on anything in this file.
    let parts = [];
    try {
        parts = await decodeMorphCode(word.morph_code);
    } catch (e) {
        console.error('renderTier2: morphology decode failed:', e);
    }
    if (parts.length > 0) {
        tier2.appendChild(await renderMorphDecodeBody(parts));
    }

    appendDetailField(tier2, 'General usage', word.gloss_dictionary);

    // Greek: TBESG lexicon entry, gated behind an explicit "Lexicon" tap.
    // Hebrew: no Lexicon link — TBESH's Meaning field carries its own
    // unresolved rights-holder restriction (Build_6_Spec.md Item 1); a
    // documented gap, not a bug.
    if (!isHebrew && word.strongs_number) {
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
            }
            await rerenderInterlinear();
        });
        tier2.appendChild(lexBtn);

        if (tier3Open) {
            tier2.appendChild(await renderTier3(word));
        }
    }

    return tier2;
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

async function renderTier3(word) {
    const tier3 = document.createElement('div');
    tier3.className = 'language-card-lexicon';

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
        body.innerHTML = sanitizeLexiconMeaning(lex.meaning);
    } else {
        // Rare (~0.2% of Greek codes, per db.js) — a disambiguation-suffix
        // mismatch between TAGNT and TBESG in the source data itself.
        body.textContent = 'No lexicon entry available.';
    }
    tier3.appendChild(body);

    return tier3;
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
