import { auth, fetchOrders, fetchUserProfile } from './firebase';
import { formatRupiah } from './formatRupiah';
import { toggleModal } from './modal-handler';

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
    const shopDetails = document.getElementById('oh-shop-details');
    shopDetails.textContent = '';
    const parts = [
        profile?.business_address,
        profile?.business_phone,
        profile?.business_email,
    ].filter(Boolean);
    parts.forEach((part, i) => {
        shopDetails.appendChild(document.createTextNode(part));
        if(i < parts.length - 1) { shopDetails.appendChild(document.createElement('br')); }
    });
    document.getElementById('oh-cashier').textContent =
        profile?.username || auth.currentUser?.email || '—';
}

function renderOrderList(orders) {
    const container = document.getElementById('oh-order-list');
    container.replaceChildren();

    if (orders.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'oh-empty';
        empty.textContent = 'No past orders found.';
        container.appendChild(empty);
        return;
    }

    orders.forEach(order => {
        const card = document.createElement('div');
        card.className = 'oh-card';
        const topRow = document.createElement('div');
        topRow.className = 'oh-card__top-row';
        const dateSpan = document.createElement('span');
        dateSpan.className = 'oh-card__date';
        dateSpan.textContent = formatDate(order.createdAt);
        const idSpan = document.createElement('span');
        idSpan.className = 'oh-card__id';
        idSpan.textContent = `#${shortId(order.id)}`;
        topRow.append(dateSpan, idSpan);

        const totalDiv = document.createElement('div');
        totalDiv.className = 'oh-card__total';
        totalDiv.textContent = `Rp. ${formatRupiah(order.totalPrice)}`;

        const bottomRow = document.createElement('div');
        bottomRow.className = 'oh-card__bottom-row';
        const qtySpan = document.createElement('span');
        qtySpan.className = 'oh-card__qty';
        qtySpan.textContent = `${order.totalQuantity} item(s)`;
        bottomRow.appendChild(qtySpan);

        card.append(topRow, totalDiv, bottomRow);

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
    itemsList.replaceChildren();

    document.getElementById('oh-invoice-num').textContent = shortId(order.id);
    document.getElementById('oh-bill-date').textContent = formatDate(order.createdAt);
    document.getElementById('oh-bill-time').textContent = formatTime(order.createdAt);

    let totalItems = 0;
    (order.items || []).forEach(item => {
        totalItems += Number(item.quantity);

        const row = document.createElement('div');
        row.className = 'oh-bill__item-row';
        const itemName = document.createElement('div');
        itemName.className = 'oh-bill__item-name';
        itemName.textContent = item.name;

        const itemQuantity = document.createElement('div');
        itemQuantity.textContent = item.quantity;

        const itemPrice = document.createElement('div');
        itemPrice.textContent = formatRupiah(item.price);

        const itemSubtotal = document.createElement('div');
        itemSubtotal.textContent = formatRupiah(item.subtotal);
        
        row.appendChild(itemName);
        row.appendChild(itemQuantity);
        row.appendChild(itemPrice);
        row.appendChild(itemSubtotal);

        itemsList.appendChild(row);
    });

    document.getElementById('oh-total-items').textContent = totalItems;
    document.getElementById('oh-subtotal').textContent = `Rp ${formatRupiah(order?.subtotal || 0)}`;
    document.getElementById('oh-business-tax').textContent = `${order?.taxRate || 0}`;
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

        // Load profile for bill header (cached centrally in firebase.js)
        const profile = await fetchUserProfile(user.uid);
        populateBillHeader(profile);

        // Reset bill panel
        document.getElementById('oh-items-list').replaceChildren();
        document.getElementById('oh-invoice-num').textContent = '—';
        document.getElementById('oh-bill-date').textContent = '—';
        document.getElementById('oh-bill-time').textContent = '—';
        document.getElementById('oh-total-items').textContent = '—';
        document.getElementById('oh-subtotal').textContent = '—';
        document.getElementById('oh-grand-total').textContent = '—';
        document.getElementById('oh-tax').textContent = '—';
        document.getElementById('oh-print-btn').disabled = true;

        // Fetch and render orders
        const orderList = document.getElementById('oh-order-list');
        const loadingMsg = document.createElement('p');
        loadingMsg.className = 'oh-empty';
        loadingMsg.textContent = 'Loading orders...';
        orderList.replaceChildren(loadingMsg);
        try {
            const orders = await fetchOrders(user.uid);
            console.log("orders : ", orders);
            renderOrderList(orders);
        } catch (err) {
            console.error('Failed to load order history:', err);
            const errorMsg = document.createElement('p');
            errorMsg.className = 'oh-empty oh-empty--error';
            errorMsg.textContent = 'Failed to load orders.';
            orderList.replaceChildren(errorMsg);
        }
    });

    initPrintButton();
}
