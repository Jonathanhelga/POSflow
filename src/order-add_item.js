import { toggleModal } from './modal-handler';
import { formatRupiah } from "./formatRupiah";
import { allItems, updateLocalStock } from "./search_item";
import { auth, submitOrder, upsertCustomerByPhone } from "./firebase";
import { refreshInsights } from './sales_insight';
import {
    openCustomerCheckout,
    closeCustomerCheckout,
    getCheckoutFormData,
    setCheckoutSubmitting,
} from './customer_checkout';

let orderedItems = [];
let selectedRowIndex = -1;
let taxRate = 0;

export function getOrderedItems(){
    return orderedItems;
}
export function setTaxRate(rate) {
    taxRate = parseFloat(rate) || 0;
    updateTotals();
}

export function openOrderItemModal(itemID) {
    const item = allItems.find(item => item.id === itemID); 
    if (!item) { return; }

    let matchedItem = orderedItems.find(o => o.id === itemID);
    document.getElementById('js-order-qty').value = matchedItem ? matchedItem.quantity : 1;
    document.getElementById('js-order-qty').max = item.stockLevel;

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
            const quantity = parseFloat(document.getElementById('js-order-qty').value) || 1;
            const item = allItems.find(item => item.id === itemId);
            if (!item) return;
            
            addItemToOrder(item.id, item.itemName, item.sellPrice, item.costPrice, quantity);
            toggleModal('order-item-modal');
        });
    }
}

export function addItemToOrder(itemID, itemName, itemPrice, costPrice, itemQuantity){
    const stockItem = allItems.find(i => i.id === itemID);
    if (stockItem && itemQuantity > stockItem.stockLevel) {
        showToast(`Only ${stockItem.stockLevel} ${stockItem.unit || 'units'} available`, 'error');
        return;
    }
    const existingIndex = orderedItems.findIndex(item => item.name === itemName);
    if(existingIndex !== -1){
        orderedItems[existingIndex].quantity = itemQuantity;
        updateRow(existingIndex);
    }
    else{
        orderedItems.push({id: itemID, name: itemName, price: itemPrice, costPrice: costPrice, quantity: itemQuantity });
        appendRow(orderedItems.length - 1);
        if(orderedItems.length === 1){ fullRender(); }
    }
    updateTotals();
}

export function scanAddItem(itemID){
    const item = allItems.find(item => item.id === itemID);
    if (!item) return;
    if (item.stockLevel <= 0) { showToast(`${item.itemName} is out of stock`, 'error'); return; }

    const existingIndex = orderedItems.findIndex(item => item.id === itemID);
    if(existingIndex === -1){
        orderedItems.push({id: item.id, name: item.itemName, price: item.sellPrice, quantity: 1});
        appendRow(orderedItems.length - 1);
        if(orderedItems.length === 1){ fullRender(); }
    }
    else{
        const newQuantity = orderedItems[existingIndex].quantity + 1;
        if (newQuantity > item.stockLevel) {
            showToast(`Max stock reached (${item.stockLevel})`, 'error');
            return;
        }
        orderedItems[existingIndex].quantity = newQuantity;
        updateRow(existingIndex);
    }
    updateTotals();
    showToast(`${item.itemName} added`);
}

