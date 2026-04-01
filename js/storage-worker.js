// storage-worker.js — Off-thread OPFS / IndexedDB persistence
//
// Receives a Uint8Array (transferred, not copied) from the main thread and
// writes it to OPFS when available, falling back to IndexedDB.

self.onmessage = async (e) => {
    const data = e.data; // Uint8Array

    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
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

    const request = indexedDB.open('ScriptureStudy', 1);
    request.onupgradeneeded = () => {
        request.result.createObjectStore('db');
    };
    request.onsuccess = () => {
        const tx = request.result.transaction('db', 'readwrite');
        tx.objectStore('db').put(data, 'core');
    };
};
