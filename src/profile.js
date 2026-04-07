import { db, LogOutUser } from './firebase';
import { getDoc, setDoc, doc } from 'firebase/firestore';
import { toggleModal } from './modal-handler';

export function initProfile(user) {
    const openBtn = document.getElementById('js-profile-open');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            loadProfileData(user);
            toggleModal('profile-modal');
        });
    }

    const form = document.getElementById('js-profile-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveProfileData(user.uid);
        });
    }

    const logoutBtn = document.getElementById('js-profile-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to log out?')) return;
            await LogOutUser();
        });
    }
}

async function loadProfileData(user) {
    // Show email and avatar initial in the modal header
    const email = user.email || '';
    document.getElementById('js-profile-email-display').textContent = email;

    const initial = email.charAt(0).toUpperCase();
    const avatarLarge = document.getElementById('js-profile-avatar-large');
    if (avatarLarge) avatarLarge.textContent = initial;

    // Load stored profile fields from Firestore
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return;
    const data = snap.data();

    document.getElementById('profile-username').value            = data.username            || '';
    document.getElementById('profile-business-name').value       = data.business_name       || '';
    document.getElementById('profile-business-address').value    = data.business_address    || '';
    document.getElementById('profile-business-phone').value      = data.business_phone      || '';
    document.getElementById('profile-business-instagram').value  = data.business_instagram  || '';
    document.getElementById('profile-business-email').value      = data.business_email      || '';
    document.getElementById('profile-tax-rate').value            = data.tax_rate            ?? '';
    document.getElementById('profile-invoice-prefix').value      = data.invoice_prefix      || '';
    document.getElementById('profile-paper-size').value          = data.printer_size        || '80';
    document.getElementById('profile-receipt-footer').value      = data.receipt_footer      || '';
}

async function saveProfileData(uid) {
    const saveBtn = document.getElementById('js-profile-save');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const formData = {
        username:           document.getElementById('profile-username').value.trim(),
        business_name:      document.getElementById('profile-business-name').value.trim(),
        business_address:   document.getElementById('profile-business-address').value.trim(),
        business_phone:     document.getElementById('profile-business-phone').value.trim(),
        business_instagram: document.getElementById('profile-business-instagram').value.trim(),
        business_email:     document.getElementById('profile-business-email').value.trim(),
        tax_rate:           document.getElementById('profile-tax-rate').value,
        invoice_prefix:     document.getElementById('profile-invoice-prefix').value.trim(),
        printer_size:       document.getElementById('profile-paper-size').value,
        receipt_footer:     document.getElementById('profile-receipt-footer').value.trim(),
    };

    try {
        await setDoc(doc(db, 'users', uid), formData, { merge: true });
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }, 1500);
    } catch (error) {
        alert('Failed to save: ' + error.message);
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}