function fullRender(){
    const tableBody = document.getElementById('order-items');
    if(!tableBody) return;
    if(orderedItems.length === 0){
        tableBody.replaceChildren();
        const row = document.createElement('tr');
        row.className = 'c-table__empty';
        const tableData = document.createElement('td');
        tableData.textContent = 'No Items Ordered Yet.';
        tableData.colSpan = 3;
        row.appendChild(tableData);
        tableBody.appendChild(row);
        return;
    }
    tableBody.replaceChildren();
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
    const tdName = document.createElement('td');
    tdName.textContent = item.name;
    const tdQty = document.createElement('td');
    tdQty.textContent = item.quantity;
    const tdTotal = document.createElement('td');
    tdTotal.textContent = formatRupiah(item.price * item.quantity);
    row.append(tdName, tdQty, tdTotal);

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
    let subtotal = 0;
    let totalQty = 0;
    orderedItems.forEach(item => {
        subtotal += item.price * item.quantity;
        totalQty += item.quantity;
    });
    const taxAmount = subtotal * (taxRate / 100);
    const totalWithTax = subtotal + taxAmount;

    document.getElementById('order-total-items').textContent = totalQty;
    document.getElementById('order-total-price').textContent = formatRupiah(subtotal);
    document.getElementById('order-tax-label').textContent = taxRate;
    document.getElementById('order-tax-amount').textContent = formatRupiah(taxAmount);
    document.getElementById('order-with-tax').textContent = formatRupiah(totalWithTax);
}
function rowIdFor(itemID){ return `order-row-${itemID}`; }

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `c-toast c-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('is-hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, 2000);
}

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

export async function initSubmitOrder(){
    const printBillBtn = document.getElementById('js-order-submit');
    const checkoutForm = document.getElementById('js-customer-checkout-form');
    if (!printBillBtn || !checkoutForm) return;

    printBillBtn.addEventListener('click', handlePrintBillClick);
    checkoutForm.addEventListener('submit', handleCheckoutFormSubmit);
}

function handlePrintBillClick() {
    if (orderedItems.length === 0) {
        alert("No items in the order yet.");
        return;
    }
    if (!auth.currentUser) {
        alert("Session expired. Please log in again.");
        return;
    }
    openCustomerCheckout();
}

async function handleCheckoutFormSubmit(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        alert("Session expired. Please log in again.");
        return;
    }
    if (orderedItems.length === 0) {
        alert("No items in the order yet.");
        return;
    }

    const { selectedCustomerId, customer, orderNote, discountPct, discountAmount } = getCheckoutFormData();

    let customerId = selectedCustomerId;
    let customerSnapshot = customer;
    const hasCustomerInfo = customer.name || customer.phone;
    if (!customerId && hasCustomerInfo) {
        try {
            const saved = await upsertCustomerByPhone(customer, user.uid);
            customerId = saved.id;
            customerSnapshot = { name: saved.name, phone: saved.phone };
        } catch (err) {
            console.error("Failed to save customer:", err);
            showToast("Couldn't save customer info, continuing with order.", 'error');
        }
    }

    const mappedItems = orderedItems.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        cost: item.costPrice,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
    }));

    const subtotal = orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
    const taxAmount = subtotalAfterDiscount * (taxRate / 100);
    const totalWithTax = subtotalAfterDiscount + taxAmount;

    const orderPayload = {
        items: mappedItems,
        totalQuantity: orderedItems.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        discountPct,
        discountAmount,
        subtotalAfterDiscount,
        taxRate,
        taxAmount,
        totalPrice: totalWithTax,
        customerId: customerId || null,
        customer: customerSnapshot,
        orderNote
    };
    console.log(orderPayload);

    setCheckoutSubmitting(true, "Submitting...");

    try {
        await submitOrder(orderPayload, user.uid);
    } catch (err) {
        console.error("Order submission failed:", err);
        const userMessage = err.code === 'permission-denied'
            ? "You don't have permission to submit orders."
            : err.code === 'not-found'
            ? "One or more items no longer exist in inventory."
            : err.message;
        showToast(`Failed to submit order: ${userMessage}`, 'error');
        setCheckoutSubmitting(false, "Submit Order");
        return;
    }

    try {
        mappedItems.forEach(item => updateLocalStock(item.id, -item.quantity));
        resetOrderAfterSubmit();
        refreshInsights(user);
        closeCustomerCheckout();
        showToast('Order submitted successfully!');
    } catch (err) {
        console.error("Post-submit local update failed:", err);
        mappedItems.forEach(item => updateLocalStock(item.id, item.quantity));
        showToast('Order was submitted, but display failed to update. Please refresh.', 'error');
    } finally {
        setCheckoutSubmitting(false, "Submit Order");
    }
}
