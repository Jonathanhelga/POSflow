import '../styles/variables.css';
import '../styles/setupWizard.css';
import '../styles/container.css';
import '../styles/add_item_modal.css';
import '../styles/features_modal.css';
import '../styles/item_button.css';
import '../styles/order_item_modal.css';
import '../styles/ordering_items.css';
import '../styles/profile_modal.css';
import '../styles/order_history_modal.css';
import '../styles/inventory_update_modal.css';
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { switchView, eventDelegation } from "./control_wizard";
import { renderLoggedInState } from "./loggedIn-user";
import { modal_handler } from './modal-handler';
import { initOrderHistory } from './order_history';
import { initInventoryUpdate } from './inventory_update';

document.addEventListener('DOMContentLoaded', function(){
    eventDelegation('js-wizard__body');
    onAuthStateChanged(auth, (user) => {
        if (user) {
            renderLoggedInState(user);
        } else {
            document.getElementById('pos-app').classList.remove('is-active');
            const wizard = document.getElementById('setup-wizard');
            wizard.classList.remove('is-hidden');
            wizard.classList.add('is-active');
            switchView('signUp');
        }
    });
    modal_handler();// Open and close modal controller
    initOrderHistory();
    initInventoryUpdate();
});