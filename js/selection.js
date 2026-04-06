// selection.js — Verse selection

import { setActivePane } from './reader.js';

let selectedVerses = [];

export function initSelection() {
    // Deselect only when clicking within scripture text but not on a verse.
    // All other clicks (panels, toolbar, resize handles, etc.) are neutral.
    document.querySelectorAll('.scripture-text').forEach(el => {
        el.addEventListener('click', handleVerseClick);
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
