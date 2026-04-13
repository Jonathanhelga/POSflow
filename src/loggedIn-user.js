import { db, LogOutUser } from "./firebase";
import { initInventoryForm } from './add_item_ui';
import { allItems, loadAllItems, initializeSearch, initGlobalBarcodeListener } from './search_item';
import { openOrderItemModal } from './order-add_item';
import { getDoc, doc } from "firebase/firestore";
import { initializeOrderForm, initSubmitOrder, setTaxRate } from "./order-add_item";
import { initProfile } from "./profile";

async function fetchBusinessProfile(uid) {
    const docSnap = await getDoc(doc(db, "users", uid));
    return docSnap.exists() ? docSnap.data() : null;
}

export async function renderLoggedInState(user) {
    const profile = await fetchBusinessProfile(user.uid);
    if (profile) {
        document.getElementById('setup-wizard').classList.add('is-hidden');
        document.getElementById('pos-app').classList.add('is-active');
        initInventoryForm();
        loadAllItems();
        initializeSearch();
        initGlobalBarcodeListener((sku) => {
            const item = allItems.find(i => i.sku === sku);
            if (item) openOrderItemModal(item.id);
        });
        initializeOrderForm();
        initSubmitOrder();
        initProfile(user);
        if (profile.tax_rate) setTaxRate(profile.tax_rate);

        // Populate toolbar profile button with user's email initial
        const initial = (user.email || '?').charAt(0).toUpperCase();
        const avatar = document.getElementById('js-profile-avatar');
        // const nameEl = document.getElementById('js-profile-name');
        if (avatar) avatar.textContent = initial;
        // if (nameEl) nameEl.textContent = user.email;
    }
    else{
        console.log("not have business profile — resuming setup wizard");
        const wizard = document.getElementById('setup-wizard');
        wizard.classList.remove('is-hidden');
        wizard.classList.add('is-active');
    }
}
