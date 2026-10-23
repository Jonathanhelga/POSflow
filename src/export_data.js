import { toggleModal } from './modal-handler';
import { fetchInventory, fetchOrders, fetchUserProfile, getCachedUserProfile } from './firebase';
import { showToast } from './toast';
import { allItems } from './search_item';
import { getExcelCurrencyFormat } from './formatCurrency';
import { summarizeTotals, summarizeItems, summarizeDiscounts, summarizePaymentMethods, summarizeCategories } from './sales_metrics';

const COL_PADDING = 2;
const COL_MIN_WCH = 10;
const COL_MAX_WCH = 40;

// The title banner is always row 0 with the metadata under it; every table's rows are
// recorded by addTable while the sheet is built, because tables vary in length.
const TOP_ITEMS_COUNT = 5;

// Content starts at B2, leaving an empty row 1 and a narrow column A as a margin.
const SHEET_ORIGIN = { r: 1, c: 1 };
const MARGIN_WCH   = 2;
const SUMMARY_TITLE_ROW      = 0;
const SUMMARY_META_FIRST_ROW = 1;

// Excel's percent format multiplies the cell by 100 when it renders, so the cell must
// hold the raw fraction (0.325) rather than 32.5, or it would read 3250%.
const PCT_FORMAT = '0.0%';

const LEFT_ALIGN = { alignment: { horizontal: 'left' } };

const THIN_SIDE = { style: 'thin', color: { rgb: '808080' } };
const CELL_BORDER = { border: { top: THIN_SIDE, bottom: THIN_SIDE, left: THIN_SIDE, right: THIN_SIDE } };

let currentUser = null;
let isExporting = false;

// xlsx-js-style is a ~2.7 MB library. Loaded on demand the first time an export runs
// (see runExport) rather than statically, so it stays out of the main bundle.
let XLSX = null;

export function initExport(user) {
    if (!user) return;
    currentUser = user;

    const openBtn = document.getElementById('export-data-open');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            toggleModal('features-modal');
            toggleModal('export-data-modal');
            // Start each visit with a clean slate, no stale card from last time.
            resetFileCard();
        });
    }

    const exportForm = document.getElementById('js-export-form');
    if (exportForm) exportForm.addEventListener('submit', runExport);
}

async function runExport(event){
    event.preventDefault();
    if (isExporting) return;
    if (!currentUser) { showToast('Please sign in to export.', 'error'); return; }

    const from = parseRangeInput(document.getElementById('js-export-from')?.value, false);
    const to = parseRangeInput(document.getElementById('js-export-to')?.value, true);
    if (from && to && from > to) { showToast('The "From" date is after the "To" date.', 'error'); return; }

    isExporting = true;
    const runBtn = document.getElementById('js-export-run');
    const originalLabel = runBtn ? runBtn.textContent : '';
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Generating…'; }

    try {
        // Fetch the spreadsheet library on first use. Cached in the module-level
        // XLSX binding so subsequent exports reuse it without re-importing.
        if (!XLSX) XLSX = await import('xlsx-js-style');

        const profile = getCachedUserProfile() || await fetchUserProfile(currentUser.uid);
        const currency = profile?.currency || 'IDR';
        const items = (allItems && allItems.length) ? allItems : await fetchInventory(currentUser.uid);
        const orders = filterOrdersByRange(await fetchOrders(currentUser.uid), from, to);

        if (!items.length && !orders.length) { showToast('No data to export for this range.', 'error'); return; }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, buildSummarySheet(profile, orders, items, from, to, currency), 'Summary');
        const bizName = (profile?.business_name || 'POS').replace(/[^\w-]+/g, '_');
        const fileName = `${bizName}_export_${fileDateStamp()}.xlsx`;
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', });
        renderFileCard(fileName, blob, orders.length);
        showToast('Export ready to download.');
    } catch (error) {
        console.error('Export failed:', error);
        showToast('Export failed. Please try again.', 'error');
    } finally {
        isExporting = false;
        if (runBtn) { runBtn.disabled = false; runBtn.textContent = originalLabel || 'Generate export'; }
    }
} 

