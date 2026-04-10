import { db, fetchInventory } from './firebase';
import { auth } from './firebase';
import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { toggleModal } from './modal-handler';

let allItems      = [];
let filteredItems = [];
let selectedItem  = null;

const formatCurrency = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(value ?? 0);

function getStockStatus(current, min) {
    return Number(current) >= Number(min) ? 'good' : 'alert';
}

// ─── Render item list

function renderItemList(items) {
    const container = document.getElementById('iu-item-list');
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<p class="iu-empty">No items found.</p>';
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const status = getStockStatus(item.stockLevel, item?.minStockLevel || 0);
        const card = document.createElement('div');
        card.className = 'iu-card';
        card.dataset.itemId = item.id;

        card.innerHTML = `
            <div class="iu-card__top">
                <div class="iu-card__tag-dot iu-tag--${item.tagColor ?? 'neutral'}"></div>
                <span class="iu-card__name">${item.itemName ?? '—'}</span>
                <span class="iu-badge iu-badge--${status}">${status === 'good' ? 'GOOD' : 'ALERT'}</span>
            </div>
            <div class="iu-card__bottom">
                <span class="iu-card__sku">${item.sku ?? '—'}</span>
                <span class="iu-card__stock-info">
                    ${item.stockLevel ?? 0} <span class="iu-card__unit">${item.unit ?? ''}</span>
                    &nbsp;/&nbsp; min ${item.minStockLevel ?? 0}
                </span>
            </div>
        `;

        card.addEventListener('click', () => selectItem(item, card));
        frag.appendChild(card);
    });
    container.appendChild(frag);
}

// ─── Select item 

function selectItem(item, cardEl) {
    document.querySelectorAll('.iu-card').forEach(c => c.classList.remove('iu-card--active'));
    cardEl.classList.add('iu-card--active');
    selectedItem = item;
    console.log(item);
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

    document.getElementById('iu-cost-price').textContent = formatCurrency(item.costPrice);
    document.getElementById('iu-sell-price').textContent = formatCurrency(item.sellPrice);

    document.getElementById('iu-incoming-qty').value = '';
    clearFeedback();
}

// ─── Save stock update

async function handleSave() {
    if (!selectedItem) return;

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
        await updateDoc(doc(db, 'inventory', selectedItem.id), {
            stockLevel:  increment(qty),
            lastUpdated: serverTimestamp(),
        });

        // Update local state
        selectedItem.stockLevel = (selectedItem.stockLevel ?? 0) + qty;
        const idx = allItems.findIndex(i => i.id === selectedItem.id);
        if (idx !== -1) allItems[idx].stockLevel = selectedItem.stockLevel;

        // Refresh the card in the list
        const cardEl = document.querySelector(`.iu-card[data-item-id="${selectedItem.id}"]`);
        if (cardEl) {
            const status = getStockStatus(selectedItem.stockLevel, selectedItem.minStockLevel);
            cardEl.querySelector('.iu-badge').textContent = status === 'good' ? 'GOOD' : 'ALERT';
            cardEl.querySelector('.iu-badge').className   = `iu-badge iu-badge--${status}`;
            cardEl.querySelector('.iu-card__stock-info').innerHTML =
                `${selectedItem.stockLevel} <span class="iu-card__unit">${selectedItem.unit ?? ''}</span>
                 &nbsp;/&nbsp; min ${selectedItem.minStockLevel ?? 0}`;
        }

        populateDetail(selectedItem);
        input.value = '';
        showFeedback(
            `Added ${qty} ${selectedItem.unit ?? 'units'}. New stock: ${selectedItem.stockLevel}.`,
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

async function openInventoryUpdate() {
    const user = auth.currentUser;
    if (!user) return;

    // Reset panel state
    selectedItem = null;
    document.getElementById('iu-item-list').innerHTML   = '<p class="iu-empty">Loading...</p>';
    document.getElementById('iu-search').value          = '';
    // document.getElementById('iu-empty-state').classList.remove('is-hidden');
    document.getElementById('iu-detail-view').classList.add('is-hidden');

    try {
        allItems      = await fetchInventory(user.uid);
        filteredItems = [...allItems];
        renderItemList(filteredItems);
    } catch (err) {
        console.error('Failed to load inventory:', err);
        document.getElementById('iu-item-list').innerHTML =
            '<p class="iu-empty iu-empty--error">Failed to load inventory.</p>';
    }
}

export function initInventoryUpdate() {
    document.getElementById('inventory-update-open').addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('inventory-update-modal');
        openInventoryUpdate();
    });

    document.getElementById('iu-save-btn').addEventListener('click', handleSave);

    document.getElementById('iu-search').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        filteredItems = q
            ? allItems.filter(item =>
                (item.itemName ?? '').toLowerCase().includes(q) ||
                (item.sku ?? '').toLowerCase().includes(q))
            : [...allItems];
        renderItemList(filteredItems);
    });
}
