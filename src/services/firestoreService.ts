/**
 * Firestore CRUD operations for all Legwan collections.
 *
 * Each boutique has its own isolated subtree:
 *   boutiques/{boutiqueId}/
 *     settings/main       (single document)
 *     users/{userId}
 *     products/{productId}
 *     sales/{saleId}
 *     stock_movements/{movementId}
 *
 * All writes go to IndexedDB immediately (offline cache) and are synced
 * to the Firestore cloud when the device comes online.
 */
import {
  doc,
  collection,
  getDoc,
  getDocs,
  getDocFromCache,
  getDocsFromCache,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  query,
  orderBy,
  where,
  limit,
  increment,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import type { Product } from '@/stores/useProductStore';
import type { Sale } from '@/stores/useSaleStore';
import type { StockMovement } from '@/stores/useStockStore';
import type { User } from '@/stores/useAuthStore';
import type { Supplier } from '@/stores/useSupplierStore';
import type { Customer } from '@/stores/useCustomerStore';
import type { Payment } from '@/stores/usePaymentStore';
import type { Expense } from '@/stores/useExpenseStore';
import type { CashSession, CashOut } from '@/stores/useCashSessionStore';
import type { InventorySession } from '@/stores/useInventoryStore';
import type { ClotureCaisse } from '@/stores/useCaisseStore';

/**
 * The default Firestore reads try the server first. On disconnected PCs this
 * can keep the splash screen waiting before eventually falling back. When the
 * browser explicitly reports offline, read IndexedDB directly instead.
 */
const readDoc: typeof getDoc = (reference) =>
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? getDocFromCache(reference)
    : getDoc(reference);

const readDocs: typeof getDocs = (reference) =>
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? getDocsFromCache(reference)
    : getDocs(reference);

// ─── Login attempt tracking (anti-brute-force) ───────────────────────────────

const pa = (bid: string) => `boutiques/${bid}/security/loginAttempts`;

export interface LoginAttemptRecord {
  count: number;
  lockedUntil: number | null;
}

export async function fsGetLoginAttempts(bid: string, userId: string): Promise<LoginAttemptRecord | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const snap = await readDoc(doc(db, pa(bid)));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, LoginAttemptRecord>;
    return data[userId] ?? null;
  } catch { return null; }
}

export async function fsSetLoginAttempts(bid: string, userId: string, record: LoginAttemptRecord): Promise<void> {
  if (!isFirebaseConfigured) return;
  await setDoc(doc(db, pa(bid)), { [userId]: record }, { merge: true });
}

// ─── Guard ──────────────────────────────────────────────────────────────────
// All public functions are no-ops when Firebase is not configured.
// This lets the app run in pure-local mode during development / testing.

// ─── Collection paths ────────────────────────────────────────────────────────
const p = {
  boutique:      (bid: string) => `boutiques/${bid}`,
  settings:      (bid: string) => `boutiques/${bid}/settings/main`,
  users:         (bid: string) => `boutiques/${bid}/users`,
  user:          (bid: string, uid: string) => `boutiques/${bid}/users/${uid}`,
  products:      (bid: string) => `boutiques/${bid}/products`,
  product:       (bid: string, pid: string) => `boutiques/${bid}/products/${pid}`,
  sales:         (bid: string) => `boutiques/${bid}/sales`,
  sale:          (bid: string, sid: string) => `boutiques/${bid}/sales/${sid}`,
  saleOperation: (bid: string, sid: string) => `boutiques/${bid}/sale_operations/${sid}`,
  movements:     (bid: string) => `boutiques/${bid}/stock_movements`,
  movement:      (bid: string, mid: string) => `boutiques/${bid}/stock_movements/${mid}`,
  stockOperation:(bid: string, oid: string) => `boutiques/${bid}/stock_operations/${oid}`,
  suppliers:     (bid: string) => `boutiques/${bid}/suppliers`,
  supplier:      (bid: string, sid: string) => `boutiques/${bid}/suppliers/${sid}`,
  customers:     (bid: string) => `boutiques/${bid}/customers`,
  customer:      (bid: string, cid: string) => `boutiques/${bid}/customers/${cid}`,
  payments:      (bid: string) => `boutiques/${bid}/payments`,
  payment:       (bid: string, pid: string) => `boutiques/${bid}/payments/${pid}`,
  refund:        (bid: string, saleId: string) => `boutiques/${bid}/refunds/${saleId}`,
  expenses:      (bid: string) => `boutiques/${bid}/expenses`,
  expense:       (bid: string, eid: string) => `boutiques/${bid}/expenses/${eid}`,
  cashSessions:  (bid: string) => `boutiques/${bid}/cash_sessions`,
  cashSession:   (bid: string, sid: string) => `boutiques/${bid}/cash_sessions/${sid}`,
  cashOuts:      (bid: string) => `boutiques/${bid}/cash_outs`,
  cashOut:       (bid: string, oid: string) => `boutiques/${bid}/cash_outs/${oid}`,
  inventorySessions: (bid: string) => `boutiques/${bid}/inventory_sessions`,
  inventorySession:  (bid: string, sid: string) => `boutiques/${bid}/inventory_sessions/${sid}`,
  clotures:      (bid: string) => `boutiques/${bid}/clotures`,
  cloture:       (bid: string, cid: string) => `boutiques/${bid}/clotures/${cid}`,
  saleCounter:   (bid: string) => `boutiques/${bid}/meta/saleCounter`,
};

