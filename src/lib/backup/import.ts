import { useProductStore } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { useSupplierStore } from '@/stores/useSupplierStore';
import { useExpenseStore } from '@/stores/useExpenseStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { useStockStore } from '@/stores/useStockStore';
import { useInventoryStore } from '@/stores/useInventoryStore';
import { usePaymentStore } from '@/stores/usePaymentStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useCaisseStore } from '@/stores/useCaisseStore';
import { z } from 'zod';
import { getBoutiqueId } from '@/services/boutiqueService';
import {
  fsSaveSettings,
  fsSaveProduct, fsSaveSale, fsSaveCustomer, fsSaveSupplier,
  fsSaveExpense, fsSaveCashSession, fsSaveCashOut, fsRestoreMovement,
  fsSaveInventorySession, fsRestorePayment, fsSaveUser,
  fsSaveCloture, fsSaveSaleCounter,
} from '@/services/firestoreService';

import {
  type BackupFile,
  type BackupData,
  BACKUP_FORMAT,
  SUPPORTED_BACKUP_VERSIONS,
  BACKUP_REMINDER_KEY,
} from './types';
import { verifyChecksum, decryptBackupData } from './backupCrypto';
import { verifyBackupManifest } from './manifest';

// ─── Versioned payload validation ────────────────────────────────────────────

const nonEmptyId = z.string().trim().min(1).max(200);
const finiteNumber = z.number().finite();
const identifiedRecord = z.object({ id: nonEmptyId }).passthrough();

const userV1Schema = identifiedRecord.extend({
  role: z.enum(['gérant', 'caissier']),
  pin: z.string().regex(/^[0-9a-f]{64}$/i),
  hashAlgo: z.enum(['sha256', 'pbkdf2']).optional(),
  salt: z.string().regex(/^[0-9a-f]+$/i).optional(),
}).superRefine((user, ctx) => {
  if (user.hashAlgo === 'pbkdf2' && !user.salt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['salt'], message: 'PBKDF2 requires a salt' });
  }
});

const productV1Schema = identifiedRecord.extend({
  nom: z.string().trim().min(1).max(500),
  stock: finiteNumber,
  prixAchat: finiteNumber.nonnegative(),
  prixVente: finiteNumber.nonnegative(),
});

const saleItemV1Schema = z.object({
  productId: nonEmptyId,
  quantity: finiteNumber.positive(),
  prixVente: finiteNumber.nonnegative(),
  prixUnitaire: finiteNumber.nonnegative().optional(),
}).passthrough();

const saleV1Schema = identifiedRecord.extend({
  saleNumber: z.string().trim().min(1).max(200),
  items: z.array(saleItemV1Schema).min(1),
  subtotal: finiteNumber.nonnegative(),
  discount: finiteNumber.min(0).max(100),
  total: finiteNumber.nonnegative(),
  // Historical v1 exports predate the explicit status field.
  status: z.enum(['completed', 'refunded']).optional(),
});

const paymentV1Schema = identifiedRecord.extend({
  saleId: nonEmptyId,
  amount: finiteNumber.positive(),
});

const expenseV1Schema = identifiedRecord.extend({
  montant: finiteNumber.positive(),
});

function uniqueIds<T extends { id: string }>(items: T[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'id'], message: `Duplicate id: ${item.id}` });
    }
    seen.add(item.id);
  });
}

function identifiedArray<T extends z.ZodTypeAny>(schema: T) {
  return z.array(schema).superRefine((items, ctx) => uniqueIds(items as Array<{ id: string }>, ctx));
}

const backupDataV1Schema = z.object({
  settings: z.object({
    nom: z.string().trim().min(1).max(500),
    devise: z.string().trim().min(1).max(20),
    langue: z.string().trim().min(2).max(10),
  }).passthrough(),
  products: identifiedArray(productV1Schema),
  sales: identifiedArray(saleV1Schema),
  customers: identifiedArray(identifiedRecord),
  suppliers: identifiedArray(identifiedRecord),
  expenses: identifiedArray(expenseV1Schema),
  cashSessions: identifiedArray(identifiedRecord),
  cashOuts: identifiedArray(identifiedRecord),
  stockMovements: identifiedArray(identifiedRecord),
  inventorySessions: identifiedArray(identifiedRecord),
  payments: identifiedArray(paymentV1Schema),
  users: identifiedArray(userV1Schema),
  clotures: identifiedArray(identifiedRecord).optional(),
  saleCounter: z.number().int().nonnegative().optional(),
}).passthrough();

