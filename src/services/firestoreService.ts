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

// ─── Guard ──────────────────────────────────────────────────────────────────
// All public functions are no-ops when Firebase is not configured.
// This lets the app run in pure-local mode during development / testing.

// ─── Collection paths ────────────────────────────────────────────────────────
const p = {
  boutique:   (bid: string) => `boutiques/${bid}`,
  settings:   (bid: string) => `boutiques/${bid}/settings/main`,
  users:      (bid: string) => `boutiques/${bid}/users`,
  user:       (bid: string, uid: string) => `boutiques/${bid}/users/${uid}`,
  products:   (bid: string) => `boutiques/${bid}/products`,
  product:    (bid: string, pid: string) => `boutiques/${bid}/products/${pid}`,
  sales:      (bid: string) => `boutiques/${bid}/sales`,
  sale:       (bid: string, sid: string) => `boutiques/${bid}/sales/${sid}`,
  movements:  (bid: string) => `boutiques/${bid}/stock_movements`,
  movement:   (bid: string, mid: string) => `boutiques/${bid}/stock_movements/${mid}`,
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
