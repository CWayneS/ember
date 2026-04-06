// reference-settings.js — Reference panel settings popover (default tab)

import { getState, setState } from './db.js';
import { switchReferenceTab } from './panels.js';

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

    // Open / close toggle
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alreadyOpen = !popover.classList.contains('hidden');
        closePopover(popover);
        if (!alreadyOpen) openPopover(btn, popover);
    });

    // Prevent clicks inside from closing
    popover.addEventListener('click', (e) => e.stopPropagation());

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
        if (e.detail.verseIds.length > 0) {
            const tab = getState(STATE_KEY) || DEFAULT_TAB;
            if (tab !== 'keep') switchReferenceTab(tab);
        }
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

function updateToggle(btns, activeTab) {
    btns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === activeTab));
}