/** Validate the complete v1 payload before any Zustand store is mutated. */
export function validateBackupDataV1(input: unknown): BackupData {
  const result = backupDataV1Schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`invalid_backup_data:${issue?.path.join('.') || 'root'}:${issue?.message || 'unknown'}`);
  }
  // Validation must not reorder keys or normalize historical payload values:
  // preserve the exact decoded object after successful validation.
  return input as BackupData;
}

// ─── Parse result ─────────────────────────────────────────────────────────────

export type RestoreErrorCode =
  | 'invalid_format'
  | 'invalid_version'
  | 'checksum_mismatch'
  | 'manifest_mismatch'
  | 'wrong_password'
  | 'unknown';

export interface ParseResult {
  ok: boolean;
  error?: RestoreErrorCode;
  data?: BackupData;
  meta?: Omit<BackupFile, 'data'>;
}

// ─── Parse & validate ─────────────────────────────────────────────────────────

/**
 * Parse a backup file, optionally decrypt it, and verify integrity.
 * Returns the plaintext BackupData on success.
 */
export async function parseBackupFile(
  file: File,
  password?: string
): Promise<ParseResult> {
  let raw: string;
  try {
    raw = await file.text();
  } catch {
    return { ok: false, error: 'unknown' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid_format' };
  }

  // Format guard
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Record<string, unknown>).format !== BACKUP_FORMAT
  ) {
    return { ok: false, error: 'invalid_format' };
  }

  const bf = parsed as BackupFile;

  // Version guard
  if (!SUPPORTED_BACKUP_VERSIONS.includes(bf.version as 1 | 2)) {
    return { ok: false, error: 'invalid_version' };
  }

  const { data: rawData, ...meta } = bf;

  // Decrypt if needed
  let data: unknown;
  if (bf.encrypted) {
    if (!password) {
      // Caller must prompt for password — signal this via wrong_password
      return { ok: false, error: 'wrong_password', meta };
    }
    try {
      data = await decryptBackupData(bf.data as string, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'wrong_password') return { ok: false, error: 'wrong_password', meta };
      return { ok: false, error: 'unknown' };
    }
  } else {
    data = bf.data;
  }

  // Verify the original decoded object before Zod reconstructs object key order.
  const valid = await verifyChecksum(data as BackupData, bf.checksum);
  if (!valid) return { ok: false, error: 'checksum_mismatch', meta };

  // v2 adds an independently checkable inventory of every collection. Keep
  // accepting historical v1 files, which predate the manifest.
  if (bf.version === 2 && (!bf.manifest || !verifyBackupManifest(data as BackupData, bf.manifest, bf.checksum))) {
    return { ok: false, error: 'manifest_mismatch', meta };
  }

  try {
    data = validateBackupDataV1(data);
  } catch {
    return { ok: false, error: 'invalid_format', meta };
  }

  return { ok: true, data: data as BackupData, meta };
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export interface RestoreProgress {
  done: number;
  total: number;
  label: string;
}

export interface RestoreTask {
  label: string;
  fn: () => Promise<unknown>;
}

export class BackupRestorePersistenceError extends Error {
  constructor(public readonly failures: Array<{ label: string; reason: string }>) {
    super(`Échec de persistance de ${failures.length} élément(s) restauré(s).`);
    this.name = 'BackupRestorePersistenceError';
  }
}

export async function executeRestoreTasks(
  tasks: RestoreTask[],
  onProgress?: (p: RestoreProgress) => void,
): Promise<void> {
  const failures: Array<{ label: string; reason: string }> = [];
  const total = tasks.length;
  let done = 0;
  const BATCH = 10;

  for (let i = 0; i < tasks.length; i += BATCH) {
    const slice = tasks.slice(i, i + BATCH);
    const results = await Promise.allSettled(slice.map(task => task.fn()));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failures.push({ label: slice[index].label, reason });
      }
    });
    done += slice.length;
    onProgress?.({ done, total, label: slice[0]?.label ?? '' });
  }

  if (failures.length > 0) throw new BackupRestorePersistenceError(failures);
}

