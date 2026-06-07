import { auth, fetchInventory, db } from './firebase';
// import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { renderItemGrid } from './item_ui';
import { formatRupiah } from './formatRupiah';

export let allItems = [];
let searchTimeout = 0;
let currentQuery = '';
let currentSortMode = 'color';
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

// Single render path: apply the active search filter, then the active sort.
export function refreshGrid(){
    const filtered = searchedItems(currentQuery);
    renderItemGrid(sortItems(filtered, currentSortMode));
}

export async function loadAllItems() {
    try {
        const user = auth.currentUser;
        if (!user) return;
        allItems = await fetchInventory(user.uid);

        // TEMP: inject mock items to stress-test grid overflow — revert this block when done
        // const mockColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'gray'];
        // for (let i = 1; i <= 60; i++) {
        //     allItems.push({
        //         id: `mock-${i}`,
        //         itemName: `Mock Item ${i}`,
        //         sku: `MOCK-${String(i).padStart(3, '0')}`,
        //         sellPrice: 10000,
        //         stockLevel: 99,
        //         tagColor: mockColors[i % mockColors.length],
        //     });
        // }
        // END TEMP

        refreshGrid();
    }
    catch (error) { console.error("Error pulling data:", error); }
}

export function addSingleItem(item){
    allItems.push(item);
    refreshGrid();
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
    document.querySelectorAll('.c-sort-bar__btn')
        .forEach(btn => btn.classList.toggle('is-active', btn === button));
    refreshGrid();
}

export function initSort(){
    document.querySelectorAll('.c-sort-bar__btn')
        .forEach(btn => btn.addEventListener('click', handleSortClick));
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

//=============
export function updateLocalStock(itemId, quantityChange) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    item.stockLevel = (item.stockLevel || 0) + quantityChange;
}

// Merge edited metadata fields into the canonical in-memory item so the grid
// and other modules reflect the change without a full reload.
export function updateLocalItem(itemId, fields) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    Object.assign(item, fields);
}