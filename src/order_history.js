import { auth, fetchOrders, fetchUserProfile } from './firebase';
import { formatCurrency, getCurrencySymbol } from './formatCurrency';
import { toggleModal } from './modal-handler';

let isProcessing = false;

// Search state. `allOrders` is the master array loaded once per modal open;
// `activeFilters` are the chips currently applied (AND semantics); `searchAttributes`
// is rebuilt per open from the fixed attributes + the user's field library.
let allOrders = [];
let activeFilters = [];
let searchAttributes = [];

// Fixed attributes always available, regardless of the custom-field library.
const FIXED_ATTRIBUTES = [
    { key: 'date',     label: 'Order Date', type: 'date', kind: 'fixed' },
    { key: 'customer', label: 'Customer',   type: 'text', kind: 'fixed' },
    { key: 'phone',    label: 'Phone',      type: 'text', kind: 'fixed' },
    { key: 'note',     label: 'Order Note', type: 'text', kind: 'fixed' },
];

function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortId(id) { return id.slice(-8).toUpperCase(); }

function orderCurrency(order) { return order?.currency || 'IDR'; }

function populateBillHeader(profile) {
    document.getElementById('oh-shop-name').textContent =
        profile?.business_name || 'My Shop';
    document.getElementById('oh-shop-tagline').textContent = '';
    const shopDetails = document.getElementById('oh-shop-details');
    shopDetails.textContent = '';
    const parts = [
        profile?.business_address,
        profile?.business_phone,
        profile?.business_email,
    ].filter(Boolean);
    parts.forEach((part, i) => {
        shopDetails.appendChild(document.createTextNode(part));
        if(i < parts.length - 1) { shopDetails.appendChild(document.createElement('br')); }
    });
    document.getElementById('oh-cashier').textContent =
        profile?.username || auth.currentUser?.email || '—';
}

function renderOrderList(orders) {
    const container = document.getElementById('oh-order-list');
    container.replaceChildren();

    if (orders.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'oh-empty';
        empty.textContent = 'No past orders found.';
        container.appendChild(empty);
        return;
    }

    orders.forEach(order => {
        const card = document.createElement('div');
        card.className = 'oh-card';
        const topRow = document.createElement('div');
        topRow.className = 'oh-card__top-row';
        const dateSpan = document.createElement('span');
        dateSpan.className = 'oh-card__date';
        dateSpan.textContent = formatDate(order.createdAt);
        const idSpan = document.createElement('span');
        idSpan.className = 'oh-card__id';
        idSpan.textContent = `#${shortId(order.id)}`;
        topRow.append(dateSpan, idSpan);

        const totalDiv = document.createElement('div');
        totalDiv.className = 'oh-card__total';
        totalDiv.textContent = `${getCurrencySymbol(orderCurrency(order))} ${formatCurrency(order.totalPrice, orderCurrency(order))}`;

        const bottomRow = document.createElement('div');
        bottomRow.className = 'oh-card__bottom-row';
        const qtySpan = document.createElement('span');
        qtySpan.className = 'oh-card__qty';
        qtySpan.textContent = `${order.totalQuantity} item(s)`;
        bottomRow.appendChild(qtySpan);

        card.append(topRow, totalDiv, bottomRow);

        const btn = document.createElement('button');
        btn.className = 'btn oh-card__btn';
        btn.textContent = 'View Details';

        btn.addEventListener('click', () => {
            if (isProcessing) return;
            isProcessing = true;
            btn.disabled = true;
            btn.textContent = 'Loading...';

            viewOrderDetails(order, card);

            setTimeout(() => {
                isProcessing = false;
                btn.disabled = false;
                btn.textContent = 'View Details';
            }, 800);
        });

        card.querySelector('.oh-card__bottom-row').appendChild(btn);
        container.appendChild(card);
    });
}