// ─── Timestamp helpers ───────────────────────────────────────────────────────
function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date)      return v;
  if (typeof v === 'string')  return new Date(v);
  return new Date();
}

function toTimestamp(d: Date | string | unknown): Timestamp {
  if (d instanceof Timestamp) return d;
  if (d instanceof Date)      return Timestamp.fromDate(d);
  if (typeof d === 'string')  return Timestamp.fromDate(new Date(d));
  return Timestamp.now();
}

// ─── Settings ────────────────────────────────────────────────────────────────
export async function fsLoadSettings(bid: string): Promise<DocumentData | null> {
  if (!isFirebaseConfigured) return null;
  const snap = await readDoc(doc(db, p.settings(bid)));
  return snap.exists() ? snap.data() : null;
}

export async function fsSaveSettings(bid: string, settings: object): Promise<void> {
  if (!isFirebaseConfigured) return;
  await setDoc(doc(db, p.settings(bid)), settings);
}

// ─── Users ───────────────────────────────────────────────────────────────────
export async function fsLoadUsers(bid: string): Promise<User[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(collection(db, p.users(bid)));
  return snap.docs.map(d => ({ ...(d.data() as User), id: d.id }));
}

export async function fsSaveUser(bid: string, user: User): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = user;
  await setDoc(doc(db, p.user(bid, id)), data);
}

export async function fsDeleteUser(bid: string, userId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, p.user(bid, userId)));
}

// ─── Products ────────────────────────────────────────────────────────────────
export async function fsLoadProducts(bid: string): Promise<Product[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(collection(db, p.products(bid)));
  return snap.docs.map(d => ({ ...(d.data() as Product), id: d.id }));
}

export async function fsSaveProduct(bid: string, product: Product): Promise<void> {
  if (!isFirebaseConfigured) return;
  await setDoc(doc(db, p.product(bid, product.id)), product);
}

export async function fsDeleteProduct(bid: string, productId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, p.product(bid, productId)));
}

// ─── Sales ───────────────────────────────────────────────────────────────────
/**
 * Loads the bounded recent history plus every credit sale. The second query is
 * required for correctness: an unpaid debt must remain visible on a new till
 * even when the originating sale is older than 90 days.
 */
export async function fsLoadSales(bid: string): Promise<Sale[]> {
  if (!isFirebaseConfigured) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const [recentSnap, creditSnap] = await Promise.all([
    readDocs(
      query(
        collection(db, p.sales(bid)),
        where('date', '>=', Timestamp.fromDate(cutoff)),
        orderBy('date', 'desc'),
        limit(2000),
      ),
    ),
    readDocs(query(collection(db, p.sales(bid)), where('paymentMode', '==', 'credit'))),
  ]);
  const byId = new Map([...recentSnap.docs, ...creditSnap.docs].map(d => [d.id, d]));
  return [...byId.values()].map(d => {
    const data = d.data();
    return { ...(data as Sale), id: d.id, date: toDate(data.date) };
  }).sort((left, right) => right.date.getTime() - left.date.getTime());
}

