import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Firestore,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import type { BackupData } from './types';

const PAGE_SIZE = 500;

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return new Date(0);
}

/** Pure pagination primitive, exported so exhaustion behavior can be tested. */
export async function readAllPages<T>(
  fetchPage: (cursor: string | null, pageSize: number) => Promise<Array<{ id: string; value: T }>>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error('invalid_page_size');
  const values: T[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();

  for (;;) {
    const page = await fetchPage(cursor, pageSize);
    values.push(...page.map(item => item.value));
    if (page.length < pageSize) return values;
    const next = page[page.length - 1]?.id;
    if (!next || seenCursors.has(next)) throw new Error('backup_pagination_cursor_stalled');
    seenCursors.add(next);
    cursor = next;
  }
}

async function loadCollection<T>(
  database: Firestore,
  boutiqueId: string,
  collectionName: string,
  map: (snapshot: QueryDocumentSnapshot<DocumentData>) => T,
): Promise<T[]> {
  const reference = collection(database, `boutiques/${boutiqueId}/${collectionName}`);
  return readAllPages(async (cursor, pageSize) => {
    const pageQuery = cursor
      ? query(reference, orderBy(documentId()), startAfter(cursor), limit(pageSize))
      : query(reference, orderBy(documentId()), limit(pageSize));
    const snapshot = await getDocs(pageQuery);
    return snapshot.docs.map(item => ({ id: item.id, value: map(item) }));
  });
}

const withId = <T>(snapshot: QueryDocumentSnapshot<DocumentData>): T => ({
  ...snapshot.data(),
  id: snapshot.id,
}) as T;

const withDate = <T>(field: string) => (snapshot: QueryDocumentSnapshot<DocumentData>): T => {
  const data = snapshot.data();
  return { ...data, id: snapshot.id, [field]: toDate(data[field]) } as T;
};

/**
 * Read the authoritative Firestore history. Unlike startup loaders, this has
 * no 90-day or record-count bound and keeps paging until the final short page.
 */
export async function loadAuthoritativeCloudBackupData(boutiqueId: string, database: Firestore = db): Promise<BackupData> {
  if (!database || (!isFirebaseConfigured && database === db)) throw new Error('firebase_not_configured');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('cloud_backup_requires_online');

  const [settingsSnapshot, saleCounterSnapshot] = await Promise.all([
    getDoc(doc(database, `boutiques/${boutiqueId}/settings/main`)),
    getDoc(doc(database, `boutiques/${boutiqueId}/meta/saleCounter`)),
  ]);
  if (!settingsSnapshot.exists()) throw new Error('cloud_boutique_not_initialized');

  const [users, products, sales, customers, suppliers, expenses, cashSessions, cashOuts,
    stockMovements, inventorySessions, payments, clotures] = await Promise.all([
    loadCollection(database, boutiqueId, 'users', withId),
    loadCollection(database, boutiqueId, 'products', withId),
    loadCollection(database, boutiqueId, 'sales', withDate('date')),
    loadCollection(database, boutiqueId, 'customers', withId),
    loadCollection(database, boutiqueId, 'suppliers', withId),
    loadCollection(database, boutiqueId, 'expenses', withDate('date')),
    loadCollection(database, boutiqueId, 'cash_sessions', withId),
    loadCollection(database, boutiqueId, 'cash_outs', withDate('date')),
    loadCollection(database, boutiqueId, 'stock_movements', withDate('date')),
    loadCollection(database, boutiqueId, 'inventory_sessions', withId),
    loadCollection(database, boutiqueId, 'payments', withDate('date')),
    loadCollection(database, boutiqueId, 'clotures', withId),
  ]);

  return {
    settings: settingsSnapshot.data() as BackupData['settings'],
    users: users as BackupData['users'],
    products: products as BackupData['products'],
    sales: sales as BackupData['sales'],
    customers: customers as BackupData['customers'],
    suppliers: suppliers as BackupData['suppliers'],
    expenses: expenses as BackupData['expenses'],
    cashSessions: cashSessions as BackupData['cashSessions'],
    cashOuts: cashOuts as BackupData['cashOuts'],
    stockMovements: stockMovements as BackupData['stockMovements'],
    inventorySessions: inventorySessions as BackupData['inventorySessions'],
    payments: payments as BackupData['payments'],
    clotures: clotures as BackupData['clotures'],
    saleCounter: saleCounterSnapshot.exists() ? Number(saleCounterSnapshot.data().value ?? 0) : 0,
  };
}
