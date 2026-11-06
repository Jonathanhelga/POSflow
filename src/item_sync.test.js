import { describe, it, expect } from 'vitest';
import { syncItemsInPlace } from './item_sync';

describe('syncItemsInPlace', () => {
    it('updates an existing object instead of replacing it', () => {
        const selected = { id: 'a', stockLevel: 5 };
        const result = syncItemsInPlace([selected], [{ id: 'a', stockLevel: 8 }]);
        expect(result[0]).toBe(selected);
        expect(selected.stockLevel).toBe(8);
    });

    it('removes fields that no longer exist on the document', () => {
        const item = { id: 'a', promo: { pct: 10 } };
        syncItemsInPlace([item], [{ id: 'a' }]);
        expect('promo' in item).toBe(false);
    });

    it('adds new documents, drops deleted ones, and follows the incoming order', () => {
        const a = { id: 'a' };
        const b = { id: 'b' };
        const result = syncItemsInPlace([a, b], [{ id: 'c' }, a]);
        expect(result.map(i => i.id)).toEqual(['c', 'a']);
        expect(result.includes(b)).toBe(false);
    });
});