export async function fsSaveSale(bid: string, sale: Sale): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = sale;
  await setDoc(doc(db, p.sale(bid, id)), {
    ...data,
    date: toTimestamp(sale.date),
  });
}

export async function fsUpdateSale(bid: string, saleId: string, data: Partial<Sale>): Promise<void> {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, p.sale(bid, saleId)), data as DocumentData);
}

/**
 * Commit atomique d'une vente et de ses conséquences sur le stock.
 *
 * Utilise increment() pour les mises à jour de stock — chaque caisse envoie
 * un DELTA (−quantité), jamais une valeur absolue. Cela élimine le
 * last-write-wins qui corrompait le stock lors d'une resynchronisation
 * multi-caisses hors-ligne.
 */
export interface SaleCommitPayload {
  /** Optional only while replaying a legacy v1 outbox entry. */
  operation?: SaleOperation;
  sale: Sale;
  /** Deltas de stock : delta est négatif (décrément) pour une vente. */
  stockDeltas: Array<{ productId: string; delta: number }>;
  movements: StockMovement[];
}

export async function fsCommitSale(bid: string, payload: SaleCommitPayload): Promise<void> {
  if (!isFirebaseConfigured) return;
  const operation: SaleOperation = payload.operation ?? {
    operationId: payload.sale.id,
    saleId: payload.sale.id,
    date: payload.sale.date,
    userId: payload.sale.userId,
    userName: payload.sale.userName,
  };
  if (operation.operationId !== payload.sale.id || operation.saleId !== payload.sale.id) {
    throw new Error('Identifiant d\'opération de vente incohérent');
  }
  if (await existsOnServerWhenOnline(p.saleOperation(bid, payload.sale.id))) return;
  const batch = writeBatch(db);

  const { id: saleId, ...saleData } = payload.sale;
  batch.set(doc(db, p.saleOperation(bid, saleId)), {
    ...operation,
    date: toTimestamp(operation.date),
  });
  batch.set(doc(db, p.sale(bid, saleId)), {
    ...saleData,
    date: toTimestamp(payload.sale.date),
  });

  for (const { productId, delta } of payload.stockDeltas) {
    batch.update(doc(db, p.product(bid, productId)), { stock: increment(delta) });
  }

  for (const movement of payload.movements) {
    const { id: movId, ...movData } = movement;
    batch.set(doc(db, p.movement(bid, movId)), {
      ...movData,
      date: toTimestamp(movement.date),
    });
  }

  await batch.commit();
}

export type StockOperationKind = 'manual' | 'inventory' | 'legacy';

export interface StockOperation {
  operationId: string;
  kind: StockOperationKind;
  date: Date | string;
  userId: string;
  userName: string;
  inventorySessionId?: string;
}

export interface StockCommitPayload {
  operation: StockOperation;
  stockDeltas: Array<{ productId: string; delta: number }>;
  movements: StockMovement[];
  /** Present only when an inventory is validated by this operation. */
  inventorySession?: InventorySession;
}

/** Firestore batches are limited to 500 writes: marker + session + 2 per line. */
export const MAX_ATOMIC_INVENTORY_ADJUSTMENTS = 249;

export function validateStockCommit(payload: StockCommitPayload): void {
  const { operation, stockDeltas, movements, inventorySession } = payload;
  if (!operation.operationId || operation.operationId.includes('/')) {
    throw new Error("Identifiant d'opération de stock invalide");
  }
  if (!operation.userId || !operation.userName) {
    throw new Error("Auteur de l'opération de stock manquant");
  }
  if (stockDeltas.length !== movements.length && operation.kind !== 'legacy') {
    throw new Error("Mouvements et deltas de stock incohérents");
  }
  const productIds = new Set<string>();
  for (const { productId, delta } of stockDeltas) {
    if (!productId || productIds.has(productId) || !Number.isInteger(delta) || delta === 0) {
      throw new Error("Delta de stock invalide ou produit dupliqué");
    }
    productIds.add(productId);
  }
  const movementIds = new Set<string>();
  for (const movement of movements) {
    if (!movement.id || movementIds.has(movement.id) || movement.operationId !== operation.operationId) {
      throw new Error("Mouvement de stock invalide ou dupliqué");
    }
    movementIds.add(movement.id);
    const delta = stockDeltas.find(item => item.productId === movement.productId);
    if (!delta || delta.delta !== movement.quantity) {
      throw new Error("Quantité du mouvement incohérente avec le delta de stock");
    }
  }
  if (operation.kind === 'inventory') {
    if (!inventorySession || inventorySession.id !== operation.inventorySessionId ||
        inventorySession.status !== 'validated') {
      throw new Error("Session d'inventaire incohérente");
    }
    if (stockDeltas.length > MAX_ATOMIC_INVENTORY_ADJUSTMENTS) {
      throw new Error(`Un inventaire ne peut ajuster que ${MAX_ATOMIC_INVENTORY_ADJUSTMENTS} produits à la fois`);
    }
  } else if (inventorySession || operation.inventorySessionId) {
    throw new Error("Une opération hors inventaire ne peut pas modifier une session d'inventaire");
  }
  const writeCount = 1 + (inventorySession ? 1 : 0) + stockDeltas.length + movements.length;
  if (writeCount > 500) throw new Error('Opération de stock trop volumineuse');
}

