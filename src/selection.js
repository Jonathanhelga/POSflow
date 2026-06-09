// Shared "currently-selected item" holder for the two-panel modals
// (barcode generator, inventory update, manage item). Each module calls
// createSelection() to get its OWN independent holder — these are NOT a
// single shared selection, so opening one modal never clobbers another.
//
// Consolidates the get / set / clear / is-selected pattern that previously
// lived as a bare `let selectedItem = null;` in three modules.

export function createSelection() {
    let current = null;
    return {
        get:   ()     => current,
        set:   (item) => { current = item; return item; },
        clear: ()     => { current = null; },
        // True when `item` is the currently-selected one (matched by id).
        is:    (item) => !!current && !!item && current.id === item.id,
    };
}
