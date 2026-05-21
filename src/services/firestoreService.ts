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
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
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
  movements:     (bid: string) => `boutiques/${bid}/stock_movements`,
  movement:      (bid: string, mid: string) => `boutiques/${bid}/stock_movements/${mid}`,
  suppliers:     (bid: string) => `boutiques/${bid}/suppliers`,
  supplier:      (bid: string, sid: string) => `boutiques/${bid}/suppliers/${sid}`,
  customers:     (bid: string) => `boutiques/${bid}/customers`,
  customer:      (bid: string, cid: string) => `boutiques/${bid}/customers/${cid}`,
  payments:      (bid: string) => `boutiques/${bid}/payments`,
  payment:       (bid: string, pid: string) => `boutiques/${bid}/payments/${pid}`,
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
  const snap = await getDoc(doc(db, p.settings(bid)));
  return snap.exists() ? snap.data() : null;
}

export async function fsSaveSettings(bid: string, settings: object): Promise<void> {
  if (!isFirebaseConfigured) return;
  await setDoc(doc(db, p.settings(bid)), settings);
}

// ─── Users ───────────────────────────────────────────────────────────────────
export async function fsLoadUsers(bid: string): Promise<User[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await getDocs(collection(db, p.users(bid)));
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
  const snap = await getDocs(collection(db, p.products(bid)));
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
export async function fsLoadSales(bid: string): Promise<Sale[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await getDocs(
    query(collection(db, p.sales(bid)), orderBy('date', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data();
    return { ...(data as Sale), id: d.id, date: toDate(data.date) };
  });
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

// ─── Stock movements ─────────────────────────────────────────────────────────
export async function fsLoadMovements(bid: string): Promise<StockMovement[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await getDocs(
    query(collection(db, p.movements(bid)), orderBy('date', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data();
    return { ...(data as StockMovement), id: d.id, date: toDate(data.date) };
  });
}

export async function fsSaveMovement(bid: string, movement: StockMovement): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = movement;
  await setDoc(doc(db, p.movement(bid, id)), {
    ...data,
    date: toTimestamp(movement.date),
  });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
export async function fsLoadSuppliers(bid: string): Promise<Supplier[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await getDocs(collection(db, p.suppliers(bid)));
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
  const snap = await getDocs(collection(db, p.customers(bid)));
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
  const snap = await getDocs(
    query(collection(db, p.payments(bid)), orderBy('date', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data();
    return { ...(data as Payment), id: d.id, date: toDate(data.date) };
  });
}

export async function fsSavePayment(bid: string, payment: Payment): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { id, ...data } = payment;
  await setDoc(doc(db, p.payment(bid, id)), {
    ...data,
    date: toTimestamp(payment.date),
  });
}

export async function fsDeletePayment(bid: string, paymentId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, p.payment(bid, paymentId)));
}

// ─── Expenses (dépenses) ─────────────────────────────────────────────────────
export async function fsLoadExpenses(bid: string): Promise<Expense[]> {
  if (!isFirebaseConfigured) return [];
  const snap = await getDocs(
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
  const snap = await getDocs(
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
  const snap = await getDocs(
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
  const snap = await getDocs(
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
  const snap = await getDocs(
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
  const snap = await getDoc(doc(db, p.saleCounter(bid)));
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
  const snap = await getDoc(doc(db, p.settings(bid)));
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