/**
 * Commits one immutable stock operation. The create-only marker, every product
 * increment, every ledger movement and the optional validated inventory
 * session are written in the same batch. A lost acknowledgement can therefore
 * be retried without applying the increments twice.
 */
export async function fsCommitStockOperation(bid: string, payload: StockCommitPayload): Promise<void> {
  validateStockCommit(payload);
  if (!isFirebaseConfigured) return;
  const { operation, stockDeltas, movements, inventorySession } = payload;
  if (await existsOnServerWhenOnline(p.stockOperation(bid, operation.operationId))) return;

  const batch = writeBatch(db);
  batch.set(doc(db, p.stockOperation(bid, operation.operationId)), {
    operationId: operation.operationId,
    kind: operation.kind,
    date: toTimestamp(operation.date),
    userId: operation.userId,
    userName: operation.userName,
    ...(operation.inventorySessionId ? { inventorySessionId: operation.inventorySessionId } : {}),
  });

  if (inventorySession) {
    const { id, ...data } = inventorySession;
    batch.set(doc(db, p.inventorySession(bid, id)), data);
  }
  for (const { productId, delta } of stockDeltas) {
    batch.update(doc(db, p.product(bid, productId)), { stock: increment(delta) });
  }
  for (const movement of movements) {
    const { id, ...data } = movement;
    batch.set(doc(db, p.movement(bid, id)), {
      ...data,
      date: toTimestamp(movement.date),
    });
  }
  await batch.commit();
}

/** Idempotent bridge for stockAdjust entries produced by releases before 1.5. */
export async function fsCommitLegacyStockAdjustment(
  bid: string,
  outboxEntryId: string,
  productId: string,
  delta: number,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  if (!outboxEntryId || !productId || !Number.isInteger(delta) || delta === 0) {
    throw new Error('Ajustement historique invalide');
  }
  const operationId = `legacy-${outboxEntryId}`;
  if (await existsOnServerWhenOnline(p.stockOperation(bid, operationId))) return;
  const batch = writeBatch(db);
  batch.set(doc(db, p.stockOperation(bid, operationId)), {
    operationId,
    kind: 'legacy',
    date: Timestamp.now(),
    userId: '__legacy__',
    userName: 'Ancienne version',
  });
  batch.update(doc(db, p.product(bid, productId)), { stock: increment(delta) });
  await batch.commit();
}

/**
 * Met à jour les champs non-stock d'un produit (prix, nom, seuil…).
 * N'écrit jamais le champ stock — les ajustements passent par
 * fsCommitStockOperation avec un mouvement et un marqueur idempotent.
 */
export async function fsUpdateProductFields(
  bid: string,
  productId: string,
  fields: Partial<Omit<Product, 'id' | 'stock'>>
): Promise<void> {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, p.product(bid, productId)), fields as DocumentData);
}

export interface RefundOperation {
  /** Equal to saleId: exactly one immutable refund marker per sale. */
  operationId: string;
  saleId: string;
  date: string;
  reason: string;
  userId: string;
  userName: string;
}

export interface RefundCommitPayload {
  /** Optional only when replaying a legacy v1 outbox entry. */
  refund?: RefundOperation;
  saleId: string;
  saleUpdate: Partial<Sale>;
  /** Deltas positifs — le remboursement rend le stock. */
  stockDeltas: Array<{ productId: string; delta: number }>;
  movements: StockMovement[];
}

