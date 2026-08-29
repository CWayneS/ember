// study-templates.js — Study Templates sub-tab: list of built-in templates,
// tap-to-generate flow (Build 5 Item 4)

import { getStudyTemplates, generateStudyFromTemplate } from './db.js';
import { openStudy } from './panels.js';

export function initStudyTemplates() {
    renderStudyTemplatesList();
}

function renderStudyTemplatesList() {
    const container = document.getElementById('study-templates-list');
    container.innerHTML = '';

    for (const template of getStudyTemplates()) {
        container.appendChild(buildTemplateCard(template));
    }
}

function buildTemplateCard(template) {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.addEventListener('click', () => handleStartTemplate(template));

    const title = document.createElement('div');
    title.className   = 'template-card-title';
    title.textContent = template.name;

    const description = document.createElement('div');
    description.className   = 'template-card-description';
    description.textContent = template.description || '';

    card.appendChild(title);
    card.appendChild(description);
    return card;
}

async function handleStartTemplate(template) {
    const studyName = await openStudyNameDialog(template.name);
    if (studyName === null) return; // cancelled — nothing created

    const studyId = generateStudyFromTemplate(template.id, studyName);
    openStudy(studyId, studyName);
}

// Small centered modal collecting a study name, pre-filled with the
// template's name as a default. Resolves with the trimmed name, or null on
// cancel. Built without innerHTML (document.createElement/textContent),
// matching plans.js's openConfirmDialog() pattern, and reusing its
// plan-metadata-* dialog styling rather than inventing a new one.
function openStudyNameDialog(defaultName) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'plan-metadata-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'plan-metadata-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const heading = document.createElement('h2');
        heading.textContent = 'Name this study';
        dialog.appendChild(heading);

        const label = document.createElement('label');
        label.className   = 'plan-metadata-field';
        label.textContent = 'Study name';

        const input = document.createElement('input');
        input.type          = 'text';
        input.autocomplete  = 'off';
        input.value         = defaultName;
        label.appendChild(input);
        dialog.appendChild(label);

        const actions = document.createElement('div');
        actions.className = 'plan-metadata-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type        = 'button';
        cancelBtn.className   = 'plan-metadata-cancel';
        cancelBtn.textContent = 'Cancel';

        const confirmBtn = document.createElement('button');
        confirmBtn.type        = 'button';
        confirmBtn.className   = 'plan-metadata-confirm';
        confirmBtn.textContent = 'Start';

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        function cleanup() {
            document.removeEventListener('keydown', onKeydown);
            overlay.remove();
        }
        function onCancel()  { cleanup(); resolve(null); }
        function onConfirm() {
            const name = input.value.trim();
            if (!name) { input.focus(); return; }
            cleanup();
            resolve(name);
        }
        function onKeydown(e) { if (e.key === 'Escape') onCancel(); }

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) onCancel(); });
        document.addEventListener('keydown', onKeydown);

        input.focus();
        input.select();
    });
}