function viewOrderDetails(order, cardEl) {
    const itemsList = document.getElementById('oh-items-list');
    itemsList.replaceChildren();

    document.getElementById('oh-invoice-num').textContent = shortId(order.id);
    document.getElementById('oh-bill-date').textContent = formatDate(order.createdAt);
    document.getElementById('oh-bill-time').textContent = formatTime(order.createdAt);

    const currency = orderCurrency(order);
    const symbol = getCurrencySymbol(currency);

    let totalItems = 0;
    (order.items || []).forEach(item => {
        totalItems += Number(item.quantity);

        const row = document.createElement('div');
        row.className = 'oh-bill__item-row';
        const itemName = document.createElement('div');
        itemName.className = 'oh-bill__item-name';
        itemName.textContent = item.name;

        const itemQuantity = document.createElement('div');
        itemQuantity.textContent = item.quantity;

        const itemPrice = document.createElement('div');
        itemPrice.textContent = formatCurrency(item.price, currency);

        const itemSubtotal = document.createElement('div');
        itemSubtotal.textContent = formatCurrency(item.subtotal, currency);

        row.appendChild(itemName);
        row.appendChild(itemQuantity);
        row.appendChild(itemPrice);
        row.appendChild(itemSubtotal);

        itemsList.appendChild(row);
    });

    document.getElementById('oh-total-items').textContent = totalItems;
    document.getElementById('oh-subtotal').textContent = `${symbol} ${formatCurrency(order?.subtotal || 0, currency)}`;
    renderDiscountRow(order);
    document.getElementById('oh-business-tax').textContent = `${order?.taxRate || 0}`;
    document.getElementById('oh-tax').textContent = `${symbol} ${formatCurrency(order?.taxAmount || 0, currency)}`;
    document.getElementById('oh-grand-total').textContent = `${symbol} ${formatCurrency(order.totalPrice, currency)}`;

    document.getElementById('oh-print-btn').disabled = false;

    renderOrderInfo(order);

    // Highlight selected card
    document.querySelectorAll('.oh-card').forEach(c => c.classList.remove('oh-card--active'));
    if (cardEl) cardEl.classList.add('oh-card--active');
}

function renderDiscountRow(order) {
    const discountPct = Number(order?.discountPct) || 0;
    const discountAmount = Number(order?.discountAmount) || 0;
    const currency = orderCurrency(order);
    document.getElementById('oh-discount-pct').textContent = String(discountPct);
    document.getElementById('oh-discount-amount').textContent = `- ${getCurrencySymbol(currency)} ${formatCurrency(discountAmount, currency)}`;
}

// ─── Order Information (display-only; not part of the printed bill) ──────────────

// Populate the info block for the selected order. Each core row is shown only when
// it has a value; custom fields are injected per order; the whole block falls back
// to an "empty" line when the order carries no extra details. (Phase 4 display.)
function renderOrderInfo(order) {
    const customer = order.customer || {};
    const hasName = setInfoRow('oh-info-customer-name', customer.name);
    const hasPhone = setInfoRow('oh-info-customer-phone', customer.phone);
    const hasNote = setInfoRow('oh-info-note', order.orderNote);

    const customWrap = document.getElementById('oh-custom-fields');
    customWrap.replaceChildren();
    let customCount = 0;
    const fields = order.customFields || {};
    for (const key of Object.keys(fields)) {
        const field = fields[key];
        if (!field || !field.value) continue;
        customWrap.appendChild(buildCustomFieldRow(field));
        customCount += 1;
    }

    const hasAnything = hasName || hasPhone || hasNote || customCount > 0;
    document.getElementById('oh-info-empty').classList.toggle('is-hidden', hasAnything);
    document.getElementById('oh-info').classList.remove('is-hidden');
}

// Set a static info row's value and toggle its visibility based on whether the
// value is present. Returns true when a value was shown.
function setInfoRow(valueId, value) {
    const valueEl = document.getElementById(valueId);
    const row = valueEl.closest('.oh-info__row');
    const has = typeof value === 'string' ? value.trim() !== '' : Boolean(value);
    valueEl.textContent = has ? value : '';
    if (row) row.classList.toggle('is-hidden', !has);
    return has;
}

function buildCustomFieldRow(field) {
    const row = document.createElement('div');
    row.className = 'oh-info__custom-row';
    const label = document.createElement('span');
    label.className = 'oh-info__label';
    label.textContent = field.label;
    const value = document.createElement('span');
    value.className = 'oh-info__value';
    value.textContent = formatCustomValue(field);
    row.append(label, value);
    return row;
}

// Prettify queryable values for display: dates "2026-06-05" → "Jun 5, 2026",
// times "17:00" → "5:00 PM". Falls back to the raw string if it can't parse.
function formatCustomValue(field) {
    if (field.type === 'date') return prettifyDate(field.value);
    if (field.type === 'time') return prettifyTime(field.value);
    return field.value;
}

