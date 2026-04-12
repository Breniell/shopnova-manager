import { describe, it, expect, beforeEach } from 'vitest';
import { useStockStore } from '@/stores/useStockStore';
import type { StockMovement } from '@/stores/useStockStore';

const seedMovements: Omit<StockMovement, 'id'>[] = [
  { date: new Date(), productId: 'p1', productName: 'Bière Castel', type: 'entrée',     quantity: 48, stockBefore: 72,  stockAfter: 120, userId: '1', userName: 'Marie Nguema', supplier: 'Brasseries du Cameroun', unitPrice: 450 },
  { date: new Date(), productId: 'p3', productName: 'Riz Thaï 5kg', type: 'entrée',     quantity: 20, stockBefore: 10,  stockAfter: 30,  userId: '1', userName: 'Marie Nguema', supplier: 'SOCOPRAL',              unitPrice: 3500 },
  { date: new Date(), productId: 'p9', productName: 'Lait Nido',    type: 'entrée',     quantity: 15, stockBefore: 5,   stockAfter: 20,  userId: '1', userName: 'Marie Nguema', supplier: 'Nestlé Cameroun',       unitPrice: 3200 },
  { date: new Date(), productId: 'p1', productName: 'Bière Castel', type: 'vente',      quantity: -6, stockBefore: 126, stockAfter: 120, userId: '2', userName: 'Paul Mbarga' },
  { date: new Date(), productId: 'p16', productName: 'Samsung A05', type: 'vente',      quantity: -1, stockBefore: 5,   stockAfter: 4,   userId: '1', userName: 'Marie Nguema' },
];

beforeEach(() => {
  localStorage.clear();
  useStockStore.setState({
    movements: seedMovements.map((m, i) => ({ ...m, id: `m${i + 1}` })),
  });
});

describe('useStockStore — initial state', () => {
  it('starts with 5 seed movements', () => {
    expect(useStockStore.getState().movements).toHaveLength(5);
  });

  it('movements have required fields', () => {
    const m = useStockStore.getState().movements[0];
    expect(m.id).toBeDefined();
    expect(m.productId).toBeDefined();
    expect(m.productName).toBeDefined();
    expect(m.type).toBeDefined();
    expect(typeof m.quantity).toBe('number');
    expect(typeof m.stockBefore).toBe('number');
    expect(typeof m.stockAfter).toBe('number');
  });
});

describe('useStockStore — addMovement', () => {
  const newMovement = {
    date: new Date(),
    productId: 'p1',
    productName: 'Bière Castel',
    type: 'entrée' as const,
    quantity: 48,
    stockBefore: 72,
    stockAfter: 120,
    userId: '1',
    userName: 'Marie Nguema',
    supplier: 'Brasseries du Cameroun',
    unitPrice: 450,
  };

  it('prepends the new movement to the list', () => {
    const before = useStockStore.getState().movements.length;
    useStockStore.getState().addMovement(newMovement);
    const movements = useStockStore.getState().movements;
    expect(movements).toHaveLength(before + 1);
    expect(movements[0].productId).toBe('p1');
  });

  it('assigns a unique id starting with "m"', () => {
    useStockStore.getState().addMovement(newMovement);
    const m = useStockStore.getState().movements[0];
    expect(m.id).toMatch(/^m\d+$/);
  });

  it('stores all movement fields correctly', () => {
    useStockStore.getState().addMovement(newMovement);
    const m = useStockStore.getState().movements[0];
    expect(m.productName).toBe('Bière Castel');
    expect(m.type).toBe('entrée');
    expect(m.quantity).toBe(48);
    expect(m.stockBefore).toBe(72);
    expect(m.stockAfter).toBe(120);
    expect(m.supplier).toBe('Brasseries du Cameroun');
    expect(m.unitPrice).toBe(450);
  });

  it('handles a sale movement (negative quantity)', () => {
    useStockStore.getState().addMovement({
      date: new Date(), productId: 'p1', productName: 'Bière Castel',
      type: 'vente', quantity: -6, stockBefore: 120, stockAfter: 114,
      userId: '2', userName: 'Paul Mbarga',
    });
    const m = useStockStore.getState().movements[0];
    expect(m.quantity).toBe(-6);
    expect(m.type).toBe('vente');
  });

  it('handles an adjustment movement', () => {
    useStockStore.getState().addMovement({
      date: new Date(), productId: 'p2', productName: 'Eau Supermont',
      type: 'ajustement', quantity: -2, stockBefore: 82, stockAfter: 80,
      userId: '1', userName: 'Marie Nguema', notes: 'Inventaire',
    });
    const m = useStockStore.getState().movements[0];
    expect(m.type).toBe('ajustement');
    expect(m.notes).toBe('Inventaire');
  });

  it('can add multiple movements', () => {
    const before = useStockStore.getState().movements.length;
    useStockStore.getState().addMovement({ ...newMovement });
    useStockStore.getState().addMovement({ ...newMovement, productId: 'p2' });
    expect(useStockStore.getState().movements).toHaveLength(before + 2);
  });
});
