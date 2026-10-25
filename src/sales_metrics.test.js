import { describe, it, expect } from 'vitest';
import { orderNetRevenue, summarizeTotals, summarizeItems, summarizeDiscounts, summarizePaymentMethods, summarizeCategories } from './sales_metrics';

const latteAndCakeOrder = {
    items: [
        { id: 'latte', name: 'Latte', quantity: 1, price: 60000, cost: 20000, subtotal: 60000 },
        { id: 'cake',  name: 'Cake',  quantity: 1, price: 40000, cost: 30000, subtotal: 40000 },
    ],
    subtotal: 100000,
    discountAmount: 10000,
    subtotalAfterDiscount: 90000,
    taxAmount: 9000,
    totalPrice: 99000,
};

describe('summarizeTotals', () => {
    it('adds up one discounted, taxed order', () => {
        const t = summarizeTotals([latteAndCakeOrder]);
        expect(t.totalOrders).toBe(1);
        expect(t.itemsSold).toBe(2);
        expect(t.grossCollected).toBe(99000);
        expect(t.taxCollected).toBe(9000);
        expect(t.netRevenue).toBe(90000);
        expect(t.costOfGoods).toBe(50000);
        expect(t.profit).toBe(40000);
        expect(t.margin).toBeCloseTo(0.4444, 4);
        expect(t.aov).toBe(90000);
    });

    it('returns zeros, not NaN, for no orders', () => {
        const t = summarizeTotals([]);
        expect(t.netRevenue).toBe(0);
        expect(t.margin).toBe(0);
        expect(t.aov).toBe(0);
    });

    it('reads an old order that has no tax or discount fields', () => {
        const legacy = { items: [{ quantity: 2, cost: 1000 }], totalPrice: 5000 };
        const t = summarizeTotals([legacy]);
        expect(t.taxCollected).toBe(0);
        expect(t.netRevenue).toBe(5000);
        expect(t.costOfGoods).toBe(2000);
        expect(t.profit).toBe(3000);
    });
});

describe('summarizeItems', () => {
    const latteOrder = (quantity, createdAt, name = 'Latte') => ({
        createdAt,
        items: [{ id: 'latte', name, quantity, cost: 20000, subtotal: 60000 * quantity }],
    });

    it('gives one row per item with revenue before the order discount', () => {
        const rows = summarizeItems([latteAndCakeOrder]);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ id: 'latte', unitsSold: 1, revenue: 60000, cost: 20000, profit: 40000 });
        expect(rows[0].margin).toBeCloseTo(0.6667, 4);
        expect(rows[1]).toMatchObject({ id: 'cake', unitsSold: 1, revenue: 40000, cost: 30000, profit: 10000 });
    });

    it('adds the same item up across orders', () => {
        const rows = summarizeItems([latteOrder(2, new Date('2026-10-01')), latteOrder(3, new Date('2026-10-02'))]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ unitsSold: 5, revenue: 300000, cost: 100000, profit: 200000 });
    });

    it('sums item profit to total profit plus the order discount', () => {
        const itemProfit = summarizeItems([latteAndCakeOrder]).reduce((sum, r) => sum + r.profit, 0);
        const totals = summarizeTotals([latteAndCakeOrder]);
        expect(itemProfit - (latteAndCakeOrder.subtotal - latteAndCakeOrder.subtotalAfterDiscount)).toBe(totals.profit);
    });

    it('sorts by revenue, highest first', () => {
        const rows = summarizeItems([latteAndCakeOrder]);
        expect(rows.map(r => r.id)).toEqual(['latte', 'cake']);
    });

    it('shows a renamed item under its newest name, whatever order the orders arrive in', () => {
        const older = latteOrder(1, new Date('2026-10-01'), 'Latte');
        const newer = latteOrder(1, new Date('2026-10-05'), 'Iced Latte');
        expect(summarizeItems([newer, older])[0].name).toBe('Iced Latte');
        expect(summarizeItems([older, newer])[0].name).toBe('Iced Latte');
    });

    it('reads a Firestore Timestamp createdAt', () => {
        const ts = (ms) => ({ toMillis: () => ms });
        const older = latteOrder(1, ts(1000), 'Latte');
        const newer = latteOrder(1, ts(2000), 'Iced Latte');
        expect(summarizeItems([newer, older])[0].name).toBe('Iced Latte');
    });

    it('returns an empty list for no orders', () => {
        expect(summarizeItems([])).toEqual([]);
    });
});

