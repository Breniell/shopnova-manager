/**
 * Constructeurs de rapports exportables (CSV + PDF).
 *
 * Chaque constructeur renvoie un `ReportTable` : le même jeu de lignes sert aux
 * deux formats, avec deux rendus de cellules.
 *   • CSV : montants en nombres bruts (« 12500 »), sans unité ni séparateur de
 *     milliers, pour que Excel les additionne. L'unité est dans l'en-tête.
 *   • PDF : montants formatés pour la lecture (« 12 500 »).
 *
 * Fonctions pures : aucune lecture de store ici, tout arrive en paramètre.
 */
import { exportCSV, exportPDF, type ExportAlign, type ExportSummaryItem } from '@/lib/export';
import type { ExportLabels } from '@/lib/exportLabels';
import { getCurrentBcp47, formatDateShort, formatTime } from '@/utils/formatters';
import { getStockStatus } from '@/lib/utils';
import { getCreditAgeInDays, getRemainingBalance, getAmountPaid, getPaymentSignedAmount } from '@/lib/credit';
import { bearsStock, type Product } from '@/stores/useProductStore';
import type { Sale } from '@/stores/useSaleStore';
import { ADJUSTMENT_REASON_LABELS, type StockMovement } from '@/stores/useStockStore';
import type { InventorySession } from '@/stores/useInventoryStore';
import type { Customer } from '@/stores/useCustomerStore';
import type { Supplier } from '@/stores/useSupplierStore';
import type { Payment } from '@/stores/usePaymentStore';
import type { Expense } from '@/stores/useExpenseStore';

export interface ReportTable {
  title: string;
  fileName: string;
  /** Période et filtres appliqués, imprimés sous le titre du PDF. */
  subtitle?: string;
  headers: string[];
  csvRows: string[][];
  pdfRows: string[][];
  align: ExportAlign[];
  summary: ExportSummaryItem[];
  /** Ligne de total du PDF. */
  totals?: string[];
}

const num = (n: number) => new Intl.NumberFormat(getCurrentBcp47()).format(Math.round(n));
const raw = (n: number) => String(Math.round(n));
const dateOf = (d: Date | string) => formatDateShort(new Date(d));
const timeOf = (d: Date | string) => formatTime(new Date(d));
const signed = (n: number) => `${n > 0 ? '+' : ''}${num(n)}`;

/** Une cellule : valeur brute pour le CSV, valeur lisible pour le PDF. */
type Cell = { csv: string; pdf: string };
const text = (s: string | undefined | null): Cell => ({ csv: s ?? '', pdf: s || '-' });
const money = (n: number): Cell => ({ csv: raw(n), pdf: num(n) });
const count = (n: number): Cell => ({ csv: String(n), pdf: num(n) });
const signedCount = (n: number): Cell => ({ csv: String(n), pdf: signed(n) });
const percent = (v: number, digits = 1): Cell => ({ csv: v.toFixed(digits), pdf: `${v.toFixed(digits)} %` });
const blank: Cell = { csv: '', pdf: '' };

function table(
  base: Pick<ReportTable, 'title' | 'fileName' | 'subtitle' | 'summary'>,
  headers: string[],
  align: ExportAlign[],
  rows: Cell[][],
  totals?: Cell[],
): ReportTable {
  return {
    ...base,
    headers,
    align,
    csvRows: rows.map(r => r.map(c => c.csv)),
    pdfRows: rows.map(r => r.map(c => c.pdf)),
    totals: totals?.map(c => c.pdf),
  };
}

const kpi = (label: string, value: string): ExportSummaryItem => ({ label, value });
const fcfa = (n: number) => `${num(n)} FCFA`;

export function periodSubtitle(L: ExportLabels, label: string, from?: Date, to?: Date): string {
  const range = from && to
    ? ` (${L.from} ${dateOf(from)} ${L.to} ${dateOf(to)})`
    : from ? ` (${L.from} ${dateOf(from)})`
    : to ? ` (${L.to} ${dateOf(to)})` : '';
  return `${L.period} : ${label}${range}`;
}

export function runExport(
  format: 'csv' | 'pdf',
  report: ReportTable,
  shopName: string,
  L: ExportLabels,
): 'ok' | 'empty' | 'blocked' {
  if (report.csvRows.length === 0) return 'empty';
  if (format === 'csv') {
    const stamp = new Date().toISOString().slice(0, 10);
    exportCSV(`${report.fileName}-${stamp}`, report.headers, report.csvRows);
    return 'ok';
  }
  const opened = exportPDF(report.title, report.headers, report.pdfRows, report.summary, {
    shopName,
    subtitle: report.subtitle,
    align: report.align,
    totals: report.totals,
    exportedOn: L.exportedOn,
  });
  return opened ? 'ok' : 'blocked';
}

// ─── Ventes ──────────────────────────────────────────────────────────────────

function paymentLabel(L: ExportLabels, mode: string): string {
  return mode === 'especes' ? L.cash : mode === 'mobile_money' ? L.mobile : mode === 'credit' ? L.credit : mode;
}

