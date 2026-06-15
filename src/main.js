import '../styles/variables.css';
import '../styles/setupWizard.css';
import '../styles/container.css';
import '../styles/add_item_modal.css';
import '../styles/features_modal.css';
import '../styles/item_button.css';
import '../styles/order_item_modal.css';
import '../styles/profile_modal.css';
import '../styles/order_history_modal.css';
import '../styles/inventory_update_modal.css';
import '../styles/manage_item_modal.css';
import '../styles/barcode_generator_modal.css';
import '../styles/sales_insights_modal.css';
import '../styles/customer_checkout_modal.css';
import '../styles/confirm-modal.css';
import '../styles/landing.css';
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { switchView, eventDelegation } from "./control_wizard";
import { renderLoggedInState } from "./loggedIn-user";
import { modal_handler } from './modal-handler';
import { initOrderHistory } from './order_history';
import { initInventoryUpdate } from './inventory_update';
import { initManageItem } from './manage-item';
import { initBarcodeGenerator } from './barcode-generator';
import { initInsights } from './sales_insight';
import { initCustomerCheckout } from './customer_checkout';
import { initClock } from './clock';
import { initThemeToggle } from './theme';
import { showToast } from './toast';
function initLoggedInApp(user) {
    renderLoggedInState(user);
    initInsights(user);
    initOrderHistory(user);
    initInventoryUpdate(user);
    initManageItem(user);
    initBarcodeGenerator(user);
    initCustomerCheckout();
    initClock();
    initThemeToggle();
}

function initLanding() {
  const overlay = document.getElementById('js-wizard-overlay');
  if (!overlay) return;

  document.getElementById('js-landing-signup').addEventListener('click', () => openWizardOverlay('signUp'));
  document.getElementById('js-landing-login').addEventListener('click', () => openWizardOverlay('logIn'));
  document.getElementById('js-hero-signup').addEventListener('click', () => openWizardOverlay('signUp'));
  document.getElementById('js-hero-login').addEventListener('click', () => openWizardOverlay('logIn'));
  document.getElementById('js-final-signup').addEventListener('click', () => openWizardOverlay('signUp'));
  document.getElementById('js-wizard-overlay-close').addEventListener('click', closeWizardOverlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWizardOverlay(); });
}

function openWizardOverlay(view) {
  const overlay = document.getElementById('js-wizard-overlay');
  switchView(view);
  overlay.classList.remove('is-hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeWizardOverlay() {
  const overlay = document.getElementById('js-wizard-overlay');
  overlay.classList.add('is-hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

initLanding();

document.addEventListener('DOMContentLoaded', function(){
    eventDelegation('js-wizard__body');
    let initialized = false;
    onAuthStateChanged(auth, (user) => {
        // document.body.classList.remove('is-booting');
        document.body.classList.remove('is-booting');
        if (user) {
            document.getElementById('js-landing').style.display = 'none';
            document.getElementById('js-wizard-overlay').classList.add('is-hidden');
            if (initialized) return;
            initialized = true;
            showToast("successfully logging in");
            initLoggedInApp(user);
        } else {
            document.getElementById('pos-app').classList.remove('is-active');
            const wizard = document.getElementById('setup-wizard');
            wizard.classList.remove('is-hidden');
            wizard.classList.add('is-active');
        }
    });
    modal_handler();// Open and close modal controller
});