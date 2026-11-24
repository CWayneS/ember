// help-guide.js — The help guide: USER_MANUAL.md rendered in the app
//
// USER_MANUAL.md is the one source: the repository's manual and the in-app
// guide are the same file, fetched and rendered at runtime (no build step).
// The renderer handles only the Markdown the manual uses (see
// docs/Help_Guide_Spec.md, Item 3) and builds DOM with createElement and
// textContent only, never by assigning HTML. Anything it doesn't recognize is shown
// as plain text.
//
// The same parse feeds Help in search (getHelpSections), so there's one
// parser and one idea of where a section starts and ends: at its heading,
// running to the next heading of any level.

import { closeAllPopovers } from './popover-registry.js';
import { createHelpMap } from './help-map.js';

const MANUAL_URL = './USER_MANUAL.md';

// ============================================================
// Parsing
// ============================================================

// GitHub's heading-anchor rule, so a #slug link works on GitHub and here:
// lowercase, drop everything but letters, digits, spaces, hyphens and
// underscores, then each space becomes a hyphen. Duplicates get -1, -2, …
export function slugify(text) {
    return text.toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/ /g, '-');
}

// Markdown inline → a list of nodes:
//   { type: 'text', text } | { type: 'code', text }
//   { type: 'strong' | 'em', children }
//   { type: 'link', href, title, children }
// Unmatched markers stay as literal text.
export function parseInline(source) {
    const nodes = [];
    let text = '';
    const flush = () => { if (text) { nodes.push({ type: 'text', text }); text = ''; } };

    let i = 0;
    while (i < source.length) {
        const ch = source[i];

        if (ch === '\\' && i + 1 < source.length && /[!-/:-@[-`{-~]/.test(source[i + 1])) {
            text += source[i + 1];
            i += 2;
            continue;
        }

        if (ch === '`') {
            const close = source.indexOf('`', i + 1);
            if (close > i) {
                flush();
                nodes.push({ type: 'code', text: source.slice(i + 1, close) });
                i = close + 1;
                continue;
            }
        }

        if (ch === '*') {
            const marker = source.startsWith('**', i) ? '**' : '*';
            const close = findCloser(source, i + marker.length, marker);
            if (close > i + marker.length) {
                flush();
                nodes.push({
                    type: marker === '**' ? 'strong' : 'em',
                    children: parseInline(source.slice(i + marker.length, close)),
                });
                i = close + marker.length;
                continue;
            }
        }

        if (ch === '[') {
            const match = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(source.slice(i));
            if (match) {
                flush();
                nodes.push({ type: 'link', href: match[2], title: match[3] || '', raw: match[0], children: parseInline(match[1]) });
                i += match[0].length;
                continue;
            }
        }

        text += ch;
        i++;
    }
    flush();
    return nodes;
}

// The next unescaped `marker`, skipping backslash escapes and code spans.
// For a single *, a ** doesn't count as its closer.
function findCloser(source, from, marker) {
    let i = from;
    while (i < source.length) {
        const ch = source[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '`') {
            const close = source.indexOf('`', i + 1);
            if (close > i) { i = close + 1; continue; }
        }
        if (source.startsWith(marker, i)) {
            if (marker === '*' && source[i + 1] === '*') { i += 2; continue; }
            return i;
        }
        i++;
    }
    return -1;
}

export function plainText(nodes) {
    return nodes.map(node =>
        node.type === 'text' || node.type === 'code' ? node.text : plainText(node.children)
    ).join('');
}

function splitTableRow(line) {
    let row = line.trim();
    if (row.startsWith('|')) row = row.slice(1);
    if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
    const cells = [];
    let cell = '';
    for (let i = 0; i < row.length; i++) {
        if (row[i] === '\\' && row[i + 1] === '|') { cell += '|'; i++; continue; }
        if (row[i] === '|') { cells.push(cell.trim()); cell = ''; continue; }
        cell += row[i];
    }
    cells.push(cell.trim());
    return cells;
}

const HEADING   = /^(#{1,4}) +(.+?) *#* *$/;
const RULE      = /^ *(-{3,}|\*{3,}) *$/;
const LIST_ITEM = /^- +(.*)$/;
const TABLE_SEP = /^ *\|? *:?-{3,}:? *(\| *:?-{3,}:? *)*\|? *$/;

// Markdown → { title, blocks, sections }.
//   blocks:   { type: 'heading', level, slug, inline } | { type: 'paragraph', inline }
//             | { type: 'list', items: [inline] } | { type: 'table', head: [inline], rows: [[inline]] }
//             | { type: 'rule' }
//   sections: every ## / ### / #### heading, in order:
//             { slug, title, level, path (ancestor titles, outermost first), text }
//             where text is the plain text of everything up to the next heading.
export function parseManual(source) {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    const usedSlugs = new Map();
    let title = '';

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') { i++; continue; }

        const heading = HEADING.exec(line);
        if (heading) {
            const inline = parseInline(heading[2]);
            const level = heading[1].length;
            const base = slugify(plainText(inline));
            const seen = usedSlugs.get(base) || 0;
            usedSlugs.set(base, seen + 1);
            const slug = seen === 0 ? base : `${base}-${seen}`;
            if (level === 1 && !title) title = plainText(inline);
            blocks.push({ type: 'heading', level, slug, inline });
            i++;
            continue;
        }

        if (RULE.test(line)) { blocks.push({ type: 'rule' }); i++; continue; }

        if (line.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
            const head = splitTableRow(line).map(parseInline);
            const rows = [];
            i += 2;
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                rows.push(splitTableRow(lines[i]).map(parseInline));
                i++;
            }
            blocks.push({ type: 'table', head, rows });
            continue;
        }

        if (LIST_ITEM.test(line)) {
            const items = [];
            while (i < lines.length && lines[i].trim() !== '') {
                const item = LIST_ITEM.exec(lines[i]);
                if (item) items.push(item[1]);
                else if (isBlockStart(lines, i)) break;
                else items[items.length - 1] += ' ' + lines[i].trim();
                i++;
            }
            blocks.push({ type: 'list', items: items.map(parseInline) });
            continue;
        }

        const paragraph = [line.trim()];
        i++;
        while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines, i)) {
            paragraph.push(lines[i].trim());
            i++;
        }
        blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
    }

    return { title, blocks, sections: buildSections(blocks) };
}

