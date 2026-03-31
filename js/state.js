// state.js — Simple reactive state manager

const state = {
    currentBook:    1,
    currentChapter: 1,
    selectedVerses: [],
    panelOpen:      false,
    activeTab:      'info',
};

const listeners = {};

export function getAppState(key) {
    return state[key];
}

export function setAppState(key, value) {
    state[key] = value;
    if (listeners[key]) {
        for (const callback of listeners[key]) {
            callback(value);
        }
    }
}

export function onStateChange(key, callback) {
    if (!listeners[key]) {
        listeners[key] = [];
    }
    listeners[key].push(callback);
}
