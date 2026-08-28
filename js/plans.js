// plans.js — Reading plan import (JSON + CSV) and the Plans tab UI

import {
    insertPlan, getPlans, deletePlan,
    getPlanDetail, getPlanDayFirstPassage, setPlanProgress, restartPlan,
    makeVerseId
} from './db.js';
import { navigateTo } from './reader.js';

// ============================================================
// Plans tab — Reading Plans sub-tab (list, import, delete)
// ============================================================

export function initPlans() {
    initPlansSubtabs();
    initPlanImport();

    // panels.js only toggles tab visibility; refresh the list whenever the
    // Plans tab itself is opened so imports/deletes made earlier are reflected.
    const plansTabBtn = document.querySelector('#reference-tabs [data-tab="plans"]');
    plansTabBtn.addEventListener('click', renderReadingPlansList);

    renderReadingPlansList();
}

function initPlansSubtabs() {
    document.querySelectorAll('.plans-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchPlansSubtab(btn.dataset.subtab));
    });
}

function switchPlansSubtab(subtab) {
    document.querySelectorAll('.plans-subtab-btn').forEach(btn => {
        const active = btn.dataset.subtab === subtab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.plans-subtab-content').forEach(panel => {
        const active = panel.id === `${subtab}-subtab`;
        panel.classList.toggle('active', active);
        panel.classList.toggle('hidden', !active);
    });
}

function initPlanImport() {
    const importBtn = document.getElementById('plan-import-btn');
    const fileInput  = document.getElementById('plan-import-input');

    importBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        fileInput.value = ''; // allow re-selecting the same file next time
        if (!file) return;

        try {
            const result = await importPlan(file);
            if (result === null) return; // user cancelled the CSV metadata dialog
            renderReadingPlansList();
        } catch (e) {
            alert(e.message);
        }
    });
}

function renderReadingPlansList() {
    const container = document.getElementById('plans-list');
    container.innerHTML = '';

    const plans = getPlans();

    if (plans.length === 0) {
        const empty = document.createElement('p');
        empty.className   = 'notes-empty';
        empty.textContent = 'No reading plans installed. Use the Import button to add a plan.';
        container.appendChild(empty);
        return;
    }

    for (const plan of plans) {
        container.appendChild(buildPlanCard(plan));
    }
}

function buildPlanCard(plan) {
    const card = document.createElement('div');
    card.className = 'plan-card';

    const info = document.createElement('div');
    info.className = 'plan-card-info';
    info.addEventListener('click', () => openPlanDetailPopover(plan.id));

    const titleRow = document.createElement('div');
    titleRow.className = 'plan-card-title-row';

    const title = document.createElement('span');
    title.className   = 'plan-card-title';
    title.textContent = plan.title;

    const badge = document.createElement('span');
    badge.className   = `plan-status-badge plan-status-${plan.status}`;
    badge.textContent = planStatusLabel(plan.status);

    titleRow.appendChild(title);
    titleRow.appendChild(badge);
    info.appendChild(titleRow);

    if (plan.status === 'active') {
        const progress = document.createElement('div');
        progress.className   = 'plan-card-progress';
        progress.textContent = `Day ${plan.current_step} of ${plan.duration_days}`;
        info.appendChild(progress);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'plan-card-delete';
    delBtn.textContent = '✕';
    delBtn.setAttribute('title', 'Delete plan');
    delBtn.setAttribute('aria-label', `Delete ${plan.title}`);
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeletePlan(plan);
    });

    card.appendChild(info);
    card.appendChild(delBtn);
    return card;
}

function planStatusLabel(status) {
    if (status === 'active') return 'In Progress';
    if (status === 'completed') return 'Completed';
    return 'Not Started';
}

// `plan` needs only { id, title, current_step, duration_days } — both the
// getPlans() row (card ✕) and the getPlanDetail() result (popover Delete
// button) satisfy that. `onDeleted` runs only after a confirmed delete —
// the popover uses it to close itself.
async function handleDeletePlan(plan, { onDeleted } = {}) {
    const confirmed = await openConfirmDialog({
        title: `Delete "${plan.title}"?`,
        lines: [
            `Current progress: Day ${plan.current_step} of ${plan.duration_days}`,
            'The plan and your progress will be removed. Your notes are not affected.'
        ],
        confirmLabel: 'Delete',
        danger: true
    });
    if (!confirmed) return;

    deletePlan(plan.id);
    renderReadingPlansList();
    onDeleted?.();
}

