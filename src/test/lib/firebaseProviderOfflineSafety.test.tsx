import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  initBoutique: vi.fn(async () => 'cloud-tenant'),
  getBoutiqueId: vi.fn(() => 'cloud-tenant'),
  activateLocalOfflineBoutique: vi.fn(() => 'cloud-tenant'),
  fsIsBoutiqueInitialized: vi.fn(async () => true),
  fsInitializeBoutique: vi.fn(async () => {}),
  fsLoadSettings: vi.fn(async () => null),
  fsLoadUsers: vi.fn(async () => []),
  fsLoadProducts: vi.fn(async () => []),
  fsLoadSales: vi.fn(async () => []),
  fsLoadMovements: vi.fn(async () => []),
  fsLoadSuppliers: vi.fn(async () => []),
  fsLoadCustomers: vi.fn(async () => []),
  fsLoadPayments: vi.fn(async () => []),
  fsLoadExpenses: vi.fn(async () => []),
  fsLoadCashSessions: vi.fn(async () => []),
  fsLoadCashOuts: vi.fn(async () => []),
  fsLoadInventorySessions: vi.fn(async () => []),
  fsLoadClotures: vi.fn(async () => []),
  fsLoadSaleCounter: vi.fn(async () => 0),
  hydrateLocalSnapshot: vi.fn(async () => true),
  installLocalSnapshotPersistence: vi.fn(),
  retryAll: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: true,
  db: {},
}));

vi.mock('@/services/boutiqueService', () => ({
  initBoutique: mocks.initBoutique,
  getBoutiqueId: mocks.getBoutiqueId,
  activateLocalOfflineBoutique: mocks.activateLocalOfflineBoutique,
  getLocalSnapshotTenantId: () => 'cloud-tenant',
  getBoutiqueRecoveryStatus: vi.fn(async () => ({ isRecoveryEnabled: false })),
}));

vi.mock('@/services/firestoreService', () => ({
  fsIsBoutiqueInitialized: mocks.fsIsBoutiqueInitialized,
  fsInitializeBoutique: mocks.fsInitializeBoutique,
  fsLoadSettings: mocks.fsLoadSettings,
  fsLoadUsers: mocks.fsLoadUsers,
  fsLoadProducts: mocks.fsLoadProducts,
  fsLoadSales: mocks.fsLoadSales,
  fsLoadMovements: mocks.fsLoadMovements,
  fsLoadSuppliers: mocks.fsLoadSuppliers,
  fsLoadCustomers: mocks.fsLoadCustomers,
  fsLoadPayments: mocks.fsLoadPayments,
  fsLoadExpenses: mocks.fsLoadExpenses,
  fsLoadCashSessions: mocks.fsLoadCashSessions,
  fsLoadCashOuts: mocks.fsLoadCashOuts,
  fsLoadInventorySessions: mocks.fsLoadInventorySessions,
  fsLoadClotures: mocks.fsLoadClotures,
  fsLoadSaleCounter: mocks.fsLoadSaleCounter,
  fsSaveUser: vi.fn(async () => {}),
  fsDeleteUser: vi.fn(async () => {}),
  fsGetLoginAttempts: vi.fn(async () => null),
  fsSetLoginAttempts: vi.fn(async () => {}),
}));

vi.mock('@/lib/localSnapshot', () => ({
  hydrateLocalSnapshot: mocks.hydrateLocalSnapshot,
  installLocalSnapshotPersistence: mocks.installLocalSnapshotPersistence,
}));

vi.mock('@/lib/outbox', () => ({ retryAll: mocks.retryAll }));
vi.mock('@/services/registryService', () => ({ sendRegistryHeartbeat: vi.fn(async () => {}) }));

vi.mock('firebase/firestore', () => ({
  onSnapshot: mocks.onSnapshot,
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn((value) => value),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  Timestamp: class Timestamp {
    static fromDate(value: Date) { return { toDate: () => value }; }
  },
}));

