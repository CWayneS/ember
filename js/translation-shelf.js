// translation-shelf.js — The Translations shelf (Translation_Addons_Spec Item 6)
//
// The reader is your Bible; the shelf is where you keep your other Bibles. A
// quiet + at the end of the book picker's translation row opens it: one line
// per translation Ember offers, with Add for one not installed and Remove for
// one that is (never KJV). Remove lives only here, so a stray click in the
// book picker can't remove anything.
//
// The catalog is fetched each time the shelf opens. Offline, the shelf lists
// what's installed from the manifest, Add is disabled, and Remove still works.
// Built from DOM nodes and textContent only.

import {
    fetchTranslationCatalog, getInstalledTranslations, getTranslations,
    addTranslation, removeTranslation, LOCKED_TRANSLATION_ID, TRANSLATIONS_CHANGED_EVENT,
} from './db.js';
import { bindPopover } from './popover-registry.js';
import { openConfirmDialog } from './dialogs.js';

let _button  = null;
let _shelf   = null;
let _catalog = null;               // the last catalog fetched this session
let _offline = false;              // the last fetch failed
let _fetchToken = 0;
const _adding = new Map();         // id -> progress text, while downloading
const _errors = new Map();         // id -> the last Add failure's message

// The + button, created once. reader.js moves it back into the translation row
// each time it redraws the row.
export function getTranslationShelfButton() {
    if (_button) return _button;

    _button = document.createElement('button');
    _button.type        = 'button';
    _button.id          = 'translation-shelf-btn';
    _button.className   = 'translation-btn translation-shelf-btn';
    _button.textContent = '+';
    _button.title       = 'Translations';
    _button.setAttribute('aria-label', 'Translations');

    _shelf = document.getElementById('translation-shelf');
    // Before bindPopover's own listener, so the shelf is drawn when it shows.
    _button.addEventListener('click', () => {
        if (_shelf.classList.contains('hidden')) openShelf();
    });
    bindPopover(_button, _shelf);
    document.addEventListener(TRANSLATIONS_CHANGED_EVENT, () => {
        if (!_shelf.classList.contains('hidden')) drawShelf();
    });
    return _button;
}

async function openShelf() {
    _errors.clear();
    drawShelf();
    const token = ++_fetchToken;
    try {
        _catalog = await fetchTranslationCatalog();
        _offline = false;
    } catch (e) {
        console.warn('Translations shelf: catalog not available:', e.message);
        _offline = true;
    }
    if (token === _fetchToken) drawShelf();
}

function drawShelf() {
    const installed = getInstalledTranslations();
    const installedIds = new Set(installed.map(t => t.id));
    const openIds = new Set(getTranslations().map(t => t.id));

    // Online: the catalog, plus anything installed it doesn't list. Offline (or
    // before the first fetch): what's installed.
    const entries = _catalog && !_offline
        ? [..._catalog, ...installed.filter(t => !_catalog.some(entry => entry.id === t.id))]
        : installed;

    _shelf.replaceChildren();

    const heading = document.createElement('p');
    heading.className   = 'help-popover-lead';
    heading.textContent = 'Translations';
    _shelf.appendChild(heading);

    if (_offline) {
        _shelf.appendChild(note('Connect to the internet to add translations.'));
    } else if (!_catalog) {
        _shelf.appendChild(note('Checking which translations are available…'));
    }

    const list = document.createElement('ul');
    list.className = 'translation-shelf-list';
    for (const entry of entries) {
        list.appendChild(drawEntry(entry, installedIds.has(entry.id), openIds.has(entry.id)));
    }
    _shelf.appendChild(list);

    const missingDefaults = (_catalog && !_offline)
        ? _catalog.filter(entry => entry.tier === 'default' && !installedIds.has(entry.id))
        : [];
    if (missingDefaults.length) {
        const restore = document.createElement('button');
        restore.type        = 'button';
        restore.className   = 'translation-shelf-restore';
        restore.textContent = 'Restore default translations';
        restore.disabled    = _adding.size > 0;
        restore.addEventListener('click', () => restoreDefaults(missingDefaults));
        _shelf.appendChild(restore);
    }
}