describe('summarizeDiscounts', () => {
    const fullPriceOrder = {
        items: [{ id: 'tea', name: 'Tea', quantity: 2, cost: 5000, subtotal: 20000 }],
        subtotal: 20000,
        discountAmount: 0,
        subtotalAfterDiscount: 20000,
        taxAmount: 0,
        totalPrice: 20000,
    };

    it('reports the discount and its share of profit before discounts', () => {
        const d = summarizeDiscounts([latteAndCakeOrder]);
        expect(d.ordersDiscounted).toBe(1);
        expect(d.totalDiscount).toBe(10000);
        expect(d.profitBeforeDiscounts).toBe(50000);
        expect(d.discountShareOfProfit).toBeCloseTo(0.2, 4);
    });

    it('counts only orders that actually got a discount', () => {
        const d = summarizeDiscounts([latteAndCakeOrder, fullPriceOrder]);
        expect(d.ordersDiscounted).toBe(1);
        expect(d.totalDiscount).toBe(10000);
        expect(d.profitBeforeDiscounts).toBe(60000);
    });

    it('closes the gap between item profit and total profit', () => {
        const orders = [latteAndCakeOrder, fullPriceOrder];
        const itemProfit = summarizeItems(orders).reduce((sum, r) => sum + r.profit, 0);
        expect(summarizeDiscounts(orders).profitBeforeDiscounts).toBe(itemProfit);
        expect(itemProfit - summarizeDiscounts(orders).totalDiscount).toBe(summarizeTotals(orders).profit);
    });

    it('uses the discount actually applied, not the stored discountAmount', () => {
        // A 30,000 discount on a 20,000 order is floored at 0, so only 20,000 came off.
        const overDiscounted = { ...fullPriceOrder, discountAmount: 30000, subtotalAfterDiscount: 0, totalPrice: 0 };
        expect(summarizeDiscounts([overDiscounted]).totalDiscount).toBe(20000);
    });

    it('treats an order from before the discount feature as undiscounted', () => {
        const legacy = { items: [{ id: 'tea', name: 'Tea', quantity: 1, cost: 1000, subtotal: 5000 }], totalPrice: 5000 };
        expect(summarizeDiscounts([legacy])).toEqual({ ordersDiscounted: 0, totalDiscount: 0, profitBeforeDiscounts: 4000, discountShareOfProfit: 0 });
    });

    it('returns zeros, not NaN, for no orders', () => {
        expect(summarizeDiscounts([])).toEqual({ ordersDiscounted: 0, totalDiscount: 0, profitBeforeDiscounts: 0, discountShareOfProfit: 0 });
    });
});

describe('summarizePaymentMethods', () => {
    const cardOrder = { items: [], subtotalAfterDiscount: 30000, taxAmount: 3000, totalPrice: 33000, paymentMethod: 'card' };

    it('splits net revenue by method and adds up to the KPI Net Revenue', () => {
        const orders = [{ ...latteAndCakeOrder, paymentMethod: 'cash' }, cardOrder];
        const rows = summarizePaymentMethods(orders);
        expect(rows.map(r => r.label)).toEqual(['Cash', 'Transfer', 'Card']);
        expect(rows[0]).toMatchObject({ orders: 1, netRevenue: 90000, share: 0.75 });
        expect(rows[1]).toMatchObject({ orders: 0, netRevenue: 0, share: 0 });
        expect(rows[2]).toMatchObject({ orders: 1, netRevenue: 30000, share: 0.25 });
        expect(rows.reduce((sum, r) => sum + r.netRevenue, 0)).toBe(summarizeTotals(orders).netRevenue);
    });

    it('puts orders with no saved method under Not recorded', () => {
        const legacy = { items: [], totalPrice: 5000 };
        const rows = summarizePaymentMethods([legacy, cardOrder]);
        expect(rows).toHaveLength(4);
        expect(rows[3]).toMatchObject({ label: 'Not recorded', orders: 1, netRevenue: 5000 });
    });

    it('lists the three methods with zeros for no orders', () => {
        const rows = summarizePaymentMethods([]);
        expect(rows).toHaveLength(3);
        expect(rows.every(r => r.orders === 0 && r.share === 0)).toBe(true);
    });
});

describe('summarizeCategories', () => {
    it('groups lines by the category saved on the inventory item', () => {
        const inventory = [{ id: 'latte', categories: ['Drinks'] }, { id: 'cake', categories: ['Food'] }];
        expect(summarizeCategories([latteAndCakeOrder], inventory)).toEqual([
            { category: 'Drinks', unitsSold: 1, revenue: 60000, profit: 40000 },
            { category: 'Food', unitsSold: 1, revenue: 40000, profit: 10000 },
        ]);
    });

    it('counts an item fully in each of its categories', () => {
        const inventory = [{ id: 'latte', categories: ['Drinks', 'Coffee'] }, { id: 'cake', categories: ['Food'] }];
        const rows = summarizeCategories([latteAndCakeOrder], inventory);
        expect(rows.map(row => row.category)).toEqual(['Coffee', 'Drinks', 'Food']);
        expect(rows[0].revenue).toBe(60000);
        expect(rows[1].revenue).toBe(60000);
    });

    it('puts deleted and uncategorized items under Uncategorized', () => {
        const inventory = [{ id: 'cake' }];
        expect(summarizeCategories([latteAndCakeOrder], inventory)).toEqual([
            { category: 'Uncategorized', unitsSold: 2, revenue: 100000, profit: 50000 },
        ]);
    });
});

describe('orderNetRevenue', () => {
    it('uses the amount after order discounts, before tax', () => {
        expect(orderNetRevenue(latteAndCakeOrder)).toBe(90000);
    });

    it('falls back to total minus tax for an order from before the discount feature', () => {
        expect(orderNetRevenue({ totalPrice: 11000, taxAmount: 1000 })).toBe(10000);
        expect(orderNetRevenue({ totalPrice: 5000 })).toBe(5000);
    });
});
