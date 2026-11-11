// global-settings.js — Global settings popover (Build 4 Item 4/5)
//
// Open/close comes from popover-registry.js's bindPopover, shared with the
// per-panel settings and help popovers. Content is built from SECTIONS below
// rather than hardcoded markup, so a future build adds a section by
// extending that array — the title+divider treatment and the ToC entry it
// gets are both generic, not one-offs.
//
// reader-settings.js/notes-settings.js/reference-settings.js content is
// explicitly NOT migrated in here yet — out of scope for Build 4.

import { bindPopover } from './popover-registry.js';
import { exportBackup, isStoragePersisted } from './db.js';
import { exportReadableCopy } from './readable-export.js';
import { flushPendingSaves } from './notes.js';
import { restoreFromBackup } from './backup.js';

const STORAGE_AT_RISK_NOTE = 'Your browser may clear Ember’s data if this device runs low on storage. Export a backup regularly to keep your notes safe.';
const STORAGE_KEPT_NOTE    = 'Your browser has agreed to keep Ember’s data, but a backup still protects your notes if this device is lost or fails. Export one regularly.';

let storageNote = null;

async function refreshStorageNote() {
    storageNote.textContent = await isStoragePersisted() ? STORAGE_KEPT_NOTE : STORAGE_AT_RISK_NOTE;
}

const SECTIONS = [
    {
        id: 'backup-restore',
        title: 'Backup & Restore',
        render(container) {
            const desc = document.createElement('p');
            desc.className = 'settings-section-desc';
            desc.textContent = 'Export your data as a backup file, or restore from a previous backup. A readable copy is a page of all your studies, with their verses quoted, to read, print or share; it can’t be restored.';
            container.appendChild(desc);

            storageNote = document.createElement('p');
            storageNote.className = 'settings-section-desc settings-storage-note';
            storageNote.textContent = STORAGE_AT_RISK_NOTE;
            container.appendChild(storageNote);

            const actions = document.createElement('div');
            actions.className = 'settings-section-actions';

            const exportBtn = document.createElement('button');
            exportBtn.type = 'button';
            exportBtn.className = 'settings-action-btn';
            exportBtn.textContent = 'Export Backup';
            // Typing still waiting on its autosave goes into the backup too.
            exportBtn.addEventListener('click', () => {
                flushPendingSaves();
                exportBackup();
            });

            const readableBtn = document.createElement('button');
            readableBtn.type = 'button';
            readableBtn.className = 'settings-action-btn';
            readableBtn.textContent = 'Export Readable Copy';
            readableBtn.addEventListener('click', () => exportReadableCopy({ button: readableBtn }));

            const restoreBtn = document.createElement('button');
            restoreBtn.type = 'button';
            restoreBtn.className = 'settings-action-btn danger';
            restoreBtn.textContent = 'Restore from Backup';
            restoreBtn.addEventListener('click', () => restoreFromBackup());

            actions.appendChild(exportBtn);
            actions.appendChild(readableBtn);
            actions.appendChild(restoreBtn);
            container.appendChild(actions);
        }
    },
    {
        id: 'data-attribution',
        title: 'Data & Attribution',
        render(container) {
            const desc = document.createElement('p');
            desc.className = 'settings-section-desc';
            desc.textContent = 'Ember bundles data from several sources. The six Bible translations, Nave’s Topical Bible, and the Brown-Driver-Briggs (1906) and Strong’s (1890) Hebrew dictionaries are public domain. Three sources are licensed CC BY 4.0 and credited here as required:';
            container.appendChild(desc);

            const list = document.createElement('ul');
            list.className = 'settings-credits-list';

            for (const credit of [
                {
                    name: 'STEPBible-Data',
                    url: 'https://www.stepbible.org',
                    note: 'Original-language word data (Hebrew/Greek text, glosses, lexicon entries, and Greek and Hebrew grammar decoding: the TAHOT, TAGNT, TBESG, TEGMC and TEHMC datasets) powering the Language tab, from Tyndale House, Cambridge.'
                },
                {
                    name: 'OpenBible.info',
                    url: 'https://www.openbible.info',
                    note: 'Cross-reference data powering the Related tab.'
                },
                {
                    // One entry for both repositories Ember draws on
                    // (HebrewLexicon and morphhb), which ask for the same credit.
                    name: 'Open Scriptures Hebrew Bible Project',
                    url: 'https://hb.openscriptures.org',
                    note: 'Hebrew lexicon (Brown-Driver-Briggs and Strong’s Hebrew Dictionary) powering the Language tab’s Lexicon for Hebrew words. When a word has several BDB entries, their order comes from word frequencies in the OSHB text.'
                }
            ]) {
                const li = document.createElement('li');
                li.className = 'settings-credit-item';

                const link = document.createElement('a');
                link.href = credit.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'settings-credit-link';
                link.textContent = credit.name;

                const note = document.createElement('span');
                note.className = 'settings-credit-note';
                note.textContent = ` — ${credit.note} CC BY 4.0.`;

                li.appendChild(link);
                li.appendChild(note);
                list.appendChild(li);
            }

            container.appendChild(list);
        }
    }
];

export function initGlobalSettings() {
    const btn     = document.getElementById('global-settings-btn');
    const popover = document.getElementById('global-settings-popover');

    buildPopoverContent(popover);
    bindPopover(btn, popover);

    // Read fresh on each open: the browser's answer can change during a session.
    refreshStorageNote();
    btn.addEventListener('click', refreshStorageNote);
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
