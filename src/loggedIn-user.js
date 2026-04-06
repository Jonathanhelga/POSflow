import { db, LogOutUser } from "./firebase";
import { initInventoryForm } from './add_item_ui';
import { loadAllItems, initializeSearch } from './search_item';
import { getDoc, doc } from "firebase/firestore";
import { initializeOrderForm } from "./order-add_item";
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
    }
    else{
        console.log("not have business profile — resuming setup wizard");
        const wizard = document.getElementById('setup-wizard');
        wizard.classList.remove('is-hidden');
        wizard.classList.add('is-active');
    }
}
