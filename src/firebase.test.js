import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// firebase.js initializes the SDK at import time, so the SDK is replaced with stubs.
// Only auth.currentUser.getIdToken matters for the delete helpers.
vi.mock('firebase/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase/firestore', () => ({ initializeFirestore: vi.fn(), persistentLocalCache: vi.fn(), persistentMultipleTabManager: vi.fn() }));
vi.mock('firebase/auth', () => ({
    getAuth: () => ({ currentUser: { getIdToken: async () => 'test-token' } }),
}));

const { deleteOrder, deleteInventoryItem } = await import('./firebase');

function mockResponse({ ok, status, json }) {
    return { ok, status, json: json ?? (async () => { throw new SyntaxError('not json'); }) };
}

describe('admin delete requests', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('posts the id and PIN with the auth token', async () => {
        fetchMock.mockResolvedValue(mockResponse({ ok: true, status: 200 }));

        await deleteOrder('order-1', '1234');

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/api\/orders\/delete$/);
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer test-token');
        expect(JSON.parse(options.body)).toEqual({ orderId: 'order-1', pin: '1234' });
    });

    it('uses the inventory endpoint for items', async () => {
        fetchMock.mockResolvedValue(mockResponse({ ok: true, status: 200 }));

        await deleteInventoryItem('item-1', '1234');

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/api\/inventory\/delete$/);
        expect(JSON.parse(options.body)).toEqual({ itemId: 'item-1', pin: '1234' });
    });

    it('throws the server error text on a wrong PIN', async () => {
        fetchMock.mockResolvedValue(
            mockResponse({ ok: false, status: 401, json: async () => ({ error: 'Incorrect Admin PIN' }) })
        );

        await expect(deleteOrder('order-1', '0000')).rejects.toThrow('Incorrect Admin PIN');
    });

    it('throws the server rate limit message on 429', async () => {
        fetchMock.mockResolvedValue(
            mockResponse({
                ok: false,
                status: 429,
                json: async () => ({ error: 'Too many wrong PIN attempts. Please try again in 15 minutes.' }),
            })
        );

        await expect(deleteInventoryItem('item-1', '0000')).rejects.toThrow('Too many wrong PIN attempts');
    });

    it('falls back to the status code when the error body has no message', async () => {
        fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 500 }));

        await expect(deleteOrder('order-1', '1234')).rejects.toThrow('Delete failed with status 500');
    });

    it('throws a connection message when the server cannot be reached', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        await expect(deleteOrder('order-1', '1234')).rejects.toThrow('Could not reach the server');
    });
});
