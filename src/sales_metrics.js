// Pure order math shared by the export (and later Insights): no Firestore, DOM or Excel here.
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from './payment_methods';
import { getItemCategories } from './item_categories';

export function summarizeTotals(orders){
    let itemsSold = 0;
    let grossCollected = 0;
    let taxCollected = 0;
    let netRevenue = 0;
    let costOfGoods = 0;

    orders.forEach(order => {
        const tax = order.taxAmount ?? 0;
        order.items.forEach(item => {
            const quantity = item.quantity;
            itemsSold += quantity;
            costOfGoods += (item.cost ?? 0) * quantity;
        });
        grossCollected += order.totalPrice;
        taxCollected += tax;
        netRevenue += order.subtotalAfterDiscount ?? (order.totalPrice - tax);
    });

    const totalOrders = orders.length;
    const profit = netRevenue - costOfGoods;
    const margin = netRevenue > 0 ? profit / netRevenue : 0;
    const aov = totalOrders > 0 ? netRevenue / totalOrders : 0;

    return { totalOrders, itemsSold, grossCollected, taxCollected, netRevenue, costOfGoods, profit, margin, aov };
}

// One row per item id, revenue before order discounts, sorted best seller first.
export function summarizeItems(orders){
    const rowsById = new Map();

    orders.forEach(order => {
        const createdAt = order.createdAt;
        const time = createdAt?.toMillis ? createdAt.toMillis() : new Date(createdAt ?? 0).getTime();

        order.items.forEach(item => {
            const id = item.id;
            const quantity = item.quantity;

            if (!rowsById.has(id)) {
                rowsById.set(id, { id, name: item.name, nameTime: time, unitsSold: 0, revenue: 0, cost: 0 });
            }
            const row = rowsById.get(id);

            if (time >= row.nameTime) {
                row.name = item.name;
                row.nameTime = time;
            }
            row.unitsSold += quantity;
            row.revenue += item.subtotal;
            row.cost += (item.cost ?? 0) * quantity;
        });
    });

    const rows = [...rowsById.values()].map(row => {
        const profit = row.revenue - row.cost;
        const margin = row.revenue > 0 ? profit / row.revenue : 0;
        return { id: row.id, name: row.name, unitsSold: row.unitsSold, revenue: row.revenue, cost: row.cost, profit, margin };
    });

    // Highest revenue first; ties fall back to units, then name, so the order never changes.
    return rows.sort((a, b) => (b.revenue - a.revenue) || (b.unitsSold - a.unitsSold) || a.name.localeCompare(b.name));
}

// Order-level discounts only; item promos are already inside each line's subtotal.
export function summarizeDiscounts(orders){
    let ordersDiscounted = 0;
    let totalDiscount = 0;

    orders.forEach(order => {
        // Orders from before the discount feature have no subtotalAfterDiscount and no discount.
        const discount = order.subtotalAfterDiscount == null ? 0 : order.subtotal - order.subtotalAfterDiscount;
        if (discount > 0) ordersDiscounted += 1;
        totalDiscount += discount;
    });

    const profitBeforeDiscounts = summarizeTotals(orders).profit + totalDiscount;
    const discountShareOfProfit = profitBeforeDiscounts > 0 ? totalDiscount / profitBeforeDiscounts : 0;

    return { ordersDiscounted, totalDiscount, profitBeforeDiscounts, discountShareOfProfit };
}

// One row per method, using each order's net revenue; orders from before 2026-08-23 have no method saved.
export function summarizePaymentMethods(orders){
    const rowsByMethod = new Map(PAYMENT_METHODS.map(method => [method, { method, label: PAYMENT_METHOD_LABELS[method], orders: 0, netRevenue: 0 }]));
    let totalNet = 0;

    orders.forEach(order => {
        const method = order.paymentMethod ?? 'unrecorded';
        if (!rowsByMethod.has(method)) rowsByMethod.set(method, { method, label: 'Not recorded', orders: 0, netRevenue: 0 });
        const row = rowsByMethod.get(method);
        const net = order.subtotalAfterDiscount ?? (order.totalPrice - (order.taxAmount ?? 0));
        row.orders += 1;
        row.netRevenue += net;
        totalNet += net;
    });

    return [...rowsByMethod.values()].map(row => ({ ...row, share: totalNet > 0 ? row.netRevenue / totalNet : 0 }));
}

// Categories come from current inventory; an item counts fully in each of its categories.
export function summarizeCategories(orders, inventory){
    const itemsById = new Map(inventory.map(item => [item.id, item]));
    const rowsByCategory = new Map();

    orders.forEach(order => order.items.forEach(item => {
        const categories = getItemCategories(itemsById.get(item.id));
        (categories.length > 0 ? categories : ['Uncategorized']).forEach(category => {
            if (!rowsByCategory.has(category)) rowsByCategory.set(category, { category, unitsSold: 0, revenue: 0, profit: 0 });
            const row = rowsByCategory.get(category);
            row.unitsSold += item.quantity;
            row.revenue += item.subtotal;
            row.profit += item.subtotal - (item.cost ?? 0) * item.quantity;
        });
    }));

    return [...rowsByCategory.values()].sort((a, b) => (b.revenue - a.revenue) || a.category.localeCompare(b.category));
}