// Same field requirements as handleDeletePlan(); `onRestarted` runs only
// after a confirmed restart.
async function handleRestartPlan(plan, { onRestarted } = {}) {
    const confirmed = await openConfirmDialog({
        title: `Restart "${plan.title}"?`,
        lines: [
            `Current progress: Day ${plan.current_step} of ${plan.duration_days}`,
            'This will reset your progress to Day 1. Your notes are not affected.'
        ],
        confirmLabel: 'Restart'
    });
    if (!confirmed) return;

    restartPlan(plan.id);
    renderReadingPlansList();
    onRestarted?.();
}

// Small centered modal with a heading, one or more message lines, and
// Cancel/Confirm buttons. Resolves true on confirm, false on cancel/escape/
// backdrop click. Built without innerHTML so plan titles (user- or
// import-supplied text) can never be interpreted as markup.
function openConfirmDialog({ title, lines, confirmLabel, cancelLabel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'plan-metadata-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'plan-metadata-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const heading = document.createElement('h2');
        heading.textContent = title;
        dialog.appendChild(heading);

        for (const line of lines) {
            const p = document.createElement('p');
            p.className   = 'plan-confirm-line';
            p.textContent = line;
            dialog.appendChild(p);
        }

        const actions = document.createElement('div');
        actions.className = 'plan-metadata-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type      = 'button';
        cancelBtn.className = 'plan-metadata-cancel';
        cancelBtn.textContent = cancelLabel;

        const confirmBtn = document.createElement('button');
        confirmBtn.type      = 'button';
        confirmBtn.className = 'plan-metadata-confirm' + (danger ? ' danger' : '');
        confirmBtn.textContent = confirmLabel;

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        function cleanup() {
            document.removeEventListener('keydown', onKeydown);
            overlay.remove();
        }
        function onCancel()  { cleanup(); resolve(false); }
        function onConfirm() { cleanup(); resolve(true); }
        function onKeydown(e) { if (e.key === 'Escape') onCancel(); }

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) onCancel(); });
        document.addEventListener('keydown', onKeydown);

        confirmBtn.focus();
    });
}

// ============================================================
// Plan detail popover
// ============================================================

function openPlanDetailPopover(planRowId) {
    const detail = getPlanDetail(planRowId);
    if (!detail) return;

    const overlay = document.createElement('div');
    overlay.className = 'plan-metadata-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'plan-detail-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    function closePopover() {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
    }
    function onKeydown(e) { if (e.key === 'Escape') closePopover(); }

    // Header: title + Continue
    const header = document.createElement('div');
    header.className = 'plan-detail-header';

    const titleEl = document.createElement('h2');
    titleEl.className   = 'plan-detail-title';
    titleEl.textContent = detail.title;

    const continueBtn = document.createElement('button');
    continueBtn.className   = 'plan-detail-continue';
    continueBtn.textContent = 'Continue →';
    continueBtn.addEventListener('click', () => {
        goToPlanDay(detail, effectiveCurrentDay(detail));
        closePopover();
    });

    header.appendChild(titleEl);
    header.appendChild(continueBtn);
    dialog.appendChild(header);

    // Progress summary (omitted for not_started)
    if (detail.status !== 'not_started') {
        const progress = document.createElement('div');
        progress.className   = 'plan-detail-progress';
        progress.textContent = `Day ${detail.current_step} of ${detail.duration_days}`;
        dialog.appendChild(progress);
    }

    // Day list
    const dayList = document.createElement('div');
    dayList.className = 'plan-detail-days';

    const currentDay = effectiveCurrentDay(detail);
    let currentRowEl = null;

    for (const day of detail.days) {
        const row = document.createElement('button');
        row.type      = 'button';
        row.className = 'plan-detail-day-row';

        let statusIcon = '○';
        if (day.day_number < currentDay) {
            statusIcon = '☑';
            row.classList.add('completed');
        } else if (day.day_number === currentDay) {
            statusIcon = '▶';
            row.classList.add('current');
            currentRowEl = row;
        }

        const iconEl = document.createElement('span');
        iconEl.className   = 'plan-detail-day-icon';
        iconEl.textContent = statusIcon;

        const labelEl = document.createElement('span');
        labelEl.className = 'plan-detail-day-label';
        const labelParts  = [`Day ${day.day_number}`];
        if (day.title) labelParts.push(day.title);
        if (day.first_passage_display) labelParts.push(day.first_passage_display);
        labelEl.textContent = labelParts.join(' — ');

        row.appendChild(iconEl);
        row.appendChild(labelEl);
        row.addEventListener('click', () => {
            goToPlanDay(detail, day.day_number);
            closePopover();
        });

        dayList.appendChild(row);
    }

    dialog.appendChild(dayList);

    // Footer: Restart + Delete
    const footer = document.createElement('div');
    footer.className = 'plan-detail-footer';

    const restartBtn = document.createElement('button');
    restartBtn.className   = 'plan-detail-restart';
    restartBtn.textContent = 'Restart';
    restartBtn.addEventListener('click', () => {
        handleRestartPlan(detail, { onRestarted: closePopover });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className   = 'plan-detail-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
        handleDeletePlan(detail, { onDeleted: closePopover });
    });

    footer.appendChild(restartBtn);
    footer.appendChild(deleteBtn);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopover(); });
    document.addEventListener('keydown', onKeydown);

    if (currentRowEl) {
        currentRowEl.scrollIntoView({ block: 'center' });
    }
}

