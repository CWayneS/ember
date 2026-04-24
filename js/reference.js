// reference.js — Reference panel: Info, Tags, Related, Language tabs

import {
    getBook, parseVerseId,
    getChapterVerseCount, getTopicsForVerse, getUserTagsForVerse,
    getNotesForVerse, getCrossReferencesForVerse
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
    renderRelatedTab(verseId, book, parsed);
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
// Related tab — cross-references
// ============================================================

function renderRelatedTab(verseId, book, parsed) {
    const container = document.getElementById('related-tab');
    container.innerHTML = '';

    const label = `${book.name} ${parsed.chapter}:${parsed.verse}`;

    const header = document.createElement('div');
    header.className   = 'ref-related-header';
    header.textContent = `Related to ${label}`;
    container.appendChild(header);

    const topRefs = getCrossReferencesForVerse(verseId);

    if (topRefs.length === 0) {
        const msg = document.createElement('p');
        msg.className   = 'ref-placeholder';
        msg.textContent = 'No high-signal cross-references for this verse.';
        container.appendChild(msg);

        // Check for sub-floor refs and show hint + button if any exist.
        const anyRefs = getCrossReferencesForVerse(verseId, { showAll: true });
        if (anyRefs.length > 0) {
            const hint = document.createElement('p');
            hint.className   = 'ref-placeholder';
            hint.textContent = 'Tap Show all to see the long tail.';
            container.appendChild(hint);
            container.appendChild(makeShowAllBtn(() =>
                renderRelatedShowAll(container, verseId, book, parsed)
            ));
        }
        return;
    }

    container.appendChild(renderRefList(topRefs));
    container.appendChild(makeShowAllBtn(() =>
        renderRelatedShowAll(container, verseId, book, parsed)
    ));
}

function renderRelatedShowAll(container, verseId, book, parsed) {
    container.innerHTML = '';

    const label = `${book.name} ${parsed.chapter}:${parsed.verse}`;

    const header = document.createElement('div');
    header.className   = 'ref-related-header';
    header.textContent = `Related to ${label}`;
    container.appendChild(header);

    const allRefs = getCrossReferencesForVerse(verseId, { showAll: true });

    // Group by target book in canonical (book ID) order.
    const groups = new Map();
    for (const ref of allRefs) {
        const bookId = Math.floor(ref.target_start / 1_000_000);
        if (!groups.has(bookId)) {
            const b = getBook(bookId);
            groups.set(bookId, { name: b ? b.name : `Book ${bookId}`, refs: [] });
        }
        groups.get(bookId).refs.push(ref);
    }

    for (const [, { name, refs }] of [...groups].sort(([a], [b]) => a - b)) {
        const details = document.createElement('details');
        details.className = 'ref-crossref-group';
        details.open      = true;

        const summary = document.createElement('summary');
        summary.className   = 'ref-crossref-group-header';
        summary.textContent = `${name} (${refs.length})`;
        details.appendChild(summary);
        details.appendChild(renderRefList(refs));
        container.appendChild(details);
    }

    const showTopBtn = document.createElement('button');
    showTopBtn.className   = 'ref-show-all-btn';
    showTopBtn.textContent = 'Show top 25';
    showTopBtn.addEventListener('click', () => renderRelatedTab(verseId, book, parsed));
    container.appendChild(showTopBtn);
}

// Builds an <ul> of cross-reference buttons (click nav wired in next step).
function renderRefList(refs) {
    const list = document.createElement('ul');
    list.className = 'ref-crossref-list';
    for (const ref of refs) {
        const li  = document.createElement('li');
        li.className = 'ref-crossref-item';
        const btn = document.createElement('button');
        btn.className            = 'ref-crossref-btn';
        btn.textContent          = refLabel(ref.target_start, ref.target_end);
        btn.dataset.targetStart  = ref.target_start;
        btn.dataset.targetEnd    = ref.target_end ?? '';
        li.appendChild(btn);
        list.appendChild(li);
    }
    return list;
}

function makeShowAllBtn(onClick) {
    const btn = document.createElement('button');
    btn.className   = 'ref-show-all-btn';
    btn.textContent = 'Show all';
    btn.addEventListener('click', onClick);
    return btn;
}

// Converts BBCCCVVV pair to "Book Chapter:Verse" or "Book Chapter:Start–End".
function refLabel(startId, endId) {
    const s     = parseVerseId(startId);
    const sBook = getBook(s.book);
    const name  = sBook ? sBook.name : `Book ${s.book}`;

    if (!endId) return `${name} ${s.chapter}:${s.verse}`;

    const e = parseVerseId(endId);
    if (s.book === e.book && s.chapter === e.chapter) {
        return `${name} ${s.chapter}:${s.verse}–${e.verse}`;
    }
    if (s.book === e.book) {
        return `${name} ${s.chapter}:${s.verse}–${e.chapter}:${e.verse}`;
    }
    const eBook = getBook(e.book);
    const eName = eBook ? eBook.name : `Book ${e.book}`;
    return `${name} ${s.chapter}:${s.verse}–${eName} ${e.chapter}:${e.verse}`;
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
