// panels.js — Study panel management: tabs, views, resize handles

import { createStudy, getState, setState } from './db.js';
import { languageTabShown } from './language.js';

// Open study tabs — browser-tab model
// "all" is the permanent All Studies tab; study IDs are integers.
let openStudies  = [];   // [{ id, name }, ...]
let activeStudyId = 'all';

export function initPanels() {
    initNotesTabs();
    watchStudyTabsWidth();
    initReferenceTabs();
    initWorkspaceResize();
    initPanelResize();
    initSelectionListener();
    initPanelLayout();
    // Ensure DOM state matches JS state and initial views are rendered
    switchToStudy('all');
}

// Called once every tab's content has been built (app.js), so the tab open
// at the last visit comes back as it was.
export function restoreReferenceTab() {
    const saved = localStorage.getItem(REFERENCE_TAB_KEY);
    if (saved && document.getElementById(`${saved}-tab`)) switchTab(saved);
}

// ============================================================
// Reference Tabs
// ============================================================

// The open tab is remembered in localStorage rather than app_state: it changes
// on every tab click, and setState writes out the whole database.
const REFERENCE_TAB_KEY = 'ember.reference.tab';

function initReferenceTabs() {
    document.querySelectorAll('#reference-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

function switchTab(tabName) {
    document.querySelectorAll('#reference-tabs .tab-btn').forEach(btn => {
        const active = btn.dataset.tab === tabName;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('#reference-panel .tab-content').forEach(panel => {
        const active = panel.id === `${tabName}-tab`;
        panel.classList.toggle('active', active);
        panel.classList.toggle('hidden', !active);
    });
    try { localStorage.setItem(REFERENCE_TAB_KEY, tabName); } catch (_) {}
    if (tabName === 'language') languageTabShown();
}

// ============================================================
// Notes Tabs — browser-tab model
// ============================================================

function initNotesTabs() {
    // "All Studies" is the permanent leftmost tab
    document.querySelector('#notes-tabs [data-study-id="all"]')
        .addEventListener('click', () => switchToStudy('all'));

    // "+" creates a new study and opens it immediately
    document.getElementById('notes-tab-add').addEventListener('click', () => {
        const studyId = createStudy('Untitled Study');
        openStudy(studyId, 'Untitled Study');
    });
}

// Open a tag filter tab. If already open, switch to it.
export function openTagView(tagName) {
    const tabId = `tag:${tagName}`;
    if (openStudies.find(s => s.id === tabId)) {
        switchToStudy(tabId);
        return;
    }
    openStudies.push({ id: tabId, name: tagName, type: 'tag' });
    renderStudyTabs();
    switchToStudy(tabId);
}

// Open a study in a tab. If already open, switch to it.
export function openStudy(studyId, studyName) {
    if (openStudies.find(s => s.id === studyId)) {
        switchToStudy(studyId);
        return;
    }
    openStudies.push({ id: studyId, name: studyName });
    renderStudyTabs();
    switchToStudy(studyId);
}

// Close a study tab. Falls back to the nearest remaining tab or "All Studies".
export function closeStudy(studyId) {
    const index = openStudies.findIndex(s => s.id === studyId);
    if (index === -1) return;

    openStudies.splice(index, 1);
    renderStudyTabs();

    if (activeStudyId === studyId) {
        const fallback = openStudies[Math.max(0, index - 1)];
        switchToStudy(fallback ? fallback.id : 'all');
    }
}

export function switchToStudy(studyId) {
    activeStudyId = studyId;

    // Update tab active state
    document.querySelectorAll('#notes-tabs .notes-tab').forEach(btn => {
        const active = btn.dataset.studyId === String(studyId);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    // Show the correct content area
    const activeView     = document.getElementById('notes-active-view');
    const allStudiesView = document.getElementById('notes-all-studies-view');
    activeView.classList.toggle('hidden',     studyId === 'all');
    allStudiesView.classList.toggle('hidden', studyId !== 'all');

    document.dispatchEvent(new CustomEvent('study-changed', {
        detail: { studyId }
    }));
}

export function getActiveStudyId() {
    return activeStudyId;
}

export function renameStudyTab(studyId, name) {
    const entry = openStudies.find(s => s.id === studyId);
    if (entry) entry.name = name;
    const tab = document.querySelector(`#notes-tabs [data-study-id="${studyId}"]`);
    if (tab) {
        tab.querySelector('.notes-tab-name').textContent = name;
        tab.title = name;
    }
}

function renderStudyTabs() {
    // Remove all dynamic study tabs (leave "All Studies" and "+" in place)
    document.querySelectorAll('#notes-tabs .notes-tab:not([data-study-id="all"])').forEach(el => el.remove());

    const addBtn = document.getElementById('notes-tab-add');

    for (const study of openStudies) {
        const tab = document.createElement('button');
        tab.className = 'notes-tab';
        tab.dataset.studyId = study.id;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', activeStudyId === study.id ? 'true' : 'false');
        if (activeStudyId === study.id) tab.classList.add('active');

        const nameSpan = document.createElement('span');
        nameSpan.className   = 'notes-tab-name';
        nameSpan.textContent = study.type === 'tag' ? `#${study.name}` : study.name;
        tab.title            = nameSpan.textContent; // the full name, when the tab is too narrow for it

        const closeBtn = document.createElement('span');
        closeBtn.className   = 'notes-tab-close';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('role', 'button');
        closeBtn.setAttribute('title', 'Close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // don't also fire the tab click
            closeStudy(study.id);
        });

        tab.appendChild(nameSpan);
        tab.appendChild(closeBtn);
        tab.addEventListener('click', () => switchToStudy(study.id));

        addBtn.before(tab);
    }
    fitStudyTabs();
}

// Study tabs wrap onto up to three rows at their usual width. Past three, they
// narrow (names truncate) in 10px steps down to the 60px minimum before a
// fourth row is allowed (and scrolls). Re-fitted when tabs open or close and
// when the panel's width changes.
const MAX_TAB_ROWS     = 3;
const TAB_BASIS_WIDEST = 120;
const TAB_BASIS_NARROW = 60;

function fitStudyTabs() {
    const nav = document.getElementById('notes-tabs');
    let basis = TAB_BASIS_WIDEST;
    nav.style.setProperty('--notes-tab-basis', `${basis}px`);
    while (basis > TAB_BASIS_NARROW && countRows(nav) > MAX_TAB_ROWS) {
        basis -= 10;
        nav.style.setProperty('--notes-tab-basis', `${basis}px`);
    }
}

function countRows(container) {
    const tops = new Set();
    for (const child of container.children) tops.add(Math.round(child.offsetTop));
    return tops.size;
}

function watchStudyTabsWidth() {
    const nav = document.getElementById('notes-tabs');
    let lastWidth = 0;
    new ResizeObserver(() => {
        const width = nav.clientWidth;
        if (width === lastWidth) return; // fitting changes the height, not the width
        lastWidth = width;
        fitStudyTabs();
    }).observe(nav);
}

// ============================================================
// Workspace Resize — horizontal drag redistributes study-panels vs reader
// ============================================================

function initWorkspaceResize() {
    const handle      = document.getElementById('workspace-resize-handle');
    const studyPanels = document.getElementById('study-panels');
    const workspace   = document.getElementById('workspace');

    let dragging  = false;
    let startX    = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
        dragging   = true;
        startX     = e.clientX;
        startWidth = studyPanels.getBoundingClientRect().width;
        document.body.style.cursor    = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const delta         = e.clientX - startX;
        const workspaceWidth = workspace.getBoundingClientRect().width;
        const newWidth      = clamp(startWidth + delta, 300, workspaceWidth - 300);
        studyPanels.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
    });
}

// ============================================================
// Panel Resize — redistributes notes-panel vs reference-panel.
// Horizontal drag when side by side (row); vertical when stacked (column).
// ============================================================

let panelRatio = 50;   // notes panel percentage of study-panels container

function applyPanelRatio(ratio) {
    const pct = ratio.toFixed(2);
    const rem = (100 - parseFloat(pct)).toFixed(2);
    document.getElementById('notes-panel').style.flex     = `1 1 ${pct}%`;
    document.getElementById('reference-panel').style.flex = `1 1 ${rem}%`;
}

function initPanelResize() {
    const handle      = document.getElementById('panel-resize-handle');
    const notesPanel  = document.getElementById('notes-panel');
    const studyPanels = document.getElementById('study-panels');

    let dragging  = false;
    let startPos  = 0;
    let startSize = 0;

    handle.addEventListener('mousedown', (e) => {
        const sideBySide = studyPanels.classList.contains('side-by-side');
        dragging  = true;
        startPos  = sideBySide ? e.clientX : e.clientY;
        const rect = notesPanel.getBoundingClientRect();
        startSize = sideBySide ? rect.width : rect.height;
        document.body.style.cursor     = sideBySide ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const sideBySide    = studyPanels.classList.contains('side-by-side');
        const current       = sideBySide ? e.clientX : e.clientY;
        const delta         = current - startPos;
        const containerRect = studyPanels.getBoundingClientRect();
        const totalSize     = sideBySide ? containerRect.width : containerRect.height;
        const newSize       = clamp(startSize + delta, 80, totalSize - 80);
        panelRatio = newSize / totalSize * 100;
        applyPanelRatio(panelRatio);
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
    });
}

// ============================================================
// Layout Toggle — notes beside the reference panel (row, the default) or
// notes above it (column). Saved in app_state.
// ============================================================

const LAYOUT_STATE_KEY = 'study_panel_layout';   // 'side-by-side' | 'stacked'

function initPanelLayout() {
    applyPanelLayout(getState(LAYOUT_STATE_KEY) !== 'stacked');
    document.getElementById('layout-toggle-btn').addEventListener('click', togglePanelLayout);
}

function applyPanelLayout(sideBySide) {
    document.getElementById('study-panels').classList.toggle('side-by-side', sideBySide);
    const btn = document.getElementById('layout-toggle-btn');
    btn.textContent = sideBySide ? '⇅' : '⇆';
    btn.title = sideBySide ? 'Put notes above reference' : 'Put notes beside reference';
}

export function togglePanelLayout() {
    const notesPanel     = document.getElementById('notes-panel');
    const referencePanel = document.getElementById('reference-panel');
    const sideBySide = !document.getElementById('study-panels').classList.contains('side-by-side');

    applyPanelLayout(sideBySide);
    setState(LAYOUT_STATE_KEY, sideBySide ? 'side-by-side' : 'stacked');

    // Reset explicit sizing and ratio so both panels start at 50/50 in the new orientation
    panelRatio = 50;
    notesPanel.style.flex     = '';
    notesPanel.style.height   = '';
    notesPanel.style.width    = '';
    referencePanel.style.flex = '';
}

// ============================================================
// Selection Listener — switch to Info tab on verse selection
// ============================================================

function initSelectionListener() {
    // Auto-switching to the Info tab on verse select was removed — jarring when
    // the user is reading another reference tab. Re-add switchTab('info') here
    // if a smarter trigger is wanted later (e.g. only on first selection).
}

// Exported so notes.js (and future modules) can switch reference tabs
export function switchReferenceTab(tabName) {
    switchTab(tabName);
}

// ============================================================
// Helpers
// ============================================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
