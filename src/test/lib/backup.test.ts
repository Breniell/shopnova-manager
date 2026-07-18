import { describe, it, expect, vi } from 'vitest';
import {
  computeChecksum,
  verifyChecksum,
  encryptBackupData,
  decryptBackupData,
} from '@/lib/backup/backupCrypto';
import {
  collectBackupData,
} from '@/lib/backup/export';
import {
  parseBackupFile,
  executeRestoreTasks,
  persistRestoreBeforeStoreMutation,
  BackupRestorePersistenceError,
} from '@/lib/backup/import';
import type { BackupData, BackupFile } from '@/lib/backup/types';
import { BACKUP_FORMAT } from '@/lib/backup/types';
import { movementRestoreContentsMatch, paymentRestoreContentsMatch } from '@/services/firestoreService';
import type { Payment } from '@/stores/usePaymentStore';
import type { StockMovement } from '@/stores/useStockStore';

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: { getState: () => ({ shop: { nom: 'Boutique Test', devise: 'XAF', langue: 'fr' } }) },
}));
vi.mock('@/stores/useProductStore', () => ({ useProductStore: { getState: () => ({ products: [{ id: 'p1' }] }) } }));
vi.mock('@/stores/useSaleStore', () => ({ useSaleStore: { getState: () => ({ sales: [] }) } }));
vi.mock('@/stores/useCustomerStore', () => ({ useCustomerStore: { getState: () => ({ customers: [] }) } }));
vi.mock('@/stores/useSupplierStore', () => ({ useSupplierStore: { getState: () => ({ suppliers: [] }) } }));
vi.mock('@/stores/useExpenseStore', () => ({ useExpenseStore: { getState: () => ({ expenses: [] }) } }));
vi.mock('@/stores/useCashSessionStore', () => ({
  useCashSessionStore: { getState: () => ({ sessions: [], cashOuts: [] }) },
}));
vi.mock('@/stores/useStockStore', () => ({ useStockStore: { getState: () => ({ movements: [] }) } }));
vi.mock('@/stores/useInventoryStore', () => ({ useInventoryStore: { getState: () => ({ sessions: [] }) } }));
vi.mock('@/stores/usePaymentStore', () => ({ usePaymentStore: { getState: () => ({ payments: [] }) } }));
vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ users: [{ id: 'u1', prenom: 'A', nom: 'B' }] }) },
}));
vi.mock('@/services/boutiqueService', () => ({ getBoutiqueId: () => 'bid-test' }));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const minimalData = (): BackupData => ({
  settings: {
    nom: 'Test Shop', adresse: '', telephone: '', email: '', nui: '',
    enteteRecu: '', piedPageRecu: '', devise: 'XAF', langue: 'fr',
    paperWidth: '80', openDrawerOnSale: false, autoPrintOnSale: false,
  },
  products:           [],
  sales:              [],
  customers:          [],
  suppliers:          [],
  expenses:           [],
  cashSessions:       [],
  cashOuts:           [],
  stockMovements:     [],
  inventorySessions:  [],
  payments:           [],
  users:              [],
});

function buildBackupFile(data: BackupData, checksum: string, extra: Record<string, unknown> = {}): BackupFile {
  return {
    format:     BACKUP_FORMAT,
    version:    1,
    exportedAt: new Date().toISOString(),
    boutiqueId: 'bid-test',
    appVersion: '1.5.0',
    checksum,
    encrypted:  false,
    data,
    ...extra,
  } as BackupFile;
}

const makeFile = (content: string) => new File([content], 'backup.json', { type: 'application/json' });

// ─── Checksum ─────────────────────────────────────────────────────────────────

describe('computeChecksum / verifyChecksum', () => {
  it('produces a 64-character hex string', async () => {
    const cs = await computeChecksum(minimalData());
    expect(cs).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', async () => {
    const data = minimalData();
    expect(await computeChecksum(data)).toBe(await computeChecksum(data));
  });

  it('verifyChecksum returns true for valid checksum', async () => {
    const data = minimalData();
    const cs   = await computeChecksum(data);
    expect(await verifyChecksum(data, cs)).toBe(true);
  });

  it('verifyChecksum detects any alteration', async () => {
    const data = minimalData();
    const cs   = await computeChecksum(data);
    const tampered = { ...data, settings: { ...data.settings, nom: 'Hacked' } };
    expect(await verifyChecksum(tampered, cs)).toBe(false);
  });
});

// ─── Encryption round-trip ────────────────────────────────────────────────────

