// search.js — Full-text search UI

import { search, parseVerseId, getBooks, getAllBookmarks } from './db.js';
import { navigateTo }                      from './reader.js';
import { openTagView, openStudy }           from './panels.js';

// ============================================================
// Init
// ============================================================

let _searchTimer = null;

export function initSearch() {
    const input   = document.getElementById('search-input');
    const overlay = document.getElementById('search-results');

    input.addEventListener('focus', () => {
        const q = input.value.trim();
        if (q.length >= 2) {
            runSearch(q);
        } else if (q.length === 0) {
            showOverlay(renderShortcuts());
        }
    });

    input.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        const q = input.value.trim();
        if (q.length === 0) {
            showOverlay(renderShortcuts());
            return;
        }
        if (q.length < 2) {
            hideOverlay();
            return;
        }
        _searchTimer = setTimeout(() => runSearch(q), 200);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideOverlay();
            input.blur();
        }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#search-bar') && !e.target.closest('#search-results')) {
            hideOverlay();
        }
    });
}

// ============================================================
// Search execution
// ============================================================

const PREFIXES = { 'b:': 'verses', 'n:': 'notes', 's:': 'studies', 't:': 'tags', 'k:': 'bookmarks' };

function runSearch(query) {
    let filter = null;
    let q      = query;
    for (const [prefix, key] of Object.entries(PREFIXES)) {
        if (query.toLowerCase().startsWith(prefix)) {
            filter = key;
            q      = query.slice(prefix.length).trim();
            break;
        }
    }

    if (q.length < (filter ? 1 : 2)) { showOverlay(renderShortcuts()); return; }

    // Bookmark search — JS-side filter, no FTS
    if (filter === 'bookmarks') {
        runBookmarkSearch(q);
        return;
    }

    const results = search(q);
    const show    = (key) => !filter || filter === key;

    const sections = [];
    if (show('verses')  && results.verses.length  > 0) sections.push(renderSection('Scripture', results.verses.map(renderVerseResult)));
    if (show('notes')   && results.notes.length   > 0) sections.push(renderSection('Notes',     results.notes.map(renderNoteResult)));
    if (show('studies') && results.studies.length > 0) sections.push(renderSection('Studies',   results.studies.map(renderStudyResult)));
    if (show('tags')    && results.tags.length    > 0) sections.push(renderSection('Tags',       results.tags.map(renderTagResult)));

    // Bookmarks — always included in unfiltered results, JS-side match
    if (!filter) {
        const bmMatches = matchBookmarks(q);
        if (bmMatches.length > 0) sections.push(renderSection('Bookmarks', bmMatches.map(renderBookmarkResult)));
    }

    if (sections.length === 0) { showOverlay(renderEmpty(query)); return; }

    const container = document.createElement('div');
    container.id = 'search-results-inner';
    sections.forEach(s => container.appendChild(s));
    showOverlay(container);
}

// ============================================================
// Renderers
// ============================================================

function renderVerseResult(verse) {
    const book    = getBooks().find(b => b.id === verse.book_id);
    const ref     = `${book?.name || ''} ${verse.chapter}:${verse.verse}`;
    const verseId = verse.id;

    const item     = document.createElement('div');
    item.className = 'search-result-item';

    const ref_el       = document.createElement('div');
    ref_el.className   = 'search-result-ref';
    ref_el.textContent = ref;

    const text_el       = document.createElement('div');
    text_el.className   = 'search-result-text';
    text_el.textContent = verse.text;

    item.appendChild(ref_el);
    item.appendChild(text_el);

    item.addEventListener('click', () => {
        navigateTo(verse.book_id, verse.chapter, verseId);
        hideOverlay();
        document.getElementById('search-input').value = '';
    });

    return item;
}

function renderNoteResult(note) {
    const item     = document.createElement('div');
    item.className = 'search-result-item';

    const label       = document.createElement('div');
    label.className   = 'search-result-ref';
    label.textContent = 'Note';

    if (note.anchors && note.anchors.length > 0) {
        const anchor = note.anchors[0];
        const parsed = parseVerseId(anchor.verse_start);
        const book   = getBooks().find(b => b.id === parsed.book);
        label.textContent = `${book?.name || 'Note'} ${parsed.chapter}:${parsed.verse}`;
    }

    const body_el       = document.createElement('div');
    body_el.className   = 'search-result-text';
    body_el.textContent = note.body;

    item.appendChild(label);
    item.appendChild(body_el);

    if (note.tags && note.tags.length > 0) {
        const chips_el     = document.createElement('div');
        chips_el.className = 'search-result-chips';
        for (const tag of note.tags) {
            const chip     = document.createElement('span');
            chip.className = 'tag-chip';
            chip.textContent = tag.name;
            chips_el.appendChild(chip);
        }
        item.appendChild(chips_el);
    }

    item.addEventListener('click', () => {
        if (note.anchors.length > 0) {
            const parsed = parseVerseId(note.anchors[0].verse_start);
            navigateTo(parsed.book, parsed.chapter, note.anchors[0].verse_start);
        }
        if (note.study_id && note.study_name) {
            openStudy(note.study_id, note.study_name);
        }
        hideOverlay();
        document.getElementById('search-input').value = '';
    });

    return item;
}