export interface SaleOperation {
  /** Equal to saleId: exactly one stock-affecting commit per sale. */
  operationId: string;
  saleId: string;
  date: Date | string;
  userId: string;
  userName: string;
}

async function existsOnServerWhenOnline(path: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    return (await getDoc(doc(db, path))).exists();
  } catch {
    // The immutable create rule remains authoritative if this best-effort
    // idempotency lookup cannot reach the server.
    return false;
  }
}

/**
 * Commit atomique d'un remboursement : MAJ vente + incréments stock + mouvements.
 * Un seul batch — impossible d'avoir la vente remboursée sans les stocks restitués.
 */
export async function fsCommitRefund(bid: string, payload: RefundCommitPayload): Promise<void> {
  if (!isFirebaseConfigured) return;
  const refund: RefundOperation = payload.refund ?? {
    operationId: payload.saleId,
    saleId: payload.saleId,
    date: typeof payload.saleUpdate.refundedAt === 'string'
      ? payload.saleUpdate.refundedAt
      : new Date().toISOString(),
    reason: typeof payload.saleUpdate.refundReason === 'string'
      ? payload.saleUpdate.refundReason
      : 'Remboursement historique',
    userId: '__legacy__',
    userName: typeof payload.saleUpdate.refundedBy === 'string'
      ? payload.saleUpdate.refundedBy
      : 'Utilisateur historique',
  };
  if (refund.operationId !== payload.saleId || refund.saleId !== payload.saleId) {
    throw new Error('Identifiant de remboursement incohérent');
  }
  // If a previous attempt committed but its acknowledgement was lost, the
  // marker proves that stock and sale were already updated by the same batch.
  if (await existsOnServerWhenOnline(p.refund(bid, payload.saleId))) return;

  const batch = writeBatch(db);

  batch.set(doc(db, p.refund(bid, payload.saleId)), refund);
  batch.update(doc(db, p.sale(bid, payload.saleId)), payload.saleUpdate as DocumentData);

  for (const { productId, delta } of payload.stockDeltas) {
    batch.update(doc(db, p.product(bid, productId)), { stock: increment(delta) });
  }

  for (const movement of payload.movements) {
    const { id: movId, ...movData } = movement;
    batch.set(doc(db, p.movement(bid, movId)), {
      ...movData,
      date: toTimestamp(movement.date),
    });
  }

  await batch.commit();
}

/**
 * Commit atomique d'un règlement sur une vente à crédit.
 *
 * Le nouveau Payment et la mise à jour dénormalisée de la Sale (amountPaid,
 * creditStatus) sont écrits dans un unique batch : on ne peut jamais avoir un
 * règlement enregistré sans que la vente reflète le solde (ou l'inverse).
 * `merge: true` sur la vente n'écrase que les champs fournis.
 */
export interface CreditPaymentCommitPayload {
  payment: Payment;
  /** Legacy v1 fields accepted only while old outbox entries are drained. */
  saleId?: string;
  saleUpdate?: Partial<Sale>;
}

function normalizePaymentOperation(payment: Payment): Payment {
  return {
    ...payment,
    operationId: payment.operationId ?? payment.id,
    kind: payment.kind ?? 'payment',
  };
}

function normalizeForImmutableComparison(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForImmutableComparison);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeForImmutableComparison(item)]));
  }
  return value;
}

/** Exported for deterministic restore/conflict tests without a live Firestore. */
export function paymentRestoreContentsMatch(existing: Payment, restored: Payment): boolean {
  return JSON.stringify(normalizeForImmutableComparison(normalizePaymentOperation(existing))) ===
    JSON.stringify(normalizeForImmutableComparison(normalizePaymentOperation(restored)));
}

/**
 * Restore an immutable payment safely. An identical existing event is a
 * successful idempotent replay; different content is an explicit conflict.
 */
