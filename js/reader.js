// reader.js — Scripture rendering and navigation

import { getChapter, getBooks, getBook, getTranslations, getTranslationDb, getNotesForVerse, getMarkupsForChapter, getBookmarksForChapter } from './db.js';

// ============================================================
// Per-pane state — persisted to localStorage
// ============================================================

const PANE_KEYS = {
    a: 'ember.pane.left.state',
    b: 'ember.pane.right.state',
};

const DEFAULT_PANE_STATE = {
    translationId:  1,
    bookId:         1,
    chapter:        1,
    verse:          1,
    scrollPosition: 0,
};

const panes = {
    a: { ...DEFAULT_PANE_STATE },
    b: { ...DEFAULT_PANE_STATE },
};

function loadPaneState(paneId) {
    try {
        const raw = localStorage.getItem(PANE_KEYS[paneId]);
        if (raw) {
            const saved = JSON.parse(raw);
            panes[paneId] = {
                translationId:  saved.translationId  ?? DEFAULT_PANE_STATE.translationId,
                bookId:         saved.bookId         ?? DEFAULT_PANE_STATE.bookId,
                chapter:        saved.chapter        ?? DEFAULT_PANE_STATE.chapter,
                verse:          saved.verse          ?? DEFAULT_PANE_STATE.verse,
                scrollPosition: saved.scrollPosition ?? DEFAULT_PANE_STATE.scrollPosition,
            };
        }
    } catch (_) {
        // Corrupt entry — keep defaults
    }
}

function savePaneState(paneId) {
    try {
        localStorage.setItem(PANE_KEYS[paneId], JSON.stringify(panes[paneId]));
    } catch (_) {}
}

// Translations list — loaded once on first use, never changes during a session.
let _translationsCache = null;
function getTranslationsList() {
    if (!_translationsCache) _translationsCache = getTranslations();
    return _translationsCache;
}

// ============================================================
// Reader-level state
// ============================================================

let activePaneId = 'a';
let splitActive  = localStorage.getItem('ember.reader.split') === 'true';
let splitRatio   = 50;    // pane A percentage width when split
let overlayPane  = 'a';   // which pane triggered the book overlay

// ============================================================
// DOM helpers
// ============================================================

function getPaneEl(id)    { return document.getElementById(`reader-pane-${id}`); }
function getTextEl(id)    { return getPaneEl(id).querySelector('.scripture-text'); }
function getContentEl(id) { return getPaneEl(id).querySelector('.pane-content'); }
function navEl(id, sel)   { return getPaneEl(id).querySelector(sel); }

// ============================================================
// Init
// ============================================================

