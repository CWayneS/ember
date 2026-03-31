// tags.js — Tag autocomplete for note blocks

import { getAllTags } from './db.js';

// Called once on app init — currently a no-op but reserved for future work
// (e.g., preloading tag cache, registering global keyboard shortcuts).
export function initTags() {}

// ============================================================
// setupTagInput — wire autocomplete to a note block's tag input
//
// Parameters:
//   inputEl      — the <input type="text"> inside .note-block-tags
//   noteId       — integer note ID (used by the caller to persist tags)
//   chipsEl      — the .note-block-tags container (chips live here)
//   suggestionsEl — the .note-block-tag-suggestions div
// ============================================================

export function setupTagInput(inputEl, noteId, chipsEl, suggestionsEl) {
    let tags      = [];  // full tag list, loaded lazily
    let filtered  = [];  // current filtered suggestions
    let activeIdx = -1;  // keyboard cursor

    function loadTags() {
        if (tags.length === 0) {
            tags = getAllTags().map(t => t.name);
        }
    }

    function showSuggestions(query) {
        loadTags();
        const q = query.trim().toLowerCase();
        if (!q) {
            hideSuggestions();
            return;
        }

        // Exclude tags already on this note
        const existing = new Set(
            [...chipsEl.querySelectorAll('.tag-chip')].map(c => c.textContent.trim().toLowerCase())
        );
        filtered = tags.filter(t => t.includes(q) && !existing.has(t)).slice(0, 8);

        if (filtered.length === 0) {
            hideSuggestions();
            return;
        }

        activeIdx = -1;
        suggestionsEl.innerHTML = '';
        for (let i = 0; i < filtered.length; i++) {
            const item = document.createElement('div');
            item.className   = 'tag-suggestion-item';
            item.textContent = filtered[i];
            item.addEventListener('mousedown', (e) => {
                // mousedown fires before input blur — prevent blur from hiding list first
                e.preventDefault();
                selectSuggestion(filtered[i]);
            });
            suggestionsEl.appendChild(item);
        }

        suggestionsEl.classList.remove('hidden');
    }

    function hideSuggestions() {
        suggestionsEl.classList.add('hidden');
        suggestionsEl.innerHTML = '';
        filtered  = [];
        activeIdx = -1;
    }

    function updateActive() {
        [...suggestionsEl.querySelectorAll('.tag-suggestion-item')].forEach((el, i) => {
            el.classList.toggle('active', i === activeIdx);
        });
    }

    function selectSuggestion(name) {
        inputEl.value = name;
        hideSuggestions();
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }

    // Input handler — update suggestions on each keystroke
    inputEl.addEventListener('input', () => {
        showSuggestions(inputEl.value);
    });

    // Keyboard navigation
    inputEl.addEventListener('keydown', (e) => {
        if (!suggestionsEl.classList.contains('hidden')) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = Math.min(activeIdx + 1, filtered.length - 1);
                updateActive();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = Math.max(activeIdx - 1, -1);
                updateActive();
            } else if (e.key === 'Enter' && activeIdx >= 0) {
                // If a suggestion is highlighted, use it — the caller's Enter handler
                // will then persist it. We just fill the input and close suggestions.
                e.preventDefault();
                inputEl.value = filtered[activeIdx];
                hideSuggestions();
                // Re-dispatch so the notes.js Enter handler fires with the filled value
                inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                return;
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        }
    });

    // Hide on blur (unless user clicked a suggestion — handled by mousedown preventDefault)
    inputEl.addEventListener('blur', () => {
        hideSuggestions();
    });
}