function isBlockStart(lines, i) {
    const line = lines[i];
    return HEADING.test(line) || RULE.test(line) || LIST_ITEM.test(line)
        || (line.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]));
}

function blockText(block) {
    switch (block.type) {
        case 'paragraph': return plainText(block.inline);
        case 'list':      return block.items.map(plainText).join(' ');
        case 'table':     return [block.head, ...block.rows].map(row => row.map(plainText).join(' ')).join(' ');
        default:          return '';
    }
}

function buildSections(blocks) {
    const sections = [];
    const openTitles = [];   // openTitles[level] = the latest heading title at that level
    let current = null;
    for (const block of blocks) {
        if (block.type === 'heading') {
            const title = plainText(block.inline);
            openTitles[block.level] = title;
            openTitles.length = block.level + 1;
            if (block.level < 2) { current = null; continue; }
            const path = openTitles.slice(2, block.level).filter(Boolean);
            current = { slug: block.slug, title, level: block.level, path, text: '' };
            sections.push(current);
            continue;
        }
        if (current) {
            const text = blockText(block);
            if (text) current.text += (current.text ? ' ' : '') + text;
        }
    }
    return sections;
}

// ============================================================
// Loading
// ============================================================

let _manualPromise = null;
let _manual = null;

// Fetches and parses the manual once per session. A failed fetch clears the
// promise so a later call (Retry, the next search focus) tries again.
export function loadManual() {
    if (!_manualPromise) {
        _manualPromise = fetch(MANUAL_URL)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(source => (_manual = parseManual(source)))
            .catch(err => { _manualPromise = null; throw err; });
    }
    return _manualPromise;
}

