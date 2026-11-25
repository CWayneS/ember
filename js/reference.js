// reference.js — Reference panel: Info, Tags, Related, Language tabs

import {
    getBook, parseVerseId, formatReference,
    getChapterVerseCount, getTopicsForVerse, getUserTagsForVerse,
    getNotesForVerse, getCrossReferencesForVerse, getHeadingsForChapter,
    getChapterNames, warnContextUnavailable
} from './db.js';
import { navigateTo, showVerse, getCurrentLocation, getActivePaneId, getActivePaneTranslation, getActivePaneTranslationId, getActivePaneTranslationAbbrev } from './reader.js';
import { selectVerseRange, getSelectionLevel, getSelectedVerseOnScreen } from './selection.js';
import { openStudy, openTagView } from './panels.js';
import { initLanguageTab, renderLanguageTab as renderLanguageTabContent } from './language.js';

const EMPTY_MSG = 'Select a verse to see reference material.';

// Called by notes.js after any note write. Re-renders the two tabs whose
// content derives from the user's own notes: Info (the verse's notes) and
// Tags ("Your Tags"). Related and Language depend only on reference data.
export function refreshReference(verseId) {
    renderInfoTab();
    renderTagsTab(verseId);
}

export function initReference() {
    initLanguageTab();
    // Selecting something opens its section; a re-render (a note written, the
    // same chapter drawn again) keeps whatever the user opened or folded.
    document.addEventListener('level-changed', () => renderInfoTab({ reopen: true }));
    document.addEventListener('chapter-rendered', () => renderInfoTab());
    document.addEventListener('pane-changed', () => renderInfoTab());
    document.addEventListener('selection-changed', (e) => {
        const { verseIds } = e.detail;
        if (verseIds.length > 0) {
            renderAll(verseIds);
        } else {
            clearAll();
        }
        renderInfoTab({ reopen: true });
    });
    // Nothing is selected yet: the verse tabs wait for one.
    for (const id of ['tags-tab', 'related-tab']) {
        setPlaceholder(document.getElementById(id), EMPTY_MSG);
    }
    renderInfoTab({ reopen: true });
}

// Tags/Related are single-verse tabs (always keyed to the first verse of
// a range, unchanged pre-Build-6 behavior). Language is the only tab that
// uses the full range — an interlinear naturally extends across a multi-verse
// selection the way a single "current verse" concept doesn't. Info follows
// the selection level instead (renderInfoTab).
function renderAll(verseIds) {
    const verseId = verseIds[0];
    const parsed  = parseVerseId(verseId);
    const book    = getBook(parsed.book);
    renderTagsTab(verseId);
    renderRelatedTab(verseId, book, parsed);
    renderLanguageTabContent(verseIds);
}

function clearAll() {
    for (const id of ['tags-tab', 'related-tab']) {
        setPlaceholder(document.getElementById(id), EMPTY_MSG);
    }
    renderLanguageTabContent([]);
}

// ============================================================
// Info tab — Translation, Book and Chapter accordions
// (docs/Info_Tab_Spec.md). The selection level decides which is open:
// translation → Translation, book → Book, chapter or verse → Chapter. Any of
// them can be opened or folded by hand, more than one at a time.
// ============================================================

const SECTION_FOR_LEVEL = { translation: 'translation', book: 'book', chapter: 'chapter', verse: 'chapter' };

let openSections = new Set(['chapter']);
let infoContext  = '';   // what the tab last described; a change opens the level's section

function renderInfoTab({ reopen = false } = {}) {
    const container = document.getElementById('info-tab');
    const translation = getActivePaneTranslation();
    const { book: bookId, chapter } = getCurrentLocation();
    const book = getBook(bookId);
    if (!book) {
        setPlaceholder(container, EMPTY_MSG);
        return;
    }

    const level   = getSelectionLevel();
    const verseId = getSelectedVerseOnScreen();
    const context = [getActivePaneId(), translation?.id, bookId, chapter, level, verseId].join('|');
    if (reopen || context !== infoContext) {
        openSections = new Set([SECTION_FOR_LEVEL[level]]);
    }
    infoContext = context;

    container.innerHTML = '';
    const accordion = document.createElement('div');
    accordion.className = 'info-accordion';
    accordion.dataset.helpTarget = 'info-sections';
    accordion.dataset.level = level;
    if (translation) accordion.appendChild(translationSection(translation));
    accordion.appendChild(bookSection(book));
    accordion.appendChild(chapterSection(book, chapter, verseId));
    container.appendChild(accordion);
}

function translationSection(translation) {
    const section = infoSection('translation', translation.abbreviation,
        [translation.name, translation.year, translation.license]);
    appendFields(section.body, [
        ['Name', translation.name],
        ['Year', translation.year],
        ['License', translation.license],
    ]);
    return section.element;
}

