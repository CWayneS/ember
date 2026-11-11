// app.js — Entry point

import { initDatabase, requestPersistentStorageIfDue, startReferenceDbDownloads } from './db.js';

import { initReader } from './reader.js';

import { initSelection } from './selection.js';

import { initNotes } from './notes.js';

import { initPanels, restoreReferenceTab } from './panels.js';
import { initSearch }        from './search.js';
import { initReference }     from './reference.js';
import { initBookmarks }    from './bookmarks.js';
import { initHelp }         from './help.js';
import { initReaderSettings } from './reader-settings.js';
import { initNotesSettings }      from './notes-settings.js';
import { initReferenceSettings }  from './reference-settings.js';
import { initMarkups }            from './markups.js';
import { initPlans }              from './plans.js';
import { initStudyTemplates }     from './study-templates.js';
import { initTemplateBar }        from './template-bar.js';
import { initGlobalSettings }     from './global-settings.js';

// Dev tuning hook — lets crossrefFloor / crossrefTopN be adjusted from the
// browser console without reloading. getCrossReferencesForVerse reads these
// live; update them, then re-select a verse to see the effect immediately.
// Harmless in production if window.emberDebug is never touched.
window.emberDebug = window.emberDebug || {};

// Phones and other small touch screens: a narrow viewport (either way round,
// so a phone held sideways counts) with a coarse pointer — not the browser's
// name. "Continue anyway" is remembered on this device.
const MOBILE_QUERY = '(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)';
const MOBILE_DISMISSED_KEY = 'ember.mobileNotice.dismissed';

function showMobileNoticeIfSmallTouchScreen() {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if (localStorage.getItem(MOBILE_DISMISSED_KEY) === 'true') return;
    const overlay = document.getElementById('mobile-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('mobile-continue-btn').addEventListener('click', () => {
        overlay.classList.add('hidden');
        try { localStorage.setItem(MOBILE_DISMISSED_KEY, 'true'); } catch (_) {}
    }, { once: true });
}

async function init() {
    showMobileNoticeIfSmallTouchScreen();
    try {
        await initDatabase();

        initReader();
        initSelection();
        initNotes();
        initPanels();
        initSearch();
        initReference();
        initBookmarks();
        initHelp();
        initReaderSettings();
        initNotesSettings();
        initReferenceSettings();
        initMarkups();
        initPlans();
        initStudyTemplates();
        initTemplateBar();
        initGlobalSettings();

        restoreReferenceTab();

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

        startReferenceDbDownloads();
        requestPersistentStorageIfDue();

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