// For Help in search, which stays synchronous: the sections once the manual
// has arrived, else null. Call loadManual() ahead of time (search-bar focus).
export function getHelpSections() {
    return _manual ? _manual.sections : null;
}

// ============================================================
// Rendering
// ============================================================

export function helpElementId(slug) {
    return `help-${slug}`;
}

function renderInline(nodes, parent) {
    for (const node of nodes) {
        if (node.type === 'text') {
            parent.appendChild(document.createTextNode(node.text));
        } else if (node.type === 'code') {
            const code = document.createElement('code');
            code.textContent = node.text;
            parent.appendChild(code);
        } else if (node.type === 'strong' || node.type === 'em') {
            const el = document.createElement(node.type);
            renderInline(node.children, el);
            parent.appendChild(el);
        } else if (node.type === 'link') {
            parent.appendChild(renderLink(node));
        }
    }
}

// #slug → scrolls the guide. https:// → a new tab. A "map:" title makes it a
// map link: in the guide it highlights that control on the app map
// (help-map.js) instead of scrolling; on GitHub it stays an ordinary link. Any other link is shown as its
// Markdown source, as plain text.
function renderLink(node) {
    if (node.href.startsWith('#')) {
        const slug = node.href.slice(1);
        const link = document.createElement('a');
        link.href = `#${helpElementId(slug)}`;
        link.className = 'help-guide-link';
        link.dataset.helpSlug = slug;
        if (node.title.startsWith('map:')) {
            link.dataset.helpMap = node.title.slice(4);
            link.classList.add('help-map-link');
            link.title = 'Show where this is on the map';
        }
        renderInline(node.children, link);
        return link;
    }
    if (/^https:\/\//.test(node.href)) {
        const link = document.createElement('a');
        link.href = node.href;
        link.target = '_blank';
        link.rel = 'noopener';
        renderInline(node.children, link);
        return link;
    }
    return document.createTextNode(node.raw);
}

// The manual's body as DOM (the H1 goes in the guide's header instead).
export function renderManualBody(manual) {
    const article = document.createElement('article');
    article.className = 'help-guide-article';
    let first = true;
    for (const block of manual.blocks) {
        if (block.type === 'heading' && block.level === 1) continue;
        if (first && block.type === 'rule') continue;   // the rule under the title
        first = false;
        article.appendChild(renderBlock(block));
    }
    return article;
}