function bookSection(book) {
    const testament = book.testament === 'OT' ? 'Old Testament' : 'New Testament';
    const genre = capitalize(book.genre);
    const section = infoSection('book', book.name, [genre]);
    appendFields(section.body, [
        ['Testament', testament],
        ['Genre', genre],
        ['Chapters', book.chapters],
    ]);
    return section.element;
}

function chapterSection(book, chapter, verseId) {
    const verseCount = getChapterVerseCount(book.id, chapter);
    const verses = verseCount ? `${verseCount} verse${verseCount !== 1 ? 's' : ''}` : '';
    // Until chapters have summaries, the verse count is the header's line.
    const section = infoSection('chapter', `${book.name} ${chapter}`, [verses]);
    const credit = document.createElement('div');
    credit.className = 'info-source';
    appendChapterNames(section.body, book, chapter, credit);
    appendFields(section.body, [['Verses', verseCount]]);
    appendChapterHeadings(section.body, book, chapter);
    if (verseId !== null) appendVerseNotes(section.body, verseId);
    section.body.appendChild(credit);
    return section.element;
}

// People, peoples and places named in the chapter (context.db, from
// STEPBible's TIPNR), each a link to its first verse here. context.db is read asynchronously, so a
// slot goes in now and fills when the rows come; a slot the tab has since
// redrawn over is left alone. Nothing shows if context.db can't be had yet
// (offline before its first download).
const NAMES_SHOWN_AT_FIRST = 24;
const chapterNamesCache = new Map();  // 'book:chapter' → Promise of rows

function chapterNames(bookId, chapter) {
    const key = `${bookId}:${chapter}`;
    if (!chapterNamesCache.has(key)) {
        const rows = getChapterNames(bookId, chapter);
        rows.catch(() => chapterNamesCache.delete(key));  // tried again next time
        chapterNamesCache.set(key, rows);
    }
    return chapterNamesCache.get(key);
}

// `credit` is an empty line at the foot of the section, which names the source
// once there are names to credit.
function appendChapterNames(container, book, chapter, credit) {
    const slot = document.createElement('div');
    slot.className = 'info-names';
    container.appendChild(slot);
    chapterNames(book.id, chapter).then(rows => {
        if (!slot.isConnected) return;
        if (rows.length === 0) return;
        const list = document.createElement('dl');
        list.className = 'info-fields';
        for (const [label, kind] of [['People', 'person'], ['Peoples', 'group'], ['Places', 'place']]) {
            const group = rows.filter(row => row.kind === kind);
            if (group.length === 0) continue;
            const term = document.createElement('dt');
            term.textContent = label;
            const detail = document.createElement('dd');
            detail.className = 'info-name-list';
            detail.dataset.kind = group[0].kind;
            fillNameList(detail, group, book, chapter);
            list.append(term, detail);
        }
        slot.appendChild(list);
        credit.textContent = 'People, peoples and places: STEPBible TIPNR';
    }).catch(warnContextUnavailable);
}

// The names as links, the first NAMES_SHOWN_AT_FIRST of them with "N more" for
// the rest (1 Chronicles' genealogies run to dozens).
function fillNameList(detail, rows, book, chapter) {
    const shown = rows.length > NAMES_SHOWN_AT_FIRST + 4 ? rows.slice(0, NAMES_SHOWN_AT_FIRST) : rows;
    for (const row of shown) detail.appendChild(nameLink(row, book, chapter));
    if (shown.length === rows.length) return;
    const more = document.createElement('button');
    more.className = 'info-name-more';
    more.textContent = `${rows.length - shown.length} more`;
    more.addEventListener('click', () => {
        more.remove();
        for (const row of rows.slice(shown.length)) detail.appendChild(nameLink(row, book, chapter));
    });
    detail.appendChild(more);
}

function nameLink(row, book, chapter) {
    const link = document.createElement('button');
    link.className = 'info-name';
    link.textContent = row.shown_as;
    const where = row.first_verse === 0 ? `${book.name} ${chapter}, title` : `${book.name} ${chapter}:${row.first_verse}`;
    // TIPNR's one-sentence @Short says who they are; @Brief, then the plain
    // description ("Man living at the time of the Patriarchs", "Descendants of
    // Amram"), stand in. An ancestor's name that may mean his people says so.
    link.title = [
        row.ambiguous ? `The people named after ${row.shown_as}, or ${row.shown_as} himself: STEPBible's data doesn't say which` : null,
        row.name !== row.shown_as ? `Also called ${row.name}` : null,
        row.summary || row.brief || row.description || null,
        row.verse_count > 1 ? `first at ${where}, in ${row.verse_count} verses` : where,
    ].filter(Boolean).join(' · ');
    const verseId = book.id * 1000000 + chapter * 1000 + row.first_verse;
    link.addEventListener('click', () => showVerse(book.id, chapter, verseId));
    return link;
}