function buildSummarySheet(profile, orders, inventory, fromDate, toDate, currency){
    const { rows, tables } = summaryRows(profile, orders, inventory, fromDate, toDate, currency);
    const worksheet = XLSX.utils.aoa_to_sheet(rows, { origin: SHEET_ORIGIN });
    const textRows = new Set([SUMMARY_TITLE_ROW, ...tables.flatMap(table => [table.titleRow, table.noteRow])]);
    const { cols, wrapCols } = computeAoaColWidths(rows, textRows);
    const lastCol = Math.max(...tables.map(table => table.lastCol));
    worksheet['!cols'] = [{ wch: MARGIN_WCH }, ...cols];
    metaDataStyle(worksheet, tables[0].headerRow - 1, lastCol);

    tables.forEach(table => tableDataStyle(worksheet, table, currency));

    wrapColumns(worksheet, wrapCols, tables);

    return worksheet;
}

function summaryRows(profile, orders, inventory, fromDate, toDate, currency){
    const businessName = profile?.business_name || 'POS';
    const totals = summarizeTotals(orders);
    const discounts = summarizeDiscounts(orders);

    const rows = [
        [`${businessName} Sales Report`],
        ['Report Type:', 'Summary'],
        ['Business Name:', businessName],
        ['Currency:', currency],
        ['Period:', formatPeriod(fromDate, toDate)],
        [],
    ];
    const tables = [];
    addTable(rows, tables, {
        header: ['Total Orders', 'Items Sold', 'Gross Collected', 'Tax Collected', 'Net Revenue', 'Total Profit', 'Margin %', 'AOV'],
        body: [[totals.totalOrders, totals.itemsSold, totals.grossCollected, totals.taxCollected, totals.netRevenue, totals.profit, totals.margin, totals.aov]],
        moneyCols: [2, 3, 4, 5, 7], pctCols: [6],
    });
    addTable(rows, tables, {
        title: `Top ${TOP_ITEMS_COUNT} Items (before order discounts)`,
        header: ['Rank', 'Item', 'Units Sold', 'Revenue', 'Profit', 'Margin %'],
        body: summarizeItems(orders).slice(0, TOP_ITEMS_COUNT).map((item, i) => [i + 1, item.name, item.unitsSold, item.revenue, item.profit, item.margin]),
        moneyCols: [3, 4], pctCols: [5],
    });
    addTable(rows, tables, {
        title: 'Discounts',
        header: ['Orders Discounted', 'Total Discount', 'Profit Before Discounts', '% of Profit Given as Discount'],
        body: [[discounts.ordersDiscounted, discounts.totalDiscount, discounts.profitBeforeDiscounts, discounts.discountShareOfProfit]],
        moneyCols: [1, 2], pctCols: [3],
    });
    addTable(rows, tables, {
        title: 'Sales by Payment Method',
        header: ['Method', 'Orders', 'Net Revenue', 'Share %'],
        body: summarizePaymentMethods(orders).map(row => [row.label, row.orders, row.netRevenue, row.share]),
        moneyCols: [2], pctCols: [3],
    });
    addTable(rows, tables, {
        title: 'Sales by Category (before order discounts)',
        header: ['Category', 'Units Sold', 'Revenue', 'Profit'],
        body: summarizeCategories(orders, inventory).map(row => [row.category, row.unitsSold, row.revenue, row.profit]),
        moneyCols: [2, 3],
        note: 'An item in several categories counts in each, so these rows can add up to more than total revenue.',
    });
    return { rows, tables };
}

// Appends an optional blank row and title, the table, and an optional note, recording each row index.
function addTable(rows, tables, { title, header, body, moneyCols = [], pctCols = [], note }) {
    if (title) rows.push([], [title]);
    const titleRow = title ? rows.length - 1 : null;
    const headerRow = rows.length;
    rows.push(header, ...body);
    const lastDataRow = rows.length - 1;
    if (note) rows.push([note]);
    const noteRow = note ? rows.length - 1 : null;
    tables.push({ titleRow, headerRow, firstDataRow: headerRow + 1, lastDataRow, noteRow, lastCol: header.length - 1, moneyCols, pctCols });
}