function prettifyDate(value) {
    const d = new Date(`${value}T00:00:00`);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function prettifyTime(value) {
    const [h, m] = String(value).split(':').map(Number);
    if (Number.isNaN(h)) return value;
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Attribute-aware search (Phase 4b) ──────────────────────────────────────────

// Build the searchable attribute list: fixed attributes + one per library field.
// Choice fields carry their options so the value control can render a dropdown.
function buildSearchAttributes(library) {
    const defs = Array.isArray(library) ? library : [];
    const custom = defs.map(def => ({
        key: `custom:${def.id}`,
        id: def.id,
        label: def.label,
        type: def.type,
        options: def.options || [],
        kind: 'custom',
    }));
    return [...FIXED_ATTRIBUTES, ...custom];
}

function getAttrByKey(key) {
    return searchAttributes.find(a => a.key === key) || null;
}

function populateAttributeSelect() {
    const select = document.getElementById('oh-search-attr');
    select.replaceChildren();
    for (const attr of searchAttributes) {
        const opt = document.createElement('option');
        opt.value = attr.key;
        opt.textContent = attr.label;
        select.appendChild(opt);
    }
    renderValueControl();
}

// Swap the value control to match the selected attribute's type.
function renderValueControl() {
    const container = document.getElementById('oh-search-value');
    container.replaceChildren();
    const attr = getAttrByKey(document.getElementById('oh-search-attr').value);
    if (attr) container.appendChild(buildValueControl(attr));
}

function buildValueControl(attr) {
    if (attr.type === 'choice') {
        const select = document.createElement('select');
        select.id = 'oh-search-input';
        for (const opt of attr.options) {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            select.appendChild(o);
        }
        return select;
    }
    const input = document.createElement('input');
    input.id = 'oh-search-input';
    // Pre-fill date/time with today/now so the shown value is the real value and
    // the user can Add immediately without having to "tweak" the field first.
    if (attr.type === 'date') {
        input.type = 'date';
        input.value = nowDateValue();
    } else if (attr.type === 'time') {
        input.type = 'time';
        input.value = nowTimeValue();
    } else {
        input.type = 'text';
        input.placeholder = `Search ${attr.label.toLowerCase()}...`;
    }
    input.addEventListener('keydown', handleSearchEnter);
    return input;
}

function nowDateValue() {
    return orderDateKey(new Date());
}

function nowTimeValue() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function handleSearchEnter(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addCurrentFilter();
}

function readValueControl() {
    const el = document.getElementById('oh-search-input');
    return el ? el.value : '';
}

// Add the current attribute+value as a chip. Replaces any existing chip for the
// same attribute so the user can't stack two filters on one field.
function addCurrentFilter() {
    const attr = getAttrByKey(document.getElementById('oh-search-attr').value);
    if (!attr) return;
    const value = readValueControl().trim();
    if (!value) return;

    activeFilters = activeFilters.filter(f => f.key !== attr.key);
    activeFilters.push({ key: attr.key, attr, value, display: displayFilterValue(attr, value) });
    renderChips();
    applyFilters();

    // Reset the value control to its default so the stale value doesn't look
    // re-addable, and the field is clearly ready for the next criterion.
    renderValueControl();
}

function removeFilter(key) {
    activeFilters = activeFilters.filter(f => f.key !== key);
    renderChips();
    applyFilters();
}

function displayFilterValue(attr, value) {
    if (attr.type === 'date') return prettifyDate(value);
    if (attr.type === 'time') return prettifyTime(value);
    return value;
}

function renderChips() {
    const wrap = document.getElementById('oh-search-chips');
    wrap.replaceChildren();
    for (const filter of activeFilters) wrap.appendChild(buildChip(filter));
}

function buildChip(filter) {
    const chip = document.createElement('span');
    chip.className = 'oh-search__chip';
    const text = document.createElement('span');
    text.textContent = `${filter.attr.label}: ${filter.display}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'oh-search__chip-remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => removeFilter(filter.key));
    chip.append(text, remove);
    return chip;
}

// Re-filter the master array against all active chips (AND) and re-render the list.
function applyFilters() {
    const filtered = activeFilters.length
        ? allOrders.filter(order => activeFilters.every(f => orderMatchesFilter(order, f)))
        : allOrders;
    renderSearchCount(filtered.length);
    renderOrderList(filtered);
}

// Show how many orders match the current filters. With no filters active this is
// just the total; with filters it reads "N of M orders".
function renderSearchCount(count) {
    const el = document.getElementById('oh-search-count');
    if (!el) return;
    el.textContent = activeFilters.length
        ? `${count} of ${allOrders.length} orders`
        : `${count} order${count === 1 ? '' : 's'}`;
}

function orderMatchesFilter(order, filter) {
    const attr = filter.attr;
    if (attr.kind === 'fixed') {
        if (attr.key === 'date') return orderDateKey(order.createdAt) === filter.value;
        return fixedText(order, attr.key).toLowerCase().includes(filter.value.toLowerCase());
    }
    const field = order.customFields ? order.customFields[attr.id] : null;
    if (!field || field.value == null) return false;
    return String(field.value) === String(filter.value);
}

function fixedText(order, key) {
    if (key === 'customer') return order.customer?.name || '';
    if (key === 'phone') return order.customer?.phone || '';
    if (key === 'note') return order.orderNote || '';
    return '';
}

// Local YYYY-MM-DD key so it lines up with what <input type="date"> produces.
function orderDateKey(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function resetSearch(library) {
    searchAttributes = buildSearchAttributes(library);
    activeFilters = [];
    populateAttributeSelect();
    renderChips();
}

// ─── Bill zoom ─────────────────────────────────────────────────────────────────

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
let billZoom = 1;

function applyBillZoom() {
    document.getElementById('oh-bill-preview').style.setProperty('--bill-zoom', billZoom);
    document.getElementById('oh-zoom-level').textContent = `${Math.round(billZoom * 100)}%`;
    document.getElementById('oh-zoom-out').disabled = billZoom <= ZOOM_MIN;
    document.getElementById('oh-zoom-in').disabled = billZoom >= ZOOM_MAX;
}

function resetBillZoom() {
    billZoom = 1;
    applyBillZoom();
}

function initBillZoom() {
    document.getElementById('oh-zoom-out').addEventListener('click', () => {
        billZoom = Math.max(ZOOM_MIN, Math.round((billZoom - ZOOM_STEP) * 100) / 100);
        applyBillZoom();
    });
    document.getElementById('oh-zoom-in').addEventListener('click', () => {
        billZoom = Math.min(ZOOM_MAX, Math.round((billZoom + ZOOM_STEP) * 100) / 100);
        applyBillZoom();
    });
    document.getElementById('oh-zoom-level').addEventListener('click', resetBillZoom);
}

// ─── Bill pan (drag like a PDF/map viewer) ──────────────────────────────────────

let panState = null;

function startBillPan(e) {
    const scrollEl = document.getElementById('oh-bill-scroll');
    panState = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: scrollEl.scrollLeft,
        scrollTop: scrollEl.scrollTop,
    };
    scrollEl.classList.add('is-dragging');
    scrollEl.setPointerCapture(e.pointerId);
}

function moveBillPan(e) {
    if (!panState) return;
    const scrollEl = document.getElementById('oh-bill-scroll');
    scrollEl.scrollLeft = panState.scrollLeft - (e.clientX - panState.startX);
    scrollEl.scrollTop = panState.scrollTop - (e.clientY - panState.startY);
}

function endBillPan(e) {
    if (!panState) return;
    panState = null;
    const scrollEl = document.getElementById('oh-bill-scroll');
    scrollEl.classList.remove('is-dragging');
    scrollEl.releasePointerCapture(e.pointerId);
}

function initBillPan() {
    const scrollEl = document.getElementById('oh-bill-scroll');
    scrollEl.addEventListener('pointerdown', startBillPan);
    scrollEl.addEventListener('pointermove', moveBillPan);
    scrollEl.addEventListener('pointerup', endBillPan);
    scrollEl.addEventListener('pointercancel', endBillPan);
}

// ─── Print ─────────────────────────────────────────────────────────────────────

function initPrintButton() {
    document.getElementById('oh-print-btn').addEventListener('click', () => {
        window.print();
    });
}

// ─── Init ──────────────────────────────────────────────────────────────────────

export async function initOrderHistory(user) {
    const openBtn = document.getElementById('js-order-history-open');
    if (!openBtn) return;

    openBtn.addEventListener('click', async () => {
        toggleModal('order-history-modal');
        if (!user) return;

        // Load profile for bill header (cached centrally in firebase.js)
        const profile = await fetchUserProfile(user.uid);
        populateBillHeader(profile);
        resetSearch(profile?.orderFieldLibrary);

        // Reset bill panel
        document.getElementById('oh-items-list').replaceChildren();
        document.getElementById('oh-invoice-num').textContent = '—';
        document.getElementById('oh-bill-date').textContent = '—';
        document.getElementById('oh-bill-time').textContent = '—';
        document.getElementById('oh-total-items').textContent = '—';
        document.getElementById('oh-subtotal').textContent = '—';
        document.getElementById('oh-grand-total').textContent = '—';
        document.getElementById('oh-tax').textContent = '—';
        document.getElementById('oh-discount-amount').textContent = '- 0';
        document.getElementById('oh-discount-pct').textContent = '0';
        document.getElementById('oh-print-btn').disabled = true;
        document.getElementById('oh-info').classList.add('is-hidden');
        resetBillZoom();

        // Fetch and render orders
        const orderList = document.getElementById('oh-order-list');
        const loadingMsg = document.createElement('p');
        loadingMsg.className = 'oh-empty';
        loadingMsg.textContent = 'Loading orders...';
        orderList.replaceChildren(loadingMsg);
        try {
            const orders = await fetchOrders(user.uid);
            allOrders = orders;
            applyFilters();
        } catch (err) {
            console.error('Failed to load order history:', err);
            const errorMsg = document.createElement('p');
            errorMsg.className = 'oh-empty oh-empty--error';
            errorMsg.textContent = 'Failed to load orders.';
            orderList.replaceChildren(errorMsg);
        }
    });

    document.getElementById('oh-search-attr').addEventListener('change', renderValueControl);
    document.getElementById('oh-search-add').addEventListener('click', addCurrentFilter);

    initPrintButton();
    initBillZoom();
    initBillPan();
}