// A folded-or-open section: a <details> whose summary carries the name and a
// one-line digest (empty parts left out). Returns the element and its body.
function infoSection(name, title, summaryParts) {
    const details = document.createElement('details');
    details.className = 'info-section';
    details.dataset.section = name;
    details.open = openSections.has(name);
    details.addEventListener('toggle', () => {
        if (details.open) openSections.add(name);
        else openSections.delete(name);
    });

    const summary = document.createElement('summary');
    summary.className = 'info-section-header';
    const titleEl = document.createElement('span');
    titleEl.className = 'info-section-title';
    titleEl.textContent = title;
    summary.appendChild(titleEl);
    const line = summaryParts.filter(part => part !== null && part !== undefined && String(part).trim() !== '').join(' · ');
    if (line) {
        const lineEl = document.createElement('span');
        lineEl.className = 'info-section-summary';
        lineEl.textContent = line;
        summary.appendChild(lineEl);
    }

    const body = document.createElement('div');
    body.className = 'info-section-body';
    details.append(summary, body);
    return { element: details, body };
}

// Label/value rows; a field with no value is left out, never shown as "—".
function appendFields(container, fields) {
    const present = fields.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
    if (present.length === 0) return;
    const list = document.createElement('dl');
    list.className = 'info-fields';
    for (const [label, value] of present) {
        const term = document.createElement('dt');
        term.textContent = label;
        const detail = document.createElement('dd');
        detail.textContent = String(value);
        list.append(term, detail);
    }
    container.appendChild(list);
}

function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// Headings the active pane's translation keeps out of its verse text (only
// WEB has any): each with where it falls, "before 119:9" or, for one inside a
// verse, "in 1:4, before “We will be glad…”".
function appendChapterHeadings(container, book, chapter) {
    const headings = getHeadingsForChapter(getActivePaneTranslationId(), book.id, chapter);
    if (headings.length === 0) return;

    container.appendChild(refHeading(`Headings · ${getActivePaneTranslationAbbrev()}`));
    const list = document.createElement('ul');
    list.className = 'ref-heading-list';
    for (const heading of headings) {
        const item = document.createElement('li');
        item.className = 'ref-heading-item';

        const text = document.createElement('span');
        text.className = 'ref-heading-text';
        text.textContent = heading.text;

        const place = document.createElement('span');
        place.className = 'ref-meta';
        const reference = `${chapter}:${heading.verse}`;
        if (heading.verse === 0) {
            place.textContent = 'before the title';
        } else if (heading.offset === 0) {
            place.textContent = `before ${reference}`;
        } else {
            place.textContent = `in ${reference}, before “${openingWords(heading.following)}”`;
        }

        item.appendChild(text);
        item.appendChild(place);
        list.appendChild(item);
    }
    container.appendChild(list);
}

// The first few words of a passage, with an ellipsis when there is more.
function openingWords(text, count = 6) {
    const words = (text || '').split(' ');
    return words.length > count ? `${words.slice(0, count).join(' ')}…` : words.join(' ');
}

function appendVerseNotes(container, verseId) {
    const notes = getNotesForVerse(verseId);
    if (notes.length === 0) return;

    container.appendChild(refHeading(`Notes on ${formatReference(verseId)}`));

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

    const header = document.createElement('div');
    header.className   = 'ref-related-header';
    header.textContent = `Related to ${formatReference(verseId)}`;
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

    const header = document.createElement('div');
    header.className   = 'ref-related-header';
    header.textContent = `Related to ${formatReference(verseId)}`;
    container.appendChild(header);

    const allRefs = getCrossReferencesForVerse(verseId, { showAll: true });

    // Group by target book in canonical (book ID) order.
    const groups = new Map();
    for (const ref of allRefs) {
        const bookId = parseVerseId(ref.target_start).book;
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

// Builds an <ul> of cross-reference buttons with click-to-navigate.
function renderRefList(refs) {
    const list = document.createElement('ul');
    list.className = 'ref-crossref-list';
    for (const ref of refs) {
        const li  = document.createElement('li');
        li.className = 'ref-crossref-item';
        const btn = document.createElement('button');
        btn.className   = 'ref-crossref-btn';
        btn.textContent = formatReference(ref.target_start, ref.target_end);
        btn.addEventListener('click', () =>
            navigateToCrossRef(ref.target_start, ref.target_end || null)
        );
        li.appendChild(btn);
        list.appendChild(li);
    }
    return list;
}

// Navigate active pane to a cross-reference target and select the range.
// Skips re-render when already on the target chapter.
function navigateToCrossRef(startId, endId) {
    const s = parseVerseId(startId);
    const { book: curBook, chapter: curChapter } = getCurrentLocation();

    if (curBook !== s.book || curChapter !== s.chapter) {
        navigateTo(s.book, s.chapter);
    }

    selectVerseRange(startId, endId);
}

function makeShowAllBtn(onClick) {
    const btn = document.createElement('button');
    btn.className   = 'ref-show-all-btn';
    btn.textContent = 'Show all';
    btn.addEventListener('click', onClick);
    return btn;
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