function creditStatusLabel(L: ExportLabels, st?: string): string {
  return st === 'pending' ? L.csPending : st === 'partial' ? L.csPartial : st === 'paid' ? L.csPaid : '';
}

/** Une ligne par vente, avec tout ce qui permet de la retrouver et de la rapprocher. */
export function salesListReport(L: ExportLabels, sales: Sale[], subtitle?: string): ReportTable {
  const active = sales.filter(s => s.status !== 'refunded');
  const cancelled = sales.filter(s => s.status === 'refunded');
  const revenue = active.reduce((sum, s) => sum + s.total, 0);
  const discounts = active.reduce((sum, s) => sum + (s.discount ?? 0), 0);
  const rows: Cell[][] = sales.map(s => [
    text(s.saleNumber),
    text(dateOf(s.date)),
    text(timeOf(s.date)),
    text(s.userName),
    text(s.customerName),
    count(s.items.reduce((sum, i) => sum + i.quantity, 0)),
    money(s.subtotal ?? s.total),
    money(s.discount ?? 0),
    money(s.total),
    text(paymentLabel(L, s.paymentMode)),
    text(s.mobileOperator ? s.mobileOperator.toUpperCase() : ''),
    text(s.mobileReference),
    s.amountReceived === undefined ? text('') : money(s.amountReceived),
    s.changeGiven === undefined ? text('') : money(s.changeGiven),
    text(s.paymentMode === 'credit' ? creditStatusLabel(L, s.creditStatus) : ''),
    text(s.paymentMode === 'credit' && s.dueDate ? dateOf(s.dueDate) : ''),
    text(s.status === 'refunded' ? L.statusCancelled : L.statusValidated),
    text(s.status === 'refunded' ? s.refundReason : ''),
    text(s.status === 'refunded' && s.refundedAt ? dateOf(s.refundedAt) : ''),
  ]);
  return table(
    {
      title: L.rSalesTitle, fileName: L.rSalesFile, subtitle,
      summary: [
        kpi(L.kSales, num(active.length)),
        kpi(L.kCancelled, num(cancelled.length)),
        kpi(L.kRevenue, fcfa(revenue)),
        kpi(L.kAvgCart, fcfa(active.length > 0 ? revenue / active.length : 0)),
        kpi(L.kDiscounts, fcfa(discounts)),
        kpi(L.kCancelledAmount, fcfa(cancelled.reduce((sum, s) => sum + s.total, 0))),
      ],
    },
    [L.colSale, L.colDate, L.colTime, L.colCashier, L.colCustomer, L.colItems, L.colSubtotal, L.colDiscount, L.colTotal,
      L.colPayment, L.colMobileOp, L.colMobileRef, L.colReceived, L.colChange, L.colCreditStatus, L.colDueDate,
      L.colStatus, L.colRefundReason, L.colRefundedAt],
    ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'left', 'left', 'left', 'right', 'right', 'left', 'left', 'left', 'left', 'left'],
    rows,
    [text(L.total), blank, blank, blank, blank,
      count(active.reduce((sum, s) => sum + s.items.reduce((q, i) => q + i.quantity, 0), 0)),
      money(active.reduce((sum, s) => sum + (s.subtotal ?? s.total), 0)), money(discounts), money(revenue),
      blank, blank, blank, blank, blank, blank, blank, blank, blank, blank],
  );
}

/**
 * Une ligne par article vendu : c'est l'export qui retrouve toutes les
 * déclinaisons, là où la liste des ventes n'en montre que le nombre.
 */
export function salesLinesReport(L: ExportLabels, sales: Sale[], products: Product[], subtitle?: string): ReportTable {
  const byId = new Map(products.map(p => [p.id, p]));
  const rows: Cell[][] = [];
  let qty = 0; let net = 0; let margin = 0; let lines = 0;

  for (const s of sales) {
    const cancelled = s.status === 'refunded';
    for (const item of s.items) {
      const unit = item.prixUnitaire ?? item.prixVente;
      const gross = item.quantity * unit;
      // Même répartition de la remise que la page Rapports : la somme des
      // lignes retombe sur le total réellement encaissé.
      const lineNet = s.subtotal > 0 ? s.total * (gross / s.subtotal) : 0;
      const product = byId.get(item.productId);
      const unitCost = item.prixAchat ?? product?.prixAchat ?? 0;
      const cost = unitCost * item.quantity;
      if (!cancelled) { qty += item.quantity; net += lineNet; margin += lineNet - cost; lines += 1; }
      rows.push([
        text(s.saleNumber), text(dateOf(s.date)), text(timeOf(s.date)), text(s.userName), text(s.customerName),
        text(item.nom), text(product?.categorie), text(product?.codeBarre),
        count(item.quantity), money(item.prixVente), money(item.prixVente - unit), money(unit),
        money(lineNet), money(unitCost), money(lineNet - cost),
        text(paymentLabel(L, s.paymentMode)),
        text(cancelled ? L.statusCancelled : L.statusValidated),
      ]);
    }
  }
  const active = sales.filter(s => s.status !== 'refunded').length;
  return table(
    {
      title: L.rSalesLinesTitle, fileName: L.rSalesLinesFile, subtitle,
      summary: [
        kpi(L.kSales, num(active)),
        kpi(L.kLines, num(lines)),
        kpi(L.kUnits, num(qty)),
        kpi(L.kRevenue, fcfa(net)),
        kpi(L.kCostGoods, fcfa(net - margin)),
        kpi(L.kMargin, fcfa(margin)),
      ],
    },
    [L.colSale, L.colDate, L.colTime, L.colCashier, L.colCustomer, L.colProduct, L.colCategory, L.colBarcode,
      L.colQty, L.colListPrice, L.colNegotiated, L.colUnitPrice, L.colLineTotal, L.colUnitCost, L.colMargin,
      L.colPayment, L.colStatus],
    ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'left', 'left'],
    rows,
    [text(L.total), blank, blank, blank, blank, blank, blank, blank, count(qty), blank, blank, blank,
      money(net), blank, money(margin), blank, blank],
  );
}

