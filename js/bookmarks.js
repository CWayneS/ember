// bookmarks.js — Bookmark button behavior

import { getBookmarkForVerse, addBookmark, removeBookmark, getAllBookmarks } from './db.js';
import { getSelectedVerses } from './selection.js';
import { navigateTo, refreshVerseIndicators } from './reader.js';
import { registerPopover, closeAllPopovers } from './popover-registry.js';

// ============================================================
// State
// ============================================================

let currentBookmark = null;   // bookmark row for the selected verse, or null

// ============================================================
// Init
// ============================================================

export function initBookmarks() {
    const btn      = document.getElementById('bookmark-btn');
    const prompt   = document.getElementById('bookmark-prompt');
    const dropdown = document.getElementById('bookmark-dropdown');
    const input    = document.getElementById('bookmark-comment');
    const saveBtn   = document.getElementById('bookmark-save');
    const cancelBtn = document.getElementById('bookmark-cancel');

    registerPopover(() => { dismissPrompt(prompt, input); closeDropdown(dropdown); });

    btn.addEventListener('click', () => handleBookmarkClick(btn, prompt, dropdown, input));
    saveBtn.addEventListener('click',   () => handleSave(prompt, input));
    cancelBtn.addEventListener('click', () => dismissPrompt(prompt, input));

    // Close prompt or dropdown on outside click
    document.addEventListener('click', (e) => {
        if (
            !prompt.classList.contains('hidden') &&
            !prompt.contains(e.target) &&
            e.target !== btn
        ) {
            dismissPrompt(prompt, input);
        }
        if (
            !dropdown.classList.contains('hidden') &&
            !dropdown.contains(e.target) &&
            e.target !== btn
        ) {
            closeDropdown(dropdown);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dismissPrompt(prompt, input);
            closeDropdown(dropdown);
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
        if (!prompt.classList.contains('hidden')) {
            dismissPrompt(prompt, input);
        }
    });
}

// ============================================================
// Click handler
// ============================================================

function handleBookmarkClick(btn, prompt, dropdown, input) {
    const verseIds = getSelectedVerses();

    if (verseIds.length === 0) {
        // No verse selected — toggle dropdown
        if (!dropdown.classList.contains('hidden')) {
            closeDropdown(dropdown);
        } else {
            openDropdown(btn, dropdown);
        }
        return;
    }

    // Close dropdown if open
    closeDropdown(dropdown);

    if (currentBookmark) {
        // Already bookmarked — remove immediately
        removeBookmark(currentBookmark.id);
        currentBookmark = null;
        updateButtonState(btn);
        refreshVerseIndicators();
    } else {
        // Show inline comment prompt
        openPrompt(btn, prompt, input);
    }
}

// ============================================================
// Prompt
// ============================================================

function openPrompt(btn, prompt, input) {
    closeAllPopovers();
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
    refreshVerseIndicators();
}

// ============================================================
// Dropdown
// ============================================================

function openDropdown(btn, dropdown) {
    closeAllPopovers();
    const rect = btn.getBoundingClientRect();
    dropdown.style.top   = `${rect.bottom + 4}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;

    renderDropdown(dropdown);
    dropdown.classList.remove('hidden');
}

function closeDropdown(dropdown) {
    dropdown.classList.add('hidden');
}

function renderDropdown(dropdown) {
    const list      = document.getElementById('bookmark-list');
    const bookmarks = getAllBookmarks();
    list.innerHTML  = '';

    if (bookmarks.length === 0) {
        const empty = document.createElement('div');
        empty.className   = 'bookmark-empty';
        empty.textContent = 'No bookmarks yet. Select a verse and click ☆ to save your place.';
        list.appendChild(empty);
        return;
    }

    for (const bm of bookmarks) {
        const row = document.createElement('div');
        row.className = 'bookmark-row';

        const ref = document.createElement('span');
        ref.className   = 'bookmark-ref';
        ref.textContent = `${bm.book_name} ${bm.chapter}:${bm.verse}`;

        const label = document.createElement('span');
        label.className   = 'bookmark-label';
        label.textContent = bm.label || '';

        const del = document.createElement('button');
        del.className   = 'bookmark-delete';
        del.textContent = '✕';
        del.title       = 'Remove bookmark';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            removeBookmark(bm.id);
            // If this was the selected verse's bookmark, clear state
            if (currentBookmark && currentBookmark.id === bm.id) {
                currentBookmark = null;
                updateButtonState(document.getElementById('bookmark-btn'));
            }
            refreshVerseIndicators();
            row.remove();
            // Show empty state if list is now empty
            if (list.children.length === 0) {
                renderDropdown(dropdown);
            }
        });

        row.appendChild(ref);
        row.appendChild(label);
        row.appendChild(del);

        row.addEventListener('click', () => {
            navigateTo(
                Math.floor(bm.verse_id / 1000000),
                bm.chapter
            );
            closeDropdown(dropdown);
        });

        list.appendChild(row);
    }
}

// ============================================================
// Visual state
// ============================================================

function updateButtonState(btn) {
    btn.classList.toggle('bookmarked', currentBookmark !== null);
    btn.setAttribute('aria-label', currentBookmark ? 'Remove bookmark' : 'Bookmark verse');
}
