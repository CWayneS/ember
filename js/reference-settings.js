// reference-settings.js — Reference panel settings popover (default tab)

import { getState, setState } from './db.js';
import { switchReferenceTab } from './panels.js';
import { bindPopover } from './popover-registry.js';

const DEFAULT_TAB = 'info';
const STATE_KEY   = 'default_reference_tab';

export function initReferenceSettings() {
    const btn      = document.querySelector('#reference-panel .panel-settings-btn');
    const popover  = document.getElementById('reference-settings-popover');
    const resetBtn = document.getElementById('ref-tab-reset');
    const toggleBtns = popover.querySelectorAll('.tab-toggle-btn');

    // Restore persisted value
    let currentTab = getState(STATE_KEY) || DEFAULT_TAB;
    updateToggle(toggleBtns, currentTab);

    bindPopover(btn, popover);

    // Tab selection
    toggleBtns.forEach(tb => {
        tb.addEventListener('click', () => {
            currentTab = tb.dataset.tab;
            updateToggle(toggleBtns, currentTab);
            setState(STATE_KEY, currentTab);
        });
    });

    resetBtn.addEventListener('click', () => {
        currentTab = DEFAULT_TAB;
        updateToggle(toggleBtns, currentTab);
        setState(STATE_KEY, DEFAULT_TAB);
    });

    // Switch to chosen default tab on verse selection (skip if set to keep)
    document.addEventListener('selection-changed', (e) => {
        if (e.detail.verseIds.length > 0 && currentTab !== 'keep') {
            switchReferenceTab(currentTab);
        }
    });
}

function updateToggle(btns, activeTab) {
    btns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === activeTab));
}
