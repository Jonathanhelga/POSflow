import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let deliver;
let fail;
vi.mock('./firebase', () => ({ listenToOrders: (uid, onOrders, onError) => { deliver = onOrders; fail = onError; } }));

describe('orders store', () => {
    let store;

    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        store = await import('./orders_store');
        store.startOrdersListener('uid');
    });

    afterEach(() => {vi.useRealTimers();});

    it('does not count a list from the device copy as synced', async () => {
        deliver([{ id: 'a' }], false);
        expect(store.allOrders).toHaveLength(1);
        const result = store.whenOrdersSynced(1000);
        await vi.advanceTimersByTimeAsync(1000);
        expect(await result).toBe(false);
    });

    it('resolves a waiting report as soon as the server confirms', async () => {
        deliver([], false);
        const result = store.whenOrdersSynced(1000);
        deliver([{ id: 'a' }], true);
        expect(await result).toBe(true);
    });

    it('stops counting as synced when the connection is lost', async () => {
        deliver([], true);
        deliver([], false);
        const result = store.whenOrdersSynced(1000);
        await vi.advanceTimersByTimeAsync(1000);
        expect(await result).toBe(false);
    });

    it('releases a waiting report when the listener fails', async () => {
        const result = store.whenOrdersSynced(1000);
        fail(new Error('denied'));
        expect(await result).toBe(false);
        expect(store.getOrdersStatus()).toBe('error');
    });
});
