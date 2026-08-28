// global-settings.js — Global settings popover (Build 4 Item 4/5)
//
// Item 4: open/close + popover-registry wiring only, matching the pattern
// used by reader-settings.js/notes-settings.js/reference-settings.js. Popover
// content (table of contents, Backup & Restore section) is built in Item 5.

import { registerPopover, closeAllPopovers } from './popover-registry.js';

export function initGlobalSettings() {
    const btn     = document.getElementById('global-settings-btn');
    const popover = document.getElementById('global-settings-popover');

    registerPopover(() => closePopover(popover));

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alreadyOpen = !popover.classList.contains('hidden');
        closeAllPopovers();
        if (!alreadyOpen) openPopover(btn, popover);
    });

    // Prevent clicks inside from closing
    popover.addEventListener('click', (e) => e.stopPropagation());

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