describe('encryptBackupData / decryptBackupData', () => {
  const PASSWORD = 'S3cr3t!2024';

  it('round-trips plaintext data through encrypt→decrypt', async () => {
    const data      = minimalData();
    const encrypted = await encryptBackupData(data, PASSWORD);
    const recovered = await decryptBackupData(encrypted, PASSWORD);
    expect(JSON.stringify(recovered)).toBe(JSON.stringify(data));
  });

  it('encrypt with same data produces different ciphertext each time (random IV)', async () => {
    const data = minimalData();
    const c1   = await encryptBackupData(data, PASSWORD);
    const c2   = await encryptBackupData(data, PASSWORD);
    expect(c1).not.toBe(c2);
  });

  it('decryptBackupData throws "wrong_password" for bad password', async () => {
    const data      = minimalData();
    const encrypted = await encryptBackupData(data, PASSWORD);
    await expect(decryptBackupData(encrypted, 'wrong-password')).rejects.toThrow('wrong_password');
  });

  it('decryptBackupData throws for corrupted ciphertext', async () => {
    const data      = minimalData();
    const encrypted = await encryptBackupData(data, PASSWORD);
    const corrupted = encrypted.slice(0, -4) + 'XXXX';
    await expect(decryptBackupData(corrupted, PASSWORD)).rejects.toThrow();
  });
});

// ─── collectBackupData ────────────────────────────────────────────────────────

