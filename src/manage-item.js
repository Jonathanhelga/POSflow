import { updateItemData } from './firebase';
import { toggleModal } from './modal-handler';
import { allItems, loadAllItems, updateLocalItem } from './search_item';
import { formatRupiah } from './formatRupiah';

let filteredItems  = [];
let selectedItem   = null;
let selectedTheme  = 'primary';

// Maps the stored tagColor token to the swatch shown on cards / header.
// Mirrors the .btn--* theme colors defined in add_item_modal.css.
const TAG_SWATCH = {
    primary:    '#4E7397',
    success:    '#86A38C',
    neutral:    '#718096',
    priority:   '#C58B8B',
    legibility: '#2D3748',
    pink:       '#ea8cd1',
    yellow:     '#ebdfa4',
};

// Theme order + display names for the swatch picker (replaces the native
// <select>, which Safari refuses to style consistently).
const THEMES = [
    { token: 'primary',    name: 'Muted Cobalt' },
    { token: 'success',    name: 'Sage Green' },
    { token: 'neutral',    name: 'Soft Blue' },
    { token: 'priority',   name: 'Dusty Rose' },
    { token: 'legibility', name: 'Deep Charcoal' },
    { token: 'pink',       name: 'Baby Pink' },
    { token: 'yellow',     name: 'Yellow Butter' },
];

function swatchFor(tagColor) {
    return TAG_SWATCH[tagColor] || 'var(--clr-border)';
}

// Build the theme swatch row once. Each swatch is a button so it styles
// identically across browsers; clicking sets the in-memory selectedTheme.
function buildThemeSwatches() {
    const container = document.getElementById('mi-edit-theme');
    const frag = document.createDocumentFragment();
    THEMES.forEach(theme => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mi-swatch';
        btn.dataset.theme = theme.token;
        btn.title = theme.name;            // native tooltip on hover
        btn.style.backgroundColor = swatchFor(theme.token);
        btn.addEventListener('click', () => setActiveTheme(theme.token));
        frag.appendChild(btn);
    });
    container.replaceChildren(frag);
}

function setActiveTheme(token) {
    selectedTheme = token;
    document.querySelectorAll('#mi-edit-theme .mi-swatch').forEach(sw => {
        sw.classList.toggle('mi-swatch--active', sw.dataset.theme === token);
    });
}

function formatTimestamp(ts) {
    if (!ts) return '—';
    // Firestore Timestamp has toDate(); fall back to raw Date/string.
    const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
    }).format(date);
}

// ─── Render item list ────────────────────────────────────────────

function renderItemList_Manage(items) {
    const container = document.getElementById('mi-item-list');
    container.replaceChildren();

    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'mi-empty';
        empty.textContent = 'No items found.';
        container.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'mi-card';
        card.dataset.itemId = item.id;

        const topRow = document.createElement('div');
        topRow.className = 'mi-card__top';

        const dot = document.createElement('span');
        dot.className = 'mi-card__dot';
        dot.style.backgroundColor = swatchFor(item.tagColor);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'mi-card__name';
        nameSpan.textContent = item.itemName ?? '—';

        topRow.append(dot, nameSpan);

        const skuSpan = document.createElement('span');
        skuSpan.className = 'mi-card__sku';
        skuSpan.textContent = item.sku ?? '—';

        card.append(topRow, skuSpan);
        card.addEventListener('click', () => selectItem(item, card));
        frag.appendChild(card);
    });
    container.appendChild(frag);
}

// ─── Select + populate ───────────────────────────────────────────

function selectItem(item, cardEl) {
    document.querySelectorAll('.mi-card').forEach(c => c.classList.remove('mi-card--active'));
    cardEl.classList.add('mi-card--active');
    selectedItem = item;
    populateDetail(item);
}

function populateDetail(item) {
    document.getElementById('mi-placeholder').classList.add('is-hidden');
    document.getElementById('mi-detail-view').classList.remove('is-hidden');
    document.getElementById('mi-footer').classList.remove('is-hidden');

    document.getElementById('mi-detail-dot').style.backgroundColor = swatchFor(item.tagColor);
    document.getElementById('mi-detail-name').textContent = item.itemName ?? '—';
    document.getElementById('mi-detail-sku').textContent  = `SKU: ${item.sku ?? '—'}`;

    // Read-only overview
    document.getElementById('mi-ro-stock').textContent   = `${item.stockLevel ?? 0} ${item.unit ?? ''}`.trim();
    document.getElementById('mi-ro-unit').textContent    = item.unit || '—';
    document.getElementById('mi-ro-created').textContent = formatTimestamp(item.createdAt);
    document.getElementById('mi-ro-updated').textContent = formatTimestamp(item.lastUpdated);
    document.getElementById('mi-ro-desc').textContent    = item.description || '—';

    // Editable fields
    document.getElementById('mi-edit-cost').value     = item.costPrice ?? '';
    document.getElementById('mi-edit-sell').value     = item.sellPrice ?? '';
    document.getElementById('mi-edit-min').value      = item.minStockLevel ?? '';
    document.getElementById('mi-edit-supplier').value = item.supplier ?? '';
    setActiveTheme(item.tagColor || 'primary');

    clearFeedback();
}

