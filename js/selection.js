// selection.js — Verse selection

import { setActivePane, getActivePaneId } from './reader.js';

let selectedVerses = [];
let anchorVerseId  = null;  // set by plain click; shift-click extends from here
let anchorPaneId   = null;  // pane the anchor lives in

export function initSelection() {
    // Verse selection — bubbling stopped at .verse so clicks don't reach .pane-content.
    document.querySelectorAll('.scripture-text').forEach(el => {
        el.addEventListener('click', handleVerseClick);
    });

    // Margin deselect — any click that reaches .pane-content (i.e. did not land on a verse)
    // clears the selection and fires selection-changed so dependent panels go idle.
    document.querySelectorAll('.pane-content').forEach(el => {
        el.addEventListener('click', clearSelection);
    });

    // Pane switch — clear any selection that belongs to the outgoing pane so both
    // panes can never show highlighted verses simultaneously.
    document.addEventListener('pane-changed', (e) => {
        if (anchorPaneId !== null && anchorPaneId !== e.detail.paneId) {
            clearSelection();
        }
    });
}

function handleVerseClick(e) {
    const verseEl = e.target.closest('.verse');
    if (!verseEl) {
        clearSelection();
        return;
    }

    e.stopPropagation(); // prevent bubbling to .pane-content deselect handler

    // Activate whichever pane this click came from
    const paneEl = e.target.closest('.reader-pane');
    const paneId = paneEl?.id.replace('reader-pane-', '') || 'a';
    if (paneEl) setActivePane(paneId);

    const verseId = parseInt(verseEl.dataset.verseId);

    if (e.shiftKey && anchorVerseId !== null && anchorPaneId === paneId) {
        // Extend selection from anchor to this verse (same pane only).
        // Cross-pane shift-click falls through to plain-click behavior below.
        applyRange(paneEl, anchorVerseId, verseId);
    } else {
        // Plain click (or shift with no anchor, or shift across panes): set new anchor.
        anchorVerseId = verseId;
        anchorPaneId  = paneId;
        applySingle(verseEl, verseId);
    }
}

// Programmatically select a verse or range in the active pane, scroll it
// into view, and dispatch selection-changed — the same visual and module
// state a click would produce. Called by cross-reference click-to-navigate
// after the chapter is rendered.
export function selectVerseRange(startId, endId = null) {
    const paneId = getActivePaneId();
    const paneEl = document.getElementById(`reader-pane-${paneId}`);
    if (!paneEl) return;

    let firstEl;
    if (!endId || startId === endId) {
        firstEl = paneEl.querySelector(`[data-verse-id="${startId}"]`);
        if (!firstEl) return;
        anchorVerseId = startId;
        anchorPaneId  = paneId;
        applySingle(firstEl, startId);
    } else {
        anchorVerseId = startId;
        anchorPaneId  = paneId;
        firstEl = applyRange(paneEl, startId, endId);
    }
    firstEl?.scrollIntoView({ block: 'center' });
}

function clearSelection() {
    const hadSelection = selectedVerses.length > 0;
    clearSelectedClasses();
    selectedVerses = [];
    anchorVerseId  = null;
    anchorPaneId   = null;
    if (hadSelection) dispatch(null);
}

export function getSelectedVerses() {
    return [...selectedVerses];
}

// ============================================================
// Apply — the one implementation of "make this the selection", used by
// both the click handlers and selectVerseRange()
// ============================================================

// Selects exactly one verse, with the select-glow animation.
function applySingle(verseEl, verseId) {
    clearSelectedClasses();
    verseEl.classList.add('selected');
    glow(verseEl);
    selectedVerses = [verseId];
    dispatch(verseEl);
}

// Selects every rendered verse in the pane whose id lies between the two
// given ids (either order). The pane renders one chapter, so the range is
// clamped to the chapter automatically. Returns the first selected element,
// or null if none fell in range.
function applyRange(paneEl, idA, idB) {
    clearSelectedClasses();
    const minId = Math.min(idA, idB);
    const maxId = Math.max(idA, idB);

    const inRange = Array.from(paneEl.querySelectorAll('.verse')).filter(el => {
        const id = parseInt(el.dataset.verseId);
        return id >= minId && id <= maxId;
    });

    inRange.forEach(el => el.classList.add('selected'));
    selectedVerses = inRange.map(el => parseInt(el.dataset.verseId));
    dispatch(inRange[0] || null);
    return inRange[0] || null;
}

function clearSelectedClasses() {
    document.querySelectorAll('.verse.selected').forEach(el => el.classList.remove('selected'));
}

// Restarts the outline-pulse animation even when the same verse is
// re-clicked: removing and re-adding the class alone would not restart it,
// so a reflow is forced in between.
function glow(verseEl) {
    verseEl.classList.remove('glow');
    void verseEl.offsetWidth;
    verseEl.classList.add('glow');
    verseEl.addEventListener('animationend', () => verseEl.classList.remove('glow'), { once: true });
}

function dispatch(verseEl) {
    document.dispatchEvent(new CustomEvent('selection-changed', {
        detail: {
            verseIds: [...selectedVerses],
            element:  verseEl
        }
    }));
}