function renderBlock(block) {
    switch (block.type) {
        case 'heading': {
            const heading = document.createElement(`h${block.level}`);
            heading.id = helpElementId(block.slug);
            renderInline(block.inline, heading);
            return heading;
        }
        case 'paragraph': {
            const paragraph = document.createElement('p');
            renderInline(block.inline, paragraph);
            return paragraph;
        }
        case 'list': {
            const list = document.createElement('ul');
            for (const item of block.items) {
                const li = document.createElement('li');
                renderInline(item, li);
                list.appendChild(li);
            }
            return list;
        }
        case 'table': {
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            for (const cell of block.head) {
                const th = document.createElement('th');
                renderInline(cell, th);
                headRow.appendChild(th);
            }
            thead.appendChild(headRow);
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            for (const row of block.rows) {
                const tr = document.createElement('tr');
                for (const cell of row) {
                    const td = document.createElement('td');
                    renderInline(cell, td);
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            return table;
        }
        default:
            return document.createElement('hr');
    }
}

// ## entries, each with its ### entries indented beneath it, and each ####
// beneath its ###.
function renderContents(manual, onPick) {
    const list = document.createElement('ul');
    list.className = 'help-guide-contents-list';
    const lists = { 2: list };
    for (const section of manual.sections) {
        const parentList = lists[section.level] || list;
        const li = document.createElement('li');
        li.className = `help-guide-contents-level-${section.level}`;
        const link = document.createElement('a');
        link.href = `#${helpElementId(section.slug)}`;
        link.dataset.helpSlug = section.slug;
        link.textContent = section.title;
        link.addEventListener('click', (e) => { e.preventDefault(); onPick(section.slug); });
        li.appendChild(link);
        parentList.appendChild(li);
        const children = document.createElement('ul');
        li.appendChild(children);
        lists[section.level + 1] = children;
        for (let level = section.level + 2; level <= 4; level++) delete lists[level];
    }
    // Drop empty nested lists.
    list.querySelectorAll('ul').forEach(ul => { if (!ul.firstChild) ul.remove(); });
    return list;
}

// ============================================================
// The overlay
// ============================================================

let _overlay = null;      // #help-guide
let _body = null;         // the scrolling center column
let _contents = null;     // the contents column
let _map = null;          // the app map (help-map.js)
let _rendered = false;
let _returnFocus = null;
let _fallbackFocus = null;
let _madeInert = [];
let _scrollFrame = 0;

export function isHelpGuideOpen() {
    return !!_overlay && !_overlay.classList.contains('hidden');
}

// Opens the guide, at the section `slug` if given (else at the top).
// options.returnFocusTo: where focus goes on close if the element that had
// focus when the guide opened is no longer visible (a "More help" link in a
// popover that the guide closed).
export function openHelpGuide(slug = '', options = {}) {
    closeAllPopovers();
    buildOverlay();

    const active = document.activeElement;
    _returnFocus = active && active !== document.body ? active : null;
    _fallbackFocus = options.returnFocusTo || null;

    if (!isHelpGuideOpen()) {
        _overlay.classList.remove('hidden');
        // Everything behind the guide is out of reach (Tab, clicks, screen
        // readers) without changing it: inert keeps layout, scroll positions
        // and the verse selection exactly as they are.
        _madeInert = [...document.body.children].filter(el => el !== _overlay && !el.inert);
        _madeInert.forEach(el => { el.inert = true; });
        window.addEventListener('keydown', onKeydown, true);
        _map.onOpen();
    }
    _body.focus({ preventScroll: true });
    showContent(slug);
}

export function closeHelpGuide() {
    if (!isHelpGuideOpen()) return;
    _map.onClose();
    _overlay.classList.add('hidden');
    _madeInert.forEach(el => { el.inert = false; });
    _madeInert = [];
    window.removeEventListener('keydown', onKeydown, true);

    const target = isFocusable(_returnFocus) ? _returnFocus
                 : isFocusable(_fallbackFocus) ? _fallbackFocus : null;
    _returnFocus = _fallbackFocus = null;
    if (target) target.focus({ preventScroll: true });
    else document.activeElement?.blur?.();
}

function isFocusable(el) {
    return !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest('.hidden');
}

// Escape is the guide's while it's open, and no key reaches the app behind
// it: this listener runs first (window, capture phase) and stops every key.
// Default actions still happen, so arrows and Page Down scroll the guide and
// Tab moves between its links.
function onKeydown(e) {
    e.stopPropagation();
    if (e.key === 'Escape') {
        e.preventDefault();
        if (_map.isDrawerOpen()) _map.closeDrawer();   // the map drawer first, then the guide
        else closeHelpGuide();
    }
}

function buildOverlay() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'help-guide';
    _overlay.className = 'hidden';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-labelledby', 'help-guide-title');

    const frame = document.createElement('div');
    frame.className = 'help-guide-frame';

    const header = document.createElement('header');
    header.className = 'help-guide-header';
    const title = document.createElement('h1');
    title.id = 'help-guide-title';
    title.textContent = 'User Manual';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'help-guide-close';
    closeBtn.setAttribute('aria-label', 'Close the guide');
    closeBtn.title = 'Close (Esc)';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeHelpGuide);
    // In a window too narrow for three columns, the map is a drawer.
    const mapBtn = document.createElement('button');
    mapBtn.className = 'help-guide-map-btn';
    mapBtn.textContent = 'Map';
    mapBtn.setAttribute('aria-label', 'Show the app map');
    mapBtn.addEventListener('click', () => _map.toggleDrawer());
    header.appendChild(title);
    header.appendChild(mapBtn);
    header.appendChild(closeBtn);

    _contents = document.createElement('nav');
    _contents.className = 'help-guide-contents';
    _contents.setAttribute('aria-label', 'Contents');

    _body = document.createElement('div');
    _body.className = 'help-guide-body';
    _body.tabIndex = -1;
    _body.addEventListener('scroll', () => {
        if (_scrollFrame) return;
        _scrollFrame = requestAnimationFrame(() => { _scrollFrame = 0; markCurrent(); });
    });
    _body.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-help-slug]');
        if (!link) return;
        e.preventDefault();
        if (link.dataset.helpMap) _map.showTarget(link.dataset.helpMap);
        else scrollToSection(link.dataset.helpSlug);
    });

    frame.appendChild(header);
    frame.appendChild(_contents);
    frame.appendChild(_body);
    _map = createHelpMap({ scrollToSection, closeGuide: closeHelpGuide });
    frame.appendChild(_map.element);
    _overlay.appendChild(frame);

    // The margin around the frame is the backdrop: a click there closes.
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) closeHelpGuide(); });
    // No click in the guide is a click "outside" anything behind it (the
    // book picker, the search results, a bookmark dropdown).
    _overlay.addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(_overlay);
}

