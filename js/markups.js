// markups.js — Markup button state and tool strip UI

const STORAGE_KEY = 'ember.markup_button.expanded';

let expanded = false;

export function initMarkups() {
    const btn   = document.getElementById('markup-btn');
    const strip = document.getElementById('markup-strip');
    if (!btn || !strip) return;

    // Restore persisted state
    expanded = localStorage.getItem(STORAGE_KEY) === 'true';
    applyState(btn, strip);

    btn.addEventListener('click', () => {
        expanded = !expanded;
        localStorage.setItem(STORAGE_KEY, String(expanded));
        applyState(btn, strip);
    });
}

function applyState(btn, strip) {
    btn.classList.toggle('active', expanded);
    strip.classList.toggle('hidden', !expanded);
}

// Other modules can query whether markup mode is active.
export function isMarkupModeActive() {
    return expanded;
}
