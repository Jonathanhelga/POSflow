// Keyboard navigation for the data-list modals (manage-item, inventory-update,barcode-generator). 
// Up/Down move a visual cursor (.list-cursor) through the rendered cards;
// Enter opens the highlighted row via the caller's existing select handler.

const CURSOR_CLASS = 'list-cursor';

export function attachListKeyNav(config) {
    document.addEventListener('keydown', (e) => handleListKeyNav(e, config));
}

function handleListKeyNav(e, config) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;

    // Only the open modal responds; closed modals carry the `is-hidden` class.
    if (config.scope.classList.contains('is-hidden')) return;

    // Let native behaviour win inside editable fields (e.g. number steppers),
    // but allow arrowing out of the search box straight into the results.
    if (isTypingTarget(e.target, config.searchInput)) return;

    const cards = Array.from(config.container.querySelectorAll(config.cardSelector));
    if (cards.length === 0) return;

    const current = cursorIndexOf(cards);
    if (e.key === 'Enter') {
        if (current === -1) return;          // nothing highlighted → leave Enter alone
        const items = config.getItems();
        if (!items[current]) return;         // cards/data out of sync (e.g. mid-load) → ignore
        e.preventDefault();
        e.stopPropagation();                 // keep the global scanner listener out of it
        config.onOpen(items[current], cards[current]);
        return;
    }

    e.preventDefault();                      // stop the panel from page-scrolling
    moveCursor(cards, nextCursorIndex(e.key, current, cards.length));
}

function isTypingTarget(target, searchInput) {
    if (target === searchInput) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function cursorIndexOf(cards) {
    return cards.findIndex(c => c.classList.contains(CURSOR_CLASS));
}

function nextCursorIndex(key, current, count) {
    if (current === -1) return key === 'ArrowDown' ? 0 : count - 1;
    if (key === 'ArrowDown') return Math.min(current + 1, count - 1);
    return Math.max(current - 1, 0);
}

function moveCursor(cards, index) {
    cards.forEach(c => c.classList.remove(CURSOR_CLASS));
    const target = cards[index];
    target.classList.add(CURSOR_CLASS);
    target.scrollIntoView({ block: 'nearest' });
}
