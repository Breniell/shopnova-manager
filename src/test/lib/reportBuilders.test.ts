import { describe, it, expect } from 'vitest';
import { getExportLabels } from '@/lib/exportLabels';
import { salesLinesReport, productSalesReport, salesListReport, inventorySessionReport, dailySalesReport, periodSummaryReport } from '@/lib/reportBuilders';
import type { Sale } from '@/stores/useSaleStore';
import type { Product } from '@/stores/useProductStore';

const L = getExportLabels('fr');

const product = (id: string, prixAchat: number): Product => ({
  id, nom: id, categorie: 'Autre' as Product['categorie'], codeBarre: '', prixAchat, prixVente: 1000, stock: 5, seuilAlerte: 2,
});

function sale(n: number, items: Array<[string, string, number]>, status?: 'refunded'): Sale {
  const lines = items.map(([productId, nom, quantity]) => ({ productId, nom, prixVente: 1000, quantity }));
  const subtotal = lines.reduce((s, i) => s + i.quantity * 1000, 0);
  return {
    id: `s${n}`, saleNumber: `V-${n}`, date: new Date('2026-10-01T10:00:00'), items: lines,
    subtotal, discount: 0, total: subtotal, paymentMode: 'especes', userId: 'u', userName: 'Awa', status,
  } as Sale;
}

describe('rapports exportés', () => {
  // 67 ventes réparties sur 12 déclinaisons d'un même produit.
  const variants = Array.from({ length: 12 }, (_, i) => `perruque-${i}`);
  const sales = Array.from({ length: 67 }, (_, i) => sale(i + 1, [[variants[i % 12], `Perruque — ${i % 12}`, 1]]));
  const products = variants.map(v => product(v, 600));

  it('exporte les 67 ventes dans la liste des ventes', () => {
    expect(salesListReport(L, sales).csvRows).toHaveLength(67);
  });

  it('exporte une ligne par article vendu, toutes déclinaisons comprises', () => {
    const r = salesLinesReport(L, sales, products);
    expect(r.csvRows).toHaveLength(67);
    expect(new Set(r.csvRows.map(row => row[5])).size).toBe(12);
  });

  it('liste toutes les déclinaisons vendues, pas seulement un top 10', () => {
    expect(productSalesReport(L, sales, products).csvRows).toHaveLength(12);
  });

  it('exclut les ventes annulées des totaux mais les garde visibles', () => {
    const all = [sale(1, [['a', 'A', 2]]), sale(2, [['a', 'A', 5]], 'refunded')];
    const r = salesLinesReport(L, all, [product('a', 400)]);
    expect(r.csvRows).toHaveLength(2);
    expect(r.csvRows[1][16]).toBe(L.statusCancelled);
    expect(r.totals?.[8]).toBe('2');
  });

  it('écrit les montants en nombres bruts dans le CSV', () => {
    const r = salesLinesReport(L, [sale(1, [['a', 'A', 3]])], [product('a', 400)]);
    expect(r.csvRows[0][12]).toBe('3000');
    expect(r.csvRows[0][14]).toBe('1800');
  });

  it("détaille une session d'inventaire avec écart et valeur", () => {
    const session = {
      id: 'i1', numero: 'INV-2026-001', scope: 'complet', status: 'validated', createdAt: '2026-10-01T08:00:00', createdBy: 'u',
      createdByName: 'Awa', validatedAt: '2026-10-01T18:00:00', validatedByName: 'Awa',
      lines: [
        { productId: 'a', productName: 'A', stockTheorique: 10, stockCompte: 8, ecart: -2, reason: 'casse' },
        { productId: 'b', productName: 'B', stockTheorique: 4, stockCompte: null, ecart: 0 },
      ],
    } as unknown as Parameters<typeof inventorySessionReport>[1];
    const r = inventorySessionReport(L, session, [product('a', 500), product('b', 100)]);
    expect(r.csvRows).toHaveLength(2);
    expect(r.csvRows[0][5]).toBe('-2');
    expect(r.csvRows[0][6]).toBe('-1000');
    expect(r.csvRows[1][4]).toBe('');
    expect(r.pdfRows[1][4]).toBe(L.uncounted);
  });

  it('jour par jour : inclut les jours sans vente et le résultat net', () => {
    const r = dailySalesReport(L, [sale(1, [['a', 'A', 2]])], [], [product('a', 400)], new Date('2026-09-29T00:00:00'), new Date('2026-10-02T00:00:00'));
    expect(r.csvRows).toHaveLength(4);
    expect(r.csvRows[2][3]).toBe('2000');
    expect(r.csvRows[2][6]).toBe('1200');
  });

  it("synthèse : chiffre d'affaires, dépenses et bénéfice net", () => {
    const exp = [{ id: 'e', date: new Date('2026-10-01'), categorie: 'loyer', description: '', montant: 500, paymentMode: 'especes', userId: 'u', userName: 'u' }] as never;
    const r = periodSummaryReport(L, [sale(1, [['a', 'A', 2]])], exp, [product('a', 400)], () => 'Loyer');
    const net = r.csvRows.find(row => row[1] === L.kNet);
    expect(net?.[2]).toBe('700');
  });
});
