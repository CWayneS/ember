// help.js — Contextual help popovers for reader, notes, reference, and global

import { bindPopover } from './popover-registry.js';
import { openHelpGuide } from './help-guide.js';

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

    // "More in the guide" links open the guide at the link's section. Focus
    // goes back to the panel's ? button on close, since the popover the link
    // was in is closed by then.
    for (const { btn, popover } of entries) {
        popover.querySelectorAll('.help-more-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                openHelpGuide(link.dataset.helpSection || '', { returnFocusTo: btn });
            });
        });
    }
}