// ─── Save edits ──────────────────────────────────────────────────

async function handleSave() {
    if (!selectedItem) return;

    const costPrice     = Number(document.getElementById('mi-edit-cost').value);
    const sellPrice     = Number(document.getElementById('mi-edit-sell').value);
    const minStockLevel = parseFloat(document.getElementById('mi-edit-min').value);
    const supplier      = document.getElementById('mi-edit-supplier').value.trim();
    const tagColor      = selectedTheme;

    if (!Number.isFinite(costPrice) || costPrice < 0) {
        showFeedback('Cost Price must be a number of 0 or more.', 'error');
        return;
    }
    if (!Number.isFinite(sellPrice) || sellPrice < 0) {
        showFeedback('Sell Price must be a number of 0 or more.', 'error');
        return;
    }
    if (!Number.isFinite(minStockLevel) || minStockLevel < 0) {
        showFeedback('Minimum Stock must be a number of 0 or more.', 'error');
        return;
    }

    const fields = { costPrice, sellPrice, minStockLevel, supplier, tagColor };

    const btn = document.getElementById('mi-save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';

    try {
        await updateItemData(selectedItem.id, fields);
        updateLocalItem(selectedItem.id, fields);
        Object.assign(selectedItem, fields);

        // Refresh the selected card's swatch in the list.
        const cardEl = document.querySelector(`.mi-card[data-item-id="${selectedItem.id}"]`);
        if (cardEl) cardEl.querySelector('.mi-card__dot').style.backgroundColor = swatchFor(tagColor);

        document.getElementById('mi-detail-dot').style.backgroundColor = swatchFor(tagColor);
        showFeedback('Item updated successfully.', 'success');
    } catch (err) {
        console.error('Item update failed:', err);
        showFeedback('Failed to update item. Please try again.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Save Changes';
    }
}

// ─── Feedback helpers ────────────────────────────────────────────

function showFeedback(msg, type) {
    const el = document.getElementById('mi-feedback');
    el.textContent = msg;
    el.className   = `mi-feedback mi-feedback--${type}`;
}

function clearFeedback() {
    const el = document.getElementById('mi-feedback');
    el.textContent = '';
    el.className   = 'mi-feedback';
}

// ─── Open / load ─────────────────────────────────────────────────

async function openManageItem(user) {
    if (!user) return;

    selectedItem = null;
    document.getElementById('mi-detail-view').classList.add('is-hidden');
    document.getElementById('mi-footer').classList.add('is-hidden');
    document.getElementById('mi-placeholder').classList.remove('is-hidden');
    document.getElementById('mi-search').value = '';

    const loadingMsg = document.createElement('p');
    loadingMsg.className = 'mi-empty';
    loadingMsg.textContent = 'Loading...';
    document.getElementById('mi-item-list').replaceChildren(loadingMsg);

    try {
        await loadAllItems();
        filteredItems = [...allItems];
        renderItemList_Manage(filteredItems);
    } catch (err) {
        console.error('Failed to load inventory:', err);
        const errMsg = document.createElement('p');
        errMsg.className = 'mi-empty mi-empty--error';
        errMsg.textContent = 'Failed to load inventory.';
        document.getElementById('mi-item-list').replaceChildren(errMsg);
    }
}

export function initManageItem(user) {
    const openBtn = document.getElementById('manage-item-open');
    if (!openBtn) return;

    buildThemeSwatches();

    openBtn.addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('manage-item-modal');
        if (!user) return;
        openManageItem(user);
    });

    document.getElementById('mi-save-btn').addEventListener('click', handleSave);

    document.getElementById('mi-search').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        filteredItems = q
            ? allItems.filter(item =>
                (item.itemName ?? '').toLowerCase().includes(q) ||
                (item.sku ?? '').toLowerCase().includes(q))
            : [...allItems];
        renderItemList_Manage(filteredItems);
    });
}
