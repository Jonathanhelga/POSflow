import { auth, fetchOrders, fetchUserProfile } from './firebase';
import { formatRupiah } from './formatRupiah';
import { toggleModal } from './modal-handler';

let profileCache = null;
let isProcessing = false;

function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortId(id) { return id.slice(-8).toUpperCase(); }

function populateBillHeader(profile) {
    console.log(profile);
    
    document.getElementById('oh-shop-name').textContent =
        profile?.business_name || 'My Shop';
    document.getElementById('oh-shop-tagline').textContent = '';
    const parts = [
        profile?.business_address,
        profile?.business_phone,
        profile?.business_email,
    ].filter(Boolean);
    document.getElementById('oh-shop-details').innerHTML = parts.join('<br>');
    document.getElementById('oh-cashier').textContent =
        profile?.username || auth.currentUser?.email || '—';
}

function renderOrderList(orders) {
    const container = document.getElementById('oh-order-list');
    container.innerHTML = '';

    if (orders.length === 0) {
        container.innerHTML = '<p class="oh-empty">No past orders found.</p>';
        return;
    }

    orders.forEach(order => {
        const card = document.createElement('div');
        card.className = 'oh-card';
        card.innerHTML = `
            <div class="oh-card__top-row">
                <span class="oh-card__date">${formatDate(order.createdAt)}</span>
                <span class="oh-card__id">#${shortId(order.id)}</span>
            </div>
            <div class="oh-card__total">Rp ${formatRupiah(order.totalPrice)}</div>
            <div class="oh-card__bottom-row">
                <span class="oh-card__qty">${order.totalQuantity} item(s)</span>
            </div>
        `;

        const btn = document.createElement('button');
        btn.className = 'btn oh-card__btn';
        btn.textContent = 'View Details';

        btn.addEventListener('click', () => {
            if (isProcessing) return;
            isProcessing = true;
            btn.disabled = true;
            btn.textContent = 'Loading...';

            viewOrderDetails(order, card);

            setTimeout(() => {
                isProcessing = false;
                btn.disabled = false;
                btn.textContent = 'View Details';
            }, 800);
        });

        card.querySelector('.oh-card__bottom-row').appendChild(btn);
        container.appendChild(card);
    });
}

function viewOrderDetails(order, cardEl) {
    const itemsList = document.getElementById('oh-items-list');
    itemsList.innerHTML = '';

    document.getElementById('oh-invoice-num').textContent = shortId(order.id);
    document.getElementById('oh-bill-date').textContent = formatDate(order.createdAt);
    document.getElementById('oh-bill-time').textContent = formatTime(order.createdAt);

    let totalItems = 0;
    (order.items || []).forEach(item => {
        totalItems += Number(item.quantity);

        const row = document.createElement('div');
        row.className = 'oh-bill__item-row';
        row.innerHTML = `
            <div class="oh-bill__item-name">${item.name}</div>
            <div>${item.quantity}</div>
            <div>${formatRupiah(item.price)}</div>
            <div>${formatRupiah(item.subtotal)}</div>
        `;
        itemsList.appendChild(row);
    });

    document.getElementById('oh-total-items').textContent = totalItems;
    document.getElementById('oh-subtotal').textContent = `Rp ${formatRupiah(order?.subtotal || 0)}`;
    document.getElementById('oh-tax').textContent = `Rp ${formatRupiah(order?.taxAmount || 0)}`;
    document.getElementById('oh-grand-total').textContent = `Rp ${formatRupiah(order.totalPrice) ?? '-'}`;

    document.getElementById('oh-print-btn').disabled = false;

    // Highlight selected card
    document.querySelectorAll('.oh-card').forEach(c => c.classList.remove('oh-card--active'));
    if (cardEl) cardEl.classList.add('oh-card--active');
}

// ─── Print ─────────────────────────────────────────────────────────────────────

function initPrintButton() {
    document.getElementById('oh-print-btn').addEventListener('click', () => {
        window.print();
    });
}

// ─── Init ──────────────────────────────────────────────────────────────────────

export async function initOrderHistory() {
    const openBtn = document.getElementById('js-order-history-open');
    if (!openBtn) return;

    openBtn.addEventListener('click', async () => {
        toggleModal('order-history-modal');
        const user = auth.currentUser;
        if (!user) return;

        // Load profile for bill header (cached after first load)
        if (!profileCache) {
            profileCache = await fetchUserProfile(user.uid);
        }
        populateBillHeader(profileCache);

        // Reset bill panel
        document.getElementById('oh-items-list').innerHTML = '';
        document.getElementById('oh-invoice-num').textContent = '—';
        document.getElementById('oh-bill-date').textContent = '—';
        document.getElementById('oh-bill-time').textContent = '—';
        document.getElementById('oh-total-items').textContent = '—';
        document.getElementById('oh-subtotal').textContent = '—';
        document.getElementById('oh-grand-total').textContent = '—';
        document.getElementById('oh-tax').textContent = '—';
        document.getElementById('oh-print-btn').disabled = true;

        // Fetch and render orders
        document.getElementById('oh-order-list').innerHTML = '<p class="oh-empty">Loading orders...</p>';
        try {
            const orders = await fetchOrders(user.uid);
            console.log("orders : ", orders);
            
            renderOrderList(orders);
        } catch (err) {
            console.error('Failed to load order history:', err);
            document.getElementById('oh-order-list').innerHTML =
                '<p class="oh-empty oh-empty--error">Failed to load orders.</p>';
        }
    });

    initPrintButton();
}
