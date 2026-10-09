import { toggleModal } from './modal-handler';
import { showToast } from "./toast";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

let currentUser = null;
let isChangingPin = false;
let resolvePinConfirm = null;
// Whether the account has a PIN configured, per the server's /adminPins record.
// Cached locally after initAdminPin() so UI can decide synchronously (setup vs
// gate) without an async round-trip on every click.
let hasPinConfigured = false;

const PIN_INPUT_IDS = ['ap-old-input', 'ap-new-input', 'ap-confirm-input', 'ap-gate-input'];
const rawPinValues = new Map();
const maskTimers = new Map();
const REVEAL_MS = 250;

function isValidPin(pin) { return /^\d{4}$/.test(pin); }

// Verification/storage of the PIN happens entirely server-side (see
// server/adminPinService.js) so the client never holds a hash it could
// brute-force offline — it only ever gets a yes/no answer back.
async function callPinApi(path, pin, extra = {}) {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`${SERVER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ pin, ...extra }),
    });
    return { ok: response.ok };
}

async function refreshPinStatus() {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`${SERVER_URL}/api/admin-pin/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    });
    const data = await response.json().catch(() => ({}));
    hasPinConfigured = Boolean(data.hasPin);
    updateFeaturesButtonLabel();
}

function getRawPin(inputId) { return rawPinValues.get(inputId) || ''; }

function renderMaskedValue(inputId, revealLast) {
    const raw = getRawPin(inputId);
    const masked = '•'.repeat(revealLast ? raw.length - 1 : raw.length);
    document.getElementById(inputId).value = revealLast ? masked + raw.slice(-1) : masked;
}

function handlePinInputTyped(inputId) {
    const input = document.getElementById(inputId);
    const prevRaw = getRawPin(inputId);
    const displayedLength = input.value.length;

    let nextRaw;
    if (displayedLength > prevRaw.length) {
        const addedDigits = input.value.slice(-(displayedLength - prevRaw.length)).replace(/\D/g, '');
        nextRaw = (prevRaw + addedDigits).slice(0, 4);
    }
    else { nextRaw = prevRaw.slice(0, displayedLength); }

    rawPinValues.set(inputId, nextRaw);
    renderMaskedValue(inputId, nextRaw.length > 0);

    clearTimeout(maskTimers.get(inputId));
    if (nextRaw.length > 0) { maskTimers.set(inputId, setTimeout(() => renderMaskedValue(inputId, false), REVEAL_MS)); }
}

function resetPinInput(inputId) {
    clearTimeout(maskTimers.get(inputId));
    rawPinValues.set(inputId, '');
    document.getElementById(inputId).value = '';
}

function setApFeedback(elId, msg) { document.getElementById(elId).textContent = msg; }

function showApPanel(panelId) {
    ['ap-old-pin', 'ap-new-pin'].forEach(id => {
        document.getElementById(id).classList.toggle('is-hidden', id !== panelId);
    });
    updateStepIndicator(panelId);
    document.querySelector(`#${panelId} input`).focus();
}

// The two-dot "Step X of 2" label only exists in the change flow.
function updateStepIndicator(panelId) {
    const isStepTwo = panelId === 'ap-new-pin';
    document.getElementById('ap-step').classList.toggle('is-hidden', !isChangingPin);
    document.getElementById('ap-dot-2').classList.toggle('is-on', isStepTwo);
    document.getElementById('ap-step-text').textContent = `Step ${isStepTwo ? 2 : 1} of 2`;
}

function updateFeaturesButtonLabel() {
    document.getElementById('admin-pin-open').textContent = hasPinConfigured ? 'Change Admin PIN' : 'Set up Admin PIN';
}

function openSetupFlow() {
    isChangingPin = hasPinConfigured;
    resetPinInput('ap-old-input');
    resetPinInput('ap-new-input');
    resetPinInput('ap-confirm-input');
    setApFeedback('ap-old-feedback', '');
    setApFeedback('ap-feedback', '');
    document.getElementById('ap-title').textContent = isChangingPin ? 'Change Admin PIN' : 'Set up Admin PIN';
    document.getElementById('ap-new-desc').textContent = isChangingPin
        ? 'Choose a new 4-digit PIN. From now on, deleting items and orders will need this one.'
        : "Your Admin PIN protects actions that can't be undone. You'll need to enter it before you delete an inventory item or delete an order. Choose 4 digits that your staff don't know.";
    // Open the modal first: an input inside a display:none modal cannot take focus.
    toggleModal('admin-pin-modal');
    showApPanel(isChangingPin ? 'ap-old-pin' : 'ap-new-pin');
}

