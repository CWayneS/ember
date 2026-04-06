// app.js — Entry point

import { initDatabase, getState } from './db.js';

import { initReader, navigateTo } from './reader.js';

import { initSelection } from './selection.js';

import { initNotes } from './notes.js';

import { initTags }          from './tags.js';
import { initPanels, togglePanelLayout } from './panels.js';
import { initSearch }        from './search.js';
import { initReference }     from './reference.js';
import { initBookmarks }    from './bookmarks.js';
import { initHelp }         from './help.js';

async function init() {
    try {
        await initDatabase();

        initReader();
        initSelection();
        initNotes();
        initTags();
        initPanels();
        initSearch();
        initReference();
        initBookmarks();
        initHelp();

        // Restore last reading position, default to Genesis 1
        const lastBook    = parseInt(getState('currentBook'))    || 1;
        const lastChapter = parseInt(getState('currentChapter')) || 1;

        navigateTo(lastBook, lastChapter);

        document.getElementById('layout-toggle-btn')
            .addEventListener('click', togglePanelLayout);

        // Dark mode toggle — persist preference in localStorage
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedTheme  = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.body.classList.add('theme-dark');
        }
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const isDark = document.body.classList.toggle('theme-dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });

        // Hide loading screen
        document.getElementById('loading').classList.add('hidden');

        // Register service worker for production only.
        // Skip on localhost so development refreshes always load fresh files.
        if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
        }
    } catch (err) {
        document.getElementById('loading').textContent = `Failed to load: ${err.message}`;
        console.error('Init failed:', err);
    }
}

init();
