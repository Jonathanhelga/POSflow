import JsBarcode from 'jsbarcode';
import { fetchInventory } from './firebase';
import { auth } from './firebase';
import { toggleModal } from './modal-handler';
import { formatRupiah } from './formatRupiah';

let allItems      = [];
let filteredItems = [];
let selectedItem  = null;
let currentObjectUrl = null;
let uploadedImageUrl = null;

// ─── helpers ──────────────────────────────────────────────────────────────────

function cleanupObjectUrl() {
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }
}

// ─── item list ────────────────────────────────────────────────────────────────

function renderItemList(items) {
    const container = document.getElementById('bg-item-list');
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<p class="bg-empty">No items found.</p>';
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-card';
        if (selectedItem?.id === item.id) card.classList.add('bg-card--active');
        card.dataset.itemId = item.id;
        card.innerHTML = `
            <div class="bg-card__top-row">
                <span class="bg-card__name">${item.itemName ?? '-'}</span>
                <span class="bg-card__sku">#${item.sku ?? '-'}</span>
            </div>
            <div class="bg-card__second-row">
                <span class="bg-card__price">Rp ${formatRupiah(item.sellPrice)}</span>
                <span class="bg-card__stock">${item.stockLevel ?? 0} <span class="bg-card__unit">${item.unit ?? ''}</span></span>
            </div>
        `;
        card.addEventListener('click', () => selectItem(item));
        frag.appendChild(card);
    });
    container.appendChild(frag);
}

// ─── selection & preview ──────────────────────────────────────────────────────

function selectItem(item) {
    selectedItem = item;

    document.querySelectorAll('.bg-card').forEach(c => {
        c.classList.toggle('bg-card--active', c.dataset.itemId === item.id);
    });

    updatePreview();
    document.getElementById('bg-print-btn').disabled = false;
}

function updatePreview() {
    if (!selectedItem) return;

    const design = document.getElementById('bg-barcode-design');
    design.innerHTML = `
        <div class="bg-preview">
            <div class="bg-preview__name">${selectedItem.itemName ?? '-'}</div>
            <div class="bg-preview__img-wrap" id="bg-preview-img-wrap">
                <img id="bg-preview-img" src="${uploadedImageUrl ?? ''}" alt="Product photo" />
            </div>
            <div class="bg-preview__price">Rp ${formatRupiah(selectedItem.sellPrice)}</div>
            <svg id="bg-barcode-svg"></svg>
        </div>
    `;

    // show/hide image block
    document.getElementById('bg-preview-img-wrap').style.display =
        uploadedImageUrl ? 'block' : 'none';

    // generate barcode
    const svgEl = document.getElementById('bg-barcode-svg');
    const sku   = (selectedItem.sku ?? '').trim();
    if (sku) {
        try {
            JsBarcode(svgEl, sku, {
                height: 110,
                fontSize: 14,
                displayValue: true,
                margin: 10,
                background: 'transparent',
            });
        } catch {
            svgEl.insertAdjacentHTML('afterend', '<p class="bg-empty bg-empty--error">Invalid SKU for barcode</p>');
            svgEl.remove();
        }
    } else {
        svgEl.insertAdjacentHTML('afterend', '<p class="bg-empty">No SKU — barcode unavailable</p>');
        svgEl.remove();
    }
}

// ─── print ────────────────────────────────────────────────────────────────────

function printPreview() {
    if (!selectedItem) return;
    const content = document.getElementById('bg-barcode-design').innerHTML;
    const win = window.open('', '_blank', 'width=500,height=680');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Barcode — ${selectedItem.itemName ?? ''}</title>
  <style>
    body { margin: 0; display: flex; justify-content: center; padding: 24px; font-family: sans-serif; }
    .bg-preview { text-align: center; background: #d8faff; padding: 30px 30px 50px; line-height: 1.6; max-width: 320px; width: 100%; }
    .bg-preview__name { font-size: 1.15rem; font-weight: 700; margin-bottom: 10px; }
    .bg-preview__img-wrap { margin-bottom: 10px; }
    .bg-preview__img-wrap img { max-width: 120px; max-height: 120px; object-fit: contain; }
    .bg-preview__price { font-size: 0.95rem; margin-bottom: 14px; color: #333; }
    svg { max-width: 100%; }
  </style>
</head>
<body>${content}</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
}

// ─── open / reset ─────────────────────────────────────────────────────────────

async function openBarcodeGenerator() {
    const user = auth.currentUser;
    if (!user) return;

    selectedItem = null;
    cleanupObjectUrl();
    uploadedImageUrl = null;

    document.getElementById('bg-item-list').innerHTML  = '<p class="bg-empty">Loading...</p>';
    document.getElementById('bg-search').value         = '';
    document.getElementById('bg-print-btn').disabled   = true;
    document.getElementById('bg-img-upload').value     = '';
    document.getElementById('bg-img-filename').textContent = '';
    document.getElementById('bg-barcode-design').innerHTML =
        '<p class="bg-empty">Select an item from the list.</p>';

    try {
        allItems      = await fetchInventory(user.uid);
        filteredItems = [...allItems];
        renderItemList(filteredItems);
    } catch (err) {
        console.error('Failed to load inventory:', err);
        document.getElementById('bg-item-list').innerHTML =
            '<p class="bg-empty bg-empty--error">Failed to load inventory.</p>';
    }
}

// ─── init ─────────────────────────────────────────────────────────────────────

export async function initBarcodeGenerator() {
    const openBtn = document.getElementById('barcode-generator-open');
    if (!openBtn) return;

    openBtn.addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('barcode-generator-modal');
        if (!auth.currentUser) return;
        openBarcodeGenerator();
    });

    document.getElementById('bg-search').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        filteredItems = q
            ? allItems.filter(item =>
                (item.itemName ?? '').toLowerCase().includes(q) ||
                (item.sku     ?? '').toLowerCase().includes(q)
              )
            : [...allItems];
        renderItemList(filteredItems);
    });

    document.getElementById('bg-img-upload').addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        cleanupObjectUrl();
        if (file) {
            currentObjectUrl = URL.createObjectURL(file);
            uploadedImageUrl = currentObjectUrl;
            document.getElementById('bg-img-filename').textContent = file.name;
        } else {
            uploadedImageUrl = null;
            document.getElementById('bg-img-filename').textContent = '';
        }
        if (selectedItem) updatePreview();
    });

    document.getElementById('bg-print-btn').addEventListener('click', printPreview);
}