export function initReader() {
    // Restore per-pane state from localStorage before first render.
    loadPaneState('a');
    loadPaneState('b');

    for (const id of ['a', 'b']) {
        navEl(id, '.pane-book-btn').addEventListener('click', () => openBookOverlay(id));
        navEl(id, '.pane-prev').addEventListener('click', () => prevChapter(id));
        navEl(id, '.pane-next').addEventListener('click', () => nextChapter(id));

        // Any click within a pane makes it the active pane.
        getPaneEl(id).addEventListener('click', () => setActivePane(id));
    }

    document.getElementById('split-toggle-btn').addEventListener('click', toggleSplit);

    document.addEventListener('click', (e) => {
        const overlay = document.getElementById('book-overlay');
        if (
            !overlay.classList.contains('hidden') &&
            !overlay.contains(e.target) &&
            !e.target.closest('.pane-book-btn')
        ) {
            closeBookOverlay();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeBookOverlay();
    });

    initSplitResize();

    // Throttled scroll-position save — 200 ms after the user stops scrolling.
    const scrollTimers = {};
    for (const id of ['a', 'b']) {
        getContentEl(id).addEventListener('scroll', () => {
            clearTimeout(scrollTimers[id]);
            scrollTimers[id] = setTimeout(() => {
                panes[id].scrollPosition = getContentEl(id).scrollTop;
                savePaneState(id);
            }, 200);
        });
    }

    // Initial render of pane A. Capture saved scroll before renderPane resets it.
    const savedScrollA = panes.a.scrollPosition;
    renderPane('a', panes.a.bookId, panes.a.chapter);
    requestAnimationFrame(() => {
        getContentEl('a').scrollTop = savedScrollA;
    });

    // Restore split-view state from localStorage.
    if (splitActive) {
        const paneB  = getPaneEl('b');
        const handle = document.getElementById('reader-split-handle');
        const btn    = document.getElementById('split-toggle-btn');
        const reader = document.getElementById('reader');

        paneB.classList.remove('hidden');
        handle.classList.remove('hidden');
        btn.classList.add('active');
        reader.classList.add('split-active');

        applyRatio(splitRatio);
        const savedScrollB = panes.b.scrollPosition;
        renderPane('b', panes.b.bookId, panes.b.chapter);
        requestAnimationFrame(() => {
            getContentEl('b').scrollTop = savedScrollB;
        });
    }
}

// ============================================================
// Public navigation API
// ============================================================

// External callers navigate the active pane.
export function navigateTo(bookId, chapter, highlightVerseId = null) {
    renderPane(activePaneId, bookId, chapter, highlightVerseId);
}

export function getCurrentLocation() {
    return { book: panes[activePaneId].bookId, chapter: panes[activePaneId].chapter };
}

// ============================================================
// Active pane
// ============================================================

export function setActivePane(paneId) {
    if (paneId === activePaneId) return;
    activePaneId = paneId;
    getPaneEl('a').classList.toggle('active', paneId === 'a');
    getPaneEl('b').classList.toggle('active', paneId === 'b');
    document.dispatchEvent(new CustomEvent('pane-changed', { detail: { paneId } }));
}

export function getActivePaneId() {
    return activePaneId;
}

// Returns the translationId of the currently active pane.
// Used by search.js and any other module that needs to read Scripture
// in whatever translation the user is currently looking at.
export function getActivePaneTranslationId() {
    return panes[activePaneId].translationId;
}

// Returns the abbreviation string (e.g. "KJV") for the active pane's translation.
export function getActivePaneTranslationAbbrev() {
    const tid = panes[activePaneId].translationId;
    const t   = getTranslationsList().find(t => t.id === tid);
    return t ? t.abbreviation : 'KJV';
}

// ============================================================
// Render
// ============================================================

function renderPane(paneId, bookId, chapter, highlightVerseId = null) {
    panes[paneId].bookId         = bookId;
    panes[paneId].chapter        = chapter;
    panes[paneId].scrollPosition = 0;  // reset on navigation; scroll listener updates it
    savePaneState(paneId);
    updateTranslationLabel(paneId);

    const book   = getBook(bookId);
    const verses = getChapter(panes[paneId].translationId, bookId, chapter);
    const textEl = getTextEl(paneId);

    navEl(paneId, '.pane-book-btn').textContent = book.abbrev;
    navEl(paneId, '.pane-location').textContent = `${book.name} ${chapter}`;

    textEl.innerHTML = '';
    const chapterBookmarks = getBookmarksForChapter(bookId, chapter);

    for (const v of verses) {
        const el = document.createElement('div');
        el.className = 'verse';
        el.dataset.verseId = v.id;

        const numSpan = document.createElement('span');
        numSpan.className = 'verse-number';
        numSpan.textContent = v.verse;

        const textSpan = document.createElement('span');
        textSpan.className = 'verse-text';
        textSpan.textContent = v.text;

        const notes    = getNotesForVerse(v.id);
        const bookmark = chapterBookmarks.get(v.id);

        if (notes.length > 0 || bookmark) {
            const indicators = document.createElement('span');
            indicators.className = 'verse-indicators';

            if (notes.length > 0) {
                const dot = document.createElement('span');
                dot.className = 'note-indicator';
                dot.title = notes.length === 1 ? '1 note' : `${notes.length} notes`;
                indicators.appendChild(dot);
            }

            if (bookmark) {
                const dot = document.createElement('span');
                dot.className = 'bookmark-indicator';
                dot.title = bookmark.label || 'Bookmarked';
                indicators.appendChild(dot);
                el.classList.add('verse-bookmarked');
            }

            numSpan.appendChild(indicators);
        }

        el.appendChild(numSpan);
        el.appendChild(textSpan);
        textEl.appendChild(el);
    }

    // Apply markup classes to verse elements (always; visibility gated by body.markup-mode-on).
    const bookChapter = bookId * 1000 + chapter;
    const markups     = getMarkupsForChapter(bookChapter);
    for (const verseEl of textEl.querySelectorAll('.verse')) {
        const verseId = parseInt(verseEl.dataset.verseId);
        for (const markup of markups) {
            const end = markup.verse_end ?? markup.verse_start;
            if (markup.verse_start <= verseId && verseId <= end) {
                applyMarkupClass(verseEl, markup);
            }
        }
    }

    if (highlightVerseId) {
        const target = textEl.querySelector(`[data-verse-id="${highlightVerseId}"]`);
        if (target) {
            target.scrollIntoView({ block: 'center' });
            target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
    } else {
        getContentEl(paneId).scrollTop = 0;
    }
}

// ============================================================
// Note dots refresh — updates both panes
// ============================================================

// Clears and re-applies markup classes on all rendered verse elements in both
// panes. Called after any markup create/delete so visuals stay in sync with DB.
export function refreshMarkupClasses() {
    for (const paneId of ['a', 'b']) {
        const textEl      = getTextEl(paneId);
        const { bookId, chapter } = panes[paneId];

        // Strip all existing markup classes before re-applying.
        for (const verseEl of textEl.querySelectorAll('.verse')) {
            for (const cls of [...verseEl.classList]) {
                if (cls.startsWith('markup-')) verseEl.classList.remove(cls);
            }
        }

        const bookChapter = bookId * 1000 + chapter;
        const markups     = getMarkupsForChapter(bookChapter);
        for (const verseEl of textEl.querySelectorAll('.verse')) {
            const verseId = parseInt(verseEl.dataset.verseId);
            for (const markup of markups) {
                const end = markup.verse_end ?? markup.verse_start;
                if (markup.verse_start <= verseId && verseId <= end) {
                    applyMarkupClass(verseEl, markup);
                }
            }
        }
    }
}

export function refreshVerseIndicators() {
    for (const paneId of ['a', 'b']) {
        const { bookId, chapter } = panes[paneId];
        const bookmarks = getBookmarksForChapter(bookId, chapter);

        for (const verseEl of getTextEl(paneId).querySelectorAll('.verse')) {
            const verseId  = parseInt(verseEl.dataset.verseId);
            const notes    = getNotesForVerse(verseId);
            const bookmark = bookmarks.get(verseId);
            const numSpan  = verseEl.querySelector('.verse-number');

            numSpan.querySelector('.verse-indicators')?.remove();
            verseEl.classList.remove('verse-bookmarked');

            if (notes.length === 0 && !bookmark) continue;

            const indicators = document.createElement('span');
            indicators.className = 'verse-indicators';

            if (notes.length > 0) {
                const dot = document.createElement('span');
                dot.className = 'note-indicator';
                dot.title = notes.length === 1 ? '1 note' : `${notes.length} notes`;
                indicators.appendChild(dot);
            }

            if (bookmark) {
                const dot = document.createElement('span');
                dot.className = 'bookmark-indicator';
                dot.title = bookmark.label || 'Bookmarked';
                indicators.appendChild(dot);
                verseEl.classList.add('verse-bookmarked');
            }

            numSpan.appendChild(indicators);
        }
    }
}

// ============================================================
// Prev / Next
// ============================================================

function prevChapter(paneId) {
    const { bookId, chapter } = panes[paneId];
    if (chapter > 1) {
        renderPane(paneId, bookId, chapter - 1);
    } else if (bookId > 1) {
        const prevBook = getBook(bookId - 1);
        renderPane(paneId, bookId - 1, prevBook.chapters);
    }
}

function nextChapter(paneId) {
    const { bookId, chapter } = panes[paneId];
    const book = getBook(bookId);
    if (chapter < book.chapters) {
        renderPane(paneId, bookId, chapter + 1);
    } else if (bookId < 66) {
        renderPane(paneId, bookId + 1, 1);
    }
}

// ============================================================
// Split toggle
// ============================================================

function toggleSplit() {
    splitActive = !splitActive;
    localStorage.setItem('ember.reader.split', String(splitActive));

    const paneB  = getPaneEl('b');
    const handle = document.getElementById('reader-split-handle');
    const btn    = document.getElementById('split-toggle-btn');
    const reader = document.getElementById('reader');

    paneB.classList.toggle('hidden', !splitActive);
    handle.classList.toggle('hidden', !splitActive);
    btn.classList.toggle('active', splitActive);
    reader.classList.toggle('split-active', splitActive);

    if (splitActive) {
        applyRatio(splitRatio);
        const savedScrollB = panes.b.scrollPosition;
        renderPane('b', panes.b.bookId, panes.b.chapter);
        requestAnimationFrame(() => {
            getContentEl('b').scrollTop = savedScrollB;
        });
    } else {
        // Clear explicit flex so pane A fills the reader naturally
        getPaneEl('a').style.flex = '';
        getPaneEl('b').style.flex = '';
        if (activePaneId === 'b') setActivePane('a');
    }
}

// ============================================================
// Translation selection
// ============================================================

// Updates the .translation-label span in the pane nav.
function updateTranslationLabel(paneId) {
    const tid    = panes[paneId].translationId;
    const t      = getTranslationsList().find(t => t.id === tid);
    const abbrev = t ? t.abbreviation : 'KJV';
    navEl(paneId, '.translation-label').textContent = abbrev;
}

// Renders the horizontal translation row at the top of the book overlay.
// Highlights the button matching the pane's current translationId.
function renderTranslationRow(paneId) {
    const container = document.getElementById('translation-row');
    container.innerHTML = '';
    const activeTid = panes[paneId].translationId;

    for (const t of getTranslationsList()) {
        const btn       = document.createElement('button');
        btn.className   = 'translation-btn' + (t.id === activeTid ? ' active' : '');
        btn.textContent = t.abbreviation;
        btn.title       = t.name;
        btn.addEventListener('click', () => {
            if (t.id !== panes[paneId].translationId) {
                switchPaneTranslation(paneId, t.id);
            }
        });
        container.appendChild(btn);
    }
}

// Validates that (bookId, chapter) exists in the target translation.
// Falls back to chapter 1 if the chapter is missing entirely.
// (Shared English versification means this should never trigger for the
//  six bundled translations, but the logic is here as insurance.)
function findValidReference(translationId, bookId, chapter) {
    const tdb = getTranslationDb(translationId);
    if (!tdb) return { bookId, chapter };

    const chapterExists = tdb.exec(
        'SELECT 1 FROM verses WHERE book = ? AND chapter = ? LIMIT 1',
        [bookId, chapter]
    )[0]?.values.length > 0;

    if (chapterExists) return { bookId, chapter };

    // Chapter is missing — fall back to chapter 1 verse 1.
    return { bookId, chapter: 1 };
}

// Switches the active translation for a pane, preserving the passage reference.
// The book picker stays open so the user can also navigate to a new book.
function switchPaneTranslation(paneId, translationId) {
    const { bookId, chapter } = panes[paneId];
    const target = findValidReference(translationId, bookId, chapter);
    panes[paneId].translationId = translationId;
    renderPane(paneId, target.bookId, target.chapter);
    // Re-render the row so the active highlight updates without reopening.
    renderTranslationRow(paneId);
}

// ============================================================
// Book / Chapter Overlay
// ============================================================

function openBookOverlay(paneId) {
    overlayPane = paneId;
    document.getElementById('book-overlay').classList.remove('hidden');
    document.getElementById('chapter-grid').classList.add('hidden');
    renderTranslationRow(paneId);
    renderBookList();
}

function closeBookOverlay() {
    document.getElementById('book-overlay').classList.add('hidden');
    document.getElementById('chapter-grid').classList.add('hidden');
}

const GENRE_LABELS = {
    law:         'Law',
    history:     'History',
    poetry:      'Poetry & Wisdom',
    prophecy:    'Prophecy',
    gospel:      'Gospels',
    epistle:     'Epistles',
    apocalyptic: 'Apocalyptic',
};

function renderBookList() {
    const books     = getBooks();
    const container = document.getElementById('book-list');
    container.innerHTML = '';

    const groups = [];
    let lastKey  = null;
    for (const book of books) {
        const key = `${book.testament}:${book.genre}`;
        if (key !== lastKey) {
            groups.push({ testament: book.testament, genre: book.genre, books: [] });
            lastKey = key;
        }
        groups[groups.length - 1].books.push(book);
    }

    let lastTestament = null;
    for (const group of groups) {
        if (group.testament !== lastTestament) {
            const divider     = document.createElement('div');
            divider.className = 'book-testament-divider';
            divider.textContent = group.testament === 'OT' ? 'Old Testament' : 'New Testament';
            container.appendChild(divider);
            lastTestament = group.testament;
        }

        const heading     = document.createElement('div');
        heading.className = 'book-genre-heading';
        heading.textContent = GENRE_LABELS[group.genre] || group.genre;
        container.appendChild(heading);

        const row     = document.createElement('div');
        row.className = 'book-genre-row';
        for (const book of group.books) {
            const btn = document.createElement('button');
            btn.className   = 'book-item';
            btn.textContent = book.abbrev;
            btn.title       = book.name;
            btn.addEventListener('click', () => showChapterGrid(book));
            row.appendChild(btn);
        }
        container.appendChild(row);
    }
}

function showChapterGrid(book) {
    const grid = document.getElementById('chapter-grid');
    grid.innerHTML = '';
    grid.classList.remove('hidden');

    for (let c = 1; c <= book.chapters; c++) {
        const btn = document.createElement('button');
        btn.className   = 'chapter-item';
        btn.textContent = c;
        btn.addEventListener('click', () => {
            renderPane(overlayPane, book.id, c);
            closeBookOverlay();
        });
        grid.appendChild(btn);
    }
}

// ============================================================
// Split resize handle
// ============================================================

function initSplitResize() {
    const handle = document.getElementById('reader-split-handle');
    const paneA  = getPaneEl('a');
    const body   = document.getElementById('reader-body');

    let dragging   = false;
    let startX     = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
        if (!splitActive) return;
        dragging   = true;
        startX     = e.clientX;
        startWidth = paneA.getBoundingClientRect().width;
        document.body.style.cursor     = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const delta      = e.clientX - startX;
        const totalWidth = body.getBoundingClientRect().width;
        const newWidth   = clamp(startWidth + delta, 200, totalWidth - 200);
        splitRatio = newWidth / totalWidth * 100;
        applyRatio(splitRatio);
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
    });
}

function applyRatio(ratio) {
    const pct = ratio.toFixed(2);
    getPaneEl('a').style.flex = `1 1 ${pct}%`;
    getPaneEl('b').style.flex = `1 1 ${(100 - parseFloat(pct)).toFixed(2)}%`;
}

// Applies the appropriate CSS class(es) to a verse element for one markup row.
// Classes are always applied; body.markup-mode-on gates whether they're visible.
function applyMarkupClass(verseEl, markup) {
    if (markup.type === 'highlight') {
        verseEl.classList.add(`markup-highlight-${markup.color}`);
    } else if (markup.type === 'underline') {
        verseEl.classList.add(`markup-underline-${markup.color}`);
    } else if (markup.type === 'circle') {
        verseEl.classList.add('markup-circle');
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
