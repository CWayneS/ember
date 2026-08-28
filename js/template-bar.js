// template-bar.js — Reading plan template bar: passage-level navigation
// within the current day of an active plan.
//
// current_step (in plans) tracks only the day the plan's bookmark sits on.
// Which passage within that day is showing, and which day the bar is
// currently *browsing* (which can drift from current_step via Prev/Prev Day
// review, without moving the bookmark), are session-only state here — they
// are never persisted and do not survive a reload. Only Next Day writes to
// the database, advancing current_step by one.

import { getPlan, getPlanDayScripture, setPlanProgress, deactivatePlan, makeVerseId } from './db.js';
import { navigateTo } from './reader.js';

// { planRowId, title, durationDays, dayNumber, passages, passageIndex } | null
let state = null;

let barEl, titleEl, prevBtn, trackEl, nextBtn, closeBtn;

export function initTemplateBar() {
    barEl    = document.getElementById('template-bar');
    titleEl  = document.getElementById('template-bar-title');
    prevBtn  = document.getElementById('template-bar-prev');
    trackEl  = document.getElementById('template-bar-track');
    nextBtn  = document.getElementById('template-bar-next');
    closeBtn = document.getElementById('template-bar-close');

    prevBtn.addEventListener('click', handlePrev);
    nextBtn.addEventListener('click', handleNext);
    closeBtn.addEventListener('click', handleClose);
}

// Sets current_step to dayNumber, loads that day's passages, navigates the
// reader to the first one, and shows the bar. This is the single entry
// point the Plans tab popover uses for both Continue and clicking a day row.
export function activatePlan(planRowId, dayNumber) {
    setPlanProgress(planRowId, dayNumber);

    const plan = getPlan(planRowId);
    if (!plan) return;

    state = { planRowId, title: plan.title, durationDays: plan.duration_days, dayNumber, passages: [], passageIndex: 0 };
    loadDay(dayNumber);

    titleEl.textContent = plan.title;
    barEl.classList.remove('hidden');
}

function loadDay(dayNumber) {
    state.dayNumber    = dayNumber;
    state.passages     = getPlanDayScripture(state.planRowId, dayNumber);
    state.passageIndex = 0;
    navigateToCurrentPassage();
    render();
}

function navigateToCurrentPassage() {
    const passage = state.passages[state.passageIndex];
    if (!passage) return;
    const verseId = makeVerseId(passage.book, passage.chapter, passage.verse_start);
    navigateTo(passage.book, passage.chapter, verseId);
}

function handlePrev() {
    if (!state) return;

    if (state.passageIndex > 0) {
        state.passageIndex--;
        navigateToCurrentPassage();
        render();
        return;
    }

    // First passage of the day — go to the previous day's last passage.
    // Day 1 has no previous day; the button is disabled in that state.
    if (state.dayNumber <= 1) return;

    const prevDayNumber = state.dayNumber - 1;
    const prevPassages  = getPlanDayScripture(state.planRowId, prevDayNumber);
    state.dayNumber     = prevDayNumber;
    state.passages      = prevPassages;
    state.passageIndex  = Math.max(prevPassages.length - 1, 0);
    navigateToCurrentPassage();
    render();
}

function handleNext() {
    if (!state) return;

    if (state.passageIndex < state.passages.length - 1) {
        state.passageIndex++;
        navigateToCurrentPassage();
        render();
        return;
    }

    // Last passage of the day.
    if (state.dayNumber >= state.durationDays) {
        // Last passage of the last day — the plan is finished.
        setPlanProgress(state.planRowId, state.durationDays);
        hide();
        return;
    }

    const nextDayNumber = state.dayNumber + 1;
    setPlanProgress(state.planRowId, nextDayNumber);
    loadDay(nextDayNumber);
}

function handleClose() {
    if (!state) return;
    deactivatePlan(state.planRowId);
    hide();
}

function hide() {
    barEl.classList.add('hidden');
    titleEl.textContent = '';
    state = null;
}

function render() {
    prevBtn.textContent = state.passageIndex === 0 ? '◀ Prev Day' : '◀ Prev';
    prevBtn.disabled    = state.passageIndex === 0 && state.dayNumber <= 1;

    nextBtn.textContent = state.passageIndex === state.passages.length - 1 ? 'Next Day ▶' : 'Next ▶';

    trackEl.innerHTML = '';
    state.passages.forEach((passage, i) => {
        if (i === state.passageIndex) {
            const label = document.createElement('button');
            label.type        = 'button';
            label.className   = 'template-bar-label';
            label.textContent = passage.display;
            label.addEventListener('click', navigateToCurrentPassage);
            trackEl.appendChild(label);
        } else {
            const dot = document.createElement('span');
            dot.className = 'template-bar-dot' + (i < state.passageIndex ? ' filled' : '');
            trackEl.appendChild(dot);
        }
    });
}