import { FirebaseProvider, bootstrapFirebase } from '@/components/FirebaseProvider';
import { useProductStore, type Product } from '@/stores/useProductStore';

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
}

describe('FirebaseProvider offline bootstrap safety', () => {
  const localProduct: Product = {
    id: 'local-newer',
    nom: 'Snapshot autonome',
    categorie: 'Autre',
    codeBarre: '',
    prixAchat: 10,
    prixVente: 20,
    stock: 3,
    seuilAlerte: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
    useProductStore.getState()._setProducts([]);
  });

  afterEach(() => {
    setOnline(true);
    useProductStore.getState()._setProducts([]);
  });

  it('never initializes a boutique when the existence probe fails', async () => {
    const networkError = Object.assign(new Error('network unavailable'), {
      code: 'firestore/unavailable',
    });
    mocks.fsIsBoutiqueInitialized.mockRejectedValueOnce(networkError);

    await expect(bootstrapFirebase()).rejects.toBe(networkError);
    expect(mocks.fsInitializeBoutique).not.toHaveBeenCalled();
  });

  it('does not disguise a cloud permission failure as a successful local bootstrap', async () => {
    const denied = Object.assign(new Error('permission denied'), { code: 'permission-denied' });
    mocks.fsLoadProducts.mockRejectedValueOnce(denied);

    await expect(bootstrapFirebase()).rejects.toBe(denied);
    expect(mocks.fsInitializeBoutique).not.toHaveBeenCalled();
  });

  it('treats an empty connected collection as authoritative instead of retaining stale local data', async () => {
    useProductStore.getState()._setProducts([localProduct]);

    await bootstrapFirebase(false);

    expect(mocks.fsLoadProducts).toHaveBeenCalledTimes(1);
    expect(useProductStore.getState().products).toEqual([]);
  });

  it('keeps the autonomous snapshot and starts no cache loader or listener offline', async () => {
    setOnline(false);
    useProductStore.getState()._setProducts([localProduct]);

    render(
      <FirebaseProvider>
        <div data-testid="offline-app">ready</div>
      </FirebaseProvider>,
    );

    await screen.findByTestId('offline-app');
    await waitFor(() => expect(mocks.initBoutique).toHaveBeenCalledTimes(1));

    expect(useProductStore.getState().products).toEqual([localProduct]);
    expect(mocks.fsIsBoutiqueInitialized).not.toHaveBeenCalled();
    expect(mocks.fsLoadProducts).not.toHaveBeenCalled();
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    expect(mocks.retryAll).not.toHaveBeenCalled();
  });

  it('hydrates the Firestore cache once for an upgrade that has no autonomous snapshot yet', async () => {
    setOnline(false);
    const cachedProduct = { ...localProduct, id: 'legacy-firestore-cache' };
    mocks.hydrateLocalSnapshot.mockResolvedValueOnce(false);
    mocks.fsLoadProducts.mockResolvedValueOnce([cachedProduct]);

    render(
      <FirebaseProvider>
        <div data-testid="upgraded-offline-app">ready</div>
      </FirebaseProvider>,
    );

    await screen.findByTestId('upgraded-offline-app');
    expect(mocks.fsIsBoutiqueInitialized).toHaveBeenCalledTimes(1);
    expect(mocks.fsLoadProducts).toHaveBeenCalledTimes(1);
    expect(useProductStore.getState().products).toEqual([cachedProduct]);
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
  });

  it('opens the local recovery shell when the cached Firebase Auth session is missing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const missingSession = Object.assign(new Error('local auth session missing'), {
      code: 'auth/local-session-missing',
    });
    mocks.initBoutique.mockRejectedValueOnce(missingSession);

    render(
      <FirebaseProvider>
        <div data-testid="recovery-shell">recovery available</div>
      </FirebaseProvider>,
    );

    await screen.findByTestId('recovery-shell');
    expect(mocks.activateLocalOfflineBoutique).toHaveBeenCalledTimes(1);
    expect(mocks.fsIsBoutiqueInitialized).not.toHaveBeenCalled();
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
