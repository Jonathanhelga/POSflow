import { listenToInventory } from './firebase';
import { renderItemGrid } from './item_ui';
import { getCategories } from './categories';
import { getItemCategories } from './item_categories';
import { syncItemsInPlace } from './item_sync';

// Only the listener in startItemsListener writes to this array. Writes elsewhere
// reach it through Firestore, so no module should change stock or prices by hand:
// the same change would then be applied twice.
export let allItems = [];
let itemsStatus = 'loading'; // 'loading' | 'ready' | 'error'
const itemsChangedCallbacks = [];
let searchTimeout = 0;
let currentQuery = '';
let currentSortMode = 'color';
// Active category filter, or null when showing every category. Independent of
// the sort mode above — sort controls order, this controls which items show.
let currentCategoryFilter = null;
function normalizeText(text){ return String(text || '').toLowerCase().trim(); }

// Sort a copy of the items by the chosen mode. 'color' groups items by their
// owner colour (tagColor), then alphabetically within each group; items with no
// colour fall to the end. Other modes are simple single-key sorts.
function sortItems(items, mode){
    const sorted = [...items];
    if (mode === 'name') {
        sorted.sort((a, b) => normalizeText(a.itemName).localeCompare(normalizeText(b.itemName)));
    } else if (mode === 'price') {
        sorted.sort((a, b) => (a.sellPrice || 0) - (b.sellPrice || 0));
    } else if (mode === 'stock') {
        sorted.sort((a, b) => (a.stockLevel || 0) - (b.stockLevel || 0));
    } else {
        sorted.sort((a, b) => {
            const colorA = a.tagColor || 'zzz';
            const colorB = b.tagColor || 'zzz';
            if (colorA !== colorB) return colorA.localeCompare(colorB);
            return normalizeText(a.itemName).localeCompare(normalizeText(b.itemName));
        });
    }
    return sorted;
}

// Single render path: apply the active search filter, then the category filter,
// then the active sort.
export function refreshGrid(){
    const search_stats_element = document.getElementById('js-search-stats');
    let filtered = searchedItems(currentQuery);
    if (currentCategoryFilter) {
        filtered = filtered.filter(item => getItemCategories(item).includes(currentCategoryFilter));
    }
    search_stats_element.textContent = filtered.length;
    renderItemGrid(sortItems(filtered, currentSortMode));
}

export function getItemsStatus() {return itemsStatus;}

// Runs `callback` after every change to allItems, from this device or another one.
export function onItemsChanged(callback) {itemsChangedCallbacks.push(callback);}

function handleItemsChanged() {
    refreshGrid();
    itemsChangedCallbacks.forEach(callback => callback());
}

// Call once after login. The promise resolves on the first result, or on failure,
// so a caller waiting for items is never left hanging.
export function startItemsListener(uid) {
    return new Promise((resolve) => {
        listenToInventory(uid, (incoming) => {
            allItems = syncItemsInPlace(allItems, incoming);
            itemsStatus = 'ready';
            handleItemsChanged();
            resolve();
        }, (error) => {
            console.error("Error pulling data:", error);
            itemsStatus = 'error';
            handleItemsChanged();
            resolve();
        });
    });
}

// Name or SKU match for the modal search boxes. A blank query returns every item.
export function filterItems(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [...allItems];
    return allItems.filter(item => (item.itemName ?? '').toLowerCase().includes(q) || (item.sku ?? '').toLowerCase().includes(q));
}

function searchedItems(query){
    if (!query || query.trim() === '') return allItems;
    const searchTerm = normalizeText(query);
    return allItems.filter(item => {
        const searchFields = [ item.itemName, item.sku, item.lastUpdated, item.supplier_info ];
        return searchFields.some(field => field != null && normalizeText(field).includes(searchTerm));
    });
}

function handleSearchEvent(event){
    currentQuery = event.target.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(refreshGrid, 300);
}

export function initializeSearch(){
    const searchInput = document.getElementById('js-item-search');
    searchInput?.addEventListener('input', (event) => handleSearchEvent(event));
}

function handleSortClick(event){
    const button = event.currentTarget;
    currentSortMode = button.dataset.sort;
    document.querySelectorAll('.c-sort-bar__btn[data-sort]')
        .forEach(btn => btn.classList.toggle('is-active', btn === button));
    refreshGrid();
}

export function initSort(){
    document.querySelectorAll('.c-sort-bar__btn[data-sort]')
        .forEach(btn => btn.addEventListener('click', handleSortClick));
}

// Toggle a category filter on/off. Tapping the active one clears it (show all);
// tapping another switches to it. Mutually exclusive among the category badges.
function handleCategoryFilterClick(cat, button){
    if (currentCategoryFilter === cat) {
        currentCategoryFilter = null;
        button.classList.remove('is-active');
    } else {
        currentCategoryFilter = cat;
        document.querySelectorAll('.c-sort-bar__btn--category')
            .forEach(btn => btn.classList.toggle('is-active', btn === button));
    }
    refreshGrid();
}

// Render one filter badge per owner category into the sort bar. Called whenever
// the canonical category list changes (initial load, add, delete).
export function renderCategoryFilters(){
    const container = document.getElementById('js-category-filters');
    if (!container) return;
    const categories = getCategories();

    // If the active filter's category was deleted, drop the filter and re-render
    // the grid so stale-filtered items don't linger.
    if (currentCategoryFilter && !categories.includes(currentCategoryFilter)) {
        currentCategoryFilter = null;
        refreshGrid();
    }

    const divider = document.getElementById('js-sort-bar-divider');
    if (divider) divider.hidden = categories.length === 0;

    const frag = document.createDocumentFragment();
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'c-sort-bar__btn c-sort-bar__btn--category';
        btn.dataset.category = cat;
        btn.textContent = cat;
        btn.classList.toggle('is-active', cat === currentCategoryFilter);
        btn.addEventListener('click', () => handleCategoryFilterClick(cat, btn));
        frag.appendChild(btn);
    });
    container.replaceChildren(frag);
}

//   1. Listen on document so no manual focus is required
//   2. Skip the event if the user is actively typing in any input/textarea/select this prevents the scanner from hijacking form fields
//   3. Accumulate characters into a buffer, reset it on Enter and process the scan
//   4. Auto-clear the buffer after 500 ms of inactivity (safety net if Enter is missed)
let scanBuffer    = '';
let scanTimestamp = 0;
let scanTimeout   = 0;
let scanCallback  = null; // set by initGlobalBarcodeListener

const FOCUSED_TAGS   = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const MIN_SCAN_CHARS = 3;   // minimum number of characters
const MAX_SCAN_MS    = 500; // a real scan completes well within this period

function handleGlobalScan(event) {
    const active = document.activeElement;
    if (FOCUSED_TAGS.has(active?.tagName) || active?.isContentEditable) return;

    if (event.key === 'Enter') {
        const elapsed = Date.now() - scanTimestamp;
        if (scanBuffer.length >= MIN_SCAN_CHARS && elapsed < MAX_SCAN_MS) { scanCallback?.(scanBuffer); }
        scanBuffer = '';
        clearTimeout(scanTimeout);
        return;
    }
    
    if (event.key.length === 1) {
        if (scanBuffer.length === 0) scanTimestamp = Date.now(); 
        scanBuffer += event.key;
    }

    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => { scanBuffer = ''; }, MAX_SCAN_MS);
}

// onScan(sku: string) — called with the raw scanned SKU string on every valid scan
export function initGlobalBarcodeListener(onScan) {
    scanCallback = onScan;
    document.addEventListener('keydown', handleGlobalScan);
}
