const _closers = [];

export function registerPopover(closeFn) {
    _closers.push(closeFn);
}

export function closeAllPopovers() {
    _closers.forEach(fn => fn());
}
