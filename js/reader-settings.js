// reader-settings.js — Reader settings popover (font size control)

import { getState, setState } from './db.js';
import { registerPopover, closeAllPopovers } from './popover-registry.js';

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
        applySize(readerBody, currentSize, display, decBtn, incBtn);
        persist(currentSize);
    });

    incBtn.addEventListener('click', () => {
        currentSize = clamp(currentSize + 1);
        applySize(readerBody, currentSize, display, decBtn, incBtn);
        persist(currentSize);
    });

    resetBtn.addEventListener('click', () => {
        currentSize = DEFAULT_SIZE;
        applySize(readerBody, currentSize, display, decBtn, incBtn);
        clearPersisted();
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

function applySize(readerBody, size, display, decBtn, incBtn) {
    readerBody.style.setProperty('--scripture-font-size', `${size}px`);
    display.textContent = `${size}px`;
    decBtn.disabled = size <= MIN_SIZE;
    incBtn.disabled = size >= MAX_SIZE;
}

function clamp(size) {
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
}

function persist(size) {
    setState(STATE_KEY, String(size));
}

function clearPersisted() {
    // Reset by removing the key — getState will return null → default used on next load
    setState(STATE_KEY, String(DEFAULT_SIZE));
}
