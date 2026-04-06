// bookmarks.js — Bookmark button behavior

import { getBookmarkForVerse, addBookmark, removeBookmark } from './db.js';
import { getSelectedVerses } from './selection.js';

// ============================================================
// State
// ============================================================

let currentBookmark = null;   // bookmark row for the selected verse, or null

// ============================================================
// Init
// ============================================================

export function initBookmarks() {
    const btn    = document.getElementById('bookmark-btn');
    const prompt = document.getElementById('bookmark-prompt');
    const input  = document.getElementById('bookmark-comment');
    const saveBtn   = document.getElementById('bookmark-save');
    const cancelBtn = document.getElementById('bookmark-cancel');

    btn.addEventListener('click', () => handleBookmarkClick(btn, prompt, input));
    saveBtn.addEventListener('click',   () => handleSave(prompt, input));
    cancelBtn.addEventListener('click', () => dismissPrompt(prompt, input));

    // Close prompt on outside click
    document.addEventListener('click', (e) => {
        if (
            !prompt.classList.contains('hidden') &&
            !prompt.contains(e.target) &&
            e.target !== btn
        ) {
            dismissPrompt(prompt, input);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !prompt.classList.contains('hidden')) {
            dismissPrompt(prompt, input);
        }
    });

    // Update button state whenever verse selection changes
    document.addEventListener('selection-changed', (e) => {
        const verseIds = e.detail?.verseIds || [];
        if (verseIds.length > 0) {
            currentBookmark = getBookmarkForVerse(verseIds[0]);
        } else {
            currentBookmark = null;
        }
        updateButtonState(btn);
        // If the prompt is open for a different verse, dismiss it
        if (!prompt.classList.contains('hidden')) {
            dismissPrompt(prompt, input);
        }
    });
}

// ============================================================
// Click handler
// ============================================================

function handleBookmarkClick(btn, prompt, input) {
    const verseIds = getSelectedVerses();

    if (verseIds.length === 0) {
        // No verse selected — placeholder for future dropdown
        return;
    }

    if (currentBookmark) {
        // Already bookmarked — remove immediately
        removeBookmark(currentBookmark.id);
        currentBookmark = null;
        updateButtonState(btn);
    } else {
        // Show inline prompt
        openPrompt(btn, prompt, input);
    }
}

// ============================================================
// Prompt
// ============================================================

function openPrompt(btn, prompt, input) {
    const rect = btn.getBoundingClientRect();
    prompt.style.top  = `${rect.bottom + 6}px`;
    prompt.style.left = `${rect.right}px`;
    prompt.classList.remove('hidden');
    input.value = '';
    input.focus();
}

function dismissPrompt(prompt, input) {
    prompt.classList.add('hidden');
    input.value = '';
}

function handleSave(prompt, input) {
    const verseIds = getSelectedVerses();
    if (verseIds.length === 0) {
        dismissPrompt(prompt, input);
        return;
    }

    const label = input.value.trim();
    addBookmark(verseIds[0], label);
    currentBookmark = getBookmarkForVerse(verseIds[0]);
    updateButtonState(document.getElementById('bookmark-btn'));
    dismissPrompt(prompt, input);
}

// ============================================================
// Visual state
// ============================================================

function updateButtonState(btn) {
    btn.classList.toggle('bookmarked', currentBookmark !== null);
    btn.setAttribute('aria-label', currentBookmark ? 'Remove bookmark' : 'Bookmark verse');
}
