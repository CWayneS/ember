// reader.js — Scripture rendering and navigation

import { getChapter, getBooks, getBook, setState, getNotesForVerse } from './db.js';

let currentBook    = 1;
let currentChapter = 1;

// ============================================================
// Init
// ============================================================

export function initReader() {
    document.getElementById('prev-chapter').addEventListener('click', prevChapter);
    document.getElementById('next-chapter').addEventListener('click', nextChapter);
    document.getElementById('book-selector-btn').addEventListener('click', toggleBookOverlay);

    // Close overlay when clicking outside of it
    document.addEventListener('click', (e) => {
        const overlay = document.getElementById('book-overlay');
        if (
            !overlay.classList.contains('hidden') &&
            !overlay.contains(e.target) &&
            e.target.id !== 'book-selector-btn'
        ) {
            overlay.classList.add('hidden');
            document.getElementById('chapter-grid').classList.add('hidden');
        }
    });
}

// ============================================================
// Navigation
// ============================================================

export function navigateTo(bookId, chapter) {
    currentBook    = bookId;
    currentChapter = chapter;

    const book   = getBook(bookId);
    const verses = getChapter(bookId, chapter);
    const container = document.getElementById('scripture-text');

    // Update reader header
    document.getElementById('current-location').textContent = `${book.name} ${chapter}`;
    document.getElementById('book-selector-btn').textContent = book.abbrev;

    // Render verses
    container.innerHTML = '';
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

        // Note indicator — appended after text so it trails the verse
        const notes = getNotesForVerse(v.id);
        if (notes.length > 0) {
            const indicator = document.createElement('span');
            indicator.className = 'note-indicator';
            indicator.title = `${notes.length} note(s)`;
            el.appendChild(indicator);
        }

        container.appendChild(el);
    }

    // Scroll reader back to top
    document.getElementById('reader-content').scrollTop = 0;

    // Persist location
    setState('currentBook', bookId);
    setState('currentChapter', chapter);
}

export function getCurrentLocation() {
    return { book: currentBook, chapter: currentChapter };
}

// ============================================================
// Prev / Next
// ============================================================

function prevChapter() {
    if (currentChapter > 1) {
        navigateTo(currentBook, currentChapter - 1);
    } else if (currentBook > 1) {
        const prevBook = getBook(currentBook - 1);
        navigateTo(currentBook - 1, prevBook.chapters);
    }
    // Genesis 1 → do nothing
}

function nextChapter() {
    const book = getBook(currentBook);
    if (currentChapter < book.chapters) {
        navigateTo(currentBook, currentChapter + 1);
    } else if (currentBook < 66) {
        navigateTo(currentBook + 1, 1);
    }
    // Revelation 22 → do nothing
}

// ============================================================
// Book / Chapter Overlay
// ============================================================

function toggleBookOverlay() {
    const overlay = document.getElementById('book-overlay');
    overlay.classList.toggle('hidden');

    if (!overlay.classList.contains('hidden')) {
        document.getElementById('chapter-grid').classList.add('hidden');
        renderBookList();
    }
}

function renderBookList() {
    const books     = getBooks();
    const container = document.getElementById('book-list');
    container.innerHTML = '';

    for (const book of books) {
        const btn = document.createElement('button');
        btn.className  = 'book-item';
        btn.textContent = book.abbrev;
        btn.title      = book.name;
        btn.addEventListener('click', () => showChapterGrid(book));
        container.appendChild(btn);
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
            navigateTo(book.id, c);
            document.getElementById('book-overlay').classList.add('hidden');
            grid.classList.add('hidden');
        });
        grid.appendChild(btn);
    }
}
