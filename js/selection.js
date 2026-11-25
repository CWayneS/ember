// selection.js — Verse selection, and the selection level
//
// A selection in the reading pane has a level (docs/Info_Tab_Spec.md, Item 1):
// translation, book, chapter or verse. Selecting a verse or range is the verse
// level. Clicking the book name or chapter number in the chapter title selects
// the book or chapter, and switching a pane's translation the translation.
// Otherwise (nothing selected, or the selected verses aren't in the chapter on
// screen) it's the chapter. The Info tab opens the section for the level;
// 'level-changed' tells it the level was set again.

import { setActivePane, getActivePaneId, getCurrentLocation } from './reader.js';

let selectedVerses = [];
let anchorVerseId  = null;  // set by plain click; shift-click extends from here
let anchorPaneId   = null;  // pane the anchor lives in

// A level chosen as such: 'translation', 'book' or 'chapter', in levelPaneId.
// null when the level follows from the verse selection.
let chosenLevel    = null;
let levelPaneId    = null;
const paneLocations = {};   // paneId → 'book:chapter' last rendered there

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

    // A re-rendered chapter (navigation, a translation switch, a lexicon
    // reference and the way back) loses its classes. The selection itself
    // stands, so a verse of it that is back on screen is outlined again.
    document.addEventListener('chapter-rendered', (e) => {
        onChapterRendered(e.detail);
        if (selectedVerses.length === 0 || e.detail.paneId !== anchorPaneId) return;
        const paneEl = document.getElementById(`reader-pane-${e.detail.paneId}`);
        for (const verseId of selectedVerses) {
            paneEl?.querySelector(`[data-verse-id="${verseId}"]`)?.classList.add('selected');
        }
    });

    // Pane switch — clear any selection that belongs to the outgoing pane so both
    // panes can never show highlighted verses simultaneously. A chosen level
    // belongs to its pane too.
    document.addEventListener('pane-changed', (e) => {
        if (anchorPaneId !== null && anchorPaneId !== e.detail.paneId) {
            clearSelection();
        }
        if (chosenLevel && levelPaneId !== e.detail.paneId) {
            setChosenLevel(null, null);
        }
    });
}

// Switching the translation selects the translation; going to another chapter
// drops a chosen level (back to the chapter, or the verse if the selection is
// on screen there). A re-render of the same chapter keeps it, and the title's
// highlight is put back.
function onChapterRendered({ paneId, bookId, chapter, cause }) {
    const location = `${bookId}:${chapter}`;
    const moved = paneLocations[paneId] !== undefined && paneLocations[paneId] !== location;
    paneLocations[paneId] = location;

    if (cause === 'translation') {
        setChosenLevel('translation', paneId);
    } else if (moved && (chosenLevel === null || levelPaneId === paneId)) {
        setChosenLevel(null, null);
    } else {
        markChosenLevel();
    }
}

// Selects the book or the chapter shown in a pane, as clicking its part of the
// chapter title does. Clears any verse selection.
export function selectLevel(level, paneId = getActivePaneId()) {
    setActivePane(paneId);
    clearSelection();
    setChosenLevel(level, paneId);
}

// The level the active pane's selection is at: 'translation', 'book',
// 'chapter' or 'verse'.
export function getSelectionLevel() {
    if (chosenLevel && levelPaneId === getActivePaneId()) return chosenLevel;
    return getSelectedVerseOnScreen() !== null ? 'verse' : 'chapter';
}

// The first selected verse, if it's in the chapter the active pane shows.
export function getSelectedVerseOnScreen() {
    if (selectedVerses.length === 0 || anchorPaneId !== getActivePaneId()) return null;
    const { book, chapter } = getCurrentLocation();
    const verseId = selectedVerses[0];
    const inChapter = Math.floor(verseId / 1000000) === book && Math.floor(verseId / 1000) % 1000 === chapter;
    return inChapter ? verseId : null;
}

function setChosenLevel(level, paneId) {
    chosenLevel = level;
    levelPaneId = level ? paneId : null;
    markChosenLevel();
    document.dispatchEvent(new CustomEvent('level-changed', { detail: { level: getSelectionLevel() } }));
}

// The chosen book or chapter gets the selected verse's outline in the title.
function markChosenLevel() {
    document.querySelectorAll('.chapter-title-target.selected').forEach(el => el.classList.remove('selected'));
    if (chosenLevel !== 'book' && chosenLevel !== 'chapter') return;
    document.querySelector(`#reader-pane-${levelPaneId} .chapter-title-target[data-level="${chosenLevel}"]`)
        ?.classList.add('selected');
}

function handleVerseClick(e) {
    const levelTarget = e.target.closest('.chapter-title-target');
    if (levelTarget) {
        e.stopPropagation();
        const paneId = e.target.closest('.reader-pane')?.id.replace('reader-pane-', '') || 'a';
        selectLevel(levelTarget.dataset.level, paneId);
        return;
    }

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

// Clears the verse selection and any chosen level: a click in the pane's
// margin goes back to the chapter level.
function clearSelection() {
    const hadSelection = selectedVerses.length > 0;
    clearSelectedClasses();
    selectedVerses = [];
    anchorVerseId  = null;
    anchorPaneId   = null;
    if (hadSelection) dispatch(null);
    if (chosenLevel) setChosenLevel(null, null);
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
    // A verse selection is the verse level.
    if (selectedVerses.length > 0 && chosenLevel) {
        chosenLevel = null;
        levelPaneId = null;
        markChosenLevel();
    }
    document.dispatchEvent(new CustomEvent('selection-changed', {
        detail: {
            verseIds: [...selectedVerses],
            element:  verseEl
        }
    }));
}
