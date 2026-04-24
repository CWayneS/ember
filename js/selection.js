// selection.js — Verse selection

import { setActivePane } from './reader.js';

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
        selectRange(paneEl, anchorVerseId, verseId);
    } else {
        // Plain click (or shift with no anchor, or shift across panes): set new anchor.
        anchorVerseId = verseId;
        anchorPaneId  = paneId;
        selectSingle(verseEl, verseId);
    }
}

function selectSingle(verseEl, verseId) {
    document.querySelectorAll('.verse.selected').forEach(el => el.classList.remove('selected'));

    verseEl.classList.add('selected');
    verseEl.classList.remove('glow');
    void verseEl.offsetWidth; // force reflow so animation restarts on re-click
    verseEl.classList.add('glow');
    verseEl.addEventListener('animationend', () => verseEl.classList.remove('glow'), { once: true });

    selectedVerses = [verseId];
    dispatch(verseEl);
}

function selectRange(paneEl, anchorId, clickedId) {
    document.querySelectorAll('.verse.selected').forEach(el => el.classList.remove('selected'));

    const minId = Math.min(anchorId, clickedId);
    const maxId = Math.max(anchorId, clickedId);

    // Query only within the pane — it renders one chapter, so clamping is automatic.
    const inRange = Array.from(paneEl.querySelectorAll('.verse'))
        .filter(el => {
            const id = parseInt(el.dataset.verseId);
            return id >= minId && id <= maxId;
        });

    inRange.forEach(el => el.classList.add('selected'));
    selectedVerses = inRange.map(el => parseInt(el.dataset.verseId));

    dispatch(inRange[0] || null);
}

function clearSelection() {
    const hadSelection = selectedVerses.length > 0;
    document.querySelectorAll('.verse.selected').forEach(el => el.classList.remove('selected'));
    selectedVerses = [];
    anchorVerseId  = null;
    anchorPaneId   = null;
    if (hadSelection) dispatch(null);
}

function dispatch(verseEl) {
    document.dispatchEvent(new CustomEvent('selection-changed', {
        detail: {
            verseIds: [...selectedVerses],
            element:  verseEl
        }
    }));
}

export function getSelectedVerses() {
    return [...selectedVerses];
}