export async function fsRestorePayment(bid: string, restored: Payment): Promise<void> {
  if (!isFirebaseConfigured) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('restore_immutable_payments_requires_online');
  }
  const operation = normalizePaymentOperation(restored);
  if (operation.operationId !== operation.id) throw new Error('restore_payment_invalid_operation_id');
  const reference = doc(db, p.payment(bid, operation.id));

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) {
      const existing = { ...(snapshot.data() as Payment), id: snapshot.id };
      if (paymentRestoreContentsMatch(existing, operation)) return;
      throw new Error(`restore_payment_conflict:${operation.id}`);
    }
    const { id, ...data } = operation;
    transaction.set(reference, { ...data, date: toTimestamp(operation.date) });
  });
}

export async function fsCommitCreditPayment(bid: string, payload: CreditPaymentCommitPayload): Promise<void> {
  if (!isFirebaseConfigured) return;
  const payment = normalizePaymentOperation(payload.payment);
  if (payment.operationId !== payment.id) throw new Error('Identifiant de paiement incohérent');
  if (await existsOnServerWhenOnline(p.payment(bid, payment.id))) return;

  const { id: payId, ...payData } = payment;
  await setDoc(doc(db, p.payment(bid, payId)), {
    ...payData,
    date: toTimestamp(payment.date),
  });
}

// ─── Stock movements ─────────────────────────────────────────────────────────
export async function fsLoadMovements(bid: string): Promise<StockMovement[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(
    query(collection(db, p.movements(bid)), orderBy('date', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data();
    return { ...(data as StockMovement), id: d.id, date: toDate(data.date) };
  });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
export async function fsLoadSuppliers(bid: string): Promise<Supplier[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(collection(db, p.suppliers(bid)));
  return snap.docs.map(d => ({ ...(d.data() as Supplier), id: d.id }));
}

export async function fsSaveSupplier(bid: string, supplier: Supplier): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = supplier;
  await setDoc(doc(db, p.supplier(bid, id)), data);
}

export async function fsDeleteSupplier(bid: string, supplierId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, p.supplier(bid, supplierId)));
}

// ─── Customers ───────────────────────────────────────────────────────────────
export async function fsLoadCustomers(bid: string): Promise<Customer[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(collection(db, p.customers(bid)));
  return snap.docs.map(d => ({ ...(d.data() as Customer), id: d.id }));
}

export async function fsSaveCustomer(bid: string, customer: Customer): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = customer;
  await setDoc(doc(db, p.customer(bid, id)), data);
}

export async function fsDeleteCustomer(bid: string, customerId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, p.customer(bid, customerId)));
}

// ─── Payments (règlements crédit) ────────────────────────────────────────────
export async function fsLoadPayments(bid: string): Promise<Payment[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(
    query(collection(db, p.payments(bid)), orderBy('date', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data();
    return { ...(data as Payment), id: d.id, date: toDate(data.date) };
  });
}

export async function fsSavePayment(bid: string, payment: Payment): Promise<void> {
  if (!isFirebaseConfigured) return;
  const operation = normalizePaymentOperation(payment);
  if (operation.operationId !== operation.id) throw new Error('Identifiant de paiement incohérent');
  if (await existsOnServerWhenOnline(p.payment(bid, operation.id))) return;
  const { id, ...data } = operation;
  await setDoc(doc(db, p.payment(bid, id)), {
    ...data,
    date: toTimestamp(operation.date),
  });
}

/** Exported for deterministic restore/conflict tests without a live Firestore. */
export function movementRestoreContentsMatch(existing: StockMovement, restored: StockMovement): boolean {
  return JSON.stringify(normalizeForImmutableComparison(existing)) ===
    JSON.stringify(normalizeForImmutableComparison(restored));
}

/** Create-only restoration for the immutable stock ledger. */
export async function fsRestoreMovement(bid: string, restored: StockMovement): Promise<void> {
  if (!isFirebaseConfigured) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('restore_immutable_movements_requires_online');
  }
  const reference = doc(db, p.movement(bid, restored.id));
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) {
      const existing = { ...(snapshot.data() as StockMovement), id: snapshot.id };
      if (movementRestoreContentsMatch(existing, restored)) return;
      throw new Error(`restore_movement_conflict:${restored.id}`);
    }
    const { id, ...data } = restored;
    transaction.set(reference, { ...data, date: toTimestamp(restored.date) });
  });
}

