// app.js — Entry point

import { initDatabase, getState } from './db.js';

import { initReader, navigateTo } from './reader.js';

import { initSelection } from './selection.js';

import { initNotes } from './notes.js';

import { initTags }   from './tags.js';
import { initPanels }  from './panels.js';
import { initSearch }  from './search.js';

async function init() {
    try {
        await initDatabase();

        initReader();
        initSelection();
        initNotes();
        initTags();
        initPanels();
        initSearch();

        // Restore last reading position, default to Genesis 1
        const lastBook    = parseInt(getState('currentBook'))    || 1;
        const lastChapter = parseInt(getState('currentChapter')) || 1;

        navigateTo(lastBook, lastChapter);

        // Hide loading screen
        document.getElementById('loading').classList.add('hidden');

        // Register service worker (sw.js created in a later phase)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(() => {
                // sw.js not yet present — safe to ignore during development
            });
        }
    } catch (err) {
        document.getElementById('loading').textContent = `Failed to load: ${err.message}`;
        console.error('Init failed:', err);
    }
}

init();
