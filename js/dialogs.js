// dialogs.js — Small centered modal dialogs shared across features
//
// One builder for the overlay/dialog/actions skeleton, two flavors on top:
// a yes/no confirm and a single-text-field prompt. plans.js, backup.js and
// study-templates.js each used to carry their own copy of this skeleton.
//
// Built from DOM nodes and textContent only — never innerHTML — because the
// copy shown here routinely includes user- or import-supplied text (plan
// titles, study names) that must never be interpreted as markup. Reuses
// the .plan-metadata-* styles, which are the app's dialog styles in all
// but name.

// Resolves true on confirm, false on Cancel / Escape / backdrop click.
export function openConfirmDialog({ title, lines = [], confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
        const { dialog, confirmBtn, mount, close } = buildDialog({ title, confirmLabel, cancelLabel, danger });

        for (const line of lines) {
            const p = document.createElement('p');
            p.className   = 'plan-confirm-line';
            p.textContent = line;
            dialog.appendChild(p);
        }

        mount({
            onCancel:  () => { close(); resolve(false); },
            onConfirm: () => { close(); resolve(true); },
        });
        confirmBtn.focus();
    });
}

// Resolves with the trimmed, non-empty text on confirm, or null on Cancel /
// Escape / backdrop click. An empty submission just refocuses the field.
export function openPromptDialog({ title, label, defaultValue = '', confirmLabel = 'OK', cancelLabel = 'Cancel' }) {
    return new Promise((resolve) => {
        const { dialog, mount, close } = buildDialog({ title, confirmLabel, cancelLabel });

        const field       = document.createElement('label');
        field.className   = 'plan-metadata-field';
        field.textContent = label;

        const input        = document.createElement('input');
        input.type         = 'text';
        input.autocomplete = 'off';
        input.value        = defaultValue;
        field.appendChild(input);
        dialog.appendChild(field);

        mount({
            onCancel:  () => { close(); resolve(null); },
            onConfirm: () => {
                const value = input.value.trim();
                if (!value) { input.focus(); return; }
                close();
                resolve(value);
            },
        });
        input.focus();
        input.select();
    });
}

// Overlay + dialog + heading, with the action row built but not yet
// appended. `mount(handlers)` appends the actions, attaches the dialog to
// the document, and wires Cancel/Confirm buttons, Escape, and backdrop
// click. `close()` detaches everything.
function buildDialog({ title, confirmLabel, cancelLabel, danger = false }) {
    const overlay = document.createElement('div');
    overlay.className = 'plan-metadata-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'plan-metadata-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const heading = document.createElement('h2');
    heading.textContent = title;
    dialog.appendChild(heading);

    const actions = document.createElement('div');
    actions.className = 'plan-metadata-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type        = 'button';
    cancelBtn.className   = 'plan-metadata-cancel';
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement('button');
    confirmBtn.type        = 'button';
    confirmBtn.className   = 'plan-metadata-confirm' + (danger ? ' danger' : '');
    confirmBtn.textContent = confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    let onKeydown = null;

    function close() {
        if (onKeydown) document.removeEventListener('keydown', onKeydown, true);
        overlay.remove();
    }

    function mount({ onCancel, onConfirm }) {
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Escape is owned by the topmost modal. Listening in the capture
        // phase and stopping propagation there keeps the keypress from also
        // reaching whatever opened this dialog (the plan detail popover, the
        // settings popover), which would otherwise close underneath it.
        onKeydown = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onCancel();
        };
        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) onCancel(); });
        document.addEventListener('keydown', onKeydown, true);
    }

    return { overlay, dialog, cancelBtn, confirmBtn, mount, close };
}
