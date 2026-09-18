// help.js — Contextual help popovers for reader, notes, reference, and global

import { bindPopover } from './popover-registry.js';

export function initHelp() {
    const entries = [
        {
            btn:     document.getElementById('reader-help-btn'),
            popover: document.getElementById('reader-help-popover'),
        },
        {
            btn:     document.querySelector('#notes-panel .panel-help-btn'),
            popover: document.getElementById('notes-help-popover'),
        },
        {
            btn:     document.querySelector('#reference-panel .panel-help-btn'),
            popover: document.getElementById('reference-help-popover'),
        },
        {
            btn:     document.getElementById('global-help-btn'),
            popover: document.getElementById('global-help-popover'),
        },
    ];

    for (const { btn, popover } of entries) {
        bindPopover(btn, popover);
    }

    // "More help" links — non-functional placeholder
    document.querySelectorAll('.help-more-link').forEach(link => {
        link.addEventListener('click', (e) => e.preventDefault());
    });
}
