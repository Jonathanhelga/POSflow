import { db, LogOutUser } from "./firebase";
import { initInventoryForm } from './add_item_ui';
import { loadAllItems, initializeSearch } from './search_item';
import { getDoc, doc } from "firebase/firestore";
import { initializeOrderForm, initSubmitOrder } from "./order-add_item";
import { initProfile } from "./profile";
async function hasBusinessProfile(uid) {
    console.log("check business profile");
    
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
}

export async function renderLoggedInState(user) { 
    const isComplete = await hasBusinessProfile(user.uid);
    if (isComplete) {
        console.log("have business profile");
        document.getElementById('setup-wizard').classList.add('is-hidden');
        document.getElementById('pos-app').classList.add('is-active');
        initInventoryForm();
        loadAllItems();
        initializeSearch();
        initializeOrderForm();
        initSubmitOrder();
        initProfile(user);

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
