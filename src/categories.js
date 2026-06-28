import { auth, fetchCategories, saveCategories } from './firebase';
import { renderCategoryFilters } from './search_item';

let categories = [];

export function getCategories() { return categories; }


export async function loadCategories() {
    const user = auth.currentUser;
    if (!user) return;
    categories = await fetchCategories(user.uid);
    renderCategoryFilters();
}

export async function persistCategories(next) {
    const user = auth.currentUser;
    if (!user) return;
    categories = next;
    await saveCategories(next, user.uid);
    renderCategoryFilters();
}
