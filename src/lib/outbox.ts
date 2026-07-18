/**
 * Outbox — file de persistance pour les écritures Firestore rejetées.
 *
 * Contexte : le SDK Firestore gère déjà les coupures réseau (les opérations
 * restent en attente dans IndexedDB et partent à la reconnexion). L'outbox
 * ne gère PAS les pannes réseau — elle gère les REJETS réels : règles de
 * sécurité, données invalides, quota dépassé. Ces rejets déclenchent le
 * .catch() même avec une connexion active.
 *
 * Stratégie :
 *   1. Le store appelle outbox.enqueue() dans son .catch() au lieu de logger.
 *   2. retryAll() est appelé au démarrage (après bootstrap) et sur 'online'.
 *   3. Après MAX_ATTEMPTS tentatives, l'entrée passe à 'failed' et reste dans
 *      la file — les données ne sont JAMAIS supprimées.
 */

import { getBoutiqueId } from '@/services/boutiqueService';
import {
  fsCommitSale,
  fsCommitRefund,
  fsCommitCreditPayment,
  fsCommitLegacyStockAdjustment,
  fsCommitStockOperation,
  fsSaveCloture,
  fsSaveCashSession,
  fsSaveCashOut,
  fsSaveExpense,
  fsRestoreMovement,
  fsSavePayment,
  fsSaveInventorySession,
  fsSaveProduct,
  fsUpdateProductFields,
  fsDeleteProduct,
  fsSaveSupplier,
  fsDeleteSupplier,
  fsSaveCustomer,
  fsDeleteCustomer,
  fsSaveSettings,
  fsSaveUser,
  fsDeleteUser,
  fsDeleteExpense,
  fsDeleteCashOut,
  type SaleCommitPayload,
  type RefundCommitPayload,
  type CreditPaymentCommitPayload,
  type StockCommitPayload,
} from '@/services/firestoreService';
import type { ClotureCaisse } from '@/stores/useCaisseStore';
import type { CashSession, CashOut } from '@/stores/useCashSessionStore';
import type { Expense } from '@/stores/useExpenseStore';
import type { StockMovement } from '@/stores/useStockStore';
import type { Payment } from '@/stores/usePaymentStore';
import type { InventorySession } from '@/stores/useInventoryStore';
import type { Product } from '@/stores/useProductStore';
import type { Supplier } from '@/stores/useSupplierStore';
import type { Customer } from '@/stores/useCustomerStore';
import type { User } from '@/stores/useAuthStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutboxEntryType =
  | 'sale'
  | 'refund'
  | 'creditPayment'
  | 'stockAdjust'
  | 'stockCommit'
  | 'cloture'
  | 'cashSession'
  | 'cashOut'
  | 'expense'
  | 'stockMovement'
  | 'payment'
  | 'inventorySession'
  | 'productCreate'
  | 'productUpdate'
  | 'productDelete'
  | 'supplierSave'
  | 'supplierDelete'
  | 'customerSave'
  | 'customerDelete'
  | 'settingsSave'
  | 'userSave'
  | 'userDelete'
  | 'expenseDelete'
  | 'cashOutDelete';

export type OutboxStatus = 'pending' | 'failed' | 'quarantined';

export interface OutboxEntry {
  id: string;
  /** Tenant that owned the operation when it was created. */
  boutiqueId: string;
  type: OutboxEntryType;
  payload: unknown;
  attempts: number;
  lastError?: string;
  createdAt: string; // ISO
  status: OutboxStatus;
}

type OutboxDispatch = (bid: string, entry: OutboxEntry) => Promise<void>;

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'legwan-outbox';
const MAX_ATTEMPTS = 3;

/** Real fallback when localStorage cannot persist the queue. */
let volatileEntries: OutboxEntry[] | null = null;
let lastPersistenceError: string | null = null;
/**
 * A startup completion and the browser `online` event may fire together.
 * Replaying the same snapshot twice is unsafe for legacy/non-idempotent
 * operations such as `stockAdjust`, so all callers share one in-flight drain.
 */
