// global-settings.js — Global settings popover (Build 4 Item 4/5)
//
// Open/close + popover-registry wiring matches the pattern used by
// reader-settings.js/notes-settings.js/reference-settings.js. Content is
// built from SECTIONS below rather than hardcoded markup, so a future build
// adds a section by extending that array — the title+divider treatment and
// the ToC entry it gets are both generic, not one-offs.
//
// reader-settings.js/notes-settings.js/reference-settings.js content is
// explicitly NOT migrated in here yet — out of scope for Build 4.

import { registerPopover, closeAllPopovers } from './popover-registry.js';
import { exportBackup } from './db.js';
import { restoreFromBackup } from './backup.js';

const SECTIONS = [
    {
        id: 'backup-restore',
        title: 'Backup & Restore',
        render(container) {
            const desc = document.createElement('p');
            desc.className = 'settings-section-desc';
            desc.textContent = 'Export your data as a backup file, or restore from a previous backup.';
            container.appendChild(desc);

            const actions = document.createElement('div');
            actions.className = 'settings-section-actions';

            const exportBtn = document.createElement('button');
            exportBtn.type = 'button';
            exportBtn.className = 'settings-action-btn';
            exportBtn.textContent = 'Export Backup';
            exportBtn.addEventListener('click', () => exportBackup());

            const restoreBtn = document.createElement('button');
            restoreBtn.type = 'button';
            restoreBtn.className = 'settings-action-btn danger';
            restoreBtn.textContent = 'Restore from Backup';
            restoreBtn.addEventListener('click', () => restoreFromBackup());

            actions.appendChild(exportBtn);
            actions.appendChild(restoreBtn);
            container.appendChild(actions);
        }
    }
];

export function initGlobalSettings() {
    const btn     = document.getElementById('global-settings-btn');
    const popover = document.getElementById('global-settings-popover');

    buildPopoverContent(popover);

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

function buildPopoverContent(popover) {
    const title = document.createElement('h2');
    title.className = 'settings-popover-title';
    title.textContent = 'Settings';
    popover.appendChild(title);
    popover.appendChild(divider());

    const toc = document.createElement('nav');
    toc.className = 'settings-toc';
    toc.setAttribute('aria-label', 'On this page');

    const tocLabel = document.createElement('p');
    tocLabel.className = 'settings-toc-label';
    tocLabel.textContent = 'On this page:';
    toc.appendChild(tocLabel);

    const tocList = document.createElement('ul');
    for (const section of SECTIONS) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.className   = 'settings-toc-link';
        link.href        = `#global-settings-section-${section.id}`;
        link.textContent = section.title;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById(`global-settings-section-${section.id}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        li.appendChild(link);
        tocList.appendChild(li);
    }
    toc.appendChild(tocList);
    popover.appendChild(toc);
    popover.appendChild(divider());

    for (const section of SECTIONS) {
        const sectionEl = document.createElement('section');
        sectionEl.className = 'settings-section';
        sectionEl.id = `global-settings-section-${section.id}`;

        const sectionTitle = document.createElement('h3');
        sectionTitle.className = 'settings-section-title';
        sectionTitle.textContent = section.title;
        sectionEl.appendChild(sectionTitle);
        sectionEl.appendChild(divider());

        section.render(sectionEl);
        popover.appendChild(sectionEl);
    }
}

function divider() {
    const hr = document.createElement('div');
    hr.className = 'settings-divider';
    return hr;
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
