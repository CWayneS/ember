// reader.js — Scripture rendering and navigation

import { getChapter, getBooks, getBook, setState, getNotesForVerse, getMarkupsForChapter } from './db.js';

// ============================================================
// State
// ============================================================

const panes = {
    a: { bookId: 1, chapter: 1 },
    b: { bookId: 1, chapter: 1 },
};

let activePaneId = 'a';
let splitActive  = false;
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
    for (const id of ['a', 'b']) {
        navEl(id, '.pane-book-btn').addEventListener('click', () => openBookOverlay(id));
        navEl(id, '.pane-prev').addEventListener('click', () => prevChapter(id));
        navEl(id, '.pane-next').addEventListener('click', () => nextChapter(id));
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
}

// ============================================================
// Public navigation API
// ============================================================

// External callers navigate the active pane.
export function navigateTo(bookId, chapter, highlightVerseId = null) {
    renderPane(activePaneId, bookId, chapter, highlightVerseId);
    if (activePaneId === 'a') {
        setState('currentBook', bookId);
        setState('currentChapter', chapter);
    }
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
}

export function getActivePaneId() {
    return activePaneId;
}

// ============================================================
// Render
// ============================================================

function renderPane(paneId, bookId, chapter, highlightVerseId = null) {
    panes[paneId].bookId  = bookId;
    panes[paneId].chapter = chapter;

    const book   = getBook(bookId);
    const verses = getChapter(bookId, chapter);
    const textEl = getTextEl(paneId);

    navEl(paneId, '.pane-book-btn').textContent = book.abbrev;
    navEl(paneId, '.pane-location').textContent = `${book.name} ${chapter}`;

    textEl.innerHTML = '';
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

        el.appendChild(numSpan);
        el.appendChild(textSpan);

        const notes = getNotesForVerse(v.id);
        if (notes.length > 0) {
            const indicator = document.createElement('span');
            indicator.className = 'note-indicator';
            indicator.title = `${notes.length} note(s)`;
            el.appendChild(indicator);
        }

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

export function refreshNoteDots() {
    for (const id of ['a', 'b']) {
        for (const verseEl of getTextEl(id).querySelectorAll('.verse')) {
            const verseId  = parseInt(verseEl.dataset.verseId);
            const notes    = getNotesForVerse(verseId);
            const existing = verseEl.querySelector('.note-indicator');
            if (notes.length > 0 && !existing) {
                const dot = document.createElement('span');
                dot.className = 'note-indicator';
                dot.title = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
                verseEl.appendChild(dot);
            } else if (notes.length === 0 && existing) {
                existing.remove();
            } else if (existing) {
                existing.title = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
            }
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
    if (paneId === 'a') {
        setState('currentBook', panes.a.bookId);
        setState('currentChapter', panes.a.chapter);
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
    if (paneId === 'a') {
        setState('currentBook', panes.a.bookId);
        setState('currentChapter', panes.a.chapter);
    }
}

// ============================================================
// Split toggle
// ============================================================

function toggleSplit() {
    splitActive = !splitActive;

    const paneB  = getPaneEl('b');
    const handle = document.getElementById('reader-split-handle');
    const btn    = document.getElementById('split-toggle-btn');
    const reader = document.getElementById('reader');

    paneB.classList.toggle('hidden', !splitActive);
    handle.classList.toggle('hidden', !splitActive);
    btn.classList.toggle('active', splitActive);
    reader.classList.toggle('split-active', splitActive);

    if (splitActive) {
        // Apply percentage flex so panes scale proportionally with container
        applyRatio(splitRatio);
        renderPane('b', panes.a.bookId, panes.a.chapter);
    } else {
        // Clear explicit flex so pane A fills the reader naturally
        getPaneEl('a').style.flex = '';
        getPaneEl('b').style.flex = '';
        if (activePaneId === 'b') setActivePane('a');
    }
}

// ============================================================
// Book / Chapter Overlay
// ============================================================

function openBookOverlay(paneId) {
    overlayPane = paneId;
    document.getElementById('book-overlay').classList.remove('hidden');
    document.getElementById('chapter-grid').classList.add('hidden');
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
            if (overlayPane === 'a') {
                setState('currentBook', book.id);
                setState('currentChapter', c);
            }
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
