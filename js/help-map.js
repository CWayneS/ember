// help-map.js — The app map beside the help guide (docs/Help_Guide_Spec.md, Item 10)
//
// A wireframe of the app as it's laid out right now, measured from the live
// page each time the guide opens (and on resize while it's open), never
// drawn by hand: whatever the panel widths, side by side or stacked, Split
// Reader on or off, the map matches. A map link in the manual ("map:name"
// title) highlights that control here and fills in the key below the map;
// clicking the map scrolls the guide to that part of the manual; Show me
// closes the guide and outlines the real control.
//
// Built with createElementNS / createElement only, never by assigning HTML.
// It never changes the app's state: no selecting, switching tabs or opening
// panes, so closing the guide still leaves everything as it was.

const SVG_NS = 'http://www.w3.org/2000/svg';

// The app's main regions, drawn as labeled outlines. `section` is where a
// click on the region (outside any target) takes the guide.
const REGIONS = [
    { name: 'header',    selector: '#global-header',  label: 'Search & settings', section: 'search' },
    { name: 'plan-bar',  selector: '#template-bar',   label: 'Plan bar',          section: 'plans' },
    { name: 'notes',     selector: '#notes-panel',    label: 'Notebook',          section: 'taking-notes' },
    { name: 'reference', selector: '#reference-panel', label: 'Reference shelf',  section: 'the-reference-panel' },
    { name: 'reader',    selector: '#reader',         label: 'Bible',             section: 'reading-scripture' },
];

// Drawn faintly inside the regions, for orientation only.
const INNER = ['#reader-header', '#reader-pane-a', '#reader-pane-b', '#reference-tabs', '#notes-tabs'];
const HANDLES = ['#panel-resize-handle', '#workspace-resize-handle', '#reader-split-handle'];

// Every control the manual points at. Each name is a data-help-target on the
// real element (in index.html, or set where JS creates it).
//   label:   what the key calls it
//   section: the manual heading slug a click on it goes to
//   anchor:  the nearest always-visible container, outlined when the control isn't on screen
//   region:  the region it lives in, outlined if the anchor isn't on screen either
//   when:    shown in the key when the control is hidden
export const TARGETS = {
    'book-button':       { label: 'Translation and chapter', section: 'the-bookchapter-selector', anchor: '#reader-pane-a .pane-nav', region: 'reader' },
    'chapter-arrows':    { label: 'Previous / next chapter', section: 'navigating-chapters', anchor: '#reader-pane-a .pane-nav', region: 'reader' },
    'translation-shelf': { label: 'Translations shelf', section: 'adding-and-removing-translations', anchor: '#reader-pane-a .pane-book-btn', region: 'reader',
                           when: 'In the book picker: click the translation and chapter first, then the + after the translations' },
    'chapter-title':     { label: 'Chapter title', section: 'the-chapter-title', anchor: '#reader-pane-a .pane-content', region: 'reader' },
    'split-reader':      { label: 'Split reader', section: 'reading-in-two-panes-side-by-side', anchor: '#reader-header', region: 'reader' },
    'verse-lines':       { label: 'One verse per line', section: 'the-reader-header', anchor: '#reader-header', region: 'reader' },
    'markup-pen':        { label: 'Markup tools', section: 'marking-up-verses', anchor: '#reader-header', region: 'reader' },
    'bookmark':          { label: 'Bookmark', section: 'bookmarks', anchor: '#reader-header', region: 'reader' },
    'reader-help':       { label: 'Reader help', section: 'getting-help', anchor: '#reader-header', region: 'reader' },
    'reader-settings':   { label: 'Reader settings', section: 'the-reader-header', anchor: '#reader-header', region: 'reader' },
    'layout-toggle':     { label: 'Side by side / stacked', section: 'the-layout', anchor: '#notes-panel .panel-header', region: 'notes' },
    'resize-handles':    { label: 'Resize handles', section: 'the-layout', anchor: '#study-panels', region: 'notes' },
    'all-studies':       { label: 'All Studies', section: 'the-all-studies-view', anchor: '#notes-tabs', region: 'notes' },
    'new-study':         { label: 'New study', section: 'creating-a-study', anchor: '#notes-tabs', region: 'notes' },
    'add-note':          { label: '+ Add Note', section: 'adding-a-note', anchor: '#notes-panel', region: 'notes',
                           when: 'At the bottom of an open study: click + to start one, or open one from All Studies' },
    'attach-verse':      { label: 'Attach the selected verse', section: 'attaching-verses-to-existing-notes', anchor: '#notes-panel', region: 'notes',
                           when: 'Beside each note’s verse chips, while a verse is selected and a study with notes is open' },
    'tag-field':         { label: 'Tag field', section: 'using-tags', anchor: '#notes-panel', region: 'notes',
                           when: 'In each note’s footer, in an open study' },
    'export-study':      { label: 'Export', section: 'exporting-a-study-to-read-print-or-share', anchor: '#notes-panel', region: 'notes',
                           when: 'At the end of an open study’s title line' },
    'notes-help':        { label: 'Notes help', section: 'getting-help', anchor: '#notes-panel .panel-header', region: 'notes' },
    'notes-settings':    { label: 'Notes settings', section: 'appearance--settings', anchor: '#notes-panel .panel-header', region: 'notes' },
    'tab-info':          { label: 'Info tab', section: 'info', anchor: '#reference-tabs', region: 'reference' },
    'info-sections':     { label: 'Translation, Book and Chapter', section: 'info', anchor: '#reference-tabs', region: 'reference',
                           when: 'In the Info tab' },
    'summary-label':     { label: '1611 summary label', section: 'the-1611-chapter-summaries', anchor: '#reference-tabs', region: 'reference',
                           when: 'In the Info tab, under a chapter\'s summary' },
    'tab-tags':          { label: 'Tags tab', section: 'tags', anchor: '#reference-tabs', region: 'reference' },
    'tab-related':       { label: 'Related tab', section: 'related', anchor: '#reference-tabs', region: 'reference' },
    'tab-language':      { label: 'Language tab', section: 'language', anchor: '#reference-tabs', region: 'reference' },
    'tab-plans':         { label: 'Plans tab', section: 'plans', anchor: '#reference-tabs', region: 'reference' },
    'reference-help':    { label: 'Reference help', section: 'getting-help', anchor: '#reference-panel .panel-header', region: 'reference' },
    'reference-settings': { label: 'Reference settings', section: 'the-reference-panel', anchor: '#reference-panel .panel-header', region: 'reference' },
    'search-bar':        { label: 'Search bar', section: 'search', anchor: '#global-header', region: 'header' },
    'theme-toggle':      { label: 'Light / dark', section: 'appearance--settings', anchor: '#global-header', region: 'header' },
    'global-help':       { label: 'Help', section: 'getting-help', anchor: '#global-header', region: 'header' },
    'global-settings':   { label: 'Settings', section: 'appearance--settings', anchor: '#global-header', region: 'header' },
};

