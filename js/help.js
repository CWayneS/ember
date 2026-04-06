// help.js — Contextual help popovers for reader, notes, and reference panels

export function initHelp() {
    const entries = [
        {
            btn:     document.getElementById('reader-help-btn'),
            popover: document.getElementById('reader-help-popover'),
        },
        {
            btn:     document.querySelector('#notes-panel .panel-help-btn'),
            popover: document.getElementById('notes-help-popover'),
        },
        {
            btn:     document.querySelector('#reference-panel .panel-help-btn'),
            popover: document.getElementById('reference-help-popover'),
        },
    ];

    const allPopovers = entries.map(e => e.popover);

    entries.forEach(({ btn, popover }) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const alreadyOpen = !popover.classList.contains('hidden');
            closeAll(allPopovers);
            if (!alreadyOpen) {
                openPopover(btn, popover);
            }
        });
    });

    // Prevent clicks inside a popover from closing it
    allPopovers.forEach(popover => {
        popover.addEventListener('click', (e) => e.stopPropagation());
    });

    // "More help" links — non-functional placeholder
    document.querySelectorAll('.help-more-link').forEach(link => {
        link.addEventListener('click', (e) => e.preventDefault());
    });

    // Close on outside click
    document.addEventListener('click', () => closeAll(allPopovers));

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAll(allPopovers);
    });
}

function openPopover(btn, popover) {
    const rect = btn.getBoundingClientRect();
    popover.style.top   = `${rect.bottom + 6}px`;
    popover.style.right = `${window.innerWidth - rect.right}px`;
    popover.classList.remove('hidden');
}

function closeAll(popovers) {
    popovers.forEach(p => p.classList.add('hidden'));
}