/** Persist first; mutate local stores only when every persistence task succeeded. */
export async function persistRestoreBeforeStoreMutation(
  tasks: RestoreTask[],
  applyStores: () => void,
  onProgress?: (p: RestoreProgress) => void,
): Promise<void> {
  // Some remote writes may already have succeeded if a later task fails. The
  // caller receives BackupRestorePersistenceError and local stores stay intact.
  await executeRestoreTasks(tasks, onProgress);
  applyStores();
}

/**
 * Restore a validated BackupData into all stores and sync to Firestore.
 * onProgress is called with incremental progress (for the UI).
 */
export async function restoreBackupData(
  data: BackupData,
  onProgress?: (p: RestoreProgress) => void
): Promise<void> {
  const validatedData = validateBackupDataV1(data);
  data = validatedData;
  const bid = getBoutiqueId();

  // 1. Persist to Firestore (offline writes resolve once queued durably by the SDK).
  const tasks: RestoreTask[] = [
    { label: 'settings',    fn: () => fsSaveSettings(bid, data.settings) },
    ...data.users.map(u             => ({ label: 'users',    fn: () => fsSaveUser(bid, u) })),
    ...data.products.map(p          => ({ label: 'products', fn: () => fsSaveProduct(bid, p) })),
    ...data.sales.map(s             => ({ label: 'sales',    fn: () => fsSaveSale(bid, s) })),
    ...data.customers.map(c         => ({ label: 'customers', fn: () => fsSaveCustomer(bid, c) })),
    ...data.suppliers.map(s         => ({ label: 'suppliers', fn: () => fsSaveSupplier(bid, s) })),
    ...data.expenses.map(e          => ({ label: 'expenses',  fn: () => fsSaveExpense(bid, e) })),
    ...data.cashSessions.map(s      => ({ label: 'sessions',  fn: () => fsSaveCashSession(bid, s) })),
    ...(data.cashOuts ?? []).map(c  => ({ label: 'cashouts',  fn: () => fsSaveCashOut(bid, c) })),
    ...data.stockMovements.map(m    => ({ label: 'movements', fn: () => fsRestoreMovement(bid, m) })),
    ...data.inventorySessions.map(i => ({ label: 'inventory', fn: () => fsSaveInventorySession(bid, i) })),
    ...data.payments.map(p          => ({ label: 'payments',  fn: () => fsRestorePayment(bid, p) })),
    ...(data.clotures ?? []).map(c  => ({ label: 'clotures',  fn: () => fsSaveCloture(bid, c) })),
    ...(typeof data.saleCounter === 'number'
      ? [{ label: 'saleCounter', fn: () => fsSaveSaleCounter(bid, data.saleCounter!) }]
      : []),
  ];

  // 2. Apply to Zustand only after every persistence task was accepted.
  await persistRestoreBeforeStoreMutation(tasks, () => {
    useSettingsStore.getState()._setSettings(data.settings);
    useProductStore.getState()._setProducts(data.products);
    useSaleStore.getState()._setSales(data.sales);
    useCustomerStore.getState()._setCustomers(data.customers);
    useSupplierStore.getState()._setSuppliers(data.suppliers);
    useExpenseStore.getState()._setExpenses(data.expenses);
    useCashSessionStore.getState()._setSessions(data.cashSessions);
    useCashSessionStore.getState()._setCashOuts(data.cashOuts ?? []);
    useStockStore.getState()._setMovements(data.stockMovements);
    useInventoryStore.getState()._setSessions(data.inventorySessions);
    usePaymentStore.getState()._setPayments(data.payments);
    useAuthStore.getState()._setUsers(data.users);
    useCaisseStore.getState()._setClotures(data.clotures ?? []);
    if (typeof data.saleCounter === 'number') useSaleStore.getState()._setSaleCounter(data.saleCounter);
  }, onProgress);

  // Mark as backed-up so the reminder resets
  try { localStorage.setItem(BACKUP_REMINDER_KEY, new Date().toISOString()); } catch { /* ignore */ }
}
