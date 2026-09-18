// study-templates.js — Study Templates sub-tab: list of built-in templates,
// tap-to-generate flow (Build 5 Item 4)

import { getStudyTemplates, generateStudyFromTemplate } from './db.js';
import { openStudy } from './panels.js';
import { openPromptDialog } from './dialogs.js';

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

// Asks for a study name (pre-filled with the template's name), then
// generates the study and opens it via the same path the "+" button uses.
// Cancelling creates nothing.
async function handleStartTemplate(template) {
    const studyName = await openPromptDialog({
        title: 'Name this study',
        label: 'Study name',
        defaultValue: template.name,
        confirmLabel: 'Start'
    });
    if (studyName === null) return;

    const studyId = generateStudyFromTemplate(template.id, studyName);
    openStudy(studyId, studyName);
}
