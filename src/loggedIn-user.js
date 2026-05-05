import { db, fetchUserProfile } from "./firebase";
import { initInventoryForm } from './add_item_ui';
import { allItems, loadAllItems, initializeSearch, initGlobalBarcodeListener } from './search_item';
import { initializeOrderForm, initSubmitOrder, setTaxRate, scanAddItem } from "./order-add_item";
import { initProfile } from "./profile";

export async function renderLoggedInState(user) {
    const profile = await fetchUserProfile(user.uid);
    if (profile) {
        document.getElementById('setup-wizard').classList.add('is-hidden');
        document.getElementById('pos-app').classList.add('is-active');
        initInventoryForm();
        loadAllItems();
        initializeSearch();
        initGlobalBarcodeListener((sku) => {
            const item = allItems.find(i => i.sku === sku);
            if (item) scanAddItem(item.id);
        });
        initializeOrderForm();
        initSubmitOrder();
        initProfile(user);
        if (profile.tax_rate) setTaxRate(profile.tax_rate);
        
        const initial = (user.email || '?').charAt(0).toUpperCase();
        const avatar = document.getElementById('js-profile-avatar');
        if (avatar) avatar.textContent = initial;
    }
    else{
        console.log("not have business profile — resuming setup wizard");
        const wizard = document.getElementById('setup-wizard');
        wizard.classList.remove('is-hidden');
        wizard.classList.add('is-active');
    }
}