async function handleVerifyOldPin(event) {
    event.preventDefault();
    const input = getRawPin('ap-old-input');
    if (!isValidPin(input)) {
        setApFeedback('ap-old-feedback', 'Enter a 4-digit PIN.');
        return;
    }

    const btn = document.getElementById('ap-old-continue');
    btn.disabled = true;

    try {
        const { ok } = await callPinApi('/api/admin-pin/verify', input);
        if (!ok) {
            setApFeedback('ap-old-feedback', 'Incorrect Admin PIN.');
            return;
        }
        setApFeedback('ap-old-feedback', '');
        showApPanel('ap-new-pin');
    } catch (err) {
        console.error('Failed to verify Admin PIN:', err);
        setApFeedback('ap-old-feedback', 'Could not verify PIN. Check your connection.');
    } finally {
        btn.disabled = false;
    }
}

async function handleSaveNewPin(event) {
    event.preventDefault();
    const newPin = getRawPin('ap-new-input');
    const confirmPin = getRawPin('ap-confirm-input');

    if (!isValidPin(newPin)) {
        setApFeedback('ap-feedback', 'PIN must be exactly 4 digits.');
        return;
    }
    if (newPin !== confirmPin) {
        setApFeedback('ap-feedback', 'PINs do not match.');
        return;
    }

    const btn = document.getElementById('ap-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        // When changing an existing PIN, send the old PIN the server now requires.
        // It is still in ap-old-input from the verify step earlier in this flow.
        const extra = isChangingPin ? { currentPin: getRawPin('ap-old-input') } : {};
        const { ok } = await callPinApi('/api/admin-pin/set', newPin, extra);
        if (!ok) {
            setApFeedback('ap-feedback', 'Failed to save PIN. Please try again.');
            return;
        }
        hasPinConfigured = true;
        updateFeaturesButtonLabel();
        toggleModal('admin-pin-modal');
        showToast(isChangingPin ? 'PIN successfully changed :)' : 'PIN successfully created :)');
    } catch (err) {
        console.error('Failed to save Admin PIN:', err);
        setApFeedback('ap-feedback', 'Failed to save PIN. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save PIN';
    }
}

function openPinGate() {
    resetPinInput('ap-gate-input');
    setApFeedback('ap-gate-feedback', '');
    toggleModal('admin-pin-gate-modal');
    document.getElementById('ap-gate-input').focus();
}

async function handlePinGateSubmit(event) {
    event.preventDefault();
    const input = getRawPin('ap-gate-input');
    if (!isValidPin(input)) {
        setApFeedback('ap-gate-feedback', 'Enter a 4-digit PIN.');
        return;
    }

    const btn = document.getElementById('ap-gate-confirm-btn');
    btn.disabled = true;

    try {
        const { ok } = await callPinApi('/api/admin-pin/verify', input);
        if (!ok) {
            setApFeedback('ap-gate-feedback', 'Incorrect Admin PIN.');
            return;
        }
        toggleModal('admin-pin-gate-modal');
        if (resolvePinConfirm) resolvePinConfirm(input);
        resolvePinConfirm = null;
    } catch (err) {
        console.error('Failed to verify Admin PIN:', err);
        setApFeedback('ap-gate-feedback', 'Could not verify PIN. Check your connection.');
    } finally {
        btn.disabled = false;
    }
}

function handlePinGateCancel() {
    toggleModal('admin-pin-gate-modal');
    if (resolvePinConfirm) resolvePinConfirm(null);
    resolvePinConfirm = null;
}

// Exported gate: call before any inventory item / order deletion.
// Resolves to the verified 4-digit PIN, which the caller must forward to the
// server delete endpoint so the deletion itself carries proof of verification.
// Resolves to null when the user cancels or has no PIN configured yet.
export function requireAdminPin() {
    if (!hasPinConfigured) {
        openSetupFlow();
        return Promise.resolve(null);
    }
    openPinGate();
    return new Promise(resolve => {
        let settled = false;
        const settle = (val) => {
            if (!settled) {
                settled = true;
                observer.disconnect();
                resolve(val);
            }
        };

        const gateModal = document.getElementById('admin-pin-gate-modal');
        const observer = new MutationObserver(() => {
            if (gateModal.classList.contains('is-hidden')) {
                settle(null);
            }
        });
        observer.observe(gateModal, { attributes: true, attributeFilter: ['class'] });

        resolvePinConfirm = settle;
    });
}

export function initAdminPin(user) {
    currentUser = user;
    refreshPinStatus().catch(err => console.error('Failed to load Admin PIN status:', err));

    PIN_INPUT_IDS.forEach(id => {
        document.getElementById(id).addEventListener('input', () => handlePinInputTyped(id));
    });

    document.getElementById('admin-pin-open').addEventListener('click', () => {
        toggleModal('features-modal');
        openSetupFlow();
    });

    document.getElementById('ap-new-pin').addEventListener('submit', handleSaveNewPin);
    document.getElementById('ap-old-pin').addEventListener('submit', handleVerifyOldPin);

    document.getElementById('ap-gate-form').addEventListener('submit', handlePinGateSubmit);
    document.getElementById('ap-gate-cancel-btn').addEventListener('click', handlePinGateCancel);
}
