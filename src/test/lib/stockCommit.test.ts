import { describe, expect, it } from 'vitest';
import {
  MAX_ATOMIC_INVENTORY_ADJUSTMENTS,
  validateStockCommit,
  type StockCommitPayload,
} from '@/services/firestoreService';

const manualPayload = (): StockCommitPayload => ({
  operation: {
    operationId: 'stock-m1',
    kind: 'manual',
    date: new Date('2026-01-01T10:00:00Z'),
    userId: 'manager-1',
    userName: 'Manager',
  },
  stockDeltas: [{ productId: 'p1', delta: 4 }],
  movements: [{
    id: 'm1',
    operationId: 'stock-m1',
    date: new Date('2026-01-01T10:00:00Z'),
    productId: 'p1',
    productName: 'Produit',
    type: 'entrée',
    quantity: 4,
    stockBefore: 2,
    stockAfter: 6,
    userId: 'manager-1',
    userName: 'Manager',
  }],
});

describe('validateStockCommit', () => {
  it('accepts a coherent operation with one stable marker and movement', () => {
    expect(() => validateStockCommit(manualPayload())).not.toThrow();
  });

  it('rejects a movement whose operation or quantity differs from the stock delta', () => {
    const wrongOperation = manualPayload();
    wrongOperation.movements[0].operationId = 'other';
    expect(() => validateStockCommit(wrongOperation)).toThrow(/Mouvement/);

    const wrongQuantity = manualPayload();
    wrongQuantity.movements[0].quantity = 5;
    expect(() => validateStockCommit(wrongQuantity)).toThrow(/Quantité/);
  });

  it('rejects duplicate products and batches above Firestore atomic limits', () => {
    const duplicate = manualPayload();
    duplicate.stockDeltas.push({ productId: 'p1', delta: 1 });
    duplicate.movements.push({ ...duplicate.movements[0], id: 'm2', quantity: 1 });
    expect(() => validateStockCommit(duplicate)).toThrow(/dupliqué/);

    expect(MAX_ATOMIC_INVENTORY_ADJUSTMENTS).toBe(249);
  });
});
