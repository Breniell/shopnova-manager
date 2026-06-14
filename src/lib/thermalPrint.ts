import type { Sale } from '@/stores/useSaleStore';
import type { ShopSettings } from '@/stores/useSettingsStore';
import { formatDateShort, formatTime, getCurrentBcp47 } from '@/utils/formatters';

export function isThermalAvailable(): boolean {
  return !!(window.legwan?.printer);
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function pad(text: string, width: number, dir: 'left' | 'right' = 'left'): string {
  const s = String(text);
  if (s.length >= width) return s.slice(0, width);
  const fill = ' '.repeat(width - s.length);
  return dir === 'left' ? s + fill : fill + s;
}

function cols(left: string, right: string, totalWidth: number): string {
  const r = String(right);
  const available = totalWidth - r.length - 1;
  const l = available > 0 ? pad(left, available) : '';
  return l + ' ' + r;
}

function divider(width: number): string {
  return '-'.repeat(width);
}

// ── Build receipt lines for a thermal roll ────────────────────────────────────

export interface ThermalLine {
  text: string;
  bold?: boolean;
  center?: boolean;
  doubleHeight?: boolean;
}

export interface ThermalReceiptData {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  shopHeader?: string;
  shopFooter?: string;
  receiptNumber: number | string;
  date: Date;
  cashierName: string;
  customerName?: string;
  items: Array<{
    nom: string;
    quantity: number;
    unitPrice: number;
    total: number;
    negotiated?: boolean;
    origPrice?: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  paymentLabel: string;
  mobileOperator?: string;
  mobileReference?: string;
  amountReceived?: number;
  changeGiven?: number;
  paperWidth: '58' | '80';
}

function buildLines(data: ThermalReceiptData): ThermalLine[] {
  const W = data.paperWidth === '58' ? 32 : 48;
  const lines: ThermalLine[] = [];

  const center = (text: string, bold = false, doubleHeight = false): void => {
    lines.push({ text, center: true, bold, doubleHeight });
  };
  const left = (text: string, bold = false): void => {
    lines.push({ text, bold });
  };
  const sep = (): void => {
    lines.push({ text: divider(W) });
  };
  const blank = (): void => {
    lines.push({ text: '' });
  };

  // Header
  center(data.shopName, true);
  if (data.shopAddress) center(data.shopAddress);
  if (data.shopPhone) center(data.shopPhone);
  if (data.shopHeader) center(data.shopHeader);
  sep();

  // Meta
  const dateStr = formatDateShort(data.date);
  const timeStr = formatTime(data.date);
  left(cols(`Reçu #${data.receiptNumber}`, `${dateStr} ${timeStr}`, W));
  left(`Caissier: ${data.cashierName}`);
  if (data.customerName) left(`Client: ${data.customerName}`);
  sep();

  // Items
  const qtyW = 4;
  const priceW = 8;
  const nameW = W - qtyW - priceW - 2;
  left(pad('Article', nameW) + ' ' + pad('Qté', qtyW, 'right') + ' ' + pad('Total', priceW, 'right'), true);
  sep();

  for (const item of data.items) {
    const nameStr = item.nom.slice(0, nameW);
    const totalStr = item.total.toLocaleString(getCurrentBcp47());
    const qtyStr = `${item.quantity}x`;
    left(pad(nameStr, nameW) + ' ' + pad(qtyStr, qtyW, 'right') + ' ' + pad(totalStr, priceW, 'right'));
    if (item.negotiated && item.origPrice != null) {
      const unitInfo = `  ${item.origPrice.toLocaleString(getCurrentBcp47())} → ${item.unitPrice.toLocaleString(getCurrentBcp47())}`;
      left(unitInfo.slice(0, W));
    }
  }
  sep();

  // Totals
  if (data.discount > 0) {
    const discountAmt = Math.round(data.subtotal * data.discount / 100);
    left(cols('Sous-total', data.subtotal.toLocaleString(getCurrentBcp47()), W));
    left(cols(`Remise (${data.discount}%)`, `-${discountAmt.toLocaleString(getCurrentBcp47())}`, W));
  }

  blank();
  lines.push({ text: cols('TOTAL', data.total.toLocaleString(getCurrentBcp47()) + ' FCFA', W), bold: true, doubleHeight: true });
  blank();

  // Payment
  sep();
  left(cols('Paiement', data.paymentLabel, W));
  if (data.mobileOperator) left(cols('Opérateur', data.mobileOperator === 'mtn' ? 'MTN MoMo' : 'Orange Money', W));
  if (data.mobileReference) left(cols('Référence', data.mobileReference, W));
  if (data.amountReceived) left(cols('Reçu', data.amountReceived.toLocaleString(getCurrentBcp47()), W));
  if (data.changeGiven != null) left(cols('Monnaie', data.changeGiven.toLocaleString(getCurrentBcp47()), W));

  // Footer
  sep();
  if (data.shopFooter) center(data.shopFooter);
  blank();

  return lines;
}

// ── Build minimal HTML for thermal printing via webContents.print() ───────────

export function buildReceiptHtml(sale: Sale, shop: ShopSettings, paymentLabel: string): string {
  const w = shop.paperWidth === '58' ? '58mm' : '80mm';
  const data: ThermalReceiptData = {
    shopName:       shop.nom,
    shopAddress:    shop.adresse || undefined,
    shopPhone:      shop.telephone || undefined,
    shopHeader:     shop.enteteRecu || undefined,
    shopFooter:     shop.piedPageRecu || undefined,
    receiptNumber:  sale.saleNumber,
    date:           new Date(sale.date),
    cashierName:    sale.userName,
    customerName:   sale.customerName,
    items:          sale.items.map(item => ({
      nom:        item.nom,
      quantity:   item.quantity,
      unitPrice:  item.prixUnitaire ?? item.prixVente,
      total:      item.quantity * (item.prixUnitaire ?? item.prixVente),
      negotiated: !!item.negotiated,
      origPrice:  item.negotiated ? item.prixVente : undefined,
    })),
    subtotal:       sale.subtotal,
    discount:       sale.discount,
    total:          sale.total,
    paymentLabel,
    mobileOperator: sale.mobileOperator,
    mobileReference:sale.mobileReference,
    amountReceived: sale.amountReceived,
    changeGiven:    sale.changeGiven,
    paperWidth:     shop.paperWidth,
  };

  const lines = buildLines(data);

  const lineHtml = lines.map(l => {
    const cls = [
      l.center ? 'c' : '',
      l.bold ? 'b' : '',
      l.doubleHeight ? 'dh' : '',
    ].filter(Boolean).join(' ');
    const esc = l.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return cls ? `<div class="${cls}">${esc}</div>` : `<div>${esc}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  @page { size: ${w} auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    line-height: 1.3;
    width: ${w};
    margin: 0;
    padding: 3mm 2mm 6mm;
    color: #000;
    background: #fff;
  }
  div { white-space: pre; overflow: hidden; }
  .c  { text-align: center; }
  .b  { font-weight: bold; }
  .dh { font-size: 12pt; font-weight: bold; }
</style>
</head><body>
${lineHtml}
</body></html>`;
}
