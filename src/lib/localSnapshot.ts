import { useSettingsStore } from '@/stores/useSettingsStore';
import { useProductStore } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useStockStore } from '@/stores/useStockStore';
import { useSupplierStore } from '@/stores/useSupplierStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { usePaymentStore } from '@/stores/usePaymentStore';
import { useExpenseStore } from '@/stores/useExpenseStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { useInventoryStore } from '@/stores/useInventoryStore';
import {
  deferCriticalSnapshotIfTransactionActive,
  onLocalStateTransactionCommit,
} from '@/lib/localStateTransaction';
import { useCaisseStore } from '@/stores/useCaisseStore';
import { toast } from 'sonner';
import { getLocalSnapshotTenantId } from '@/services/boutiqueService';

const SNAPSHOT_KEY = 'legwan-local-snapshot-v1';
const DB_NAME = 'legwan-local-data';
const STORE_NAME = 'snapshots';
let installed = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let quotaWarningShown = false;
let writeQueue: Promise<void> = Promise.resolve();

const tenantKey = () => `${SNAPSHOT_KEY}:${getLocalSnapshotTenantId()}`;

function reviveDateFields(records: unknown, fields: string[]): void {
  if (!Array.isArray(records)) return;
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    for (const field of fields) {
      const value = (record as Record<string, unknown>)[field];
      if (typeof value === 'string') (record as Record<string, unknown>)[field] = new Date(value);
    }
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRawSnapshot(raw: string): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    localStorage.setItem(tenantKey(), raw);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(raw, tenantKey());
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
  // Remove the legacy quota-limited copy after a successful migration.
  try { localStorage.removeItem(tenantKey()); } catch { /* storage unavailable */ }
}

async function loadRawSnapshot(): Promise<string | null> {
  const database = await openDatabase();
  if (database) {
    const stored = await new Promise<string | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME).get(tenantKey());
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (stored) return stored;
  }
  try { return localStorage.getItem(tenantKey()); } catch { return null; }
}

export async function saveLocalSnapshotNow(): Promise<void> {
  try {
    const sale = useSaleStore.getState();
    const cash = useCashSessionStore.getState();
    const raw = JSON.stringify({
      version: 1,
      settings: useSettingsStore.getState().shop,
      products: useProductStore.getState().products,
      sales: sale.sales,
      cart: sale.cart,
      discount: sale.discount,
      saleCounter: sale.saleCounter,
      movements: useStockStore.getState().movements,
      suppliers: useSupplierStore.getState().suppliers,
      customers: useCustomerStore.getState().customers,
      payments: usePaymentStore.getState().payments,
      expenses: useExpenseStore.getState().expenses,
      cashSessions: cash.sessions,
      cashOuts: cash.cashOuts,
      currentSessionId: cash.currentSessionId,
      inventorySessions: useInventoryStore.getState().sessions,
      clotures: useCaisseStore.getState().clotures,
    });
    // Serialize atomic store replacements so an older transaction can never
    // finish after and overwrite a newer sale/stock state.
    writeQueue = writeQueue.catch(() => {}).then(() => storeRawSnapshot(raw));
    await writeQueue;
  } catch (error) {
    console.warn('[LocalSnapshot] sauvegarde locale impossible:', error);
    if (!quotaWarningShown) {
      quotaWarningShown = true;
      toast.error('Sauvegarde locale saturée : exportez une sauvegarde puis libérez de l’espace.', {
        id: 'legwan-local-snapshot-quota',
        duration: 15_000,
      });
    }
  }
}

export async function hydrateLocalSnapshot(): Promise<boolean> {
  try {
    const raw = await loadRawSnapshot();
    if (!raw) return false;
    const data = JSON.parse(raw) as Record<string, unknown>;
    reviveDateFields(data.sales, ['date']);
    reviveDateFields(data.movements, ['date']);
    reviveDateFields(data.payments, ['date']);
    reviveDateFields(data.expenses, ['date']);
    reviveDateFields(data.cashOuts, ['date']);

    if (data.settings) useSettingsStore.getState()._setSettings(data.settings as never);
    if (Array.isArray(data.products)) useProductStore.getState()._setProducts(data.products as never);
    if (Array.isArray(data.sales)) useSaleStore.getState()._setSales(data.sales as never);
    if (Array.isArray(data.cart)) useSaleStore.setState({ cart: data.cart as never });
    if (typeof data.discount === 'number') useSaleStore.setState({ discount: data.discount });
    if (typeof data.saleCounter === 'number') useSaleStore.getState()._setSaleCounter(data.saleCounter);
    if (Array.isArray(data.movements)) useStockStore.getState()._setMovements(data.movements as never);
    if (Array.isArray(data.suppliers)) useSupplierStore.getState()._setSuppliers(data.suppliers as never);
    if (Array.isArray(data.customers)) useCustomerStore.getState()._setCustomers(data.customers as never);
    if (Array.isArray(data.payments)) usePaymentStore.getState()._setPayments(data.payments as never);
    if (Array.isArray(data.expenses)) useExpenseStore.getState()._setExpenses(data.expenses as never);
    if (Array.isArray(data.cashSessions)) useCashSessionStore.getState()._setSessions(data.cashSessions as never);
    if (Array.isArray(data.cashOuts)) useCashSessionStore.getState()._setCashOuts(data.cashOuts as never);
    if (typeof data.currentSessionId === 'string' || data.currentSessionId === null) {
      useCashSessionStore.getState()._setCurrentSessionId(data.currentSessionId as string | null);
    }
    if (Array.isArray(data.inventorySessions)) useInventoryStore.getState()._setSessions(data.inventorySessions as never);
    if (Array.isArray(data.clotures)) useCaisseStore.getState()._setClotures(data.clotures as never);
    return true;
  } catch (error) {
    console.warn('[LocalSnapshot] restauration locale impossible:', error);
    return false;
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveLocalSnapshotNow();
  }, 100);
}

export function installLocalSnapshotPersistence(): void {
  if (installed) return;
  installed = true;
  // Financial and stock-changing transactions are persisted immediately so a
  // power cut cannot fall inside the general UI debounce window.
  const saveCriticalSnapshot = () => {
    if (!deferCriticalSnapshotIfTransactionActive()) void saveLocalSnapshotNow();
  };
  onLocalStateTransactionCommit(() => { void saveLocalSnapshotNow(); });
  useSaleStore.subscribe(saveCriticalSnapshot);
  useProductStore.subscribe(saveCriticalSnapshot);
  useStockStore.subscribe(saveCriticalSnapshot);
  usePaymentStore.subscribe(saveCriticalSnapshot);
  useExpenseStore.subscribe(saveCriticalSnapshot);
  useCashSessionStore.subscribe(saveCriticalSnapshot);
  useInventoryStore.subscribe(saveCriticalSnapshot);
  useCaisseStore.subscribe(saveCriticalSnapshot);

  [
    useSettingsStore,
    useSupplierStore, useCustomerStore,
  ].forEach(store => store.subscribe(scheduleSave));
}
