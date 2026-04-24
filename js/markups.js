// markups.js — Markup button state, tool strip UI, and apply/remove logic

import { getExistingMarkup, createMarkup, deleteMarkup } from './db.js';
import { getSelectedVerses } from './selection.js';
import { refreshMarkupClasses } from './reader.js';

const STORAGE_KEY = 'ember.markup_button.expanded';

let expanded = false;

export function initMarkups() {
    const btn   = document.getElementById('markup-btn');
    const strip = document.getElementById('markup-strip');
    if (!btn || !strip) return;

    // Restore persisted state
    expanded = localStorage.getItem(STORAGE_KEY) === 'true';
    applyState(btn, strip);

    btn.addEventListener('click', () => {
        expanded = !expanded;
        localStorage.setItem(STORAGE_KEY, String(expanded));
        applyState(btn, strip);
    });

    // Wire tool clicks
    strip.querySelectorAll('.markup-tool').forEach(tool => {
        tool.addEventListener('click', () => {
            handleToolClick(tool.dataset.type, tool.dataset.color);
        });
    });
}

function handleToolClick(type, color) {
    if (!expanded) return;

    const verses = getSelectedVerses();
    if (verses.length === 0) return;

    const verseStart = Math.min(...verses);
    const verseEnd   = verses.length > 1 ? Math.max(...verses) : null;

    // getExistingMarkup matches on (verseStart, verseEnd, type) — returns any
    // markup of this type on the exact range, regardless of color.
    const existing = getExistingMarkup(verseStart, verseEnd, type);

    if (existing) {
        if (existing.color === color) {
            // Same type + same color + same range → toggle off.
            deleteMarkup(existing.id);
        } else {
            // Same type, different color (highlight or underline) → replace.
            deleteMarkup(existing.id);
            createMarkup(verseStart, verseEnd, type, color);
        }
    } else {
        createMarkup(verseStart, verseEnd, type, color);
    }

    refreshMarkupClasses();
}

function applyState(btn, strip) {
    btn.classList.toggle('active', expanded);
    strip.classList.toggle('hidden', !expanded);
    // Gate markup visibility via a body class so CSS can show/hide all markup
    // styles without re-rendering verses. Classes on verses are always present.
    document.body.classList.toggle('markup-mode-on', expanded);
}

// Other modules can query whether markup mode is active.
export function isMarkupModeActive() {
    return expanded;
}
