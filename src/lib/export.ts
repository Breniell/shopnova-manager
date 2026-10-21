/**
 * Export utilities - CSV and PDF.
 *
 * Security hardening:
 * - CSV: cells starting with =, +, -, @, | are prefixed with ' to prevent
 *   formula injection (spreadsheet formula injection / CSV injection).
 *   Plain numbers (« -12 », « 3.5 ») are left alone: they are not formulas and
 *   prefixing them would turn every negative quantity into text.
 * - PDF: all cell values are HTML-escaped before injection into the print
 *   window to prevent XSS via product names or customer data. The summary
 *   therefore takes structured `{ label, value }` items, never HTML: markup
 *   passed in a string would be escaped and printed literally.
 */
import { getCurrentBcp47 } from '@/utils/formatters';

// ─── CSV helpers ─────────────────────────────────────────────────────────────

const PLAIN_NUMBER = /^[-+]?\d+([.,]\d+)?$/;

/** Prevent formula injection in spreadsheet apps (Excel, LibreOffice). */
function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@|]/.test(value) && !PLAIN_NUMBER.test(value)) return `'${value}`;
  // Escape double quotes and wrap in quotes if value contains delimiter or newline
  if (value.includes(';') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿'; // UTF-8 BOM for Excel compatibility
  const csv = bom + [
    headers.map(sanitizeCsvCell).join(';'),
    ...rows.map(r => r.map(sanitizeCsvCell).join(';')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

// ─── PDF helpers ──────────────────────────────────────────────────────────────

/** Escape HTML special characters to prevent XSS in the print window. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Un chiffre clé en tête de rapport : « 1 250 000 FCFA » / « Chiffre d'affaires ». */
export interface ExportSummaryItem {
  label: string;
  value: string;
}

export type ExportAlign = 'left' | 'right' | 'center';

export interface ExportPdfOptions {
  /** Nom de la boutique, affiché sous le titre. */
  shopName?: string;
  /** Période et filtres appliqués : « Cette semaine - du 01/10 au 07/10 ». */
  subtitle?: string;
  /** Alignement de chaque colonne (par défaut : à gauche). */
  align?: ExportAlign[];
  /** Ligne de total, en pied de tableau (même nombre de cellules que les en-têtes). */
  totals?: string[];
  /** Libellé « Exporté le … à … ». */
  exportedOn?: string;
  /** Pied de page. */
  footer?: string;
}

function summaryHtml(item: ExportSummaryItem | string): string {
  if (typeof item === 'string') return `<div class="summary-item">${escapeHtml(item)}</div>`;
  return `<div class="summary-item"><strong>${escapeHtml(item.value)}</strong>${escapeHtml(item.label)}</div>`;
}

/**
 * Ouvre la fenêtre d'impression du rapport.
 * @returns false si le navigateur a bloqué l'ouverture de la fenêtre.
 */
export function exportPDF(
  title: string,
  headers: string[],
  rows: string[][],
  summary?: Array<ExportSummaryItem | string>,
  options: ExportPdfOptions = {},
): boolean {
  const { shopName, subtitle, align = [], totals, footer = 'Legwan - La gestion, réinventée.' } = options;
  const safeTitle = escapeHtml(title);
  const cls = (i: number) => (align[i] && align[i] !== 'left' ? ` class="${align[i]}"` : '');
  const bcp47 = getCurrentBcp47();
  const now = new Date();
  const stamp = `${options.exportedOn ?? 'Exporté le'} ${now.toLocaleDateString(bcp47, { day: '2-digit', month: 'long', year: 'numeric' })} - ${now.toLocaleTimeString(bcp47, { hour: '2-digit', minute: '2-digit' })}`;
  // Au-delà de 6 colonnes, le portrait écrase les libellés.
  const orientation = headers.length > 6 ? 'landscape' : 'portrait';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  @page { size: A4 ${orientation}; margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #1a1a2e; }
  .shop { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #A93200; margin-bottom: 2px; }
  h1 { font-size: 20px; margin-bottom: 4px; color: #0D0F1A; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 4px; }
  .stamp { font-size: 11px; color: #888; margin-bottom: 16px; }
  .summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
  .summary-item { background: #f4f4f8; padding: 8px 14px; border-radius: 6px; font-size: 12px; }
  .summary-item strong { display: block; font-size: 16px; color: #A93200; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #1E2236; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; }
  tr:nth-child(even) td { background: #fafafa; }
  .right { text-align: right; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }
  tfoot td { font-weight: 700; background: #f4f4f8; border-top: 2px solid #1E2236; }
  .empty { text-align: center; color: #888; padding: 20px; }
  .footer { margin-top: 16px; font-size: 10px; color: #999; text-align: center; }
  @media print { body { padding: 0; } th, tfoot td, .summary-item { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
${shopName ? `<div class="shop">${escapeHtml(shopName)}</div>` : ''}
<h1>${safeTitle}</h1>
${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
<div class="stamp">${escapeHtml(stamp)}</div>
${summary && summary.length > 0 ? `<div class="summary">${summary.map(summaryHtml).join('')}</div>` : ''}
<table><thead><tr>${headers.map((h, i) => `<th${cls(i)}>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.length === 0
    ? `<tr><td class="empty" colspan="${headers.length}">-</td></tr>`
    : rows.map(r => `<tr>${r.map((c, i) => `<td${cls(i)}>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
${totals ? `<tfoot><tr>${totals.map((c, i) => `<td${cls(i)}>${escapeHtml(c)}</td>`).join('')}</tr></tfoot>` : ''}
</table>
<div class="footer">${escapeHtml(footer)}</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
  return true;
}

// ─── Blob download ────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
