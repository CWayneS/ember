// search.js — Full-text search UI

import { search, parseVerseId, formatReference, getAllBookmarks } from './db.js';
import { navigateTo, getActivePaneTranslationId, getActivePaneTranslationAbbrev } from './reader.js';
import { openTagView, openStudy }           from './panels.js';
import { loadManual, getHelpSections, openHelpGuide } from './help-guide.js';

// ============================================================
// Init
// ============================================================

let _searchTimer = null;

export function initSearch() {
    const input   = document.getElementById('search-input');
    const overlay = document.getElementById('search-results');

    input.addEventListener('focus', () => {
        // Help in search reads the manual's sections synchronously; fetch it
        // (precached, so local) the first time the bar gets focus.
        loadManual().catch(() => {});
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

const PREFIXES = { 'b:': 'verses', 'n:': 'notes', 's:': 'studies', 't:': 'tags', 'k:': 'bookmarks', 'h:': 'help' };

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

    // Help search — the manual's sections, JS-side, no FTS
    if (filter === 'help') {
        const matches = matchHelpSections(q, { body: true, limit: 10 });
        if (matches.length === 0) { showOverlay(renderEmpty(query)); return; }
        const container = document.createElement('div');
        container.id = 'search-results-inner';
        container.appendChild(renderSection('Help', matches.map(renderHelpResult)));
        showOverlay(container);
        return;
    }

    const translationId    = getActivePaneTranslationId();
    const translationAbbrev = getActivePaneTranslationAbbrev();
    const results = search(q, translationId);
    const show    = (key) => !filter || filter === key;

    const sections = [];
    if (show('verses')  && results.verses.length  > 0) sections.push(renderSection(`Scripture · ${translationAbbrev}`, results.verses.map(renderVerseResult)));
    if (show('notes')   && results.notes.length   > 0) sections.push(renderSection('Notes',     results.notes.map(renderNoteResult)));
    if (show('studies') && results.studies.length > 0) sections.push(renderSection('Studies',   results.studies.map(renderStudyResult)));
    if (show('tags')    && results.tags.length    > 0) sections.push(renderSection('Tags',       results.tags.map(renderTagResult)));

    // Bookmarks — always included in unfiltered results, JS-side match
    if (!filter) {
        const bmMatches = matchBookmarks(q);
        if (bmMatches.length > 0) sections.push(renderSection('Bookmarks', bmMatches.map(renderBookmarkResult)));

        // Help — headings only here, so a word in the manual's examples
        // (the Search section's "love") doesn't bring up Help for it.
        const helpMatches = matchHelpSections(q, { body: false, limit: 3 });
        if (helpMatches.length > 0) sections.push(renderSection('Help', helpMatches.map(renderHelpResult)));
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
    const verseId = verse.id;

    const item     = document.createElement('div');
    item.className = 'search-result-item';

    const ref_el       = document.createElement('div');
    ref_el.className   = 'search-result-ref';
    ref_el.textContent = formatReference(verseId);

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
        label.textContent = formatReference(note.anchors[0].verse_start);
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
        return formatReference(bm.verse_id).toLowerCase().includes(lq);
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
    ref_el.textContent = formatReference(bm.verse_id);

    item.appendChild(ref_el);

    if (bm.label) {
        const label_el       = document.createElement('div');
        label_el.className   = 'search-result-text';
        label_el.textContent = bm.label;
        item.appendChild(label_el);
    }

    item.addEventListener('click', () => {
        const { book, chapter } = parseVerseId(bm.verse_id);
        navigateTo(book, chapter, bm.verse_id);
        hideOverlay();
        document.getElementById('search-input').value = '';
    });

    return item;
}

// ============================================================
// Help — the manual's sections (docs/Help_Guide_Spec.md, Item 6)
// ============================================================

// Lowercase words with apostrophes dropped, so "Strong's" is one word,
// "strongs", that "strong" and "strong's" both start.
function helpWords(text) {
    return text.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const _helpWordCache = new WeakMap();
function sectionWords(section) {
    let words = _helpWordCache.get(section);
    if (!words) {
        words = { heading: helpWords(section.title), body: helpWords(section.text) };
        _helpWordCache.set(section, words);
    }
    return words;
}

// Every query word must start a word in the heading (or, with body, a word
// in the heading or the section's text). Heading matches rank first.
function matchHelpSections(query, { body, limit }) {
    const sections = getHelpSections();
    if (!sections) return [];
    const queryWords = helpWords(query);
    if (queryWords.length === 0) return [];
    const startsSome = (words, queryWord) => words.some(word => word.startsWith(queryWord));

    const headingMatches = [];
    const bodyMatches = [];
    for (const section of sections) {
        const words = sectionWords(section);
        if (queryWords.every(queryWord => startsSome(words.heading, queryWord))) {
            headingMatches.push(section);
        } else if (body && queryWords.every(queryWord =>
            startsSome(words.heading, queryWord) || startsSome(words.body, queryWord))) {
            bodyMatches.push(section);
        }
    }
    return headingMatches.concat(bodyMatches).slice(0, limit);
}

function firstSentence(text) {
    const match = /^.*?[.!?](?=\s|$)/.exec(text);
    return match ? match[0] : text;
}

function renderHelpResult(section) {
    const item     = document.createElement('div');
    item.className = 'search-result-item search-result-help';

    const title_el       = document.createElement('div');
    title_el.className   = 'search-result-ref';
    title_el.textContent = section.title;
    item.appendChild(title_el);

    if (section.path.length > 0) {
        const parent_el       = document.createElement('div');
        parent_el.className   = 'search-result-context';
        parent_el.textContent = section.path.join(' › ');
        item.appendChild(parent_el);
    }

    const text_el       = document.createElement('div');
    text_el.className   = 'search-result-text';
    text_el.textContent = firstSentence(section.text);
    item.appendChild(text_el);

    item.addEventListener('click', () => {
        hideOverlay();
        const input = document.getElementById('search-input');
        input.value = '';
        input.blur();
        openHelpGuide(section.slug);
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
        { prefix: 'k:', desc: 'Bookmarks only'        },
        { prefix: 'h:', desc: 'Help only'             },
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
