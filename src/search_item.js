import { auth, fetchInventory } from './firebase';
import { createItemButton, renderItemGrid } from './item_ui';
import { formatRupiah } from './formatRupiah';

export let allItems = [];
let searchTimeout = 0;
function normalizeText(text){ return String(text || '').toLowerCase().trim(); }

export async function loadAllItems() {
    try {
        const user = auth.currentUser;
        if (!user) return;
        allItems = await fetchInventory(user.uid);
        console.log("Total Items Loaded:", allItems.length);
        console.table(allItems);
        renderItemGrid(allItems);
    }
    catch (error) { console.error("Error pulling data:", error); }
}

export function addSingleItem(item){
    const container = document.getElementById('item-grid');
    if(!container) return;
    allItems.push(item);
    createItemButton(container, item);
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
    const query = event.target.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const filteredItems = searchedItems(query);
        renderItemGrid(filteredItems);
    }, 300);
}

export function initializeSearch(){
    const searchInput = document.getElementById('js-item-search');
    searchInput?.addEventListener('input', (event) => handleSearchEvent(event));
}
//=============
function updateLocalStock(itemId, quantityChange){}

function syncStockToFirestore(itemId, newQuantity){}