// Both bounds are optional, so the period reads as a closed range, an open one,
// or "All time" when the user exported without picking any dates.
function formatPeriod(fromDate, toDate) {
    const from = formatRangeDate(fromDate);
    const to = formatRangeDate(toDate);
    if (from && to) return `${from} - ${to}`;
    if (from) return `${from} onwards`;
    if (to) return `Up to ${to}`;
    return 'All time';
}

function formatRangeDate(d) {
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function metaDataStyle(worksheet, spacerRow, lastCol) {
    const cleanPaperBoldLabel = { font: { bold: true, color: { rgb: '000000' } }, fill: { fgColor: { rgb: 'FFFFFF' } } };
    const cleanPaperNormalValue = { font: { color: { rgb: '000000' } }, fill: { fgColor: { rgb: 'FFFFFF' } } };

    for (let R = SUMMARY_META_FIRST_ROW; R <= spacerRow; R++) {
        for (let C = 0; C <= lastCol; C++) {
            const address = cellAddress(R, C);

            if (!worksheet[address]) { worksheet[address] = { t: 's', v: '' }; }

            if (C === 0 && R < spacerRow) { mergeCellStyle(worksheet[address], cleanPaperBoldLabel); }
            else { mergeCellStyle(worksheet[address], cleanPaperNormalValue); }
        }
    }

    const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F3864' } },
        alignment: { horizontal: 'center', vertical: 'center' },
    };

    // Excel paints a merged range using the top-left cell's value, but it draws
    // the fill per underlying cell, so every cell of the banner row needs the style too.
    for (let C = 0; C <= lastCol; C++) {
        const address = cellAddress(SUMMARY_TITLE_ROW, C);
        if (!worksheet[address]) { worksheet[address] = { t: 's', v: '' }; }
        mergeCellStyle(worksheet[address], titleStyle);
    }

    const bannerRow = SHEET_ORIGIN.r + SUMMARY_TITLE_ROW;
    worksheet['!merges'] = [{ s: { r: bannerRow, c: SHEET_ORIGIN.c }, e: { r: bannerRow, c: SHEET_ORIGIN.c + lastCol } }];
    worksheet['!rows'] = [];
    worksheet['!rows'][bannerRow] = { hpt: 50 };
}

function tableDataStyle(worksheet, table, cur) {
    if (table.titleRow != null) mergeCellStyle(worksheet[cellAddress(table.titleRow, 0)], { font: { bold: true, sz: 12, color: { rgb: '1F3864' } } });
    if (table.noteRow != null) mergeCellStyle(worksheet[cellAddress(table.noteRow, 0)], { font: { italic: true, color: { rgb: '595959' } } });

    const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '4F81BD' } },
        alignment: { horizontal: 'center', vertical: 'center' },
    };

    for (let C = 0; C <= table.lastCol; C++) {
        const cell = worksheet[cellAddress(table.headerRow, C)];
        if (cell) { mergeCellStyle(cell, headerStyle); }
    }

    const fmt = getExcelCurrencyFormat(cur);

    for (let R = table.firstDataRow; R <= table.lastDataRow; R++) {
        // Left-align every cell in the data row.
        for (let C = 0; C <= table.lastCol; C++) {
            const cell = worksheet[cellAddress(R, C)];
            if (cell) mergeCellStyle(cell, LEFT_ALIGN);
        }
        // Number formats apply only to numeric cells in the table's money and percent columns.
        table.moneyCols.forEach((C) => {
            const cell = worksheet[cellAddress(R, C)];
            if (cell && typeof cell.v === 'number') cell.z = fmt;
        });
        table.pctCols.forEach((C) => {
            const cell = worksheet[cellAddress(R, C)];
            if (cell && typeof cell.v === 'number') cell.z = PCT_FORMAT;
        });
    }

    // Border every cell from the header down, creating any blank cell so the grid has no gaps.
    for (let R = table.headerRow; R <= table.lastDataRow; R++) {
        for (let C = 0; C <= table.lastCol; C++) {
            const address = cellAddress(R, C);
            if (!worksheet[address]) worksheet[address] = { t: 's', v: '' };
            mergeCellStyle(worksheet[address], CELL_BORDER);
        }
    }
}

