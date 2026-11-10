// readable-export.js — Studies as one self-contained HTML page, to read, print
// or share without Ember. Unlike a backup, it can't be restored.
//
// The page is built as a detached document and filled with textContent, so
// note text is always text, never markup. It has no script and links nothing
// outside itself.

import {
    getStudies, getNotesForStudy, getNotesByStudy, getStudyName, getBooks, getChapter,
    getTranslations, countVersesInRange, formatReference, parseVerseId, downloadFile,
} from './db.js';
import { getActivePaneTranslationId } from './reader.js';
import { coalesceAnchors, flushPendingSaves } from './notes.js';

// A longer anchor (a whole chapter or book) is named, not quoted.
export const MAX_QUOTED_VERSES = 30;

const UNTITLED = 'Untitled Study';

const STYLE = `
body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.55; color: #222; background: #fff;
       max-width: 46rem; margin: 2.5rem auto; padding: 0 1.25rem; }
h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
h2 { font-size: 1.3rem; margin: 2.5rem 0 .25rem; padding-bottom: .25rem; border-bottom: 1px solid #ccc; }
.meta { color: #666; font-size: .9rem; margin: 0 0 1.25rem; }
nav ol { padding-left: 1.5rem; }
nav a { color: inherit; }
.note { margin: 1.5rem 0; padding-bottom: 1.25rem; border-bottom: 1px solid #eee; break-inside: avoid; }
.passage { margin: 0 0 .75rem; }
.reference { font-weight: bold; margin: 0 0 .25rem; }
blockquote { margin: 0 0 .5rem; padding: .25rem 0 .25rem 1rem; border-left: 3px solid #b8c2ae; color: #333; }
.verse-number { font-size: .7em; vertical-align: super; color: #888; }
.not-quoted { color: #666; font-style: italic; margin: 0 0 .5rem; }
.body { white-space: pre-wrap; margin: 0; }
.empty { color: #888; font-style: italic; }
.tags { color: #555; font-size: .9rem; margin: .5rem 0 0; }
@media print {
    body { margin: 0; max-width: none; }
    nav { display: none; }
    section + section > h2 { break-before: page; }
}
`;

// `studyId` exports that one study; without it, every study, in the All
// Studies order, then any notes outside a study. A large library takes a few
// seconds (about 4 at 40 years of notes), so `button` says "Preparing…"
// meanwhile, and gets a frame to show it before the work starts.
export async function exportReadableCopy({ studyId = null, button = null } = {}) {
    // The database must hold what was typed just now, still waiting on autosave.
    flushPendingSaves();
    const label = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = 'Preparing…';
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    try {
        const translation = activeTranslation();
        let studies;
        if (studyId === null) {
            const notesByStudy = getNotesByStudy();
            studies = getStudies().map(study => ({ id: study.id, name: study.name, notes: notesByStudy.get(study.id) ?? [] }));
            const loose = notesByStudy.get(null);
            if (loose) studies.push({ id: 'none', name: 'Notes not in a study', notes: loose });
        } else {
            studies = [{ id: studyId, name: getStudyName(studyId), notes: getNotesForStudy(studyId) }];
        }

        const title = studyId === null ? 'Ember — Studies' : `Ember — ${studies[0].name || UNTITLED}`;
        const html = buildReadableExport(studies, translation, title, { oneStudy: studyId !== null });
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadFile(blob, exportFilename(studyId === null ? null : studies[0].name));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = label;
        }
    }
}

function activeTranslation() {
    const id = getActivePaneTranslationId();
    const row = getTranslations().find(translation => translation.id === id) ?? getTranslations()[0];
    return { id: row.id, name: row.name, abbreviation: row.abbreviation };
}

