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
import { getBoutiqueId } from '@/services/boutiqueService';
import {
  fsSaveSettings,
  fsSaveProduct, fsSaveSale, fsSaveCustomer, fsSaveSupplier,
  fsSaveExpense, fsSaveCashSession, fsSaveCashOut, fsSaveMovement,
  fsSaveInventorySession, fsSavePayment, fsSaveUser,
} from '@/services/firestoreService';

import {
  type BackupFile,
  type BackupData,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_REMINDER_KEY,
} from './types';
import { verifyChecksum, decryptBackupData } from './backupCrypto';

// ─── Parse result ─────────────────────────────────────────────────────────────

export type RestoreErrorCode =
  | 'invalid_format'
  | 'invalid_version'
  | 'checksum_mismatch'
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
  if (bf.version !== BACKUP_VERSION) {
    return { ok: false, error: 'invalid_version' };
  }

  const { data: rawData, ...meta } = bf;

  // Decrypt if needed
  let data: BackupData;
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
    data = bf.data as BackupData;
  }

  // Integrity check
  const valid = await verifyChecksum(data, bf.checksum);
  if (!valid) return { ok: false, error: 'checksum_mismatch', meta };

  return { ok: true, data, meta };
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export interface RestoreProgress {
  done: number;
  total: number;
  label: string;
}

/**
 * Restore a validated BackupData into all stores and sync to Firestore.
 * onProgress is called with incremental progress (for the UI).
 */
export async function restoreBackupData(
  data: BackupData,
  onProgress?: (p: RestoreProgress) => void
): Promise<void> {
  const bid = getBoutiqueId();

  // 1. Push to Zustand stores (instant, synchronous)
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

  // 2. Persist to Firestore (fire-and-forget per record; offline → syncs on reconnect)
  type Task = { label: string; fn: () => Promise<unknown> };
  const tasks: Task[] = [
    { label: 'settings',    fn: () => fsSaveSettings(bid, data.settings) },
    ...data.users.map(u             => ({ label: 'users',    fn: () => fsSaveUser(bid, u) })),
    ...data.products.map(p          => ({ label: 'products', fn: () => fsSaveProduct(bid, p) })),
    ...data.sales.map(s             => ({ label: 'sales',    fn: () => fsSaveSale(bid, s) })),
    ...data.customers.map(c         => ({ label: 'customers', fn: () => fsSaveCustomer(bid, c) })),
    ...data.suppliers.map(s         => ({ label: 'suppliers', fn: () => fsSaveSupplier(bid, s) })),
    ...data.expenses.map(e          => ({ label: 'expenses',  fn: () => fsSaveExpense(bid, e) })),
    ...data.cashSessions.map(s      => ({ label: 'sessions',  fn: () => fsSaveCashSession(bid, s) })),
    ...(data.cashOuts ?? []).map(c  => ({ label: 'cashouts',  fn: () => fsSaveCashOut(bid, c) })),
    ...data.stockMovements.map(m    => ({ label: 'movements', fn: () => fsSaveMovement(bid, m) })),
    ...data.inventorySessions.map(i => ({ label: 'inventory', fn: () => fsSaveInventorySession(bid, i) })),
    ...data.payments.map(p          => ({ label: 'payments',  fn: () => fsSavePayment(bid, p) })),
  ];

  const total = tasks.length;
  let done = 0;

  // Process in batches of 10 to avoid overwhelming Firestore write limits
  const BATCH = 10;
  for (let i = 0; i < tasks.length; i += BATCH) {
    const slice = tasks.slice(i, i + BATCH);
    await Promise.allSettled(slice.map(t => t.fn()));
    done += slice.length;
    onProgress?.({ done, total, label: slice[0]?.label ?? '' });
  }

  // Mark as backed-up so the reminder resets
  try { localStorage.setItem(BACKUP_REMINDER_KEY, new Date().toISOString()); } catch { /* ignore */ }
}
