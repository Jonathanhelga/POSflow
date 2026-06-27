import { auth, fetchCategories, saveCategories } from './firebase';
import { renderCategoryFilters } from './search_item';

// Canonical in-memory list of the owner's item categories. Other modules read
// from here (like search_item.js owns allItems) instead of re-fetching.
let categories = [];

export function getCategories() { return categories; }

// Build the option list for one <select>: a leading "— None —", the current
// categories, plus selectedValue itself when it's an orphaned label (a deleted
// category an item still carries) so the selection is never silently lost.
function buildOptions(select, selectedValue) {
    const list = [...categories];
    if (selectedValue && !list.includes(selectedValue)) list.push(selectedValue);

    const frag = document.createDocumentFragment();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— None —';
    frag.appendChild(none);

    list.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        frag.appendChild(opt);
    });

    select.replaceChildren(frag);
    select.value = selectedValue || '';
}

// Refresh every category <select> from the canonical list. A selection that is
// no longer a known category falls back to "— None —".
export function populateCategorySelects() {
    document.querySelectorAll('.js-category-select').forEach(select => {
        const keep = categories.includes(select.value) ? select.value : '';
        buildOptions(select, keep);
    });
}

// Point one <select> at a specific value, preserving an orphaned label so a
// deleted category an item still uses stays put (per the "keep the label" rule).
export function selectCategoryValue(select, value) {
    buildOptions(select, value || '');
}

// Load the list once at login and fill the dropdowns.
export async function loadCategories() {
    const user = auth.currentUser;
    if (!user) return;
    categories = await fetchCategories(user.uid);
    populateCategorySelects();
    renderCategoryFilters();
}

// Persist a new list, update the cache, and refresh the dropdowns everywhere.
export async function persistCategories(next) {
    const user = auth.currentUser;
    if (!user) return;
    categories = next;
    await saveCategories(next, user.uid);
    populateCategorySelects();
    renderCategoryFilters();
}