/** Tous les produits vendus sur la période, pas seulement les dix premiers. */
export function productSalesReport(L: ExportLabels, sales: Sale[], products: Product[], subtitle?: string): ReportTable {
  const byId = new Map(products.map(p => [p.id, p]));
  const byProduct = new Map<string, { nom: string; qty: number; revenue: number; cost: number; tickets: Set<string> }>();
  for (const s of sales) {
    if (s.status === 'refunded') continue;
    for (const item of s.items) {
      const gross = item.quantity * (item.prixUnitaire ?? item.prixVente);
      const revenue = s.subtotal > 0 ? s.total * (gross / s.subtotal) : 0;
      const cost = (item.prixAchat ?? byId.get(item.productId)?.prixAchat ?? 0) * item.quantity;
      const e = byProduct.get(item.productId);
      if (e) { e.qty += item.quantity; e.revenue += revenue; e.cost += cost; e.tickets.add(s.id); }
      else byProduct.set(item.productId, { nom: item.nom, qty: item.quantity, revenue, cost, tickets: new Set([s.id]) });
    }
  }
  const entries = Array.from(byProduct.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRevenue = entries.reduce((sum, [, p]) => sum + p.revenue, 0);
  const totalQty = entries.reduce((sum, [, p]) => sum + p.qty, 0);
  const totalMargin = totalRevenue - entries.reduce((sum, [, p]) => sum + p.cost, 0);
  const active = sales.filter(s => s.status !== 'refunded').length;
  const share = (v: number) => (totalRevenue > 0 ? v / totalRevenue * 100 : 0);

  const rows: Cell[][] = entries.map(([id, p], i) => [
    count(i + 1), text(p.nom), text(byId.get(id)?.categorie), count(p.qty), count(p.tickets.size),
    money(p.qty > 0 ? p.revenue / p.qty : 0), money(p.revenue), money(p.revenue - p.cost),
    p.revenue > 0 ? percent((p.revenue - p.cost) / p.revenue * 100) : text(''),
    percent(share(p.revenue)),
  ]);
  return table(
    {
      title: L.rProductSalesTitle, fileName: L.rProductSalesFile, subtitle,
      summary: [
        kpi(L.kSales, num(active)),
        kpi(L.kProducts, num(entries.length)),
        kpi(L.kUnits, num(totalQty)),
        kpi(L.kRevenue, fcfa(totalRevenue)),
        kpi(L.kMargin, fcfa(totalMargin)),
      ],
    },
    [L.colNum, L.colProduct, L.colCategory, L.colQty, L.colTickets, L.colAvgPrice, L.colRevenue, L.colMargin, L.colMarginPct, L.colPercent],
    ['right', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
    rows,
    [blank, text(L.total), blank, count(totalQty), blank, blank, money(totalRevenue), money(totalMargin),
      totalRevenue > 0 ? percent(totalMargin / totalRevenue * 100) : blank, percent(100, 0)],
  );
}

/** Une ligne par jour de la période, y compris les jours sans vente. */
export function dailySalesReport(
  L: ExportLabels, sales: Sale[], expenses: Expense[], products: Product[], from: Date, to: Date, subtitle?: string,
): ReportTable {
  const byId = new Map(products.map(p => [p.id, p]));
  const key = (d: Date | string) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
  type Day = { date: Date; sales: number; units: number; revenue: number; cost: number; expenses: number };
  const days = new Map<string, Day>();
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end) {
    days.set(key(cursor), { date: new Date(cursor), sales: 0, units: 0, revenue: 0, cost: 0, expenses: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const s of sales) {
    if (s.status === 'refunded') continue;
    const d = days.get(key(s.date));
    if (!d) continue;
    d.sales += 1; d.revenue += s.total;
    for (const i of s.items) {
      d.units += i.quantity;
      d.cost += (i.prixAchat ?? byId.get(i.productId)?.prixAchat ?? 0) * i.quantity;
    }
  }
  for (const e of expenses) {
    const d = days.get(key(e.date));
    if (d) d.expenses += e.montant;
  }
  const list = Array.from(days.values());
  const sum = (f: (d: Day) => number) => list.reduce((t, d) => t + f(d), 0);
  const rows: Cell[][] = list.map(d => [
    text(dateOf(d.date)), count(d.sales), count(d.units), money(d.revenue), money(d.revenue - d.cost), money(d.expenses),
    money(d.revenue - d.cost - d.expenses),
  ]);
  const net = sum(d => d.revenue - d.cost - d.expenses);
  return table(
    {
      title: L.rDailyTitle, fileName: L.rDailyFile, subtitle,
      summary: [kpi(L.kSales, num(sum(d => d.sales))), kpi(L.kRevenue, fcfa(sum(d => d.revenue))), kpi(L.kNet, fcfa(net))],
    },
    [L.colDay, L.colSalesCount, L.colQty, L.colRevenue, L.colMargin, L.colExpenses, L.colNet],
    ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
    rows,
    [text(L.total), count(sum(d => d.sales)), count(sum(d => d.units)), money(sum(d => d.revenue)),
      money(sum(d => d.revenue - d.cost)), money(sum(d => d.expenses)), money(net)],
  );
}

/**
 * Synthèse de période : les chiffres de l'écran Rapports réunis en un document,
 * avec la répartition par paiement, les dépenses par catégorie et le top produits.
 */
export function periodSummaryReport(
  L: ExportLabels, sales: Sale[], expenses: Expense[], products: Product[],
  categoryLabel: (e: Expense) => string, subtitle?: string,
): ReportTable {
  const byId = new Map(products.map(p => [p.id, p]));
  const active = sales.filter(s => s.status !== 'refunded');
  const revenue = active.reduce((sum, s) => sum + s.total, 0);
  const cost = active.reduce((sum, s) => sum + s.items.reduce(
    (c, i) => c + (i.prixAchat ?? byId.get(i.productId)?.prixAchat ?? 0) * i.quantity, 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.montant, 0);
  const net = revenue - cost - totalExpenses;
  const units = active.reduce((sum, s) => sum + s.items.reduce((q, i) => q + i.quantity, 0), 0);

  const rows: Cell[][] = [];
  const add = (section: string, label: string, value: Cell) => rows.push([text(section), text(label), value]);

  add(L.secKpi, L.kSales, count(active.length));
  add(L.secKpi, L.kUnits, count(units));
  add(L.secKpi, L.kRevenue, money(revenue));
  add(L.secKpi, L.kAvgCart, money(active.length > 0 ? revenue / active.length : 0));
  add(L.secKpi, L.kCostGoods, money(cost));
  add(L.secKpi, L.kMargin, money(revenue - cost));
  add(L.secKpi, L.kExpensesTotal, money(totalExpenses));
  add(L.secKpi, L.kNet, money(net));
  add(L.secKpi, L.kDiscounts, money(active.reduce((sum, s) => sum + (s.discount ?? 0), 0)));
  add(L.secKpi, L.kCancelled, count(sales.length - active.length));

  for (const mode of ['especes', 'mobile_money', 'credit'] as const) {
    const ofMode = active.filter(s => s.paymentMode === mode);
    const total = ofMode.reduce((sum, s) => sum + s.total, 0);
    const share = revenue > 0 ? ` (${(total / revenue * 100).toFixed(1)} %)` : '';
    rows.push([text(L.secPayment), text(`${paymentLabel(L, mode)} - ${ofMode.length}`), { csv: raw(total), pdf: `${num(total)}${share}` }]);
  }

  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const label = categoryLabel(e);
    byCategory.set(label, (byCategory.get(label) ?? 0) + e.montant);
  }
  for (const [label, total] of Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])) {
    add(L.secExpenses, label, money(total));
  }

  const top = new Map<string, { nom: string; revenue: number }>();
  for (const s of active) {
    for (const i of s.items) {
      const gross = i.quantity * (i.prixUnitaire ?? i.prixVente);
      const r = s.subtotal > 0 ? s.total * (gross / s.subtotal) : 0;
      const e = top.get(i.productId);
      if (e) e.revenue += r; else top.set(i.productId, { nom: i.nom, revenue: r });
    }
  }
  Array.from(top.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    .forEach((p, i) => add(L.secTop, `${i + 1}. ${p.nom}`, money(p.revenue)));

  return table(
    {
      title: L.rSummaryTitle, fileName: L.rSummaryFile, subtitle,
      summary: [kpi(L.kRevenue, fcfa(revenue)), kpi(L.kExpensesTotal, fcfa(totalExpenses)), kpi(L.kNet, fcfa(net))],
    },
    [L.colSection, L.colIndicator, L.colValue],
    ['left', 'left', 'right'],
    rows,
  );
}

// ─── Produits & stock ────────────────────────────────────────────────────────

function stockStatusLabel(L: ExportLabels, p: Product): string {
  const s = getStockStatus(p.stock, p.seuilAlerte);
  return s === 'stockout' ? L.stockOut : s === 'low' ? L.stockLow : L.stockOk;
}

/** Les déclinaisons sont de vrais produits : une ligne chacune, avec son parent. */
export function productsReport(L: ExportLabels, products: Product[], subtitle?: string): ReportTable {
  const parentName = new Map(products.map(p => [p.id, p.nom]));
  const sellable = products.filter(bearsStock);
  const value = sellable.reduce((sum, p) => sum + p.prixAchat * p.stock, 0);
  const saleValue = sellable.reduce((sum, p) => sum + p.prixVente * p.stock, 0);
  const yesNo = (b?: boolean) => (b ? L.yes : L.no);
  const optMoney = (n?: number) => (n === undefined ? text('') : money(n));
  const rows: Cell[][] = sellable.map(p => [
    text(p.nom), text(p.parentId ? parentName.get(p.parentId) : ''), text(p.categorie), text(p.codeBarre),
    money(p.prixAchat), money(p.prixVente), money(p.prixVente - p.prixAchat),
    p.prixVente > 0 ? percent((p.prixVente - p.prixAchat) / p.prixVente * 100) : text(''),
    optMoney(p.prixPlancher), optMoney(p.prixCible), text(yesNo(p.negociable)),
    count(p.stock), count(p.seuilAlerte), text(stockStatusLabel(L, p)),
    money(p.prixAchat * p.stock), money(p.prixVente * p.stock), text(p.description),
  ]);
  return table(
    {
      title: L.rProductsTitle, fileName: L.rProductsFile, subtitle,
      summary: [
        kpi(L.kReferences, num(sellable.length)),
        kpi(L.kOutOfStock, num(sellable.filter(p => p.stock <= 0).length)),
        kpi(L.colStockValue.replace(' (FCFA)', ''), fcfa(value)),
        kpi(L.colSaleValue.replace(' (FCFA)', ''), fcfa(saleValue)),
      ],
    },
    [L.colProduct, L.colParent, L.colCategory, L.colBarcode, L.colBuyPrice, L.colSellPrice, L.colUnitMargin, L.colMarginPct,
      L.colFloor, L.colTarget, L.colNegotiable, L.colStock, L.colThreshold, L.colStatus, L.colStockValue, L.colSaleValue, L.colNotes],
    ['left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'left', 'right', 'right', 'left', 'right', 'right', 'left'],
    rows,
    [text(L.total), blank, blank, blank, blank, blank, blank, blank, blank, blank, blank,
      count(sellable.reduce((sum, p) => sum + p.stock, 0)), blank, blank, money(value), money(saleValue), blank],
  );
}

export function stockStateReport(L: ExportLabels, products: Product[], subtitle?: string): ReportTable {
  const stocked = products.filter(bearsStock);
  const out = stocked.filter(p => p.stock <= 0).length;
  const low = stocked.filter(p => p.stock > 0 && p.stock <= p.seuilAlerte).length;
  const value = stocked.reduce((sum, p) => sum + p.prixAchat * p.stock, 0);
  const saleValue = stocked.reduce((sum, p) => sum + p.prixVente * p.stock, 0);
  const rows: Cell[][] = stocked.map(p => [
    text(p.nom), text(p.categorie), text(p.codeBarre), count(p.stock), count(p.seuilAlerte),
    text(stockStatusLabel(L, p)), money(p.prixAchat), money(p.prixAchat * p.stock), money(p.prixVente * p.stock),
  ]);
  return table(
    {
      title: L.rStockTitle, fileName: L.rStockFile, subtitle,
      summary: [
        kpi(L.kReferences, num(stocked.length)),
        kpi(L.kOutOfStock, num(out)),
        kpi(L.kLowStock, num(low)),
        kpi(L.kStockValue, fcfa(value)),
      ],
    },
    [L.colProduct, L.colCategory, L.colBarcode, L.colStock, L.colThreshold, L.colStatus, L.colBuyPrice, L.colStockValue, L.colSaleValue],
    ['left', 'left', 'left', 'right', 'right', 'left', 'right', 'right', 'right'],
    rows,
    [text(L.total), blank, blank, count(stocked.reduce((sum, p) => sum + p.stock, 0)), blank, blank, blank, money(value), money(saleValue)],
  );
}

/** Produits en alerte avec la quantité à commander pour revenir à 3× le seuil. */
export function stockAlertsReport(L: ExportLabels, products: Product[], title?: string, fileName?: string, subtitle?: string): ReportTable {
  const alerts = products
    .filter(p => bearsStock(p) && getStockStatus(p.stock, p.seuilAlerte) !== 'healthy')
    .map(p => ({ p, recommended: Math.max(0, p.seuilAlerte * 3 - p.stock) }))
    .sort((a, b) => a.p.stock - b.p.stock);
  const rows: Cell[][] = alerts.map(({ p, recommended }) => [
    text(p.nom), text(p.categorie), text(p.codeBarre), count(p.stock), count(p.seuilAlerte),
    text(stockStatusLabel(L, p)), count(recommended), money(p.prixAchat), money(p.prixAchat * recommended),
  ]);
  const reorderCost = alerts.reduce((sum, a) => sum + a.p.prixAchat * a.recommended, 0);
  return table(
    {
      title: title ?? L.rAlertsTitle, fileName: fileName ?? L.rAlertsFile, subtitle,
      summary: [
        kpi(L.kOutOfStock, num(alerts.filter(a => a.p.stock <= 0).length)),
        kpi(L.kLowStock, num(alerts.filter(a => a.p.stock > 0).length)),
        kpi(L.colReorderCost.replace(' (FCFA)', ''), fcfa(reorderCost)),
      ],
    },
    [L.colProduct, L.colCategory, L.colBarcode, L.colStock, L.colThreshold, L.colStatus, L.colRecommended, L.colBuyPrice, L.colReorderCost],
    ['left', 'left', 'left', 'right', 'right', 'left', 'right', 'right', 'right'],
    rows,
    [text(L.total), blank, blank, blank, blank, blank, count(alerts.reduce((sum, a) => sum + a.recommended, 0)), blank, money(reorderCost)],
  );
}

export function stockMovementsReport(L: ExportLabels, movements: StockMovement[], subtitle?: string): ReportTable {
  const rows: Cell[][] = movements.map(m => [
    text(dateOf(m.date)), text(timeOf(m.date)), text(m.productName),
    text(m.type.charAt(0).toUpperCase() + m.type.slice(1)),
    signedCount(m.quantity), count(m.stockBefore), count(m.stockAfter),
    m.unitPrice === undefined ? text('') : money(m.unitPrice),
    text(m.reason ? ADJUSTMENT_REASON_LABELS[m.reason] : ''),
    text(m.userName), text(m.supplier), text(m.notes), text(m.inventorySessionId ? L.yes : ''),
  ]);
  return table(
    {
      title: L.rMovementsTitle, fileName: L.rMovementsFile, subtitle,
      summary: [
        kpi(L.kMovements, num(movements.length)),
        kpi(L.kUnits, signed(movements.reduce((sum, m) => sum + m.quantity, 0))),
      ],
    },
    [L.colDate, L.colTime, L.colProduct, L.colType, L.colQty, L.colBefore, L.colAfter, L.colUnitPriceBuy, L.colReason, L.colUser, L.colSupplier, L.colNotes, L.colSession],
    ['left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'left', 'left', 'left', 'left', 'left'],
    rows,
  );
}

// ─── Inventaires ─────────────────────────────────────────────────────────────

function scopeLabel(L: ExportLabels, session: InventorySession): string {
  return session.scope === 'complet' ? L.scopeAll
    : session.scope === 'categorie' ? `${L.scopeCategory} : ${session.scopeCategorie ?? ''}`
    : L.scopeManual;
}

/** Historique : une ligne par session. */
export function inventoryHistoryReport(L: ExportLabels, sessions: InventorySession[], subtitle?: string): ReportTable {
  const totalQty = sessions.reduce((sum, s) => sum + (s.totalEcartQty ?? 0), 0);
  const totalValue = sessions.reduce((sum, s) => sum + (s.totalEcartValue ?? 0), 0);
  const rows: Cell[][] = sessions.map(s => [
    text(s.numero), text(scopeLabel(L, s)), text(dateOf(s.createdAt)), text(s.createdByName),
    text(s.validatedAt ? dateOf(s.validatedAt) : ''), text(s.validatedByName),
    count(s.lines.length), count(s.lines.filter(l => l.ecart !== 0).length),
    signedCount(s.totalEcartQty ?? 0), money(s.totalEcartValue ?? 0), text(s.notes),
  ]);
  return table(
    {
      title: L.rInvHistTitle, fileName: L.rInvHistFile, subtitle,
      summary: [kpi(L.kSessions, num(sessions.length)), kpi(L.kGapQty, signed(totalQty)), kpi(L.kGapValue, fcfa(totalValue))],
    },
    [L.colNum, L.colScope, L.colCreatedAt, L.colCreatedBy, L.colValidatedAt, L.colValidatedBy, L.colLines, L.kWithGap, L.colGap, L.colGapValue, L.colNotes],
    ['left', 'left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'left'],
    rows,
    [text(L.total), blank, blank, blank, blank, blank, blank, blank, signedCount(totalQty), money(totalValue), blank],
  );
}

/**
 * Détail d'une session, ligne par ligne : stock théorique, compté, écart,
 * valeur de l'écart (au prix d'achat) et motif.
 */
export function inventorySessionReport(L: ExportLabels, session: InventorySession, products: Product[]): ReportTable {
  const byId = new Map(products.map(p => [p.id, p]));
  const lines = session.lines;
  const counted = lines.filter(l => l.stockCompte !== null);
  const gapValue = (l: (typeof lines)[number]) => l.ecart * (byId.get(l.productId)?.prixAchat ?? 0);
  const rows: Cell[][] = lines.map(l => [
    text(l.productName), text(byId.get(l.productId)?.categorie), text(byId.get(l.productId)?.codeBarre),
    count(l.stockTheorique),
    l.stockCompte === null ? { csv: '', pdf: L.uncounted } : count(l.stockCompte),
    l.stockCompte === null ? text('') : signedCount(l.ecart),
    l.stockCompte === null ? text('') : money(gapValue(l)),
    text(l.reason ? ADJUSTMENT_REASON_LABELS[l.reason] : ''), text(l.notes),
  ]);
  const withGap = counted.filter(l => l.ecart !== 0);
  const totalQty = session.totalEcartQty ?? counted.reduce((sum, l) => sum + l.ecart, 0);
  const totalValue = session.totalEcartValue ?? counted.reduce((sum, l) => sum + gapValue(l), 0);
  const status = session.status === 'validated' ? L.statusValidated : session.status === 'cancelled' ? L.statusCancelled : '';
  const subtitle = [
    scopeLabel(L, session),
    `${L.colCreatedBy} ${session.createdByName} - ${dateOf(session.createdAt)}`,
    session.validatedAt ? `${L.colValidatedBy} ${session.validatedByName ?? ''} - ${dateOf(session.validatedAt)}` : '',
    status,
    session.notes ?? '',
  ].filter(Boolean).join(' | ');
  return table(
    {
      title: `${L.rInvDetailTitle} ${session.numero}`, fileName: `${L.rInvDetailFile}-${session.numero}`, subtitle,
      summary: [
        kpi(L.kReferences, num(lines.length)),
        kpi(L.kCounted, num(counted.length)),
        kpi(L.kWithGap, num(withGap.length)),
        kpi(L.kGapQty, signed(totalQty)),
        kpi(L.kGapValue, fcfa(totalValue)),
      ],
    },
    [L.colProduct, L.colCategory, L.colBarcode, L.colTheoretical, L.colCounted, L.colGap, L.colGapValue, L.colReason, L.colNote],
    ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'left', 'left'],
    rows,
    [text(L.total), blank, blank, count(lines.reduce((sum, l) => sum + l.stockTheorique, 0)),
      count(counted.reduce((sum, l) => sum + (l.stockCompte ?? 0), 0)), signedCount(totalQty), money(totalValue), blank, blank],
  );
}

/**
 * Feuille de comptage à imprimer : le stock théorique est masqué pour ne pas
 * influencer le compteur, la colonne « Comptage physique » est laissée vide.
 */
export function inventorySheetReport(L: ExportLabels, session: InventorySession, products: Product[]): ReportTable {
  const byId = new Map(products.map(p => [p.id, p]));
  const rows: Cell[][] = session.lines.map(l => [
    text(l.productName), text(byId.get(l.productId)?.categorie), text(byId.get(l.productId)?.codeBarre), blank, blank,
  ]);
  return table(
    {
      title: `${L.rInvSheetTitle} ${session.numero}`, fileName: `${L.rInvSheetFile}-${session.numero}`,
      subtitle: `${scopeLabel(L, session)} | ${L.colCreatedBy} ${session.createdByName} - ${dateOf(session.createdAt)}`,
      summary: [kpi(L.kReferences, num(session.lines.length))],
    },
    [L.colProduct, L.colCategory, L.colBarcode, L.colPhysical, L.colNote],
    ['left', 'left', 'left', 'right', 'left'],
    rows,
  );
}

// ─── Clients, fournisseurs ───────────────────────────────────────────────────

export function customersReport(
  L: ExportLabels,
  customers: Customer[],
  salesByCustomer: Map<string, { count: number; total: number }>,
  subtitle?: string,
): ReportTable {
  const rows: Cell[][] = customers.map(c => {
    const s = salesByCustomer.get(c.id);
    return [
      text(`${c.prenom} ${c.nom}`.trim()), text(c.telephone), text(c.email), text(c.adresse),
      text(dateOf(c.dateCreation)),
      c.plafondCredit === undefined ? text('') : money(c.plafondCredit),
      count(s?.count ?? 0), money(s?.total ?? 0), money(s && s.count > 0 ? s.total / s.count : 0),
      text(c.archived ? L.archived : L.active), text(c.notes),
    ];
  });
  const total = customers.reduce((sum, c) => sum + (salesByCustomer.get(c.id)?.total ?? 0), 0);
  const nbSales = customers.reduce((sum, c) => sum + (salesByCustomer.get(c.id)?.count ?? 0), 0);
  return table(
    {
      title: L.rCustomersTitle, fileName: L.rCustomersFile, subtitle,
      summary: [kpi(L.kCustomers, num(customers.length)), kpi(L.colSalesTotal.replace(' (FCFA)', ''), fcfa(total))],
    },
    [L.colName, L.colPhone, L.colEmail, L.colAddress, L.colSince, L.colCreditLimit, L.colSalesCount, L.colSalesTotal, L.kAvgCart, L.colStatus, L.colNotes],
    ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'left', 'left'],
    rows,
    [text(L.total), blank, blank, blank, blank, blank, count(nbSales), money(total), blank, blank, blank],
  );
}

export function suppliersReport(L: ExportLabels, suppliers: Supplier[], subtitle?: string): ReportTable {
  const rows: Cell[][] = suppliers.map(s => [text(s.nom), text(s.telephone), text(s.email), text(s.adresse), text(s.notes)]);
  return table(
    { title: L.rSuppliersTitle, fileName: L.rSuppliersFile, subtitle, summary: [kpi(L.kSuppliers, num(suppliers.length))] },
    [L.colName, L.colPhone, L.colEmail, L.colAddress, L.colNotes],
    ['left', 'left', 'left', 'left', 'left'],
    rows,
  );
}

// ─── Dépenses ────────────────────────────────────────────────────────────────

export interface ExpenseHeaders {
  date: string; category: string; description: string; beneficiary: string;
  reference: string; payment: string; amount: string; user: string; notes: string;
}

export function expensesReport(
  L: ExportLabels,
  expenses: Expense[],
  h: ExpenseHeaders,
  categoryLabel: (e: Expense) => string,
  paymentModeLabel: (e: Expense) => string,
  subtitle?: string,
): ReportTable {
  const total = expenses.reduce((sum, e) => sum + e.montant, 0);
  const rows: Cell[][] = expenses.map(e => [
    text(dateOf(e.date)), text(categoryLabel(e)), text(e.description), text(e.beneficiaire), text(e.reference),
    text(paymentModeLabel(e)), money(e.montant), text(e.userName), text(e.notes),
  ]);
  return table(
    {
      title: L.rExpensesTitle, fileName: L.rExpensesFile, subtitle,
      summary: [kpi(L.kExpenses, num(expenses.length)), kpi(L.colAmount.replace(' (FCFA)', ''), fcfa(total))],
    },
    [h.date, h.category, h.description, h.beneficiary, h.reference, h.payment, h.amount, h.user, h.notes],
    ['left', 'left', 'left', 'left', 'left', 'left', 'right', 'left', 'left'],
    rows,
    [text(L.total), blank, blank, blank, blank, blank, money(total), blank, blank],
  );
}

// ─── Crédit ──────────────────────────────────────────────────────────────────

export function creditOpenSalesReport(L: ExportLabels, openSales: Sale[], payments: Payment[], subtitle?: string): ReportTable {
  const rows: Cell[][] = openSales.map(s => [
    text(s.saleNumber), text(dateOf(s.date)), text(s.customerName), money(s.total),
    money(getAmountPaid(s, payments)), money(getRemainingBalance(s, payments)),
    count(getCreditAgeInDays(s)), text(s.dueDate ? dateOf(s.dueDate) : ''),
  ]);
  const outstanding = openSales.reduce((sum, s) => sum + getRemainingBalance(s, payments), 0);
  return table(
    {
      title: L.rCreditOpenTitle, fileName: L.rCreditOpenFile, subtitle,
      summary: [kpi(L.kOpenSales, num(openSales.length)), kpi(L.kOutstanding, fcfa(outstanding))],
    },
    [L.colSale, L.colDate, L.colCustomer, L.colTotal, L.colPaid, L.colRemaining, L.colAge, L.colDueDate],
    ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'left'],
    rows,
    [text(L.total), blank, blank, money(openSales.reduce((sum, s) => sum + s.total, 0)),
      money(openSales.reduce((sum, s) => sum + getAmountPaid(s, payments), 0)), money(outstanding), blank, blank],
  );
}

export interface CreditClientRow { customerName: string; outstanding: number; nbOpen: number; oldestSale: Sale | null }

export function creditClientsReport(L: ExportLabels, clients: CreditClientRow[], subtitle?: string): ReportTable {
  const total = clients.reduce((sum, c) => sum + c.outstanding, 0);
  const rows: Cell[][] = clients.map(c => [
    text(c.customerName), count(c.nbOpen), money(c.outstanding),
    count(c.oldestSale ? getCreditAgeInDays(c.oldestSale) : 0),
  ]);
  return table(
    {
      title: L.rCreditClientsTitle, fileName: L.rCreditClientsFile, subtitle,
      summary: [kpi(L.kCustomers, num(clients.length)), kpi(L.kOutstanding, fcfa(total))],
    },
    [L.colCustomer, L.colOpenSales, L.colRemaining, L.colAge],
    ['left', 'right', 'right', 'right'],
    rows,
    [text(L.total), count(clients.reduce((sum, c) => sum + c.nbOpen, 0)), money(total), blank],
  );
}

export function creditPaymentsReport(
  L: ExportLabels,
  payments: Payment[],
  customerName: (id: string) => string,
  saleNumber: (id: string) => string,
  subtitle?: string,
): ReportTable {
  const received = payments.reduce((sum, p) => sum + getPaymentSignedAmount(p), 0);
  const rows: Cell[][] = payments.map(p => [
    text(dateOf(p.date)), text(timeOf(p.date)), text(customerName(p.customerId)), text(saleNumber(p.saleId)),
    text(p.kind === 'reversal' ? L.reversal : p.channel === 'mobile_money' ? L.mobile : L.cash),
    money(getPaymentSignedAmount(p)), text(p.mobileReference), text(p.userName), text(p.notes),
  ]);
  return table(
    {
      title: L.rCreditPaymentsTitle, fileName: L.rCreditPaymentsFile, subtitle,
      summary: [kpi(L.kPayments, num(payments.length)), kpi(L.kReceived, fcfa(received))],
    },
    [L.colDate, L.colTime, L.colCustomer, L.colSale, L.colChannel, L.colAmount, L.colReference, L.colUser, L.colNotes],
    ['left', 'left', 'left', 'left', 'left', 'right', 'left', 'left', 'left'],
    rows,
    [text(L.total), blank, blank, blank, blank, money(received), blank, blank, blank],
  );
}