function showContent(slug) {
    if (_rendered) { scrollToSection(slug); return; }

    _body.replaceChildren(statusMessage('Loading the guide…'));
    _contents.replaceChildren();
    loadManual().then(manual => {
        if (_rendered) return;
        _rendered = true;
        _overlay.querySelector('#help-guide-title').textContent = manual.title || 'User Manual';
        _contents.replaceChildren(renderContents(manual, scrollToSection));
        _body.replaceChildren(renderManualBody(manual));
        if (isHelpGuideOpen()) scrollToSection(slug);
    }).catch(() => {
        const message = statusMessage("The guide couldn't be loaded. Try again when you're online.");
        const retry = document.createElement('button');
        retry.className = 'help-guide-retry';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => showContent(slug));
        message.appendChild(retry);
        _body.replaceChildren(message);
    });
}

function statusMessage(text) {
    const el = document.createElement('div');
    el.className = 'help-guide-status';
    const p = document.createElement('p');
    p.textContent = text;
    el.appendChild(p);
    return el;
}

// Puts the section's heading at the top of the body. An unknown or empty
// slug goes to the top. Never touches location.hash.
function scrollToSection(slug) {
    const heading = slug ? _body.querySelector(`#${CSS.escape(helpElementId(slug))}`) : null;
    _body.scrollTop = heading
        ? heading.getBoundingClientRect().top - _body.getBoundingClientRect().top + _body.scrollTop
        : 0;
    markCurrent(heading ? slug : null);
}

// The current contents entry: the given section, or else the last heading
// at or above the top of the body.
function markCurrent(slug = undefined) {
    if (!_rendered) return;
    if (slug === undefined) {
        slug = null;
        const top = _body.getBoundingClientRect().top + 4;
        for (const heading of _body.querySelectorAll('h2, h3, h4')) {
            if (heading.getBoundingClientRect().top > top) break;
            slug = heading.id.slice('help-'.length);
        }
    }
    for (const link of _contents.querySelectorAll('a.current')) {
        link.classList.remove('current');
        link.removeAttribute('aria-current');
    }
    if (!slug) return;
    const link = _contents.querySelector(`a[data-help-slug="${CSS.escape(slug)}"]`);
    if (link) {
        link.classList.add('current');
        link.setAttribute('aria-current', 'location');
        link.scrollIntoView({ block: 'nearest' });
    }
}