let activeRetry: Promise<OutboxPersistenceState> | null = null;

export interface OutboxPersistenceState {
  durable: boolean;
  error: string | null;
}

export interface OutboxEnqueueResult extends OutboxPersistenceState {
  entry: OutboxEntry;
}

// ─── Listeners ───────────────────────────────────────────────────────────────

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();

function notify(entries: OutboxEntry[]): void {
  listeners.forEach(fn => fn(entries));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function load(): OutboxEntry[] {
  if (volatileEntries) return [...volatileEntries];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<OutboxEntry>>;
    if (!Array.isArray(parsed)) throw new Error('invalid outbox payload');
    lastPersistenceError = null;

    // Legacy entries have no trustworthy tenant. Preserve but never replay them.
    return parsed.map(entry => entry.boutiqueId
      ? entry as OutboxEntry
      : {
          ...entry,
          boutiqueId: '__unknown__',
          status: 'quarantined',
          lastError: 'Entrée historique sans boutiqueId : rejeu automatique interdit.',
        } as OutboxEntry
    );
  } catch (err) {
    lastPersistenceError = `Lecture de l'outbox impossible : ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[outbox] ${lastPersistenceError}`);
    return [];
  }
}

function save(entries: OutboxEntry[]): OutboxPersistenceState {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    volatileEntries = null;
    lastPersistenceError = null;
  } catch (err) {
    volatileEntries = [...entries];
    lastPersistenceError = `Outbox conservée uniquement en mémoire : ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[outbox] ${lastPersistenceError}`);
  }
  notify(entries);
  return { durable: volatileEntries === null && lastPersistenceError === null, error: lastPersistenceError };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function enqueue(type: OutboxEntryType, payload: unknown): OutboxEnqueueResult {
  const boutiqueId = getBoutiqueId();
  const entry: OutboxEntry = {
    id: 'obx' + Date.now() + Math.random().toString(36).slice(2, 6),
    boutiqueId,
    type,
    payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const entries = [...load(), entry];
  const persistence = save(entries);
  return { entry, ...persistence };
}

export function getAll(): OutboxEntry[] {
  return load();
}

export function getPersistenceState(): OutboxPersistenceState {
  return { durable: volatileEntries === null && lastPersistenceError === null, error: lastPersistenceError };
}

/** Test-only reset for module-level volatile state. */
export function resetOutboxMemoryForTests(): void {
  volatileEntries = null;
  lastPersistenceError = null;
}

/** Default dispatcher: calls the matching Firestore function. */
async function defaultDispatch(bid: string, entry: OutboxEntry): Promise<void> {
  switch (entry.type) {
    case 'sale':
      await fsCommitSale(bid, entry.payload as SaleCommitPayload);
      break;
    case 'refund':
      await fsCommitRefund(bid, entry.payload as RefundCommitPayload);
      break;
    case 'creditPayment':
      await fsCommitCreditPayment(bid, entry.payload as CreditPaymentCommitPayload);
      break;
    case 'stockAdjust': {
      const { productId, delta } = entry.payload as { productId: string; delta: number };
      await fsCommitLegacyStockAdjustment(bid, entry.id, productId, delta);
      break;
    }
    case 'stockCommit': {
      await fsCommitStockOperation(bid, entry.payload as StockCommitPayload);
      break;
    }
    case 'cloture':
      await fsSaveCloture(bid, entry.payload as ClotureCaisse);
      break;
    case 'cashSession':
      await fsSaveCashSession(bid, entry.payload as CashSession);
      break;
    case 'cashOut':
      await fsSaveCashOut(bid, entry.payload as CashOut);
      break;
    case 'expense':
      await fsSaveExpense(bid, entry.payload as Expense);
      break;
    case 'stockMovement':
      await fsRestoreMovement(bid, entry.payload as StockMovement);
      break;
    case 'payment':
      await fsSavePayment(bid, entry.payload as Payment);
      break;
    case 'inventorySession':
      await fsSaveInventorySession(bid, entry.payload as InventorySession);
      break;
    case 'productCreate':
      await fsSaveProduct(bid, entry.payload as Product);
      break;
    case 'productUpdate': {
      const payload = entry.payload as {
        productId: string;
        fields: Partial<Omit<Product, 'id' | 'stock'>>;
      };
      await fsUpdateProductFields(bid, payload.productId, payload.fields);
      break;
    }
    case 'productDelete':
      await fsDeleteProduct(bid, entry.payload as string);
      break;
    case 'supplierSave':
      await fsSaveSupplier(bid, entry.payload as Supplier);
      break;
    case 'supplierDelete':
      await fsDeleteSupplier(bid, entry.payload as string);
      break;
    case 'customerSave':
      await fsSaveCustomer(bid, entry.payload as Customer);
      break;
    case 'customerDelete':
      await fsDeleteCustomer(bid, entry.payload as string);
      break;
    case 'settingsSave':
      await fsSaveSettings(bid, entry.payload as object);
      break;
    case 'userSave':
      await fsSaveUser(bid, entry.payload as User);
      break;
    case 'userDelete':
      await fsDeleteUser(bid, entry.payload as string);
      break;
    case 'expenseDelete':
      await fsDeleteExpense(bid, entry.payload as string);
      break;
    case 'cashOutDelete':
      await fsDeleteCashOut(bid, entry.payload as string);
      break;
  }
}

/**
 * Retry all pending entries (up to MAX_ATTEMPTS per session).
 *
 * The optional `dispatch` override is for unit tests — production code
 * always uses the default Firestore dispatcher.
 */
async function drainPendingEntries(dispatch: OutboxDispatch): Promise<OutboxPersistenceState> {
  const entries = load();
  if (entries.length === 0) return getPersistenceState();
  const drainedEntryIds = new Set(entries.map(entry => entry.id));

  const bid = getBoutiqueId();
  const updated: OutboxEntry[] = [...entries];

  for (let i = 0; i < updated.length; i++) {
    const entry = updated[i];
    if (entry.status === 'failed' || entry.status === 'quarantined') continue;

    if (entry.boutiqueId !== bid) {
      updated[i] = {
        ...entry,
        status: 'quarantined',
        lastError: `Tenant différent : entrée=${entry.boutiqueId}, session=${bid}. Rejeu interdit.`,
      };
      continue;
    }

    try {
      await dispatch(bid, entry);
      // Success: remove from outbox
      updated.splice(i, 1);
      i--;
    } catch (err) {
      const attempts = entry.attempts + 1;
      updated[i] = {
        ...entry,
        attempts,
        lastError: err instanceof Error ? err.message : String(err),
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      };
    }
  }

  // A write can fail and enqueue a new operation while this asynchronous drain
  // is awaiting Firestore. Preserve entries that were not part of our snapshot
  // instead of replacing the queue with the stale `updated` array.
  const concurrentlyEnqueued = load().filter(entry => !drainedEntryIds.has(entry.id));
  return save([...updated, ...concurrentlyEnqueued]);
}

export function retryAll(dispatch: OutboxDispatch = defaultDispatch): Promise<OutboxPersistenceState> {
  // An operation may be enqueued while a previous drain is awaiting the
  // network. Chain one more drain so that entry is not left pending until the
  // next application restart/online event.
  if (activeRetry) return activeRetry.then(() => retryAll(dispatch));

  activeRetry = drainPendingEntries(dispatch).finally(() => {
    activeRetry = null;
  });
  return activeRetry;
}

/** Explicit operator action: reset exhausted entries and attempt them again. */
export function retryFailed(dispatch: OutboxDispatch = defaultDispatch): Promise<OutboxPersistenceState> {
  const entries = load();
  const reset = entries.map(entry => entry.status === 'failed'
    ? { ...entry, status: 'pending' as const, attempts: 0, lastError: undefined }
    : entry);
  save(reset);
  return retryAll(dispatch);
}
