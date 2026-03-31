// panels.js — Study panel management: tabs, views, resize handles

import { createStudy } from './db.js';

// Open study tabs — browser-tab model
// "all" is the permanent All Studies tab; study IDs are integers.
let openStudies  = [];   // [{ id, name }, ...]
let activeStudyId = 'all';

export function initPanels() {
    initNotesTabs();
    initReferenceTabs();
    initWorkspaceResize();
    initPanelResize();
    initSelectionListener();
}

// ============================================================
// Reference Tabs
// ============================================================

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
        nameSpan.textContent = study.name;

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
// Vertical drag in default (column) layout; horizontal in stacked (row) layout.
// ============================================================

function initPanelResize() {
    const handle       = document.getElementById('panel-resize-handle');
    const notesPanel   = document.getElementById('notes-panel');
    const studyPanels  = document.getElementById('study-panels');

    let dragging  = false;
    let startPos  = 0;
    let startSize = 0;

    handle.addEventListener('mousedown', (e) => {
        const stacked = studyPanels.classList.contains('stacked');
        dragging  = true;
        startPos  = stacked ? e.clientX : e.clientY;
        const rect = notesPanel.getBoundingClientRect();
        startSize = stacked ? rect.width : rect.height;
        document.body.style.cursor    = stacked ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const stacked      = studyPanels.classList.contains('stacked');
        const current      = stacked ? e.clientX : e.clientY;
        const delta        = current - startPos;
        const containerRect = studyPanels.getBoundingClientRect();
        const totalSize    = stacked ? containerRect.width : containerRect.height;
        const newSize      = clamp(startSize + delta, 80, totalSize - 80);

        notesPanel.style.flex = 'none';
        if (stacked) {
            notesPanel.style.width  = `${newSize}px`;
            notesPanel.style.height = '';
        } else {
            notesPanel.style.height = `${newSize}px`;
            notesPanel.style.width  = '';
        }
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
    });
}

// ============================================================
// Layout Toggle — switch between stacked (column) and side-by-side (row)
// ============================================================

export function togglePanelLayout() {
    const studyPanels = document.getElementById('study-panels');
    const notesPanel  = document.getElementById('notes-panel');

    studyPanels.classList.toggle('stacked');

    // Reset any explicit sizing so flex takes over cleanly
    notesPanel.style.flex   = '';
    notesPanel.style.height = '';
    notesPanel.style.width  = '';
}

// ============================================================
// Selection Listener — switch to Info tab on verse selection
// ============================================================

function initSelectionListener() {
    document.addEventListener('selection-changed', (e) => {
        if (e.detail.verseIds.length > 0) {
            switchTab('info');
        }
    });
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