describe('collectBackupData', () => {
  it('returns a BackupData with all expected fields', () => {
    const data = collectBackupData();
    expect(data).toHaveProperty('settings');
    expect(data).toHaveProperty('products');
    expect(data).toHaveProperty('sales');
    expect(data).toHaveProperty('customers');
    expect(data).toHaveProperty('suppliers');
    expect(data).toHaveProperty('expenses');
    expect(data).toHaveProperty('cashSessions');
    expect(data).toHaveProperty('cashOuts');
    expect(data).toHaveProperty('stockMovements');
    expect(data).toHaveProperty('inventorySessions');
    expect(data).toHaveProperty('payments');
    expect(data).toHaveProperty('users');
  });

  it('includes at least one product from the mock store', () => {
    const data = collectBackupData();
    expect(data.products.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── parseBackupFile ──────────────────────────────────────────────────────────

describe('parseBackupFile', () => {
  it('rejects a non-JSON file', async () => {
    const file   = makeFile('not json at all');
    const result = await parseBackupFile(file);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_format');
  });

  it('rejects a valid JSON with wrong format field', async () => {
    const file   = makeFile(JSON.stringify({ format: 'something-else', version: 1 }));
    const result = await parseBackupFile(file);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_format');
  });

  it('rejects an unsupported version', async () => {
    const data  = minimalData();
    const cs    = await computeChecksum(data);
    const bf    = buildBackupFile(data, cs, { version: 99 } as unknown as Partial<BackupFile>);
    const file  = makeFile(JSON.stringify(bf));
    const result = await parseBackupFile(file);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_version');
  });

  it('rejects a file with tampered checksum', async () => {
    const data  = minimalData();
    const bf    = buildBackupFile(data, 'a'.repeat(64));   // wrong checksum
    const file  = makeFile(JSON.stringify(bf));
    const result = await parseBackupFile(file);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('checksum_mismatch');
  });

  it('accepts a valid plain backup', async () => {
    const data  = minimalData();
    const cs    = await computeChecksum(data);
    const bf    = buildBackupFile(data, cs);
    const file  = makeFile(JSON.stringify(bf));
    const result = await parseBackupFile(file);
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('rejects structurally invalid business data even with a valid checksum', async () => {
    const invalid = {
      ...minimalData(),
      users: [{
        id: 'u1', prenom: 'A', nom: 'B', role: 'superadmin',
        pin: '1234', color: '#000000',
      }],
    } as unknown as BackupData;
    const cs = await computeChecksum(invalid);
    const file = makeFile(JSON.stringify(buildBackupFile(invalid, cs)));

    const result = await parseBackupFile(file);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_format');
  });

  it('rejects duplicate identifiers in a collection', async () => {
    const baseProduct = {
      id: 'p1', nom: 'Produit', stock: 2, prixAchat: 100, prixVente: 150,
      categorie: 'test', codeBarre: '', seuilAlerte: 0,
    };
    const invalid = { ...minimalData(), products: [baseProduct, { ...baseProduct }] } as BackupData;
    const cs = await computeChecksum(invalid);
    const file = makeFile(JSON.stringify(buildBackupFile(invalid, cs)));

    const result = await parseBackupFile(file);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_format');
  });

  it('returns wrong_password when encrypted file is given no password', async () => {
    const data  = minimalData();
    const cs    = await computeChecksum(data);
    const enc   = await encryptBackupData(data, 'pw');
    const bf: BackupFile = {
      format: BACKUP_FORMAT, version: 1,
      exportedAt: new Date().toISOString(), boutiqueId: 'bid', appVersion: '1.5.0',
      checksum: cs, encrypted: true, data: enc,
    };
    const file  = makeFile(JSON.stringify(bf));
    const result = await parseBackupFile(file);  // no password
    expect(result.ok).toBe(false);
    expect(result.error).toBe('wrong_password');
  });

  it('round-trip: encrypted backup decrypts and validates correctly', async () => {
    const data  = minimalData();
    const cs    = await computeChecksum(data);
    const enc   = await encryptBackupData(data, 'pw123');
    const bf: BackupFile = {
      format: BACKUP_FORMAT, version: 1,
      exportedAt: new Date().toISOString(), boutiqueId: 'bid', appVersion: '1.5.0',
      checksum: cs, encrypted: true, data: enc,
    };
    const file   = makeFile(JSON.stringify(bf));
    const result = await parseBackupFile(file, 'pw123');
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.data)).toBe(JSON.stringify(data));
  });

  it('returns wrong_password for correct-format but wrong password', async () => {
    const data  = minimalData();
    const cs    = await computeChecksum(data);
    const enc   = await encryptBackupData(data, 'correct-pw');
    const bf: BackupFile = {
      format: BACKUP_FORMAT, version: 1,
      exportedAt: new Date().toISOString(), boutiqueId: 'bid', appVersion: '1.5.0',
      checksum: cs, encrypted: true, data: enc,
    };
    const file   = makeFile(JSON.stringify(bf));
    const result = await parseBackupFile(file, 'wrong-pw');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('wrong_password');
  });
});

describe('restore persistence', () => {
  it('rejects when any allSettled task fails instead of reporting success', async () => {
    const progress = vi.fn();
    const tasks = [
      { label: 'settings', fn: vi.fn().mockResolvedValue(undefined) },
      { label: 'sales', fn: vi.fn().mockRejectedValue(new Error('permission-denied')) },
    ];

    const promise = executeRestoreTasks(tasks, progress);

    await expect(promise).rejects.toBeInstanceOf(BackupRestorePersistenceError);
    await expect(promise).rejects.toMatchObject({
      failures: [{ label: 'sales', reason: 'permission-denied' }],
    });
    expect(progress).toHaveBeenLastCalledWith({ done: 2, total: 2, label: 'settings' });
  });

  it('does not mutate local stores when persistence is only partially successful', async () => {
    const applyStores = vi.fn();
    const tasks = [
      { label: 'products', fn: vi.fn().mockResolvedValue(undefined) },
      { label: 'sales', fn: vi.fn().mockRejectedValue(new Error('quota-exceeded')) },
    ];

    await expect(
      persistRestoreBeforeStoreMutation(tasks, applyStores),
    ).rejects.toBeInstanceOf(BackupRestorePersistenceError);

    expect(applyStores).not.toHaveBeenCalled();
  });
});

describe('immutable payment restore', () => {
  const historicalPayment = (): Payment => ({
    id: 'pay-1', saleId: 'sale-1', customerId: 'customer-1',
    date: new Date('2026-07-13T08:00:00.000Z'), amount: 500,
    channel: 'especes', userId: 'user-1', userName: 'Caissier',
  });

  it('treats the same historical payment as an idempotent success', () => {
    const restored = historicalPayment();
    const existing = { ...historicalPayment(), operationId: 'pay-1', kind: 'payment' as const };
    expect(paymentRestoreContentsMatch(existing, restored)).toBe(true);
  });

  it('detects different immutable content as a conflict', () => {
    const restored = historicalPayment();
    const existing = { ...historicalPayment(), amount: 700 };
    expect(paymentRestoreContentsMatch(existing, restored)).toBe(false);
  });
});

describe('immutable stock movement restore', () => {
  const movement = (): StockMovement => ({
    id: 'sale-s1-0', date: new Date('2026-07-13T08:00:00.000Z'),
    productId: 'p1', productName: 'Produit', type: 'vente', quantity: -2,
    stockBefore: 10, stockAfter: 8, userId: 'u1', userName: 'Caissier',
  });

  it('accepts an identical replay and detects changed immutable content', () => {
    expect(movementRestoreContentsMatch(movement(), { ...movement() })).toBe(true);
    expect(movementRestoreContentsMatch(movement(), { ...movement(), quantity: -3 })).toBe(false);
  });
});