function drawEntry(entry, isInstalled, isOpen) {
    const item = document.createElement('li');
    item.className = 'translation-shelf-item';
    item.dataset.translationId = entry.id;

    const title = document.createElement('div');
    title.className = 'translation-shelf-title';
    const abbreviation = document.createElement('strong');
    abbreviation.textContent = entry.abbreviation;
    title.appendChild(abbreviation);
    title.appendChild(document.createTextNode(` ${entry.name}${entry.year ? ` · ${entry.year}` : ''}`));
    item.appendChild(title);

    if (entry.description) {
        const description = document.createElement('div');
        description.className   = 'translation-shelf-description';
        description.textContent = entry.description;
        item.appendChild(description);
    }

    const footer = document.createElement('div');
    footer.className = 'translation-shelf-footer';
    const size = document.createElement('span');
    size.className   = 'translation-shelf-size';
    size.textContent = entry.size_bytes ? formatMegabytes(entry.size_bytes) : '';
    footer.appendChild(size);
    footer.appendChild(drawAction(entry, isInstalled, isOpen));
    item.appendChild(footer);

    if (_errors.has(entry.id)) {
        const error = document.createElement('div');
        error.className   = 'translation-shelf-error';
        error.textContent = _errors.get(entry.id);
        item.appendChild(error);
    }
    return item;
}

function drawAction(entry, isInstalled, isOpen) {
    if (_adding.has(entry.id)) {
        const progress = document.createElement('span');
        progress.className   = 'translation-shelf-progress';
        progress.textContent = _adding.get(entry.id);
        return progress;
    }
    if (entry.id === LOCKED_TRANSLATION_ID) {
        return status('Always installed');
    }
    if (isInstalled) {
        const wrap = document.createElement('span');
        if (!isOpen) wrap.appendChild(status('Downloads when you’re next online · '));
        const remove = document.createElement('button');
        remove.type        = 'button';
        remove.className   = 'translation-shelf-remove';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => confirmRemove(entry));
        wrap.appendChild(remove);
        return wrap;
    }
    const add = document.createElement('button');
    add.type        = 'button';
    add.className   = 'translation-shelf-add';
    add.textContent = 'Add';
    add.disabled    = _offline || !_catalog;
    add.addEventListener('click', () => addFromShelf(entry));
    return add;
}

async function confirmRemove(entry) {
    const confirmed = await openConfirmDialog({
        title: `Remove ${entry.abbreviation} Translation?`,
        lines: ['You can download it again later. Your notes, highlights and bookmarks are not affected.'],
        confirmLabel: 'Remove',
        danger: true,
    });
    if (!confirmed) return;
    try {
        await removeTranslation(entry.id);
    } catch (e) {
        console.error('Translations shelf: remove failed:', e);
        _errors.set(entry.id, e.message);
    }
    drawShelf();
}

async function addFromShelf(entry) {
    _errors.delete(entry.id);
    _adding.set(entry.id, 'Downloading…');
    drawShelf();
    try {
        await addTranslation(entry, {
            onProgress: (received, total) => showProgress(entry, received, total),
        });
    } catch (e) {
        _errors.set(entry.id, e.message);
    } finally {
        _adding.delete(entry.id);
        drawShelf();
    }
}

async function restoreDefaults(entries) {
    for (const entry of entries) await addFromShelf(entry);
}

// Updates the one line in place: a redraw per chunk would be wasteful.
function showProgress(entry, received, total) {
    const text = total
        ? `Downloading ${entry.abbreviation}… ${(received / 1048576).toFixed(1)} of ${(total / 1048576).toFixed(1)} MB`
        : 'Downloading…';
    _adding.set(entry.id, text);
    const line = _shelf.querySelector(`[data-translation-id="${entry.id}"] .translation-shelf-progress`);
    if (line) line.textContent = text;
}

function note(text) {
    const line = document.createElement('p');
    line.className   = 'translation-shelf-note';
    line.textContent = text;
    return line;
}

function status(text) {
    const span = document.createElement('span');
    span.className   = 'translation-shelf-status';
    span.textContent = text;
    return span;
}

function formatMegabytes(bytes) {
    return `${(bytes / 1048576).toFixed(1)} MB`;
}