// The day a plan is "on": current_step if it has started, else Day 1.
function effectiveCurrentDay(detail) {
    return detail.current_step > 0 ? detail.current_step : 1;
}

// Sets progress to dayNumber and navigates the reader to that day's first
// passage. Used by both Continue and clicking a specific day row.
function goToPlanDay(detail, dayNumber) {
    setPlanProgress(detail.id, dayNumber);

    const passage = getPlanDayFirstPassage(detail.id, dayNumber);
    if (!passage) {
        console.error(`goToPlanDay: no first passage for plan "${detail.plan_id}" day ${dayNumber}`);
        return;
    }

    const verseId = makeVerseId(passage.book, passage.chapter, passage.verse_start);
    navigateTo(passage.book, passage.chapter, verseId);
    renderReadingPlansList();
}

// ============================================================
// Plan import (JSON + CSV)
// ============================================================

// Accepts a File object (from a file picker or drop). Detects format by
// extension, parses and validates it, and inserts the plan via db.js.
// Returns the insertPlan() result, or null if the user cancels the CSV
// metadata dialog. Throws an Error with a user-facing .message on any
// validation failure.
export async function importPlan(file) {
    const name = (file.name || '').toLowerCase();

    if (name.endsWith('.json')) {
        return importJsonPlan(file);
    }
    if (name.endsWith('.csv')) {
        return importCsvPlan(file);
    }
    throw new Error('Only .json and .csv plan files are supported.');
}

// ============================================================
// JSON import
// ============================================================

async function importJsonPlan(file) {
    let data;
    try {
        const text = await file.text();
        data = JSON.parse(text);
    } catch (e) {
        throw new Error("Could not read this file. Make sure it's a valid Ember plan file.");
    }

    const meta = data && typeof data === 'object' ? data.plan_metadata : null;
    const days = data && typeof data === 'object' ? data.days : null;

    const missing = [];
    if (!meta || typeof meta !== 'object') missing.push('plan_metadata');
    if (!meta?.id) missing.push('plan_metadata.id');
    if (!meta?.title) missing.push('plan_metadata.title');
    if (!meta?.duration_days) missing.push('plan_metadata.duration_days');
    if (!Array.isArray(days) || days.length === 0) missing.push('days');
    if (missing.length > 0) {
        throw new Error(`This plan file is missing required field(s): ${missing.join(', ')}.`);
    }

    // Date-bound conversion: silently drop schedule_type/start_date and go
    // sequential. current_step is derived from how many days would have
    // elapsed since start_date, if that's determinable; otherwise 0.
    let currentStep = 0;
    if (meta.schedule_type === 'date' || meta.start_date) {
        currentStep = deriveCurrentStepFromStartDate(meta.start_date, meta.duration_days);
    }

    const sequentialMeta = {
        id: meta.id,
        title: meta.title,
        description: meta.description,
        author: meta.author,
        language: meta.language,
        duration_days: meta.duration_days,
        tags: meta.tags,
        schema_version: meta.schema_version,
        current_step: currentStep
    };

    return insertPlanOrThrowFriendly(sequentialMeta, days, 'imported');
}