const NARROW_QUERY = '(max-width: 1099px)';

// ------------------------------------------------------------ measuring

// Shown, with a size: in the DOM, not inside anything hidden, and not zero-sized.
function onScreen(el) {
    if (!el || !el.isConnected || el.closest('.hidden')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function targetElements(name) {
    return [...document.querySelectorAll(`[data-help-target="${CSS.escape(name)}"]`)];
}

function visibleTargetElements(name) {
    return targetElements(name).filter(onScreen);
}

// ------------------------------------------------------------ the map

export function createHelpMap({ scrollToSection, closeGuide }) {
    const column = document.createElement('aside');
    column.className = 'help-map';
    column.setAttribute('aria-label', 'App map');

    const drawerClose = document.createElement('button');
    drawerClose.className = 'help-map-drawer-close';
    drawerClose.setAttribute('aria-label', 'Close the map');
    drawerClose.textContent = '✕';
    drawerClose.addEventListener('click', () => setDrawer(false));

    const heading = document.createElement('div');
    heading.className = 'help-map-heading';
    heading.textContent = 'Where things are';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('help-map-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'A map of Ember as it is laid out now');

    const key = document.createElement('div');
    key.className = 'help-map-key';
    key.setAttribute('aria-live', 'polite');

    column.append(drawerClose, heading, svg, key);
    renderKeyHint();

    let current = null;          // the highlighted target's name
    let observer = null;
    let frame = 0;
    let drawerOpen = false;

    function setDrawer(open) {
        drawerOpen = open;
        column.classList.toggle('drawer-open', open);
        column.closest('#help-guide')?.classList.toggle('help-map-drawer-open', open);
    }

    function isNarrow() {
        return window.matchMedia(NARROW_QUERY).matches;
    }

    // ---------------------------------------------------- drawing

    function rectEl(rect, className, extra = {}) {
        const r = document.createElementNS(SVG_NS, 'rect');
        r.setAttribute('x', rect.left.toFixed(1));
        r.setAttribute('y', rect.top.toFixed(1));
        r.setAttribute('width', Math.max(rect.width, 1).toFixed(1));
        r.setAttribute('height', Math.max(rect.height, 1).toFixed(1));
        r.setAttribute('class', className);
        for (const [name, value] of Object.entries(extra)) r.setAttribute(name, value);
        return r;
    }

    function draw() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.replaceChildren();
        const fontSize = Math.max(width / 30, 14);

        const backdrop = rectEl({ left: 0, top: 0, width, height }, 'help-map-window');
        svg.appendChild(backdrop);

        for (const region of REGIONS) {
            const el = document.querySelector(region.selector);
            if (!onScreen(el)) continue;
            const rect = el.getBoundingClientRect();
            const group = document.createElementNS(SVG_NS, 'g');
            group.setAttribute('class', 'help-map-region');
            group.dataset.region = region.name;
            group.appendChild(rectEl(rect, 'help-map-region-rect'));
            if (rect.height > fontSize * 1.6) {
                const label = document.createElementNS(SVG_NS, 'text');
                label.setAttribute('x', (rect.left + fontSize * 0.5).toFixed(1));
                label.setAttribute('y', (rect.top + rect.height / 2 + fontSize * 0.35).toFixed(1));
                label.setAttribute('font-size', fontSize.toFixed(1));
                label.setAttribute('class', 'help-map-region-label');
                label.textContent = region.label;
                if (region.name !== 'header' && region.name !== 'plan-bar') {
                    label.setAttribute('x', (rect.left + rect.width / 2).toFixed(1));
                    label.setAttribute('text-anchor', 'middle');
                    label.setAttribute('y', (rect.top + rect.height * 0.55).toFixed(1));
                }
                group.appendChild(label);
            }
            const title = document.createElementNS(SVG_NS, 'title');
            title.textContent = region.label;
            group.appendChild(title);
            group.addEventListener('click', () => scrollToSection(region.section));
            svg.appendChild(group);
        }

        for (const selector of INNER) {
            const el = document.querySelector(selector);
            if (onScreen(el)) svg.appendChild(rectEl(el.getBoundingClientRect(), 'help-map-inner'));
        }
        for (const selector of HANDLES) {
            const el = document.querySelector(selector);
            if (onScreen(el)) svg.appendChild(rectEl(el.getBoundingClientRect(), 'help-map-handle'));
        }

        for (const [name, target] of Object.entries(TARGETS)) {
            for (const el of visibleTargetElements(name)) {
                const r = rectEl(el.getBoundingClientRect(), 'help-map-target', { 'data-target': name });
                const title = document.createElementNS(SVG_NS, 'title');
                title.textContent = target.label;
                r.appendChild(title);
                r.addEventListener('click', (e) => {
                    e.stopPropagation();
                    scrollToSection(target.section);
                    showTarget(name, { scrollMap: false });
                });
                svg.appendChild(r);
            }
        }

        if (current) applyHighlight(current, false);
    }

    // ---------------------------------------------------- highlight + key

    function regionOf(name) {
        return REGIONS.find(region => region.name === TARGETS[name]?.region);
    }

    function applyHighlight(name, pulse) {
        svg.querySelectorAll('.help-map-highlight, .help-map-ring, .help-map-dashed, .help-map-region-outline')
            .forEach(el => el.remove());
        svg.querySelectorAll('.help-map-target.active').forEach(el => el.classList.remove('active'));

        const target = TARGETS[name];
        if (!target) return 'unknown';
        const visible = visibleTargetElements(name);

        if (visible.length > 0) {
            const regionEl = document.querySelector(regionOf(name)?.selector || '');
            if (onScreen(regionEl)) {
                svg.appendChild(rectEl(regionEl.getBoundingClientRect(), 'help-map-region-outline'));
            }
            for (const el of visible) {
                const rect = el.getBoundingClientRect();
                svg.appendChild(rectEl(rect, `help-map-highlight${pulse ? ' pulse' : ''}`, { 'data-target': name }));
                // Controls are tiny at map scale: a ring around each one finds it.
                const ring = document.createElementNS(SVG_NS, 'circle');
                ring.setAttribute('cx', (rect.left + rect.width / 2).toFixed(1));
                ring.setAttribute('cy', (rect.top + rect.height / 2).toFixed(1));
                ring.setAttribute('r', (Math.max(rect.width, rect.height) / 2 + window.innerWidth / 50).toFixed(1));
                ring.setAttribute('class', `help-map-ring${pulse ? ' pulse' : ''}`);
                svg.appendChild(ring);
            }
            svg.querySelectorAll(`.help-map-target[data-target="${CSS.escape(name)}"]`)
                .forEach(el => el.classList.add('active'));
            return 'shown';
        }

        const anchor = document.querySelector(target.anchor);
        const fallback = onScreen(anchor) ? anchor : document.querySelector(regionOf(name)?.selector || '');
        if (onScreen(fallback)) {
            svg.appendChild(rectEl(fallback.getBoundingClientRect(), 'help-map-dashed',
                { 'data-target': name, 'data-outlined': fallback === anchor ? 'anchor' : 'region' }));
        }
        return 'hidden';
    }

    function renderKeyHint() {
        const hint = document.createElement('p');
        hint.className = 'help-map-key-hint';
        hint.textContent = 'Click a dotted link in the guide to see where that control is, or click the map to read about that part of Ember.';
        key.replaceChildren(hint);
    }

    function renderKey(name, state) {
        const target = TARGETS[name];
        key.replaceChildren();

        const row = document.createElement('div');
        row.className = 'help-map-key-row';
        const real = targetElements(name)[0];
        if (real) {
            const icon = document.createElement('span');
            icon.className = 'help-map-key-icon';
            icon.appendChild(copyOfControl(real));
            row.appendChild(icon);
        }
        const label = document.createElement('span');
        label.className = 'help-map-key-label';
        label.textContent = target.label;
        row.appendChild(label);
        key.appendChild(row);

        if (state === 'hidden' && target.when) {
            const when = document.createElement('p');
            when.className = 'help-map-key-when';
            when.textContent = target.when;
            key.appendChild(when);
        }

        if (state === 'shown') {
            const showMe = document.createElement('button');
            showMe.className = 'help-map-show-me';
            showMe.textContent = 'Show me';
            showMe.addEventListener('click', () => showMeTarget(name));
            key.appendChild(showMe);
        }
    }

    // The real control's own content, so the key can't go stale: ids and
    // help targets stripped, inert and hidden from screen readers.
    function copyOfControl(el) {
        const copy = el.cloneNode(true);
        for (const node of [copy, ...copy.querySelectorAll('*')]) {
            node.removeAttribute('id');
            node.removeAttribute('data-help-target');
            node.removeAttribute('for');
            node.classList?.remove('hidden', 'active', 'selected');
        }
        copy.inert = true;
        copy.setAttribute('aria-hidden', 'true');
        copy.tabIndex = -1;
        return copy;
    }

    // A map link: highlight the control, open the drawer in a narrow window,
    // and bring the map into view. Never scrolls the guide.
    function showTarget(name, { scrollMap = true } = {}) {
        if (!TARGETS[name]) return;
        current = name;
        if (isNarrow()) setDrawer(true);
        const state = applyHighlight(name, true);
        renderKey(name, state);
        if (scrollMap) svg.scrollIntoView({ block: 'nearest' });
    }

    // ---------------------------------------------------- Show me

    function showMeTarget(name) {
        const elements = visibleTargetElements(name);
        closeGuide();
        if (elements.length === 0) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        for (const el of elements) {
            el.classList.remove('help-show-me', 'help-show-me-steady');
            void el.offsetWidth;   // restart the animation
            el.classList.add(reduced ? 'help-show-me-steady' : 'help-show-me');
            setTimeout(() => el.classList.remove('help-show-me', 'help-show-me-steady'), reduced ? 2000 : 1500);
        }
        const first = elements[0];
        if (first.matches('button, input, a[href], select, textarea, [tabindex]') && !first.disabled) {
            first.focus({ preventScroll: true });
        }
    }

    // ---------------------------------------------------- open / close

    function onOpen() {
        draw();
        observer = new ResizeObserver(() => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                if (!isNarrow() && drawerOpen) setDrawer(false);
                draw();
            });
        });
        observer.observe(document.documentElement);
    }

    function onClose() {
        observer?.disconnect();
        observer = null;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        setDrawer(false);
        current = null;
        renderKeyHint();
    }

    return {
        element: column,
        onOpen,
        onClose,
        showTarget,
        toggleDrawer: () => setDrawer(!drawerOpen),
        isDrawerOpen: () => drawerOpen,
        closeDrawer: () => setDrawer(false),
    };
}