// ─── Expenses (dépenses) ─────────────────────────────────────────────────────
export async function fsLoadExpenses(bid: string): Promise<Expense[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(
    query(collection(db, p.expenses(bid)), orderBy('date', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data();
    return { ...(data as Expense), id: d.id, date: toDate(data.date) };
  });
}

export async function fsSaveExpense(bid: string, expense: Expense): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = expense;
  await setDoc(doc(db, p.expense(bid, id)), {
    ...data,
    date: toTimestamp(expense.date),
  });
}

export async function fsDeleteExpense(bid: string, expenseId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, p.expense(bid, expenseId)));
}

// ─── Cash Sessions ───────────────────────────────────────────────────────────
export async function fsLoadCashSessions(bid: string): Promise<CashSession[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(
    query(collection(db, p.cashSessions(bid)), orderBy('openedAt', 'desc'))
  );
  return snap.docs.map(d => ({ ...(d.data() as CashSession), id: d.id }));
}

export async function fsSaveCashSession(bid: string, session: CashSession): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = session;
  await setDoc(doc(db, p.cashSession(bid, id)), data);
}

// ─── Cash Outs (sorties de caisse) ───────────────────────────────────────────
export async function fsLoadCashOuts(bid: string): Promise<CashOut[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(
    query(collection(db, p.cashOuts(bid)), orderBy('date', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data();
    return { ...(data as CashOut), id: d.id, date: toDate(data.date) };
  });
}

export async function fsSaveCashOut(bid: string, cashOut: CashOut): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = cashOut;
  await setDoc(doc(db, p.cashOut(bid, id)), {
    ...data,
    date: toTimestamp(cashOut.date),
  });
}

export async function fsDeleteCashOut(bid: string, cashOutId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, p.cashOut(bid, cashOutId)));
}

// ─── Inventory Sessions ──────────────────────────────────────────────────────
export async function fsLoadInventorySessions(bid: string): Promise<InventorySession[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(
    query(collection(db, p.inventorySessions(bid)), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ ...(d.data() as InventorySession), id: d.id }));
}

export async function fsSaveInventorySession(bid: string, session: InventorySession): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = session;
  await setDoc(doc(db, p.inventorySession(bid, id)), data);
}

export async function fsDeleteInventorySession(bid: string, sessionId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, p.inventorySession(bid, sessionId)));
}

// ─── Clotures ────────────────────────────────────────────────────────────────
export async function fsLoadClotures(bid: string): Promise<ClotureCaisse[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await readDocs(
    query(collection(db, p.clotures(bid)), orderBy('date', 'desc'))
  );
  return snap.docs.map(d => ({ ...(d.data() as ClotureCaisse), id: d.id }));
}

export async function fsSaveCloture(bid: string, cloture: ClotureCaisse): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = cloture;
  await setDoc(doc(db, p.cloture(bid, id)), data);
}

// ─── Sale counter ─────────────────────────────────────────────────────────────
export async function fsLoadSaleCounter(bid: string): Promise<number> {
  if (!isFirebaseConfigured) return 0;
  const snap = await readDoc(doc(db, p.saleCounter(bid)));
  if (!snap.exists()) return 0;
  return (snap.data().value as number) ?? 0;
}

export async function fsSaveSaleCounter(bid: string, value: number): Promise<void> {
  if (!isFirebaseConfigured) return;
  await setDoc(doc(db, p.saleCounter(bid)), { value });
}

// ─── Boutique initialization ─────────────────────────────────────────────────

/** Returns true if this boutique already has data in Firestore */
export async function fsIsBoutiqueInitialized(bid: string): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  const snap = await readDoc(doc(db, p.settings(bid)));
  return snap.exists();
}

export interface BoutiqueInitData {
  settings: object;
  users: User[];
}

/** Seeds a fresh boutique with default settings and users in a single batch */
export async function fsInitializeBoutique(bid: string, data: BoutiqueInitData): Promise<void> {
  if (!isFirebaseConfigured) return;
  const batch = writeBatch(db);

  // Boutique metadata doc
  batch.set(doc(db, p.boutique(bid)), {
    createdAt: Timestamp.now(),
    plan: 'gratuit',
  });

  // Settings
  batch.set(doc(db, p.settings(bid)), data.settings);

  // Users
  data.users.forEach(user => {
    const { id, ...rest } = user;
    batch.set(doc(db, p.user(bid, id)), rest);
  });

  await batch.commit();
}