// Best-effort determination of "days elapsed since start_date," clamped to
// [0, duration_days]. Returns 0 if start_date is missing or unparseable.
function deriveCurrentStepFromStartDate(startDate, durationDays) {
    if (typeof startDate !== 'string') return 0;

    const start = new Date(`${startDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) return 0;

    const now = new Date();
    const startUtcDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const nowUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const elapsedDays = Math.floor((nowUtcDay - startUtcDay) / 86400000);

    if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) return 0;
    return Math.min(elapsedDays, durationDays);
}

// ============================================================
// CSV import
// ============================================================

async function importCsvPlan(file) {
    let text;
    try {
        text = await file.text();
    } catch (e) {
        throw new Error("Could not read this file. Make sure it's a valid Ember plan file.");
    }

    const rows = parseCsv(text);
    if (!rows || rows.length === 0) {
        throw new Error("Could not read this file. Make sure it's a valid Ember plan file.");
    }

    const durationDays = rows.reduce((max, row) => Math.max(max, row.day), 0);

    const dayMap = new Map();
    for (const row of rows) {
        if (!dayMap.has(row.day)) dayMap.set(row.day, []);
        dayMap.get(row.day).push({ ref: row.ref, display: row.display });
    }
    const days = [...dayMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([day_number, scripture]) => ({ day_number, scripture }));

    const metadata = await openCsvMetadataDialog();
    if (!metadata) return null; // user cancelled

    const meta = {
        id: `csv-${slugify(metadata.title)}-${Date.now()}`,
        title: metadata.title,
        description: metadata.description || null,
        author: metadata.author || null,
        language: 'en',
        duration_days: durationDays,
        tags: [],
        schema_version: 1,
        current_step: 0
    };

    return insertPlanOrThrowFriendly(meta, days, 'imported');
}

// Expected columns: day, ref, display (any order, matched by header name).
// Returns null if the required columns aren't present.
function parseCsv(text) {
    const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
    if (lines.length < 2) return null;

    const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const dayIdx = header.indexOf('day');
    const refIdx = header.indexOf('ref');
    const displayIdx = header.indexOf('display');
    if (dayIdx === -1 || refIdx === -1 || displayIdx === -1) return null;

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        const dayNum = parseInt(cols[dayIdx], 10);
        if (!Number.isFinite(dayNum)) continue;
        rows.push({
            day: dayNum,
            ref: (cols[refIdx] ?? '').trim(),
            display: (cols[displayIdx] ?? '').trim()
        });
    }
    return rows;
}

// Minimal RFC4180-style line splitter: handles quoted fields with embedded
// commas and doubled quotes ("").
function splitCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else {
                cur += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            result.push(cur);
            cur = '';
        } else {
            cur += c;
        }
    }
    result.push(cur);
    return result;
}

function slugify(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'plan';
}

// Small centered modal collecting title (required), description, and author
// for a CSV import. Resolves with the entered values, or null on cancel.
function openCsvMetadataDialog() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'plan-metadata-overlay';
        overlay.innerHTML = `
            <div class="plan-metadata-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-meta-heading">
                <h2 id="plan-meta-heading">Plan Details</h2>
                <p class="plan-metadata-hint">This CSV doesn't include plan info — fill in a few details before importing.</p>
                <label class="plan-metadata-field">
                    Title <span class="plan-metadata-required">*</span>
                    <input type="text" id="plan-meta-title" autocomplete="off">
                </label>
                <label class="plan-metadata-field">
                    Description
                    <textarea id="plan-meta-description" rows="2"></textarea>
                </label>
                <label class="plan-metadata-field">
                    Author
                    <input type="text" id="plan-meta-author" autocomplete="off">
                </label>
                <div class="plan-metadata-actions">
                    <button type="button" class="plan-metadata-cancel">Cancel</button>
                    <button type="button" class="plan-metadata-confirm">Import</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const titleInput   = overlay.querySelector('#plan-meta-title');
        const descInput    = overlay.querySelector('#plan-meta-description');
        const authorInput  = overlay.querySelector('#plan-meta-author');
        const cancelBtn    = overlay.querySelector('.plan-metadata-cancel');
        const confirmBtn   = overlay.querySelector('.plan-metadata-confirm');

        function cleanup() {
            document.removeEventListener('keydown', onKeydown);
            overlay.remove();
        }

        function onCancel() {
            cleanup();
            resolve(null);
        }

        function onConfirm() {
            const title = titleInput.value.trim();
            if (!title) {
                titleInput.focus();
                return;
            }
            cleanup();
            resolve({
                title,
                description: descInput.value.trim(),
                author: authorInput.value.trim()
            });
        }

        function onKeydown(e) {
            if (e.key === 'Escape') onCancel();
        }

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) onCancel();
        });
        document.addEventListener('keydown', onKeydown);

        titleInput.focus();
    });
}

// ============================================================
// Shared insert wrapper
// ============================================================

function insertPlanOrThrowFriendly(meta, days, source) {
    try {
        return insertPlan(meta, days, source);
    } catch (e) {
        if (e.code === 'DUPLICATE_PLAN_ID') {
            throw new Error('A plan with this ID is already installed.');
        }
        throw e;
    }
}
