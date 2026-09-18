// reader-settings.js — Reader settings popover (font size control)

import { getState, setState } from './db.js';
import { bindPopover } from './popover-registry.js';

const DEFAULT_SIZE = 18;
const MIN_SIZE     = 12;
const MAX_SIZE     = 28;
const STATE_KEY    = 'scripture_font_size';

export function initReaderSettings() {
    const btn     = document.getElementById('reader-settings-btn');
    const popover = document.getElementById('reader-settings-popover');
    const decBtn  = document.getElementById('font-size-decrease');
    const incBtn  = document.getElementById('font-size-increase');
    const resetBtn = document.getElementById('font-size-reset');
    const display = document.getElementById('font-size-display');
    const readerBody = document.getElementById('reader-body');

    // Restore persisted value
    const saved = parseInt(getState(STATE_KEY)) || DEFAULT_SIZE;
    let currentSize = clamp(saved);
    applySize(readerBody, currentSize, display, decBtn, incBtn);

    bindPopover(btn, popover);

    decBtn.addEventListener('click', () => {
        currentSize = clamp(currentSize - 1);
        applySize(readerBody, currentSize, display, decBtn, incBtn);
        setState(STATE_KEY, String(currentSize));
    });

    incBtn.addEventListener('click', () => {
        currentSize = clamp(currentSize + 1);
        applySize(readerBody, currentSize, display, decBtn, incBtn);
        setState(STATE_KEY, String(currentSize));
    });

    resetBtn.addEventListener('click', () => {
        currentSize = DEFAULT_SIZE;
        applySize(readerBody, currentSize, display, decBtn, incBtn);
        setState(STATE_KEY, String(DEFAULT_SIZE));
    });
}

function applySize(readerBody, size, display, decBtn, incBtn) {
    readerBody.style.setProperty('--scripture-font-size', `${size}px`);
    display.textContent = `${size}px`;
    decBtn.disabled = size <= MIN_SIZE;
    incBtn.disabled = size >= MAX_SIZE;
}

function clamp(size) {
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
}
