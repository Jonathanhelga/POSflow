import { submitItemData, auth, getCachedUserProfile } from "./firebase";
import { getCurrencySymbol } from './formatCurrency';
import { addSingleItem } from "./search_item";
import { toggleModal } from './modal-handler';
import { showToast } from "./toast";

export function initInventoryForm() {
    document.getElementById('js-item-create-open').addEventListener('click', () => {
        const currency = getCachedUserProfile()?.currency || 'IDR';
        const symbol = getCurrencySymbol(currency);
        document.getElementById('c-cost-currency').textContent = symbol;
        document.getElementById('c-sell-currency').textContent = symbol;
        toggleModal('item-create-modal');
    });
    const form = document.getElementById('js-item-create-form');
    const submitBtn = document.getElementById('js-add-new-item');
    if (!form || !submitBtn) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) {
            showToast("Session expired. Please log in again.", 'error');
            return;
        }
        const requiredFields = [
            { id: 'sku', label: 'SKU' },
            { id: 'item-name', label: 'Item Name' },
            { id: 'cost-price', label: 'Cost Price' },
            { id: 'sell-price', label: 'Selling Price' },
            { id: 'item-qty', label: 'Item Quantity' },
            { id: 'item-unit', label: 'Unit' },
        ];

        const emptyFields = requiredFields.filter(f => !document.getElementById(f.id).value.trim());
        if (emptyFields.length > 0) {
            showToast(`Please fill in the following required fields:\n• ${emptyFields.map(f => f.label).join('\n• ')}`, 'error');
            document.getElementById(emptyFields[0].id).focus();
            return;
        }

        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving Item...";
        const formData = {
            tagColor: document.getElementById('tag-color').value,
            sku: document.getElementById('sku').value.trim().toUpperCase(),
            itemName: document.getElementById('item-name').value.trim(),
            costPrice: Number(document.getElementById('cost-price').value) || 0,
            sellPrice: Number(document.getElementById('sell-price').value) || 0,
            stockLevel: parseFloat(document.getElementById('item-qty').value) || 0,
            minStockLevel: parseFloat(document.getElementById('min-stock-level').value) || 0,
            unit: document.getElementById('item-unit').value,
            supplier: document.getElementById('supplier-info').value.trim(),
            description: document.getElementById('js-description').value.trim(),
        };
        
        try {
            const itemData = await submitItemData(formData, user.uid);
            addSingleItem(itemData);
            showToast('Inventory updated successfully.');

            form.reset();
            document.querySelector('[data-modal-close="item-create-modal"]')?.click();
        } catch (err) {
            console.error("Submission Error:", err);
            showToast(`Failed to save: ${err.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}