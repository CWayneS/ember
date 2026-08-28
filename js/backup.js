// backup.js — Restore-from-backup flow (Build 4 Item 3)
//
// Export lives in db.js (exportBackup()) since it's a thin wrapper around
// db.export(). Restore needs a file picker and a confirmation dialog, which
// are UI concerns — this module owns them and calls into db.js only for
// validation and the actual destructive write, mirroring how plans.js owns
// its own confirm dialogs and calls into db.js purely for data operations.

import { looksLikeCoreDb, restoreCoreDb } from './db.js';

// Opens a .db file picker. On selection: reads the file, runs the minimal
// structural check, confirms with the user, then destructively replaces
// core.db and reloads. Any failure (unreadable file, invalid file, failed
// write) shows an alert and leaves the current database untouched — nothing
// is written until the file has passed validation AND the user has confirmed.
export function restoreFromBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => input.remove();
    input.addEventListener('cancel', cleanup);

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        cleanup();
        if (!file) return;

        let bytes;
        try {
            bytes = new Uint8Array(await file.arrayBuffer());
        } catch (e) {
            console.error('restoreFromBackup: could not read file:', e);
            alert('Could not read the selected file. Nothing was changed.');
            return;
        }

        if (!looksLikeCoreDb(bytes)) {
            alert('This does not look like a valid Ember backup file. Nothing was changed.');
            return;
        }

        const confirmed = await openRestoreConfirmDialog();
        if (!confirmed) return;

        try {
            await restoreCoreDb(bytes);
        } catch (e) {
            console.error('restoreFromBackup: write failed:', e);
            alert('Restore failed — the backup could not be written. Your current data was not changed.');
            return;
        }

        window.location.reload();
    });

    input.click();
}

// Built the same way plans.js's openConfirmDialog() is built — DOM nodes and
// textContent only, no innerHTML — since this dialog states consequences in
// plain language and must never be able to interpret its own copy as markup.
// Resolves true on confirm, false on cancel/Escape/backdrop click.
function openRestoreConfirmDialog() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'plan-metadata-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'plan-metadata-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const heading = document.createElement('h2');
        heading.textContent = 'Restore from backup?';
        dialog.appendChild(heading);

        const lines = [
            'This will replace all current notes, tags, bookmarks, markups, and reading plan progress with the contents of the selected file.',
            'This cannot be undone.'
        ];
        for (const line of lines) {
            const p = document.createElement('p');
            p.className   = 'plan-confirm-line';
            p.textContent = line;
            dialog.appendChild(p);
        }

        const actions = document.createElement('div');
        actions.className = 'plan-metadata-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type        = 'button';
        cancelBtn.className   = 'plan-metadata-cancel';
        cancelBtn.textContent = 'Cancel';

        const confirmBtn = document.createElement('button');
        confirmBtn.type        = 'button';
        confirmBtn.className   = 'plan-metadata-confirm danger';
        confirmBtn.textContent = 'Restore';

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        function cleanup() {
            document.removeEventListener('keydown', onKeydown);
            overlay.remove();
        }
        function onCancel()  { cleanup(); resolve(false); }
        function onConfirm() { cleanup(); resolve(true); }
        function onKeydown(e) { if (e.key === 'Escape') onCancel(); }

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) onCancel(); });
        document.addEventListener('keydown', onKeydown);

        confirmBtn.focus();
    });
}
