// backup.js — Restore-from-backup flow (Build 4 Item 3)
//
// Export lives in db.js (exportBackup()) since it's a thin wrapper around
// db.export(). Restore needs a file picker and a confirmation dialog, which
// are UI concerns — this module owns them and calls into db.js only for
// validation and the actual destructive write, mirroring how plans.js owns
// its own confirm dialogs and calls into db.js purely for data operations.

import { looksLikeCoreDb, restoreCoreDb } from './db.js';
import { openConfirmDialog } from './dialogs.js';

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

        // States consequences in plain language; the shared dialog is built
        // from textContent only, so this copy can never be read as markup.
        const confirmed = await openConfirmDialog({
            title: 'Restore from backup?',
            lines: [
                'This will replace all current notes, tags, bookmarks, markups, and reading plan progress with the contents of the selected file.',
                'This cannot be undone.'
            ],
            confirmLabel: 'Restore',
            danger: true
        });
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
