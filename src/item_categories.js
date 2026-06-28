// Read an item's categories, adapting legacy single-string docs on the fly.
// New array items → as-is; legacy `category` string → [category]; none → [].
// Pure leaf module (no imports) so any module can use it without import cycles.
export function getItemCategories(item) {
    if (Array.isArray(item?.categories)) return item.categories;
    if (typeof item?.category === 'string' && item.category) return [item.category];
    return [];
}
