// storage-worker.js — Off-thread OPFS / IndexedDB persistence
//
// Receives a Uint8Array (transferred, not copied) from the main thread and
// writes it to OPFS when available, falling back to IndexedDB.
//
// Each write then transfers the buffer back. It is a whole copy of core.db, and
// left here it waits on this thread's garbage collector, which allocates so little
// that it rarely runs: about one file's worth of memory piled up per save, reaching
// 1.2 GB at 40 years of data (docs/STRESS_TEST_RESULTS.md). The main thread collects
// it promptly.

self.onmessage = async (e) => {
    const data = e.data; // Uint8Array

    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        try {
            const root     = await navigator.storage.getDirectory();
            const handle   = await root.getFileHandle('core.db', { create: true });
            const writable = await handle.createWritable();
            await writable.write(data);
            await writable.close();
            self.postMessage(data, [data.buffer]);
            return;
        } catch (_) {
            // Fall through to IndexedDB
        }
    }

    const request = indexedDB.open('ScriptureStudy', 1);
    request.onupgradeneeded = () => {
        request.result.createObjectStore('db');
    };
    request.onsuccess = () => {
        const tx = request.result.transaction('db', 'readwrite');
        tx.objectStore('db').put(data, 'core');
        tx.oncomplete = () => self.postMessage(data, [data.buffer]);
    };
};
