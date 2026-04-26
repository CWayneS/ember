// notes-settings.js — Notes panel settings popover (font size control)

import { getState, setState } from './db.js';
import { registerPopover, closeAllPopovers } from './popover-registry.js';

const DEFAULT_SIZE = 18;
const MIN_SIZE     = 12;
const MAX_SIZE     = 28;
const STATE_KEY    = 'notes_font_size';

export function initNotesSettings() {
    const btn      = document.querySelector('#notes-panel .panel-settings-btn');
    const popover  = document.getElementById('notes-settings-popover');
    const decBtn   = document.getElementById('notes-font-size-decrease');
    const incBtn   = document.getElementById('notes-font-size-increase');
    const resetBtn = document.getElementById('notes-font-size-reset');
    const display  = document.getElementById('notes-font-size-display');
    const notesPanel = document.getElementById('notes-panel');

    // Restore persisted value
    const saved = parseInt(getState(STATE_KEY)) || DEFAULT_SIZE;
    let currentSize = clamp(saved);
    applySize(notesPanel, currentSize, display, decBtn, incBtn);

    registerPopover(() => closePopover(popover));

    // Open / close toggle
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alreadyOpen = !popover.classList.contains('hidden');
        closeAllPopovers();
        if (!alreadyOpen) openPopover(btn, popover);
    });

    // Prevent clicks inside from closing
    popover.addEventListener('click', (e) => e.stopPropagation());

    decBtn.addEventListener('click', () => {
        currentSize = clamp(currentSize - 1);
        applySize(notesPanel, currentSize, display, decBtn, incBtn);
        setState(STATE_KEY, String(currentSize));
    });

    incBtn.addEventListener('click', () => {
        currentSize = clamp(currentSize + 1);
        applySize(notesPanel, currentSize, display, decBtn, incBtn);
        setState(STATE_KEY, String(currentSize));
    });

    resetBtn.addEventListener('click', () => {
        currentSize = DEFAULT_SIZE;
        applySize(notesPanel, currentSize, display, decBtn, incBtn);
        setState(STATE_KEY, String(DEFAULT_SIZE));
    });

    // Close on outside click or Escape
    document.addEventListener('click', () => closePopover(popover));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePopover(popover);
    });
}

function openPopover(btn, popover) {
    const rect = btn.getBoundingClientRect();
    popover.style.top   = `${rect.bottom + 6}px`;
    popover.style.right = `${window.innerWidth - rect.right}px`;
    popover.classList.remove('hidden');
}

function closePopover(popover) {
    popover.classList.add('hidden');
}

function applySize(notesPanel, size, display, decBtn, incBtn) {
    notesPanel.style.setProperty('--notes-font-size', `${size}px`);
    display.textContent = `${size}px`;
    decBtn.disabled = size <= MIN_SIZE;
    incBtn.disabled = size >= MAX_SIZE;
}

function clamp(size) {
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
}