// Title, section title and note rows are skipped: they spill into empty cells instead of widening column A.
function computeAoaColWidths(rows, skipRows) {
    const measured = rows.filter((row, r) => !skipRows.has(r));

    let widest = 0;
    measured.forEach((row) => { if (row.length > widest) widest = row.length; });
    if (!widest) return { cols: [{ wch: COL_MIN_WCH }], wrapCols: [] };

    const cols = [];
    const wrapCols = [];
    for (let c = 0; c < widest; c++) {
        let max = 0;
        measured.forEach((row) => {
            const v = row[c];
            const len = v == null ? 0 : String(v).length;
            if (len > max) max = len;
        });
        const { wch, overflow } = sizeColumn(max);
        cols.push({ wch });
        if (overflow) wrapCols.push(c);
    }
    return { cols, wrapCols };
}

// Only table rows wrap; wrapping the banner, section titles or notes would squeeze them into one column.
function wrapColumns(worksheet, wrapCols, tables) {
    tables.forEach((table) => {
        for (let r = table.headerRow; r <= table.lastDataRow; r++) {
            wrapCols.forEach((c) => {
                mergeCellStyle(worksheet[cellAddress(r, c)], {
                    alignment: { wrapText: true, vertical: 'top' },
                });
            });
        }
    });
}

function sizeColumn(maxLen) {
    const desired = maxLen + COL_PADDING;
    return {
        wch: Math.min(Math.max(desired, COL_MIN_WCH), COL_MAX_WCH),
        overflow: desired > COL_MAX_WCH,
    };
}

// Layout code counts rows and columns from the content's top-left; this shifts them past the margin.
function cellAddress(r, c) {
    return XLSX.utils.encode_cell({ r: r + SHEET_ORIGIN.r, c: c + SHEET_ORIGIN.c });
}

function mergeCellStyle(cell, patch) {
    if (!cell) return;
    const prev = cell.s || {};
    const next = { ...prev, ...patch };
    if (prev.alignment || patch.alignment) {
        next.alignment = { ...(prev.alignment || {}), ...(patch.alignment || {}) };
    }
    cell.s = next;
}

// Bytes → a compact human-readable size for the download card.
function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

// Tear down the previous card and release its blob URL, so repeated exports in
// one session don't leak object URLs.
function resetFileCard() {
    const box = document.getElementById('generated-file-box');
    if (!box) return;
    if (box.dataset.url) {
        URL.revokeObjectURL(box.dataset.url);
        delete box.dataset.url;
    }
    box.replaceChildren();
    box.hidden = true;
}

function renderFileCard(fileName, blob, orderCount) {
    const box = document.getElementById('generated-file-box');
    if (!box) return;

    resetFileCard();

    const url = URL.createObjectURL(blob);
    box.dataset.url = url;

    const icon = document.createElement('span');
    icon.className = 'c-export__file-icon';
    icon.textContent = '📄';

    const info = document.createElement('div');
    info.className = 'c-export__file-info';

    const name = document.createElement('p');
    name.className = 'c-export__file-name';
    name.textContent = fileName;

    const meta = document.createElement('p');
    meta.className = 'c-export__file-meta';
    const orderLabel = orderCount === 1 ? 'order' : 'orders';
    meta.textContent = `1 sheet · ${orderCount} ${orderLabel} · ${formatFileSize(blob.size)}`;

    info.append(name, meta);

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'c-export__download';
    download.textContent = 'Download';
    download.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    box.append(icon, info, download);
    box.hidden = false;
}

function filterOrdersByRange(orders, from, to) {
    if (!from && !to) return orders;
    return orders.filter((order) => {
        const d = toJsDate(order.createdAt);
        if (!d || isNaN(d)) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
    });
}

function parseRangeInput(value, endOfDay) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return endOfDay
        ? new Date(y, m - 1, d, 23, 59, 59, 999)
        : new Date(y, m - 1, d, 0, 0, 0, 0);
}

function toJsDate(ts) {
    if (!ts) return null;
    return ts.toDate ? ts.toDate() : new Date(ts);
}

function fileDateStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}