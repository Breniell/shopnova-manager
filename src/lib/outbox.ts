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
  fsAdjustStock,
  fsSaveCloture,
  fsSaveCashSession,
  fsSaveCashOut,
  fsSaveExpense,
  fsSaveMovement,
  fsSavePayment,
  fsSaveInventorySession,
  type SaleCommitPayload,
  type RefundCommitPayload,
  type CreditPaymentCommitPayload,
} from '@/services/firestoreService';
import type { ClotureCaisse } from '@/stores/useCaisseStore';
import type { CashSession, CashOut } from '@/stores/useCashSessionStore';
import type { Expense } from '@/stores/useExpenseStore';
import type { StockMovement } from '@/stores/useStockStore';
import type { Payment } from '@/stores/usePaymentStore';
import type { InventorySession } from '@/stores/useInventoryStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutboxEntryType =
  | 'sale'
  | 'refund'
  | 'creditPayment'
  | 'stockAdjust'
  | 'cloture'
  | 'cashSession'
  | 'cashOut'
  | 'expense'
  | 'stockMovement'
  | 'payment'
  | 'inventorySession';

export type OutboxStatus = 'pending' | 'failed';

export interface OutboxEntry {
  id: string;
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function save(entries: OutboxEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full — keep in memory at least; notify UI
  }
  notify(entries);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function enqueue(type: OutboxEntryType, payload: unknown): void {
  const entry: OutboxEntry = {
    id: 'obx' + Date.now() + Math.random().toString(36).slice(2, 6),
    type,
    payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const entries = [...load(), entry];
  save(entries);
}

export function getAll(): OutboxEntry[] {
  return load();
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
      await fsAdjustStock(bid, productId, delta);
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
      await fsSaveMovement(bid, entry.payload as StockMovement);
      break;
    case 'payment':
      await fsSavePayment(bid, entry.payload as Payment);
      break;
    case 'inventorySession':
      await fsSaveInventorySession(bid, entry.payload as InventorySession);
      break;
  }
}

/**
 * Retry all pending entries (up to MAX_ATTEMPTS per session).
 *
 * The optional `dispatch` override is for unit tests — production code
 * always uses the default Firestore dispatcher.
 */
export async function retryAll(dispatch: OutboxDispatch = defaultDispatch): Promise<void> {
  const entries = load();
  if (entries.length === 0) return;

  const bid = getBoutiqueId();
  const updated: OutboxEntry[] = [...entries];

  for (let i = 0; i < updated.length; i++) {
    const entry = updated[i];
    if (entry.status === 'failed') continue; // exhausted — leave as-is

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

  save(updated);
}
