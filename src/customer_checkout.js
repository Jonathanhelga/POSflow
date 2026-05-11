import { toggleModal } from './modal-handler';
import { formatRupiah } from './formatRupiah';
import { getOrderedItems } from './order-add_item';

const MODAL_ID = 'customer-checkout-modal';

export function initCustomerCheckout() {
    const discountInput = document.getElementById('js-checkout-discount');
    if (!discountInput) return;
    discountInput.addEventListener('input', recalcTotals);
}

export function openCustomerCheckout() {
    renderOrderRecap();
    resetDiscount();
    recalcTotals();
    toggleModal(MODAL_ID);
}

export function closeCustomerCheckout() {
    document.querySelector(`[data-modal-close="${MODAL_ID}"]`)?.click();
}

export function getCheckoutFormData() {
    const items = getOrderedItems();
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const discountPct = clampDiscount(Number(document.getElementById('js-checkout-discount')?.value) || 0);
    const discountAmount = subtotal * (discountPct / 100);
    return {
        customer: {
            id: document.getElementById('js-checkout-customer-id')?.value.trim() || '',
            name: document.getElementById('js-checkout-customer-name')?.value.trim() || '',
            phone: document.getElementById('js-checkout-customer-phone')?.value.trim() || '',
            note: document.getElementById('js-checkout-customer-note')?.value.trim() || '',
        },
        discountPct,
        discountAmount,
    };
}

export function setCheckoutSubmitting(isSubmitting, label) {
    const submitBtn = document.getElementById('js-checkout-submit');
    if (!submitBtn) return;
    submitBtn.disabled = isSubmitting;
    if (label !== undefined) submitBtn.textContent = label;
}

function renderOrderRecap() {
    const tbody = document.getElementById('js-checkout-recap-body');
    if (!tbody) return;
    tbody.replaceChildren();

    const items = getOrderedItems();
    if (items.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.className = 'c-checkout__recap-empty';
        td.textContent = 'No items in this order yet.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    items.forEach(item => tbody.appendChild(buildRecapRow(item)));
}

function buildRecapRow(item) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = item.name;

    const qtyTd = document.createElement('td');
    qtyTd.className = 'c-checkout__col-qty';
    qtyTd.textContent = `x${item.quantity}`;

    const subtotalTd = document.createElement('td');
    subtotalTd.className = 'c-checkout__col-subtotal';
    subtotalTd.textContent = formatRupiah(item.price * item.quantity);

    tr.appendChild(nameTd);
    tr.appendChild(qtyTd);
    tr.appendChild(subtotalTd);
    return tr;
}

function resetDiscount() {
    const discountInput = document.getElementById('js-checkout-discount');
    if (discountInput) discountInput.value = '';
}

function recalcTotals() {
    const items = getOrderedItems();
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

    const discountInput = document.getElementById('js-checkout-discount');
    const discountPct = clampDiscount(Number(discountInput?.value) || 0);
    const discountAmount = subtotal * (discountPct / 100);
    const total = Math.max(0, subtotal - discountAmount);

    setText('js-checkout-subtotal', formatRupiah(subtotal));
    setText('js-checkout-discount-amount', `- ${formatRupiah(discountAmount)}`);
    setText('js-checkout-total', formatRupiah(total));
}

function clampDiscount(value) {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
