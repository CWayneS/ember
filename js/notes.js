// notes.js — Study document with inline note editing

import {
    saveNote, updateNote, deleteNote,
    getNotesForStudy, getNotesForVerse, getStudies,
    parseVerseId, getBooks, createStudy, deleteStudy,
    addNoteTag, removeNoteTag
} from './db.js';
import { refreshNoteDots }                          from './reader.js';
import { openStudy, closeStudy, getActiveStudyId, switchReferenceTab } from './panels.js';

let currentVerseIds = [];       // verses currently selected in the reader
let _books          = null;     // lazy cache — avoids re-querying 66 books per render
const saveTimers    = new Map(); // noteId → debounce timer

// ============================================================
// Init
// ============================================================

export function initNotes() {
    document.addEventListener('selection-changed', (e) => {
        currentVerseIds = e.detail.verseIds;
        if (currentVerseIds.length > 0) {
            renderInfoTab(currentVerseIds[0]);
        } else {
            clearInfoTab();
        }
    });

    document.addEventListener('study-changed', (e) => {
        const { studyId } = e.detail;
        if (studyId === 'all') {
            renderAllStudies();
        } else {
            renderStudyDocument(studyId);
        }
    });
}

// ============================================================
// Study document view
// ============================================================

function renderStudyDocument(studyId) {
    const container = document.getElementById('notes-active-view');
    const notes     = getNotesForStudy(studyId);

    container.innerHTML = '';

    if (notes.length === 0) {
        const empty = document.createElement('p');
        empty.className   = 'notes-empty';
        empty.textContent = 'No notes yet. Select a verse and click Add Note.';
        container.appendChild(empty);
    } else {
        for (const note of notes) {
            container.appendChild(buildNoteBlock(note, studyId));
        }
    }

    container.appendChild(buildAddNoteButton(studyId));
}

function buildNoteBlock(note, studyId) {
    const block = document.createElement('div');
    block.className      = 'note-block';
    block.dataset.noteId = note.id;

    // Verse anchor label
    if (note.anchors && note.anchors.length > 0) {
        const anchor     = document.createElement('div');
        anchor.className = 'note-block-anchor';
        anchor.textContent = formatAnchor(note.anchors[0]);
        block.appendChild(anchor);
    }

    // Body — contenteditable, click anywhere to edit, autosave on input
    const body = document.createElement('div');
    body.className       = 'note-block-body';
    body.contentEditable = 'true';
    body.setAttribute('data-placeholder', 'Write your note…');
    body.textContent     = note.body;
    body.addEventListener('input', () => scheduleSave(note.id, body));
    block.appendChild(body);

    // Footer: tags + delete button
    const footer     = document.createElement('div');
    footer.className = 'note-block-footer';

    footer.appendChild(buildTagsArea(note));
    footer.appendChild(buildDeleteButton(note.id, studyId));

    block.appendChild(footer);
    return block;
}

function buildTagsArea(note) {
    const container     = document.createElement('div');
    container.className = 'note-block-tags';

    for (const tag of note.tags) {
        container.appendChild(makeTagChip(tag.name, note.id, container));
    }

    // Tag input — Enter to add, autocomplete wired by tags.js
    const input     = document.createElement('input');
    input.type      = 'text';
    input.className = 'note-block-tag-input';
    input.setAttribute('placeholder', 'Add tag…');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            e.preventDefault();
            const name = input.value.trim();
            addNoteTag(note.id, name);
            container.insertBefore(makeTagChip(name, note.id, container), input);
            input.value = '';
        }
    });

    // Suggestions container — wired by tags.js when it initialises
    const suggestions     = document.createElement('div');
    suggestions.className = 'note-block-tag-suggestions hidden';

    container.appendChild(input);
    container.appendChild(suggestions);

    // Let tags.js attach autocomplete when it is ready
    import('./tags.js').then(({ setupTagInput }) => {
        setupTagInput(input, note.id, container, suggestions);
    }).catch(() => { /* tags.js not yet available — plain input works */ });

    return container;
}

function makeTagChip(name, noteId, tagsContainer) {
    const chip     = document.createElement('span');
    chip.className = 'tag-chip removable';
    chip.textContent = name;
    chip.addEventListener('click', () => {
        removeNoteTag(noteId, name);
        chip.remove();
    });
    return chip;
}

function buildDeleteButton(noteId, studyId) {
    const btn     = document.createElement('button');
    btn.className = 'note-block-delete';
    btn.textContent = 'Delete';
    btn.addEventListener('click', () => {
        if (!confirm('Delete this note?')) return;
        clearTimeout(saveTimers.get(noteId));
        saveTimers.delete(noteId);
        deleteNote(noteId);
        renderStudyDocument(studyId);
        refreshAfterWrite();
    });
    return btn;
}

function buildAddNoteButton(studyId) {
    const btn     = document.createElement('button');
    btn.className = 'add-note-btn';
    btn.textContent = '+ Add Note';
    btn.addEventListener('click', () => addNote(studyId));
    return btn;
}

// ============================================================
// Info tab — verse notes (read-only, click to navigate to study)
// ============================================================

function renderInfoTab(verseId) {
    const container = document.getElementById('info-tab');
    const notes     = getNotesForVerse(verseId);

    container.innerHTML = '';

    if (notes.length === 0) {
        const empty = document.createElement('p');
        empty.className   = 'notes-empty';
        empty.textContent = 'No notes for this verse.';
        container.appendChild(empty);
        return;
    }

    for (const note of notes) {
        container.appendChild(buildInfoNoteCard(note));
    }
}

