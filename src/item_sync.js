// Applies a fresh list from Firestore onto the objects already in memory, instead
// of swapping them for new ones. Modules hold references to these objects (the
// selected item, click handlers on list cards), and this keeps those references
// live. The returned array follows the order of `incoming`.
export function syncItemsInPlace(current, incoming) {
    const byId = new Map(current.map(item => [item.id, item]));
    return incoming.map(fresh => {
        const existing = byId.get(fresh.id);
        if (!existing) return fresh;
        for (const key of Object.keys(existing)) {if (!(key in fresh)) {delete existing[key];}}
        return Object.assign(existing, fresh);
    });
}
