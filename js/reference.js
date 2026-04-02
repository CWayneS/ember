// reference.js — Reference panel: Info, Tags, Related, Language tabs

import {
    getBook, parseVerseId,
    getChapterVerseCount, getTopicsForVerse, getUserTagsForVerse,
    getNotesForVerse
} from './db.js';
import { openStudy, openTagView } from './panels.js';

const EMPTY_MSG = 'Select a verse to see reference material.';

export function refreshReference(verseId) {
    const parsed = parseVerseId(verseId);
    const book   = getBook(parsed.book);
    renderInfoTab(book, parsed.chapter, verseId);
}

export function initReference() {
    document.addEventListener('selection-changed', (e) => {
        const { verseIds } = e.detail;
        if (verseIds.length > 0) {
            renderAll(verseIds[0]);
        } else {
            clearAll();
        }
    });
}

function renderAll(verseId) {
    const parsed = parseVerseId(verseId);
    const book   = getBook(parsed.book);
    renderInfoTab(book, parsed.chapter, verseId);
    renderTagsTab(verseId);
    renderRelatedTab();
    renderLanguageTab();
}

function clearAll() {
    for (const id of ['info-tab', 'tags-tab', 'related-tab', 'language-tab']) {
        setPlaceholder(document.getElementById(id), EMPTY_MSG);
    }
}

// ============================================================
// Info tab — book metadata + chapter info
// ============================================================

function renderInfoTab(book, chapter, verseId) {
    const container = document.getElementById('info-tab');
    container.innerHTML = '';

    if (!book) {
        setPlaceholder(container, EMPTY_MSG);
        return;
    }

    const testament = book.testament === 'OT' ? 'Old Testament' : 'New Testament';

    // Book section
    const bookSection = document.createElement('div');
    bookSection.className = 'ref-section';

    const bookName = document.createElement('div');
    bookName.className   = 'ref-book-name';
    bookName.textContent = book.name;

    const bookMeta = document.createElement('div');
    bookMeta.className   = 'ref-meta';
    bookMeta.textContent = `${testament} · ${book.genre}`;

    bookSection.appendChild(bookName);
    bookSection.appendChild(bookMeta);
    container.appendChild(bookSection);

    // Chapter section
    const verseCount = getChapterVerseCount(book.id, chapter);

    const chapterSection = document.createElement('div');
    chapterSection.className = 'ref-section';

    const chapterLabel = document.createElement('div');
    chapterLabel.className   = 'ref-chapter-label';
    chapterLabel.textContent = `Chapter ${chapter}`;

    const chapterMeta = document.createElement('div');
    chapterMeta.className   = 'ref-meta';
    chapterMeta.textContent = `${verseCount} verse${verseCount !== 1 ? 's' : ''}`;

    chapterSection.appendChild(chapterLabel);
    chapterSection.appendChild(chapterMeta);
    container.appendChild(chapterSection);
    appendVerseNotes(container, verseId);
}

function appendVerseNotes(container, verseId) {
    const notes = getNotesForVerse(verseId);
    if (notes.length === 0) return;

    container.appendChild(refHeading('Notes'));

    for (const note of notes) {
        const card     = document.createElement('div');
        card.className = 'ref-note-card';

        const body     = document.createElement('div');
        body.className = 'ref-note-body';
        body.textContent = note.body || '(empty note)';
        card.appendChild(body);

        const meta     = document.createElement('div');
        meta.className = 'ref-note-meta';

        if (note.tags && note.tags.length > 0) {
            for (const tag of note.tags) {
                const chip     = document.createElement('span');
                chip.className = 'tag-chip';
                chip.textContent = tag.name;
                chip.addEventListener('click', () => openTagView(tag.name));
                meta.appendChild(chip);
            }
        }

        if (note.study_id) {
            const link     = document.createElement('button');
            link.className = 'ref-note-study-link';
            link.textContent = `${note.study_name || 'Study'} →`;
            link.addEventListener('click', () => openStudy(note.study_id, note.study_name || 'Study'));
            meta.appendChild(link);
        }

        card.appendChild(meta);
        container.appendChild(card);
    }
}

// ============================================================
// Tags tab — system topics + user tags
// ============================================================

function renderTagsTab(verseId) {
    const container = document.getElementById('tags-tab');
    container.innerHTML = '';

    const topics   = getTopicsForVerse(verseId);
    const userTags = getUserTagsForVerse(verseId);

    if (topics.length === 0 && userTags.length === 0) {
        setPlaceholder(container, 'No topics or tags for this verse.');
        return;
    }

    if (topics.length > 0) {
        container.appendChild(refHeading('Topics'));
        const chips = document.createElement('div');
        chips.className = 'ref-chips';
        for (const topic of topics) {
            const chip     = document.createElement('span');
            chip.className = 'tag-chip system-tag';
            chip.textContent = topic.name;
            chip.addEventListener('click', () => openTagView(topic.name));
            chips.appendChild(chip);
        }
        container.appendChild(chips);
    }

    if (userTags.length > 0) {
        container.appendChild(refHeading('Your Tags'));
        const chips = document.createElement('div');
        chips.className = 'ref-chips';
        for (const name of userTags) {
            const chip     = document.createElement('span');
            chip.className = 'tag-chip';
            chip.textContent = name;
            chip.addEventListener('click', () => openTagView(name));
            chips.appendChild(chip);
        }
        container.appendChild(chips);
    }
}

// ============================================================
// Related tab — placeholder
// ============================================================

function renderRelatedTab() {
    setPlaceholder(document.getElementById('related-tab'),
        'Cross-references will be available in Build 2.');
}

// ============================================================
// Language tab — placeholder
// ============================================================

function renderLanguageTab() {
    setPlaceholder(document.getElementById('language-tab'),
        'Original language tools will be available in a future build.');
}

// ============================================================
// Helpers
// ============================================================

function setPlaceholder(container, text) {
    container.innerHTML = '';
    const p     = document.createElement('p');
    p.className = 'ref-placeholder';
    p.textContent = text;
    container.appendChild(p);
}

function refHeading(text) {
    const h     = document.createElement('div');
    h.className = 'ref-section-heading';
    h.textContent = text;
    return h;
}
