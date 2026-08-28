// plans.js — Reading plan import (JSON + CSV)

import { insertPlan } from './db.js';

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