function renderStudyResult(study) {
    const item     = document.createElement('div');
    item.className = 'search-result-item';

    const label       = document.createElement('div');
    label.className   = 'search-result-ref';
    label.textContent = 'Study';

    const name_el       = document.createElement('div');
    name_el.className   = 'search-result-text';
    name_el.textContent = study.name;

    item.appendChild(label);
    item.appendChild(name_el);

    item.addEventListener('click', () => {
        openStudy(study.id, study.name);
        hideOverlay();
        document.getElementById('search-input').value = '';
    });

    return item;
}

function renderTagResult(tag) {
    const item     = document.createElement('div');
    item.className = 'search-result-item';

    const label       = document.createElement('div');
    label.className   = 'search-result-ref';
    label.textContent = 'Tag';

    const name_el       = document.createElement('div');
    name_el.className   = 'search-result-text';
    name_el.textContent = `#${tag.name}`;

    item.appendChild(label);
    item.appendChild(name_el);

    item.addEventListener('click', () => {
        openTagView(tag.name);
        hideOverlay();
        document.getElementById('search-input').value = '';
    });

    return item;
}

function matchBookmarks(q) {
    const lq = q.toLowerCase();
    return getAllBookmarks().filter(bm => {
        if (bm.label) return bm.label.toLowerCase().includes(lq);
        return `${bm.book_name} ${bm.chapter}:${bm.verse}`.toLowerCase().includes(lq);
    });
}

function runBookmarkSearch(q) {
    const matches = matchBookmarks(q);

    if (matches.length === 0) { showOverlay(renderEmpty(q)); return; }

    const container = document.createElement('div');
    container.id = 'search-results-inner';
    container.appendChild(renderSection('Bookmarks', matches.map(renderBookmarkResult)));
    showOverlay(container);
}

function renderBookmarkResult(bm) {
    const item     = document.createElement('div');
    item.className = 'search-result-item';

    const ref_el       = document.createElement('div');
    ref_el.className   = 'search-result-ref';
    ref_el.textContent = `${bm.book_name} ${bm.chapter}:${bm.verse}`;

    item.appendChild(ref_el);

    if (bm.label) {
        const label_el       = document.createElement('div');
        label_el.className   = 'search-result-text';
        label_el.textContent = bm.label;
        item.appendChild(label_el);
    }

    item.addEventListener('click', () => {
        navigateTo(Math.floor(bm.verse_id / 1000000), bm.chapter);
        hideOverlay();
        document.getElementById('search-input').value = '';
    });

    return item;
}

function renderEmpty(query) {
    const el       = document.createElement('div');
    el.className   = 'search-no-results';
    el.textContent = `No results for "${query}"`;
    return el;
}

function renderShortcuts() {
    const el       = document.createElement('div');
    el.className   = 'search-shortcuts';

    const heading       = document.createElement('div');
    heading.className   = 'search-shortcuts-heading';
    heading.textContent = 'Search prefixes';
    el.appendChild(heading);

    const prefixes = [
        { prefix: 'b:', desc: 'Scripture verses only' },
        { prefix: 'n:', desc: 'Notes only'            },
        { prefix: 's:', desc: 'Studies only'          },
        { prefix: 't:', desc: 'Tags only'             },
        { prefix: 'k:', desc: 'Bookmarks'             },
    ];

    for (const { prefix, desc } of prefixes) {
        const row       = document.createElement('div');
        row.className   = 'search-shortcut-row';

        const code       = document.createElement('span');
        code.className   = 'search-shortcut-prefix';
        code.textContent = prefix;

        const label       = document.createElement('span');
        label.className   = 'search-shortcut-desc';
        label.textContent = desc;

        row.appendChild(code);
        row.appendChild(label);
        row.addEventListener('click', () => {
            const input   = document.getElementById('search-input');
            input.value   = prefix;
            input.focus();
            // position cursor at end
            input.setSelectionRange(prefix.length, prefix.length);
        });
        el.appendChild(row);
    }

    return el;
}

function renderSection(title, items) {
    const section     = document.createElement('div');
    section.className = 'search-result-section';

    const heading       = document.createElement('div');
    heading.className   = 'search-result-heading';
    heading.textContent = title;
    section.appendChild(heading);

    for (const item of items) {
        section.appendChild(item);
    }
    return section;
}

// ============================================================
// Overlay helpers
// ============================================================

function showOverlay(content) {
    const overlay  = document.getElementById('search-results');
    overlay.innerHTML = '';
    overlay.appendChild(content);
    overlay.classList.remove('hidden');
}

function hideOverlay() {
    const overlay = document.getElementById('search-results');
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
}
