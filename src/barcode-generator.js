import JsBarcode from 'jsbarcode';
import html2canvas from 'html2canvas';
import { fetchInventory } from './firebase';
import { auth } from './firebase';
import { toggleModal } from './modal-handler';
import { formatRupiah } from './formatRupiah';

let allItems      = [];
let filteredItems = [];
let selectedItem  = null;
let currentObjectUrl = null;
let uploadedImageUrl = null;
let activeSize = 'large';

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
    document.getElementById('bg-save-btn').disabled = false;
}

function updatePreview() {
    if (!selectedItem) return;

    const design = document.getElementById('bg-barcode-design');
    design.innerHTML = `
        <div class="bg-preview bg-preview--${activeSize}">
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
                margin: 5,
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

// ─── save ─────────────────────────────────────────────────────────────────────

async function saveDesign() {
    if (!selectedItem) return;

    const previewEl = document.querySelector('.bg-preview');
    if (!previewEl) return;

    const btn = document.getElementById('bg-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        // Capture the preview card as a high-res PNG (scale 3 = 3× pixel density)
        const canvas = await html2canvas(previewEl, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#d8faff',
        });

        // Build filename: e.g. "barcode-SKU123-sticker-s.png"
        const name = selectedItem.sku ?? selectedItem.itemName ?? 'barcode';
        const link = document.createElement('a');
        link.download = `barcode-${name}-${activeSize}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Failed to save design:', err);
    } finally {
        btn.disabled = false;
        alert('design successfully downloaded')
        btn.textContent = 'Save Design';
    }
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
    document.getElementById('bg-save-btn').disabled   = true;
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

    document.getElementById('bg-size-options').addEventListener('click', (e) => {
        const btn = e.target.closest('.bg-size-btn');
        if (!btn) return;
        activeSize = btn.dataset.size;
        document.querySelectorAll('.bg-size-btn').forEach(b =>
            b.classList.toggle('bg-size-btn--active', b === btn)
        );
        if (selectedItem) updatePreview();
    });

    document.getElementById('bg-save-btn').addEventListener('click', saveDesign);
}