// The page as a string. Exported for tests.
export function buildReadableExport(studies, translation, title, { oneStudy = false } = {}) {
    const doc = document.implementation.createHTMLDocument(title);
    doc.documentElement.lang = 'en';
    const charset = doc.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    doc.head.prepend(charset);
    const viewport = doc.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    doc.head.appendChild(viewport);
    const style = doc.createElement('style');
    style.textContent = STYLE;
    doc.head.appendChild(style);

    const add = (parent, tag, text, className) => {
        const element = doc.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        parent.appendChild(element);
        return element;
    };

    add(doc.body, 'h1', title.replace(/^Ember — /, ''));
    const dateText = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    add(doc.body, 'p', `Exported from Ember on ${dateText}. Scripture is quoted from the ${translation.name} (${translation.abbreviation}).`, 'meta');

    if (!oneStudy && studies.length > 1) {
        const nav = add(doc.body, 'nav');
        add(nav, 'h2', 'Contents');
        const list = add(nav, 'ol');
        for (const study of studies) {
            const link = add(add(list, 'li'), 'a', study.name || UNTITLED);
            link.href = `#study-${study.id}`;
        }
    }

    const chapters = chapterCache(translation.id);
    // A one-study export is titled by the study; the full export heads each one.
    for (const study of studies) {
        const section = add(doc.body, 'section');
        section.id = `study-${study.id}`;
        if (!oneStudy) add(section, 'h2', study.name || UNTITLED);
        add(section, 'p', study.notes.length === 1 ? '1 note' : `${study.notes.length} notes`, 'meta');
        for (const note of study.notes) {
            section.appendChild(buildNote(doc, add, note, translation, chapters));
        }
    }
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';
}

// Each chapter is read from the translation once per export: a library has
// tens of thousands of anchors but only 1,189 chapters.
function chapterCache(translationId) {
    const chapterCounts = new Map(getBooks().map(book => [book.id, book.chapters]));
    const cache = new Map();
    const chapter = (book, number) => {
        const key = book * 1000 + number;
        if (!cache.has(key)) cache.set(key, getChapter(translationId, book, number));
        return cache.get(key);
    };

    // An anchor's verses, at most MAX_QUOTED_VERSES + 1 of them, and its count.
    return function versesInRange(startId, endId) {
        const end = endId ?? startId;
        const last = parseVerseId(end);
        let { book, chapter: number } = parseVerseId(startId);
        const verses = [];
        while (book < last.book || (book === last.book && number <= last.chapter)) {
            for (const verse of chapter(book, number)) {
                if (verse.id < startId) continue;
                if (verse.id > end) break;
                verses.push({ ...verse, book, chapter: number });
                // Rare (a whole chapter or book): counted, not walked.
                if (verses.length > MAX_QUOTED_VERSES) {
                    return { verses, total: countVersesInRange(translationId, startId, end) };
                }
            }
            number++;
            if (number > (chapterCounts.get(book) ?? 0)) {
                book++;
                number = 1;
                if (!chapterCounts.has(book)) break;
            }
        }
        return { verses, total: verses.length };
    };
}

function buildNote(doc, add, note, translation, versesInRange) {
    const article = doc.createElement('article');
    article.className = 'note';

    for (const anchor of coalesceAnchors(note.anchors || [])) {
        const passage = add(article, 'div', undefined, 'passage');
        add(passage, 'p', `${formatReference(anchor.verse_start, anchor.verse_end)} (${translation.abbreviation})`, 'reference');
        const { verses, total } = versesInRange(anchor.verse_start, anchor.verse_end);
        if (total > MAX_QUOTED_VERSES) {
            add(passage, 'p', `${total} verses, not quoted.`, 'not-quoted');
            continue;
        }
        const quote = add(passage, 'blockquote');
        let paragraph = null;
        let chapterKey = null;
        for (const verse of verses) {
            // KJV, ASV and Darby keep an empty row for a Psalm title.
            if (!verse.text) continue;
            const key = verse.book * 1000 + verse.chapter;
            if (key !== chapterKey) {
                paragraph = add(quote, 'p');
                chapterKey = key;
            } else {
                paragraph.appendChild(doc.createTextNode(' '));
            }
            // A real space after the number, so copied text reads "1 In the…".
            if (verse.verse > 0) add(paragraph, 'span', String(verse.verse), 'verse-number');
            paragraph.appendChild(doc.createTextNode(verse.verse > 0 ? ` ${verse.text}` : verse.text));
        }
        // A Psalm title alone, in a translation that has no wording for it.
        if (!quote.firstChild) quote.remove();
    }

    if (note.body) {
        const body = add(article, 'p', note.body, 'body');
        body.dir = 'auto';
    } else {
        add(article, 'p', 'Empty note.', 'empty');
    }

    if (note.tags?.length) {
        add(article, 'p', `Tags: ${note.tags.map(tag => tag.name).join(', ')}`, 'tags');
    }
    return article;
}

// ember-studies-2026-11-10.html, or ember-study-<name>-2026-11-10.html. Keeps
// letters in any script; drops what file systems refuse.
function exportFilename(studyName) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (studyName === null) return `ember-studies-${date}.html`;
    const safe = studyName
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60)
        .replace(/^[.-]+|[.-]+$/g, '');
    return `ember-study-${safe || 'untitled-study'}-${date}.html`;
}
