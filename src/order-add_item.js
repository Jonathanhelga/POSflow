import { toggleModal } from './modal-handler';
import { formatRupiah } from "./formatRupiah";
import { allItems } from "./search_item";
import { doc } from 'firebase/firestore';

let orderedItems = [];
let selectedRowIndex = -1;

export function openOrderItemModal(itemID) {
    const item = allItems.find(item => item.id === itemID); 
    if (!item) { return; }

    let matchedItem = orderedItems.find(o => o.id === itemID); //
    document.getElementById('js-order-qty').value = matchedItem ? matchedItem.quantity : 1;

    document.getElementById('js-current-item-id').value = item.id;
    document.getElementById('order-item-sku').textContent = item.sku || '';
    document.getElementById('order-item-name').textContent = item.itemName;
    document.getElementById('order-item-stock').textContent = item.stockLevel;
    document.getElementById('order-item-price').textContent = formatRupiah(item.sellPrice);
    document.getElementById('order-item-unit').textContent = ' ' + item.unit;

    toggleModal('order-item-modal');
}

export function initializeOrderForm(){
    const form = document.getElementById('js-order-item-form');
    if(form){
        fullRender();
        orderModifier();
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            
            const itemId = document.getElementById('js-current-item-id').value; //is the itemID
            const quantity = parseFloat(document.getElementById('js-order-qty').value) || 0;
            const item = allItems.find(item => item.id === itemId);
            if (!item) return;
            
            addItemToOrder(item.id, item.itemName, item.sellPrice, quantity);
            toggleModal('order-item-modal');
        });
    }
}

export function addItemToOrder(itemID, itemName, itemPrice, itemQuantity){
    const existingIndex = orderedItems.findIndex(item => item.name === itemName);
    if(existingIndex !== -1){
        orderedItems[existingIndex].quantity = itemQuantity;
        updateRow(existingIndex);
    }
    else{
        orderedItems.push({id: itemID, name: itemName, price: itemPrice, quantity: itemQuantity });
        appendRow(orderedItems.length - 1);
        if(orderedItems.length === 1){ fullRender(); }
    }
    updateTotals();
}

function fullRender(){
    const tableBody = document.getElementById('order-items');
    if(!tableBody) return;
    if(orderedItems.length === 0){ 
        tableBody.innerHTML = '';
        const row = document.createElement('tr');
        row.innerHTML = `        
            <tr class="c-table__empty">
                <td colspan="3">No items ordered yet</td>
            </tr>`;
        tableBody.appendChild(row);
        return;
    }
    tableBody.innerHTML = '';
    orderedItems.forEach((_, index) => appendRow(index));
}
function appendRow(index){
    const tableBody = document.getElementById('order-items');
    if(!tableBody) return;

    const item = orderedItems[index];
    const row = document.createElement('tr');
    row.id = rowIdFor(item.id)

    row.style.cursor = 'pointer';

    row.addEventListener('click', () => { handleRowClick(index, row); })

    row.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openOrderItemModal(item.id)
    })

    row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>${formatRupiah(item.price * item.quantity)}</td>
    `;

    tableBody.appendChild(row);
} 
function updateRow(index){
    const item = orderedItems[index];
    const row = document.getElementById(rowIdFor(item.id));
    if(!row){
        appendRow(index);
        return;
    }
    row.cells[1].textContent = item.quantity;
    row.cells[2].textContent = formatRupiah(item.price * item.quantity);
}

function orderModifier(){
    const resetButton = document.getElementById('js-order-reset');
    const removeButton = document.getElementById('js-order-remove');
    // const submitButton = document.getElementById('js-order-print');
    resetButton.addEventListener('click', () => { resetOrderTable(); })
    removeButton.addEventListener('click', () => { removeSelectedItem(); })
}
function removeSelectedItem(){
    if(selectedRowIndex === -1) { return; }

    orderedItems.splice(selectedRowIndex, 1);
    selectedRowIndex = -1;

    fullRender();
    updateTotals();

    const removeBtn = document.getElementById('js-order-remove');
    if (removeBtn) removeBtn.disabled = true;
}

function resetOrderTable(){
    if (orderedItems.length === 0) return;
    if (!confirm('Reset the entire order?')) return;
    orderedItems = [];
    selectedRowIndex = -1;
    fullRender();
    updateTotals();
}
function resetOrderAfterSubmit(){
    orderedItems = [];
    selectedRowIndex = -1;
    fullRender();
    updateTotals();
}
function updateTotals(){
    const totalItemsElement = document.getElementById('order-total-items');
    const orderTotalPrice = document.getElementById('order-total-price');
    let totalPrice = 0;
    let totalQty = 0;
    orderedItems.forEach(item => {
        totalPrice += item.price * item.quantity;
        totalQty += item.quantity;
    });
    totalItemsElement.textContent = totalQty;
    orderTotalPrice.textContent = formatRupiah(totalPrice);
}

function rowIdFor(itemID){ return `order-row-${itemID}`; }


let lastSelectedRow = null;

function handleRowClick(index, rowElement){
    const removeBtn = document.getElementById('js-order-remove');

    if(lastSelectedRow === rowElement){
        rowElement.classList.remove('selected');
        selectedRowIndex  = -1;
        lastSelectedRow = null;
        if (removeBtn) removeBtn.disabled = true;
        return;
    }
    if(lastSelectedRow) { lastSelectedRow.classList.remove('selected'); }

    rowElement.classList.add('selected');
    selectedRowIndex = index;
    lastSelectedRow = rowElement;
    if (removeBtn) removeBtn.disabled = false;
}
