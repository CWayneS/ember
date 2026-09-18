// popover-registry.js — Shared popover coordination
//
// Two layers:
//   registerPopover/closeAllPopovers — any module with something popover-like
//     (including bookmarks.js's prompt/dropdown, which position and dismiss
//     differently) registers a closer so opening one popover closes the rest.
//   bindPopover — the standard button-anchored popover: toggle on button
//     click, position below the button's right edge, close on outside click
//     or Escape, clicks inside don't close. The settings and help popovers
//     all share this exact behavior; it used to be copied into each module,
//     each copy adding its own document-level click and keydown listener.
//     Now one pair of document listeners serves every bound popover.

const _closers      = [];
const _boundClosers = [];
let   _documentListenersBound = false;

export function registerPopover(closeFn) {
    _closers.push(closeFn);
}

export function closeAllPopovers() {
    _closers.forEach(fn => fn());
}

// Wires `btn` to toggle `popover`. Returns { open, close } for callers that
// need to drive it programmatically. The popover is expected to start with
// the `hidden` class and to be position: fixed (see .help-popover in CSS).
export function bindPopover(btn, popover) {
    const close = () => popover.classList.add('hidden');
    const open  = () => {
        const rect = btn.getBoundingClientRect();
        popover.style.top   = `${rect.bottom + 6}px`;
        popover.style.right = `${window.innerWidth - rect.right}px`;
        popover.classList.remove('hidden');
    };

    registerPopover(close);
    _boundClosers.push(close);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alreadyOpen = !popover.classList.contains('hidden');
        closeAllPopovers();
        if (!alreadyOpen) open();
    });

    // Clicks inside the popover must not reach the document-level closer.
    popover.addEventListener('click', (e) => e.stopPropagation());

    bindDocumentListeners();
    return { open, close };
}

// Outside click / Escape close only the popovers bound through bindPopover —
// not every registered closer. bookmarks.js's prompt has its own outside-
// click rule (clicks inside the prompt keep it open without stopping
// propagation), so it must not be swept up by a blanket document click.
function bindDocumentListeners() {
    if (_documentListenersBound) return;
    _documentListenersBound = true;

    document.addEventListener('click', () => _boundClosers.forEach(fn => fn()));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') _boundClosers.forEach(fn => fn());
    });
}
