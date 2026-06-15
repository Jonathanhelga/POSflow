import { db, getCachedUserProfile } from './firebase';
import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { toggleModal } from './modal-handler';
import { allItems, loadAllItems, updateLocalStock } from './search_item';
import { createSelection } from './selection';
import { formatCurrency, getCurrencySymbol } from './formatCurrency';

let filteredItems = [];
const selection   = createSelection();

function currentCurrency() {
    return getCachedUserProfile()?.currency || 'IDR';
}

function getStockStatus(current, min) {
    return Number(current ?? 0) >= Number(min ?? 0) ? 'good' : 'alert';
}

// ─── Render item list

function renderItemList_Inventory(items) {
    const container = document.getElementById('iu-item-list');
    container.replaceChildren();

    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'iu-empty';
        empty.textContent = 'No items found.';
        container.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const status = getStockStatus(item.stockLevel, item?.minStockLevel || 0);
        const card = document.createElement('div');
        card.className = 'iu-card';
        card.dataset.itemId = item.id;

        const topRow = document.createElement('div');
        topRow.className = 'iu-card__top';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'iu-card__name';
        nameSpan.textContent = item.itemName ?? '—';
        const badge = document.createElement('span');
        badge.className = `iu-badge iu-badge--${status}`;
        badge.textContent = status === 'good' ? 'GOOD' : 'ALERT';
        topRow.append(nameSpan, badge);

        const bottomRow = document.createElement('div');
        bottomRow.className = 'iu-card__bottom';
        const skuSpan = document.createElement('span');
        skuSpan.className = 'iu-card__sku';
        skuSpan.textContent = item.sku ?? '—';
        const stockInfo = document.createElement('span');
        stockInfo.className = 'iu-card__stock-info';
        const unitSpan = document.createElement('span');
        unitSpan.className = 'iu-card__unit';
        unitSpan.textContent = item.unit ?? '';
        stockInfo.append(
            document.createTextNode(`${item.stockLevel ?? 0} `),
            unitSpan,
            document.createTextNode(` \u00a0/\u00a0 min ${item.minStockLevel ?? 0}`)
        );
        bottomRow.append(skuSpan, stockInfo);

        card.append(topRow, bottomRow);

        card.addEventListener('click', () => selectItem(item, card));
        frag.appendChild(card);
    });
    container.appendChild(frag);
}

// ─── Select item 

function selectItem(item, cardEl) {
    document.querySelectorAll('.iu-card').forEach(c => c.classList.remove('iu-card--active'));
    cardEl.classList.add('iu-card--active');
    selection.set(item);
    populateDetail(item);
    
}

// ─── Populate right panel 

function populateDetail(item) {
    // document.getElementById('iu-empty-state').classList.add('is-hidden');
    document.getElementById('iu-detail-view').classList.remove('is-hidden');

    const status = getStockStatus(item.stockLevel, item?.minStockLevel || 0);
    const badgeEl = document.getElementById('iu-status-badge');
    badgeEl.textContent = status === 'good' ? 'GOOD' : 'ALERT';
    badgeEl.className = `iu-detail-badge iu-badge--${status}`;

    const tagDot = document.getElementById('iu-detail-tag');
    tagDot.className = `iu-detail-tag iu-tag--${status === 'good' ? 'good' : 'alert'}`;

    document.getElementById('iu-detail-name').textContent = item.itemName ?? '—';
    document.getElementById('iu-detail-sku').textContent  = `SKU: ${item.sku ?? '—'}`;

    document.getElementById('iu-current-stock').textContent = `${item.stockLevel ?? 0} ${item.unit ?? ''}`;
    document.getElementById('iu-min-stock').textContent     = `${item.minStockLevel ?? 0} ${item.unit ?? ''}`;
    document.getElementById('iu-unit').textContent          = item.unit || '—';
    document.getElementById('iu-supplier').textContent      = item.supplier || '—';

    const currency = currentCurrency();
    const symbol = getCurrencySymbol(currency);
    document.getElementById('iu-cost-price').textContent = `${symbol} ${formatCurrency(item.costPrice, currency)}`;
    document.getElementById('iu-sell-price').textContent = `${symbol} ${formatCurrency(item.sellPrice, currency)}`;

    document.getElementById('iu-incoming-qty').value = '';
    clearFeedback();
}

