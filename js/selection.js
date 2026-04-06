// selection.js — Verse selection

import { setActivePane } from './reader.js';

let selectedVerses = [];

export function initSelection() {
    // Attach to each pane's scripture-text so pane-nav clicks don't interfere
    document.querySelectorAll('.scripture-text').forEach(el => {
        el.addEventListener('click', handleVerseClick);
    });

    // Clear selection when clicking outside the reader text and outside the panels.
    // Guard: if the target was removed from the DOM during its own click handler
    // (e.g. renderStudyDocument wiping innerHTML), e.target.isConnected is false
    // and closest() returns null — treat detached clicks as non-clearing.
    document.addEventListener('click', (e) => {
        if (!e.target.isConnected) return;
        if (
            !e.target.closest('.scripture-text') &&
            !e.target.closest('#notes-panel') &&
            !e.target.closest('#reference-panel') &&
            !e.target.closest('#bookmark-btn') &&
            !e.target.closest('#bookmark-prompt')
        ) {
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

    // Activate whichever pane this click came from
    const paneEl = e.target.closest('.reader-pane');
    if (paneEl) setActivePane(paneEl.id.replace('reader-pane-', ''));

    const verseId = parseInt(verseEl.dataset.verseId);

    // Clear previous selection across all panes
    document.querySelectorAll('.verse.selected').forEach(el => el.classList.remove('selected'));

    // Select this verse and flash the glow animation
    verseEl.classList.add('selected');
    verseEl.classList.remove('glow');
    void verseEl.offsetWidth; // force reflow so animation restarts on re-click
    verseEl.classList.add('glow');
    verseEl.addEventListener('animationend', () => verseEl.classList.remove('glow'), { once: true });

    selectedVerses = [verseId];

    dispatch(verseEl);
}

function clearSelection() {
    if (selectedVerses.length === 0) return;
    document.querySelectorAll('.verse.selected').forEach(el => el.classList.remove('selected'));
    selectedVerses = [];
    dispatch(null);
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
