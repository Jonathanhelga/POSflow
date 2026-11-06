import { listenToOrders } from './firebase';

// One live list of the owner's orders, shared by Order History, Sales Insights and
// Export. Only the listener below writes to it.
export let allOrders = [];
let ordersStatus = 'loading'; // 'loading' | 'ready' | 'error'
let ordersSynced = false;     // true once the server has confirmed the list is current
const changedCallbacks = [];
let syncWaiters = [];

export function getOrdersStatus() {return ordersStatus;}

// Runs `callback` after every change to allOrders, from this device or another one.
export function onOrdersChanged(callback) {changedCallbacks.push(callback);}

function settleSyncWaiters(result) {
    syncWaiters.forEach(settle => settle(result));
    syncWaiters = [];
}

function handleOrders(orders, synced) {
    allOrders = orders;
    ordersStatus = 'ready';
    ordersSynced = synced;
    if (synced) {settleSyncWaiters(true);}
    changedCallbacks.forEach(callback => callback());
}

function handleOrdersError(error) {
    console.error('Failed to load orders:', error);
    ordersStatus = 'error';
    ordersSynced = false;
    settleSyncWaiters(false);
    changedCallbacks.forEach(callback => callback());
}

// Call once after login. Calling it again after an error starts a new listener.
export function startOrdersListener(uid) {
    ordersStatus = 'loading';
    listenToOrders(uid, handleOrders, handleOrdersError);
}

// The list can come from the copy on this device, which may be out of date. Reports
// await this first: true means the server confirmed it, false means it could not.
export function whenOrdersSynced(timeoutMs = 10000) {
    if (ordersSynced) return Promise.resolve(true);
    return new Promise((resolve) => {
        const settle = (result) => {clearTimeout(timer); resolve(result);};
        const timer = setTimeout(() => {
            syncWaiters = syncWaiters.filter(waiter => waiter !== settle);
            resolve(false);
        }, timeoutMs);
        syncWaiters.push(settle);
    });
}