// ─── Save stock update

async function handleSave() {
    const item = selection.get();
    if (!item) return;

    const input = document.getElementById('iu-incoming-qty');
    const qty   = Number(input.value);

    if (!Number.isInteger(qty) || qty <= 0) {
        showFeedback('Please enter a valid whole number greater than 0.', 'error');
        return;
    }

    const btn = document.getElementById('iu-save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';

    try {
        await updateDoc(doc(db, 'inventory', item.id), {
            stockLevel:  increment(qty),
            lastUpdated: serverTimestamp(),
        });

        updateLocalStock(item.id, qty);

        // Refresh the card in the list
        const cardEl = document.querySelector(`.iu-card[data-item-id="${item.id}"]`);
        if (cardEl) {
            const status = getStockStatus(item.stockLevel, item.minStockLevel);
            cardEl.querySelector('.iu-badge').textContent = status === 'good' ? 'GOOD' : 'ALERT';
            cardEl.querySelector('.iu-badge').className   = `iu-badge iu-badge--${status}`;
            const stockInfoEl = cardEl.querySelector('.iu-card__stock-info');
            const updatedUnitSpan = document.createElement('span');
            updatedUnitSpan.className = 'iu-card__unit';
            updatedUnitSpan.textContent = item.unit ?? '';
            stockInfoEl.replaceChildren(
                document.createTextNode(`${item.stockLevel} `),
                updatedUnitSpan,
                document.createTextNode(` \u00a0/\u00a0 min ${item.minStockLevel ?? 0}`)
            );
        }

        populateDetail(item);
        input.value = '';
        showFeedback(
            `Added ${qty} ${item.unit ?? 'units'}. New stock: ${item.stockLevel}.`,
            'success'
        );

    } catch (err) {
        console.error('Stock update failed:', err);
        showFeedback('Failed to update stock. Please try again.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Save';
    }
}

// ─── Feedback helpers 

function showFeedback(msg, type) {
    const el = document.getElementById('iu-feedback');
    el.textContent = msg;
    el.className   = `iu-feedback iu-feedback--${type}`;
}

function clearFeedback() {
    const el = document.getElementById('iu-feedback');
    el.textContent = '';
    el.className   = 'iu-feedback';
}

// ─── Load inventory on open

async function openInventoryUpdate(user) {
    if (!user) return;

    // Reset panel state
    selection.clear();
    const loadingMsg = document.createElement('p');
    loadingMsg.className = 'iu-empty';
    loadingMsg.textContent = 'Loading...';
    document.getElementById('iu-item-list').replaceChildren(loadingMsg);
    document.getElementById('iu-search').value          = '';

    try {
        await loadAllItems();
        filteredItems = [...allItems];
        renderItemList_Inventory(filteredItems);
    } catch (err) {
        console.error('Failed to load inventory:', err);
        const errMsg = document.createElement('p');
        errMsg.className = 'iu-empty iu-empty--error';
        errMsg.textContent = 'Failed to load inventory.';
        document.getElementById('iu-item-list').replaceChildren(errMsg);
    }
}

export function initInventoryUpdate(user) {
    const openBtn = document.getElementById('inventory-update-open');
    if (!openBtn) return;

    openBtn.addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('inventory-update-modal');
        if (!user) return;
        openInventoryUpdate(user);
    });

    document.getElementById('iu-save-btn').addEventListener('click', handleSave);

    document.getElementById('iu-search').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        filteredItems = q
            ? allItems.filter(item =>
                (item.itemName ?? '').toLowerCase().includes(q) ||
                (item.sku ?? '').toLowerCase().includes(q))
            : [...allItems];
        renderItemList_Inventory(filteredItems);
    });
}