function clearInfoTab() {
    const container = document.getElementById('info-tab');
    container.innerHTML = '';
    const empty = document.createElement('p');
    empty.className   = 'notes-empty';
    empty.textContent = 'Select a verse to see notes.';
    container.appendChild(empty);
}

function buildInfoNoteCard(note) {
    const card     = document.createElement('div');
    card.className = 'info-note-card';

    const body     = document.createElement('div');
    body.className = 'info-note-body';
    body.textContent = note.body || '(empty note)';
    card.appendChild(body);

    const meta     = document.createElement('div');
    meta.className = 'info-note-meta';

    if (note.tags && note.tags.length > 0) {
        for (const tag of note.tags) {
            const chip     = document.createElement('span');
            chip.className = 'tag-chip';
            chip.textContent = tag.name;
            meta.appendChild(chip);
        }
    }

    if (note.study_id) {
        const link     = document.createElement('button');
        link.className = 'info-note-study';
        link.textContent = `${note.study_name || 'Study'} →`;
        link.addEventListener('click', () => openStudy(note.study_id, note.study_name || 'Study'));
        meta.appendChild(link);
    }

    card.appendChild(meta);
    return card;
}

// ============================================================
// All Studies view
// ============================================================

function renderAllStudies() {
    const container = document.getElementById('notes-all-studies-view');
    const studies   = getStudies();

    container.innerHTML = '';

    if (studies.length === 0) {
        const empty = document.createElement('p');
        empty.className   = 'notes-empty';
        empty.textContent = 'No studies yet. Click + to start one.';
        container.appendChild(empty);
        return;
    }

    for (const study of studies) {
        const item = document.createElement('div');
        item.className = 'study-list-item';

        const info     = document.createElement('div');
        info.className = 'study-list-info';
        info.addEventListener('click', () => openStudy(study.id, study.name));

        const name     = document.createElement('div');
        name.className = 'study-list-name';
        name.textContent = study.name;

        const meta     = document.createElement('div');
        meta.className = 'study-list-meta';
        const count    = study.note_count;
        const modified = new Date(study.modified_at).toLocaleDateString();
        meta.textContent = `${count} note${count !== 1 ? 's' : ''} · ${modified}`;

        info.appendChild(name);
        info.appendChild(meta);

        const delBtn     = document.createElement('button');
        delBtn.className = 'study-list-delete';
        delBtn.textContent = '✕';
        delBtn.setAttribute('title', 'Delete study');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const label = study.note_count > 0
                ? `Delete "${study.name}" and its ${study.note_count} note${study.note_count !== 1 ? 's' : ''}?`
                : `Delete "${study.name}"?`;
            if (!confirm(label)) return;
            closeStudy(study.id);
            deleteStudy(study.id);
            renderAllStudies();
        });

        item.appendChild(info);
        item.appendChild(delBtn);
        container.appendChild(item);
    }
}

// ============================================================
// Note operations
// ============================================================

function addNote(studyId) {
    const anchors = currentVerseIds.length > 0 ? [{
        verseStart: Math.min(...currentVerseIds),
        verseEnd:   currentVerseIds.length > 1 ? Math.max(...currentVerseIds) : null
    }] : [];

    const noteId = saveNote('', anchors, [], studyId);

    // Re-render the whole document — guarantees the new block is visible
    renderStudyDocument(studyId);

    // Find the new block and focus it
    const block = document.querySelector(`[data-note-id="${noteId}"]`);
    block?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    block?.querySelector('.note-block-body')?.focus();

    refreshAfterWrite();
}

function scheduleSave(noteId, bodyEl) {
    clearTimeout(saveTimers.get(noteId));
    saveTimers.set(noteId, setTimeout(() => {
        updateNote(noteId, bodyEl.textContent.trim());
        refreshAfterWrite();
    }, 800));
}

// ============================================================
// showNoteEditor — navigation entry point (used by search.js)
// Ensures a study is open; navigates to the verse; adds a note if none exists.
// ============================================================

export function showNoteEditor(verseIds, options = {}) {
    currentVerseIds = verseIds;

    let studyId = getActiveStudyId();

    if (!studyId || studyId === 'all') {
        studyId = autoCreateStudy(verseIds[0]);
    }

    renderStudyDocument(studyId);

    if (options.focusTag) {
        document.querySelector('.note-block-tag-input')?.focus();
    }
}

// ============================================================
// Auto-create a study named from the current passage + date
// ============================================================

function autoCreateStudy(verseId) {
    let name = 'My Study';

    if (verseId) {
        const parsed = parseVerseId(verseId);
        const book   = books().find(b => b.id === parsed.book);
        const date   = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        name = `${book?.name || 'Study'} ${parsed.chapter} — ${date}`;
    }

    const studyId = createStudy(name);
    openStudy(studyId, name);
    return studyId;
}

// ============================================================
// Helpers
// ============================================================

// Called after any note write — refreshes reader note-dots and info tab
function refreshAfterWrite() {
    refreshNoteDots();
    if (currentVerseIds.length > 0) {
        renderInfoTab(currentVerseIds[0]);
    }
}

function formatAnchor(anchor) {
    const parsed = parseVerseId(anchor.verse_start);
    const book   = books().find(b => b.id === parsed.book);
    const label  = `${book?.name || ''} ${parsed.chapter}:${parsed.verse}`;

    if (anchor.verse_end && anchor.verse_end !== anchor.verse_start) {
        const end = parseVerseId(anchor.verse_end);
        return `${label}–${end.verse}`;
    }
    return label;
}

function books() {
    if (!_books) _books = getBooks();
    return _books;
}
