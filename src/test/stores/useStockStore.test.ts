import { describe, it, expect, beforeEach } from 'vitest';
import { useStockStore } from '@/stores/useStockStore';
import { useProductStore, type Product } from '@/stores/useProductStore';

const products: Product[] = [
  { id: 'p1', nom: 'Bière Castel', categorie: 'Boissons', codeBarre: '1', prixAchat: 450, prixVente: 600, stock: 72, seuilAlerte: 10 },
  { id: 'p2', nom: 'Eau', categorie: 'Boissons', codeBarre: '2', prixAchat: 200, prixVente: 300, stock: 20, seuilAlerte: 5 },
];

const entry = {
  date: new Date('2026-01-01T10:00:00Z'),
  productId: 'p1',
  productName: 'Bière Castel',
  type: 'entrée' as const,
  quantity: 48,
  userId: '1',
  userName: 'Marie Nguema',
  supplier: 'Brasseries du Cameroun',
  unitPrice: 450,
};

beforeEach(() => {
  localStorage.clear();
  useProductStore.setState({ products: products.map(product => ({ ...product })) });
  useStockStore.setState({ movements: [] });
});

describe('useStockStore - atomic manual stock changes', () => {
  it('updates product and immutable movement from the same operation', () => {
    const movement = useStockStore.getState().commitStockChange(entry);

    expect(useProductStore.getState().products[0].stock).toBe(120);
    expect(useStockStore.getState().movements).toEqual([movement]);
    expect(movement.stockBefore).toBe(72);
    expect(movement.stockAfter).toBe(120);
    expect(movement.operationId).toBe(`stock-${movement.id}`);
  });

  it('generates stable unique operation IDs for rapid consecutive changes', () => {
    const first = useStockStore.getState().commitStockChange(entry);
    const second = useStockStore.getState().commitStockChange({ ...entry, productId: 'p2', productName: 'Eau' });

    expect(first.id).toMatch(/^m\d+[a-z0-9]+$/);
    expect(second.id).not.toBe(first.id);
    expect(second.operationId).not.toBe(first.operationId);
  });

  it('records a negative inventory-style adjustment without going below zero', () => {
    const movement = useStockStore.getState().commitStockChange({
      ...entry,
      type: 'ajustement',
      quantity: -2,
      reason: 'casse',
    });

    expect(useProductStore.getState().products[0].stock).toBe(70);
    expect(movement.stockAfter).toBe(70);
    expect(movement.reason).toBe('casse');
  });

  it('rejects zero, fractional, negative-entry and underflow quantities without partial state', () => {
    const invalid = [
      { ...entry, quantity: 0 },
      { ...entry, quantity: 1.5 },
      { ...entry, quantity: -1 },
      { ...entry, type: 'ajustement' as const, quantity: -73 },
    ];

    invalid.forEach(change => expect(() => useStockStore.getState().commitStockChange(change)).toThrow());
    expect(useProductStore.getState().products[0].stock).toBe(72);
    expect(useStockStore.getState().movements).toHaveLength(0);
  });
});

describe('useStockStore - correction d\'un stock mal saisi', () => {
  const correction = (quantity: number) => ({
    ...entry,
    type: 'ajustement' as const,
    quantity,
    reason: 'erreur_saisie' as const,
    supplier: undefined,
    unitPrice: undefined,
  });

  it('corrige à la baisse un stock de départ trop élevé', () => {
    const movement = useStockStore.getState().commitStockChange(correction(-62));
    expect(useProductStore.getState().products[0].stock).toBe(10);
    expect(movement.stockBefore).toBe(72);
    expect(movement.stockAfter).toBe(10);
    expect(movement.reason).toBe('erreur_saisie');
  });

  it('corrige à la hausse un stock de départ trop faible', () => {
    useStockStore.getState().commitStockChange(correction(28));
    expect(useProductStore.getState().products[0].stock).toBe(100);
  });

  it('garde la trace de la correction dans l\'historique', () => {
    useStockStore.getState().commitStockChange(correction(-2));
    const [m] = useStockStore.getState().movements;
    expect(m.type).toBe('ajustement');
    expect(m.quantity).toBe(-2);
  });

  it('refuse de rendre le stock négatif', () => {
    expect(() => useStockStore.getState().commitStockChange(correction(-73))).toThrow();
    expect(useProductStore.getState().products[0].stock).toBe(72);
  });
});
