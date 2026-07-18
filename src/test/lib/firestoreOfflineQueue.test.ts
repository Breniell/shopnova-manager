import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  batchCommit: vi.fn(async () => {}),
  batchSet: vi.fn(),
  batchUpdate: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: true,
  db: {},
}));

vi.mock('@/services/boutiqueService', () => ({
  getBoutiqueId: () => 'cloud-tenant',
  getLocalSnapshotTenantId: () => 'cloud-tenant',
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    doc: vi.fn((_db: unknown, path: string) => ({ path })),
    writeBatch: vi.fn(() => ({
      set: mocks.batchSet,
      update: mocks.batchUpdate,
      delete: vi.fn(),
      commit: mocks.batchCommit,
    })),
    runTransaction: vi.fn(),
    Timestamp: class Timestamp {
      private readonly value: Date;
      constructor(value = new Date()) { this.value = value; }
      static fromDate(value: Date) { return new this(value); }
      static now() { return new this(); }
      toDate() { return this.value; }
    },
  };
});

import { fsCommitSale, type SaleCommitPayload } from '@/services/firestoreService';
import { saveLocalSnapshotNow, hydrateLocalSnapshot } from '@/lib/localSnapshot';
import { useSaleStore, type Sale } from '@/stores/useSaleStore';

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
}

describe('cloud tenant offline durability', () => {
  const sale: Sale = {
    id: 'sale-offline-1',
    saleNumber: 'LGW-2026-TEST-00001',
    date: new Date('2026-07-13T10:00:00Z'),
    items: [],
    subtotal: 500,
    discount: 0,
    total: 500,
    paymentMode: 'especes',
    userId: 'manager-1',
    userName: 'Ada Manager',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setOnline(false);
    useSaleStore.setState({ sales: [], cart: [], discount: 0, saleCounter: 0 });
  });

  afterEach(() => {
    setOnline(true);
    localStorage.clear();
    useSaleStore.setState({ sales: [], cart: [], discount: 0, saleCounter: 0 });
  });

  it('queues the Firestore batch and independently restores the local snapshot after restart', async () => {
    const commit: SaleCommitPayload = {
      operation: {
        operationId: sale.id,
        saleId: sale.id,
        date: sale.date,
        userId: sale.userId,
        userName: sale.userName,
      },
      sale,
      stockDeltas: [],
      movements: [],
    };

    await fsCommitSale('cloud-tenant', commit);
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1);
    expect(mocks.batchSet).toHaveBeenCalledTimes(2);

    useSaleStore.setState({ sales: [sale] });
    await saveLocalSnapshotNow();
    useSaleStore.setState({ sales: [] });

    await expect(hydrateLocalSnapshot()).resolves.toBe(true);
    expect(useSaleStore.getState().sales).toHaveLength(1);
    expect(useSaleStore.getState().sales[0]).toMatchObject({ id: sale.id, total: 500 });
    expect(useSaleStore.getState().sales[0].date).toBeInstanceOf(Date);
  });
});
