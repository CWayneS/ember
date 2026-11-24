// storage-worker.js — Off-thread OPFS / IndexedDB persistence
//
// Receives saves as Uint8Arrays (transferred, not copied) from the main thread and
// writes each to OPFS when available, falling back to IndexedDB.
//
// Writes run one at a time, in order. Each message is a whole copy of core.db, so
// only the newest one waiting matters: while a write is in progress, a newer save
// replaces the one waiting behind it, and the write in progress is never cut short.
// Without the queue, two overlapping writes could finish out of order and leave an
// older copy on disk over the latest edit (docs/STRESS_TEST_RESULTS.md, write ordering).
//
// Every buffer goes back to the main thread once it is done with, whether it was
// written, failed, or was replaced while waiting. Left here, it waits on this thread's
// garbage collector, which allocates so little that it rarely runs: about one file's
// worth of memory piled up per save, reaching 1.2 GB at 40 years of data
// (docs/STRESS_TEST_RESULTS.md). The main thread collects it promptly.
//
// The one other message, { type: 'idle' }, is answered with { type: 'idle' } once
// every save sent before it has been written. Restore waits on it (db.js,
// restoreCoreDb()) before writing core.db itself.

let waiting = null;        // newest save not yet started
let writing = false;       // a write is in progress
let idleRequests = 0;      // 'idle' messages to answer when the queue empties

function handBack(data) {
    self.postMessage(data, [data.buffer]);
}

function answerIdleRequests() {
    for (; idleRequests > 0; idleRequests--) self.postMessage({ type: 'idle' });
}

self.onmessage = (e) => {
    if (e.data?.type === 'idle') {
        idleRequests++;
        if (!writing) answerIdleRequests();
        return;
    }
    if (waiting) handBack(waiting);
    waiting = e.data; // Uint8Array
    if (!writing) drainQueue();
};

async function drainQueue() {
    writing = true;
    while (waiting) {
        const data = waiting;
        waiting = null;
        try {
            await writeCoreDb(data);
        } catch (error) {
            console.error('storage-worker: write failed:', error);
        } finally {
            handBack(data);
        }
    }
    writing = false;
    answerIdleRequests();
}

// OPFS only with createWritable (older Safari lacks it): checking first keeps
// getFileHandle from leaving an empty core.db there on every save.
async function writeCoreDb(data) {
    if ('storage' in navigator && 'getDirectory' in navigator.storage
        && 'createWritable' in FileSystemFileHandle.prototype) {
        try {
            const root     = await navigator.storage.getDirectory();
            const handle   = await root.getFileHandle('core.db', { create: true });
            const writable = await handle.createWritable();
            await writable.write(data);
            await writable.close();
            return;
        } catch (_) {
            // Fall through to IndexedDB
        }
    }
    await writeToIndexedDb(data);
}

// Settles on every outcome, so a failed write can never stall the queue behind it.
function writeToIndexedDb(data) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ScriptureStudy', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('db');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const connection = request.result;
            let tx;
            try {
                tx = connection.transaction('db', 'readwrite');
                tx.objectStore('db').put(data, 'core');
            } catch (error) {
                connection.close();
                reject(error);
                return;
            }
            tx.oncomplete = () => { connection.close(); resolve(); };
            tx.onerror    = () => { connection.close(); reject(tx.error); };
            tx.onabort    = () => { connection.close(); reject(tx.error); };
        };
    });
}
