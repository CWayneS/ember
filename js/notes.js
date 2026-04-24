// notes.js — Study document with inline note editing

import {
    saveNote, updateNote, deleteNote,
    getNotesForStudy, getStudies, getNotesForTag, getVersesForTopic, getTopicVerseCount,
    parseVerseId, getBooks, createStudy, deleteStudy, renameStudy, getStudyName,
    addNoteTag, removeNoteTag, addAnchorToNote, getCurrentTranslationId
} from './db.js';
import { refreshNoteDots, navigateTo }              from './reader.js';
import { openStudy, closeStudy, getActiveStudyId, openTagView, renameStudyTab } from './panels.js';
import { refreshReference }                         from './reference.js';

let currentVerseIds = [];       // verses currently selected in the reader
const saveTimers    = new Map(); // noteId → debounce timer

// ============================================================
// Init
// ============================================================

export function initNotes() {
    document.addEventListener('selection-changed', (e) => {
        currentVerseIds = e.detail.verseIds;
        updateAttachButtons();
    });

    document.addEventListener('study-changed', (e) => {
        const { studyId } = e.detail;
        if (studyId === 'all') {
            renderAllStudies();
        } else if (typeof studyId === 'string' && studyId.startsWith('tag:')) {
            renderTagView(studyId.slice(4));
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

    // Editable study title
    const title           = document.createElement('div');
    title.className       = 'study-title';
    title.contentEditable = 'true';
    title.setAttribute('data-placeholder', 'Untitled Study');
    title.textContent     = getStudyName(studyId);
    title.addEventListener('input', () => {
        const name = title.textContent.trim();
        renameStudy(studyId, name);
        renameStudyTab(studyId, name || 'Untitled Study');
    });
    title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
    });
    container.appendChild(title);

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
    updateAttachButtons();
}

function updateAttachButtons() {
    document.querySelectorAll('.note-block-attach-btn').forEach(btn => {
        if (currentVerseIds.length === 0) {
            btn.classList.add('hidden');
            return;
        }
        const verseStart = Math.min(...currentVerseIds);
        const parsed     = parseVerseId(verseStart);
        const book       = getBooks().find(b => b.id === parsed.book);
        btn.textContent  = `+ ${book?.name || ''} ${parsed.chapter}:${parsed.verse}`;
        btn.classList.remove('hidden');
    });
}

function buildNoteBlock(note, studyId) {
    const block = document.createElement('div');
    block.className      = 'note-block';
    block.dataset.noteId = note.id;

    // Anchor chips + attach button
    const anchorsArea     = document.createElement('div');
    anchorsArea.className = 'note-block-anchors';

    for (const anchor of coalesceAnchors(note.anchors || [])) {
        const chip       = document.createElement('div');
        chip.className   = 'note-block-anchor note-block-anchor-link';
        chip.textContent = formatAnchor(anchor);
        chip.addEventListener('click', () => {
            const parsed = parseVerseId(anchor.verse_start);
            navigateTo(parsed.book, parsed.chapter, anchor.verse_start);
        });
        anchorsArea.appendChild(chip);
    }

    const attachBtn     = document.createElement('button');
    attachBtn.className = 'note-block-attach-btn hidden';
    attachBtn.addEventListener('click', () => {
        if (currentVerseIds.length === 0) return;
        const verseStart = Math.min(...currentVerseIds);
        const verseEnd   = currentVerseIds.length > 1 ? Math.max(...currentVerseIds) : null;
        if (note.anchors.some(a => a.verse_start === verseStart)) return;
        addAnchorToNote(note.id, verseStart, verseEnd);
        renderStudyDocument(studyId);
        refreshAfterWrite();
    });
    anchorsArea.appendChild(attachBtn);
    block.appendChild(anchorsArea);

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
    chip.className = 'tag-chip';
    chip.textContent = name;
    chip.addEventListener('click', () => openTagView(name));
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
// Tag filter view
// ============================================================

const TOPIC_PAGE = 100;

function renderTagView(tagName) {
    const container = document.getElementById('notes-active-view');
    const notes     = getNotesForTag(tagName);
    const total     = getTopicVerseCount(tagName);
    const verses    = getVersesForTopic(tagName, getCurrentTranslationId(), TOPIC_PAGE, 0);

    container.innerHTML = '';

    if (notes.length === 0 && total === 0) {
        const empty       = document.createElement('p');
        empty.className   = 'notes-empty';
        empty.textContent = `No notes or verses tagged "${tagName}".`;
        container.appendChild(empty);
        return;
    }

    if (verses.length > 0) {
        const appendFooter = () => {
            for (const note of notes) {
                container.appendChild(buildTagNoteCard(note));
            }
            if (total > verses.length) {
                container.appendChild(buildLoadMoreButton(tagName, TOPIC_PAGE, total, container, notes));
            }
        };
        renderInChunks(container, verses, buildTopicVerseCard, appendFooter);
    } else {
        for (const note of notes) {
            container.appendChild(buildTagNoteCard(note));
        }
    }
}

function buildLoadMoreButton(tagName, offset, total, container, notes) {
    const remaining = total - offset;
    const btn       = document.createElement('button');
    btn.className   = 'load-more-btn';
    btn.textContent = `Load ${Math.min(remaining, TOPIC_PAGE)} more of ${remaining} remaining`;
    btn.addEventListener('click', () => {
        btn.remove();
        // Remove note cards so they re-append after new verses
        for (const note of notes) {
            container.querySelector(`[data-note-id="${note.id}"]`)?.remove();
        }
        const newVerses = getVersesForTopic(tagName, getCurrentTranslationId(), TOPIC_PAGE, offset);
        const newOffset = offset + newVerses.length;
        const appendFooter = () => {
            for (const note of notes) {
                container.appendChild(buildTagNoteCard(note));
            }
            if (newOffset < total) {
                container.appendChild(buildLoadMoreButton(tagName, newOffset, total, container, notes));
            }
        };
        renderInChunks(container, newVerses, buildTopicVerseCard, appendFooter);
    });
    return btn;
}

function renderInChunks(container, items, buildFn, onDone, startIndex = 0) {
    const CHUNK = 30;
    const end   = Math.min(startIndex + CHUNK, items.length);
    for (let i = startIndex; i < end; i++) {
        container.appendChild(buildFn(items[i]));
    }
    if (end < items.length) {
        requestAnimationFrame(() => renderInChunks(container, items, buildFn, onDone, end));
    } else {
        onDone?.();
    }
}

function buildTopicVerseCard(verse) {
    const block     = document.createElement('div');
    block.className = 'note-block';

    const anchor     = document.createElement('div');
    anchor.className = 'note-block-anchor note-block-anchor-link';
    anchor.textContent = `${verse.book_name} ${verse.chapter}:${verse.verse}`;
    anchor.addEventListener('click', () => navigateTo(verse.book_id, verse.chapter, verse.id));
    block.appendChild(anchor);

    const body       = document.createElement('div');
    body.className   = 'note-block-body';
    body.textContent = verse.text;
    block.appendChild(body);

    return block;
}

function buildTagNoteCard(note) {
    const block     = document.createElement('div');
    block.className = 'note-block';

    // Header row: verse anchor (left) + study link (right)
    const header     = document.createElement('div');
    header.className = 'tag-note-card-header';

    if (note.anchors && note.anchors.length > 0) {
        const anchor       = document.createElement('div');
        anchor.className   = 'note-block-anchor note-block-anchor-link';
        anchor.textContent = formatAnchor(note.anchors[0]);
        anchor.addEventListener('click', () => {
            const a = note.anchors[0];
            const parsed = parseVerseId(a.verse_start);
            navigateTo(parsed.book, parsed.chapter, a.verse_start);
        });
        header.appendChild(anchor);
    }

    if (note.study_id && note.study_name) {
        const link       = document.createElement('div');
        link.className   = 'tag-note-study-link';
        link.textContent = `→ ${note.study_name}`;
        link.addEventListener('click', () => openStudy(note.study_id, note.study_name));
        header.appendChild(link);
    }

    block.appendChild(header);

    // Body — read-only
    const body       = document.createElement('div');
    body.className   = 'note-block-body';
    body.textContent = note.body || '';
    block.appendChild(body);

    // Tags — display only, no remove/add controls
    if (note.tags && note.tags.length > 0) {
        const tags     = document.createElement('div');
        tags.className = 'note-block-tags note-block-tags-readonly';
        for (const tag of note.tags) {
            const chip       = document.createElement('span');
            chip.className   = 'tag-chip';
            chip.textContent = tag.name;
            tags.appendChild(chip);
        }
        block.appendChild(tags);
    }

    return block;
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
        const raw = bodyEl.innerText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        updateNote(noteId, raw);
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
        const book   = getBooks().find(b => b.id === parsed.book);
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
    if (currentVerseIds.length > 0) refreshReference(currentVerseIds[0]);
}

// Merges contiguous note_anchors rows into display ranges.
// Pure function — does not touch the database.
// Two anchors are contiguous if they share the same book and chapter and their
// verse ranges touch or overlap (second start <= first effective end + 1).
function coalesceAnchors(anchors) {
    if (anchors.length === 0) return [];

    // Sort by verse_start — BBCCCVVV encoding means numeric sort = canonical order.
    const sorted = [...anchors].sort((a, b) => a.verse_start - b.verse_start);

    const result  = [];
    let curStart  = sorted[0].verse_start;
    let curEnd    = sorted[0].verse_end ?? sorted[0].verse_start;

    for (let i = 1; i < sorted.length; i++) {
        const next      = sorted[i];
        const nextStart = next.verse_start;
        const nextEnd   = next.verse_end ?? next.verse_start;

        const curParsed  = parseVerseId(curStart);
        const nextParsed = parseVerseId(nextStart);

        const sameChapter = curParsed.book    === nextParsed.book &&
                            curParsed.chapter === nextParsed.chapter;
        const touches     = nextStart <= curEnd + 1;

        if (sameChapter && touches) {
            curEnd = Math.max(curEnd, nextEnd);
        } else {
            result.push({ verse_start: curStart, verse_end: curEnd === curStart ? null : curEnd });
            curStart = nextStart;
            curEnd   = nextEnd;
        }
    }
    result.push({ verse_start: curStart, verse_end: curEnd === curStart ? null : curEnd });

    return result;
}

function formatAnchor(anchor) {
    const parsed = parseVerseId(anchor.verse_start);
    const book   = getBooks().find(b => b.id === parsed.book);
    const label  = `${book?.name || ''} ${parsed.chapter}:${parsed.verse}`;

    if (anchor.verse_end && anchor.verse_end !== anchor.verse_start) {
        const end = parseVerseId(anchor.verse_end);
        return `${label}–${end.verse}`;
    }
    return label;
}

