import { submitOrder, auth } from "./firebase";

export function initInventoryForm() {
    
    const form = document.getElementById('js-item-create-form');
    const submitBtn = document.getElementById('js-add-new-item');
    if (!form || !submitBtn) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) {
            alert("Session expired. Please log in again.");
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
            alert("Inventory updated successfully.");

            form.reset();
            document.querySelector('[data-modal-close="item-create-modal"]')?.click();
        } catch (err) {
            console.error("Submission Error:", err);
            alert(`Failed to save: ${err.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}