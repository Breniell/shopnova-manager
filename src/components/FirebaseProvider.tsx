/**
 * FirebaseProvider
 *
 * Bootstraps the Firebase connection on app startup:
 *   1. Signs in anonymously → gets the permanent boutiqueId
 *   2. Checks if this boutique already exists in Firestore
 *   3. If new: reads legwan-pending-admin (set by PolicyGate) to create the real
 *      admin account, then seeds Firestore via fsInitializeBoutique
 *   4. Loads all collections (uses IndexedDB cache when offline → instant)
 *   5. Populates all Zustand stores
 *   6. Renders children (the app)
 *
 * Shows a branded splash screen while initializing.
 * If Firebase is not configured (missing env vars), runs in pure-local mode.
 */
import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { onSnapshot, collection, doc, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { useTranslation } from '@/i18n';
import {
  initBoutique,
  getBoutiqueId,
  activateLocalOfflineBoutique,
} from '@/services/boutiqueService';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import {
  fsIsBoutiqueInitialized,
  fsInitializeBoutique,
  fsLoadSettings,
  fsLoadUsers,
  fsLoadProducts,
  fsLoadSales,
  fsLoadMovements,
  fsLoadSuppliers,
  fsLoadCustomers,
  fsLoadPayments,
  fsLoadExpenses,
  fsLoadCashSessions,
  fsLoadCashOuts,
  fsLoadInventorySessions,
  fsLoadClotures,
  fsLoadSaleCounter,
} from '@/services/firestoreService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore, type Product } from '@/stores/useProductStore';
import { useSaleStore, type Sale } from '@/stores/useSaleStore';
import { useStockStore, type StockMovement } from '@/stores/useStockStore';
import { useSupplierStore, type Supplier } from '@/stores/useSupplierStore';
import { useCustomerStore, type Customer } from '@/stores/useCustomerStore';
import { usePaymentStore, type Payment } from '@/stores/usePaymentStore';
import { useExpenseStore, type Expense } from '@/stores/useExpenseStore';
import { useCashSessionStore, type CashOut, type CashSession } from '@/stores/useCashSessionStore';
import { useInventoryStore, type InventorySession } from '@/stores/useInventoryStore';
import { useCaisseStore, type ClotureCaisse } from '@/stores/useCaisseStore';
import { useSettingsStore, defaultShopSettings, type ShopSettings } from '@/stores/useSettingsStore';
import { hashPin, generateSalt } from '@/lib/crypto';
import type { User } from '@/stores/useAuthStore';
import { sendRegistryHeartbeat } from '@/services/registryService';
import { retryAll } from '@/lib/outbox';
import { shouldUseOfflineFallback, runBoundedStartup } from '@/lib/offlineStartup';
import { hydrateLocalSnapshot, installLocalSnapshotPersistence } from '@/lib/localSnapshot';
import { mergeSyncedSales } from '@/lib/salesSync';

const PENDING_ADMIN_KEY = 'legwan-pending-admin';

type BootstrapData = [
  ShopSettings | null,
  User[],
  Product[],
  Sale[],
  StockMovement[],
  Supplier[],
  Customer[],
  Payment[],
  Expense[],
  CashSession[],
  CashOut[],
  InventorySession[],
  ClotureCaisse[],
  number,
];

// ─── Default data for brand-new boutiques ─────────────────────────────────────

/**
 * Builds the initial user list for a new boutique.
 *
 * Priority 1: legwan-pending-admin set by PolicyGate (real owner account).
 * Priority 2: demo accounts for dev/local mode when no admin was configured.
 */
/** Exported for integration-testing only — do not call from application code. */
export async function buildDefaultUsers(): Promise<User[]> {
  const pendingRaw = localStorage.getItem(PENDING_ADMIN_KEY);
  if (pendingRaw) {
    try {
      const { prenom, nom, hashedPin, salt } = JSON.parse(pendingRaw) as {
        prenom: string; nom: string; hashedPin: string; salt: string;
      };
      if (prenom && nom && hashedPin && salt) {
        localStorage.removeItem(PENDING_ADMIN_KEY);
        return [{
          id: crypto.randomUUID(),
          prenom: prenom.trim(),
          nom: nom.trim(),
          role: 'gérant',
          pin: hashedPin,
          salt,
          hashAlgo: 'pbkdf2' as const, // PolicyGate always uses hashPin(pin, salt) → PBKDF2
          color: '#A93200',
        }];
      }
    } catch {
      localStorage.removeItem(PENDING_ADMIN_KEY);
    }
  }

  // Fallback: seeded demo accounts — DEV / LOCAL MODE ONLY.
  // In production (Firebase configured), the real admin always comes from
  // PENDING_ADMIN_KEY set by PolicyGate at first install. We must never seed
  // accounts with hardcoded, well-known PINs into a real boutique — that would
  // be a standing backdoor (e.g. a "gérant" account with PIN 1234).
  if (isFirebaseConfigured) {
    return [];
  }

  // One random salt per demo user so hashAlgo and salt always travel together.
  const [saltMarie, saltPaul, saltFatou] = [generateSalt(), generateSalt(), generateSalt()];
  const [pinMarie, pinPaul, pinFatou] = await Promise.all([
    hashPin('1234', saltMarie),
    hashPin('5678', saltPaul),
    hashPin('0000', saltFatou),
  ]);
  return [
    { id: 'u-marie', prenom: 'Marie', nom: 'Nguema', role: 'gérant',   pin: pinMarie, salt: saltMarie, hashAlgo: 'pbkdf2' as const, color: '#A93200' },
    { id: 'u-paul',  prenom: 'Paul',  nom: 'Mbarga', role: 'caissier', pin: pinPaul,  salt: saltPaul,  hashAlgo: 'pbkdf2' as const, color: '#00D4AA' },
    { id: 'u-fatou', prenom: 'Fatou', nom: 'Diallo', role: 'caissier', pin: pinFatou, salt: saltFatou, hashAlgo: 'pbkdf2' as const, color: '#F59E0B' },
  ];
}

// ─── Registry heartbeat (fire-and-forget) ────────────────────────────────────

/**
 * Kicks off the platform registry heartbeat without blocking the caller.
 * Intentionally synchronous (void, not async): startup completes before the
 * network round-trip resolves.  Called once per bootstrap, whichever path is
 * taken (first launch OR subsequent launches), so there is never a double-send.
 */
function scheduleHeartbeat(): void {
  import('@/services/boutiqueService')
    .then(m => m.getBoutiqueRecoveryStatus())
    .then(s => sendRegistryHeartbeat(!!s.isRecoveryEnabled))
    .catch(() => {});
}

// ─── Seed local demo data (no Firebase) ──────────────────────────────────────

async function seedLocalMode(): Promise<void> {
  if (useAuthStore.getState().users.length > 0) return;
  const defaultUsers = await buildDefaultUsers();
  useAuthStore.getState()._setUsers(defaultUsers);
  useSettingsStore.getState()._setSettings(defaultShopSettings);
}

// ─── Splash screen ─────────────────────────────────────────────────────────────

const SplashScreen: React.FC<{ message?: string }> = ({ message }) => (
  <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-6 z-[9999]">
    <svg width="64" height="64" viewBox="0 0 80 80" fill="none">
      <rect width="80" height="80" rx="18" fill="#A93200"/>
      <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="20" y1="13" x2="20" y2="60" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <line x1="20" y1="60" x2="34" y2="60" stroke="white" strokeWidth="5" strokeLinecap="round"/>
    </svg>

    <div className="text-center">
      <p className="text-xl font-bold text-foreground font-['Space_Grotesk']">Legwan</p>
      <p className="text-sm text-muted-foreground mt-1">
        {message ?? 'Chargement…'}
      </p>
    </div>

    <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
      <div className="h-full bg-primary rounded-full animate-[loading_1.5s_ease-in-out_infinite]" style={{ width: '60%' }} />
    </div>

    <style>{`
      @keyframes loading {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(266%); }
      }
    `}</style>
  </div>
);

const ErrorScreen: React.FC<{ error: string }> = ({ error }) => {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4 p-6 z-[9999]">
      <div className="w-16 h-16 rounded-xl bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground text-center">
        {t('common.firebaseError')}
      </h2>
      <p className="text-sm text-muted-foreground text-center max-w-sm">{error}</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        {t('common.firebaseEnvHint')}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="nova-btn-primary px-6 py-2 rounded-lg text-sm"
      >
        {t('common.retry')}
      </button>
    </div>
  );
};

// ─── Real-time listeners ──────────────────────────────────────────────────────
// Business collections get live updates so a second till cannot keep stale
// accounting, session or inventory data until the next application restart.

function subscribeToRealtime(bid: string): Array<() => void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const parseDate = (value: unknown): Date => value instanceof Timestamp ? value.toDate()
    : value instanceof Date ? value
    : new Date(value as string);

  const mapSales = (documents: Array<{ id: string; data: () => Record<string, unknown> }>): Sale[] =>
    documents.map(item => {
      const data = item.data();
      return { ...(data as unknown as Sale), id: item.id, date: parseDate(data.date) };
    });

  const unsubProducts = onSnapshot(
    collection(db, `boutiques/${bid}/products`),
    snap => {
      const products = snap.docs.map(d => ({ ...(d.data() as Product), id: d.id }));
      useProductStore.getState()._setProducts(products);
    },
    err => console.warn('[onSnapshot] products:', err),
  );

  let recentSales: Sale[] | null = null;
  let creditSales: Sale[] | null = null;
  const publishSales = () => {
    if (!recentSales || !creditSales) return;
    const merged = mergeSyncedSales(
      recentSales,
      creditSales,
      useSaleStore.getState().sales,
      cutoff,
    );
    useSaleStore.getState()._setSales(merged);
  };

  const unsubRecentSales = onSnapshot(
    query(
      collection(db, `boutiques/${bid}/sales`),
      where('date', '>=', Timestamp.fromDate(cutoff)),
      orderBy('date', 'desc'),
      limit(2000),
    ),
    snap => {
      recentSales = mapSales(snap.docs);
      publishSales();
    },
    err => console.warn('[onSnapshot] recent sales:', err),
  );

  const unsubCreditSales = onSnapshot(
    query(collection(db, `boutiques/${bid}/sales`), where('paymentMode', '==', 'credit')),
    snap => {
      creditSales = mapSales(snap.docs);
      publishSales();
    },
    err => console.warn('[onSnapshot] credit sales:', err),
  );

  const unsubPayments = onSnapshot(
    query(
      collection(db, `boutiques/${bid}/payments`),
      orderBy('date', 'desc'),
    ),
    snap => {
      const payments = snap.docs.map(d => {
        const data = d.data();
        return { ...(data as Payment), id: d.id, date: parseDate(data.date) };
      });
      usePaymentStore.getState()._setPayments(payments);
    },
    err => console.warn('[onSnapshot] payments:', err),
  );

  const unsubUsers = onSnapshot(
    collection(db, `boutiques/${bid}/users`),
    snap => {
      const users = snap.docs.map(d => ({ ...(d.data() as User), id: d.id }));
      // Preserve the offline PIN directory on an empty cache emission, but an
      // empty server snapshot is authoritative (for example after revocation).
      if (users.length || !snap.metadata.fromCache) useAuthStore.getState()._setUsers(users);
    },
    err => console.warn('[onSnapshot] users:', err),
  );

  const unsubCustomers = onSnapshot(
    collection(db, `boutiques/${bid}/customers`),
    snap => {
      const customers = snap.docs.map(d => ({ ...(d.data() as Customer), id: d.id }));
      useCustomerStore.getState()._setCustomers(customers);
    },
    err => console.warn('[onSnapshot] customers:', err),
  );

  const unsubSettings = onSnapshot(
    doc(db, `boutiques/${bid}/settings/main`),
    snap => {
      if (snap.exists()) useSettingsStore.getState()._setSettings(snap.data() as ShopSettings);
    },
    err => console.warn('[onSnapshot] settings:', err),
  );

  const unsubMovements = onSnapshot(
    query(collection(db, `boutiques/${bid}/stock_movements`), orderBy('date', 'desc')),
    snap => useStockStore.getState()._setMovements(snap.docs.map(item => {
      const data = item.data();
      return { ...(data as StockMovement), id: item.id, date: parseDate(data.date) };
    })),
    err => console.warn('[onSnapshot] stock movements:', err),
  );

  const unsubSuppliers = onSnapshot(
    collection(db, `boutiques/${bid}/suppliers`),
    snap => useSupplierStore.getState()._setSuppliers(
      snap.docs.map(item => ({ ...(item.data() as Supplier), id: item.id })),
    ),
    err => console.warn('[onSnapshot] suppliers:', err),
  );

  const unsubExpenses = onSnapshot(
    query(collection(db, `boutiques/${bid}/expenses`), orderBy('date', 'desc')),
    snap => useExpenseStore.getState()._setExpenses(snap.docs.map(item => {
      const data = item.data();
      return { ...(data as Expense), id: item.id, date: parseDate(data.date) };
    })),
    err => console.warn('[onSnapshot] expenses:', err),
  );

  const unsubCashSessions = onSnapshot(
    query(collection(db, `boutiques/${bid}/cash_sessions`), orderBy('openedAt', 'desc')),
    snap => {
      const sessions = snap.docs.map(item => ({ ...(item.data() as CashSession), id: item.id }));
      const store = useCashSessionStore.getState();
      store._setSessions(sessions);
      if (store.currentSessionId && !sessions.some(
        session => session.id === store.currentSessionId && session.status === 'open',
      )) store._setCurrentSessionId(null);
    },
    err => console.warn('[onSnapshot] cash sessions:', err),
  );

  const unsubCashOuts = onSnapshot(
    query(collection(db, `boutiques/${bid}/cash_outs`), orderBy('date', 'desc')),
    snap => useCashSessionStore.getState()._setCashOuts(snap.docs.map(item => {
      const data = item.data();
      return { ...(data as CashOut), id: item.id, date: parseDate(data.date) };
    })),
    err => console.warn('[onSnapshot] cash outs:', err),
  );

  const unsubInventorySessions = onSnapshot(
    query(collection(db, `boutiques/${bid}/inventory_sessions`), orderBy('createdAt', 'desc')),
    snap => useInventoryStore.getState()._setSessions(
      snap.docs.map(item => ({ ...(item.data() as InventorySession), id: item.id })),
    ),
    err => console.warn('[onSnapshot] inventory sessions:', err),
  );

  const unsubClotures = onSnapshot(
    query(collection(db, `boutiques/${bid}/clotures`), orderBy('date', 'desc')),
    snap => useCaisseStore.getState()._setClotures(
      snap.docs.map(item => ({ ...(item.data() as ClotureCaisse), id: item.id })),
    ),
    err => console.warn('[onSnapshot] clotures:', err),
  );

  return [
    unsubProducts,
    unsubRecentSales,
    unsubCreditSales,
    unsubPayments,
    unsubUsers,
    unsubCustomers,
    unsubSettings,
    unsubMovements,
    unsubSuppliers,
    unsubExpenses,
    unsubCashSessions,
    unsubCashOuts,
    unsubInventorySessions,
    unsubClotures,
  ];
}

// ─── Main bootstrap ─────────────────────────────────────────────────────────────

/** Exported for integration-testing only — do not call from application code. */
export async function bootstrapFirebase(localSnapshotAvailable = false): Promise<void> {
  // 1. Authenticate + get boutiqueId
  const boutiqueId = await initBoutique();

  // A hydrated autonomous snapshot is the newest crash-safe source on this
  // device. Never replace it with a possibly older or incomplete Firestore
  // cache while disconnected. Installations upgrading from an older version
  // may not have such a snapshot yet, so they still get one cache hydration.
  if (localSnapshotAvailable && typeof navigator !== 'undefined' && navigator.onLine === false) return;

  // 2. Check if this boutique already exists in Firestore
  // A failed probe is not evidence of a new boutique. Propagate the failure so
  // a cache miss, permission error, or transient outage can never enqueue a
  // destructive reinitialization of an existing cloud tenant.
  const initialized = await fsIsBoutiqueInitialized(boutiqueId);

  if (!initialized) {
    const pendingAdmin = localStorage.getItem(PENDING_ADMIN_KEY);
    if (isFirebaseConfigured && !pendingAdmin) {
      // Expected on a genuine first launch (PolicyGate hasn't written pendingAdmin yet).
      // Unexpected after a restore — signInBoutiqueRecoveryAccount should have caught this.
      // If you see this after a restore attempt, check [Restore] logs above for the cause.
      console.error('[Restore] No boutique data and no pending admin for UID:', boutiqueId);
    }

    // Brand-new boutique: seed Firestore with the admin account from PolicyGate
    // (or demo accounts in dev mode), then seed local state.
    let defaultUsers = useAuthStore.getState().users;
    // A first launch may have completed locally while the PC was disconnected.
    // In that case PolicyGate's pending admin has already been consumed and is
    // now present in the persisted auth store. Reuse it when Firebase becomes
    // available instead of initializing the new remote tenant with no users.
    if (!defaultUsers.length) defaultUsers = await buildDefaultUsers();

    try {
      await fsInitializeBoutique(boutiqueId, {
        settings: useSettingsStore.getState().shop,
        users: defaultUsers,
      });
    } catch (err) {
      // Offline on first launch — still seed local state so app is usable
      console.error('[Restore] fsInitializeBoutique failed (offline or permission error):', err);
    }

    useAuthStore.getState()._setUsers(defaultUsers);
    // Keep settings restored from the autonomous snapshot. On a genuine first
    // launch this state is already defaultShopSettings.
    useSettingsStore.getState()._setSettings(useSettingsStore.getState().shop);
    scheduleHeartbeat(); // first-ever registration: boutique appears in registry immediately
    return;
  }

  // 3. Load all data from Firestore (IndexedDB cache → instant offline)
  const results = (await Promise.all([
      fsLoadSettings(boutiqueId),
      fsLoadUsers(boutiqueId),
      fsLoadProducts(boutiqueId),
      fsLoadSales(boutiqueId),
      fsLoadMovements(boutiqueId),
      fsLoadSuppliers(boutiqueId),
      fsLoadCustomers(boutiqueId),
      fsLoadPayments(boutiqueId),
      fsLoadExpenses(boutiqueId),
      fsLoadCashSessions(boutiqueId),
      fsLoadCashOuts(boutiqueId),
      fsLoadInventorySessions(boutiqueId),
      fsLoadClotures(boutiqueId),
      fsLoadSaleCounter(boutiqueId),
  ])) as unknown as BootstrapData;

  const [
    settings, users, products, sales, movements, suppliers, customers, payments, expenses,
    cashSessions, cashOuts, inventorySessions, clotures, saleCounter
  ] = results;

  // 4. Populate Zustand stores
  // Connected reads are authoritative, including an empty collection. Offline
  // cache hydration (used only when upgrading without a local snapshot) keeps
  // an existing local value when that collection is absent from the cache.
  const authoritative = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (settings)            useSettingsStore.getState()._setSettings(settings);
  if (authoritative || users.length) {
    useAuthStore.getState()._setUsers(users);
    // Security: validate that the persisted currentUser still exists in Firestore
    // Prevents localStorage manipulation to bypass PIN authentication
    const { currentUser, isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated && currentUser) {
      const stillValid = users.some(u => u.id === currentUser.id);
      if (!stillValid) {
        useAuthStore.getState().logout();
      }
    }
  }
  if (authoritative || products.length)     useProductStore.getState()._setProducts(products);
  if (authoritative || sales.length) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    useSaleStore.getState()._setSales(mergeSyncedSales(
      sales.filter(sale => new Date(sale.date) >= cutoff),
      sales.filter(sale => sale.paymentMode === 'credit'),
      useSaleStore.getState().sales,
      cutoff,
    ));
  }
  if (authoritative || movements.length)    useStockStore.getState()._setMovements(movements);
  if (authoritative || suppliers.length)    useSupplierStore.getState()._setSuppliers(suppliers);
  if (authoritative || customers.length)    useCustomerStore.getState()._setCustomers(customers);
  if (authoritative || payments.length)     usePaymentStore.getState()._setPayments(payments);
  if (authoritative || expenses.length)     useExpenseStore.getState()._setExpenses(expenses);
  if (authoritative || cashSessions.length) useCashSessionStore.getState()._setSessions(cashSessions);
  if (authoritative) {
    const currentSessionId = useCashSessionStore.getState().currentSessionId;
    if (currentSessionId && !cashSessions.some(session => session.id === currentSessionId)) {
      useCashSessionStore.getState()._setCurrentSessionId(null);
    }
  }
  if (authoritative || cashOuts.length)     useCashSessionStore.getState()._setCashOuts(cashOuts);
  if (authoritative || inventorySessions.length) useInventoryStore.getState()._setSessions(inventorySessions);
  if (authoritative || clotures.length)     useCaisseStore.getState()._setClotures(clotures);
  if (authoritative || saleCounter > 0) useSaleStore.getState()._setSaleCounter(saleCounter);

  // 5. Send platform registry heartbeat (fire-and-forget, never blocks startup)
  scheduleHeartbeat();
}

async function trySeedLocalMode(): Promise<boolean> {
  try {
    await seedLocalMode();
    return true;
  } catch (err) {
    console.warn('Local fallback failed:', err);
    return false;
  }
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Restore autonomous local data before any cloud read can fail or time out.
    const localHydration = hydrateLocalSnapshot().then((available) => {
      installLocalSnapshotPersistence();
      return available;
    });

    if (!isFirebaseConfigured) {
      localHydration.then(() => seedLocalMode()).then(() => setReady(true));
      return;
    }

    let realtimeUnsubs: Array<() => void> = [];
    let usedOfflineFallback = false;

    const finishCloudBootstrap = () => {
        setReady(true);
        if (navigator.onLine === false || !isFirebaseConfigured) {
          // Stay exclusively on the autonomous snapshot for this session. A
          // reload on `online` performs a fresh authenticated cloud bootstrap.
          usedOfflineFallback = true;
          return;
        }
        // Retry any writes that were rejected before this session started.
        retryAll().catch(() => {});
        // Start real-time listeners now that auth is established.
        realtimeUnsubs.forEach(fn => fn());
        realtimeUnsubs = subscribeToRealtime(getBoutiqueId());
      };

    const cloudBootstrap = localHydration.then((available) => bootstrapFirebase(available));
    runBoundedStartup(cloudBootstrap, finishCloudBootstrap)
      .then(finishCloudBootstrap)
      .catch(async (err: unknown) => {
        console.error('Firebase bootstrap error:', err);
        // Cloud availability must never prevent a locally installed POS from
        // opening. A normal offline bootstrap reads Firestore's IndexedDB;
        // this last-resort path still exposes the persisted hashed staff list.
        if (shouldUseOfflineFallback(err)) {
          // A timeout while navigator still says "online" is only a degraded
          // session: keep observing the in-flight cloud bootstrap. Permanent
          // local mode is reserved for a genuinely disconnected first install.
          const code = typeof err === 'object' && err && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
          if (navigator.onLine === false || code === 'auth/local-session-missing') {
            activateLocalOfflineBoutique();
          }
          if (await trySeedLocalMode()) {
            usedOfflineFallback = true;
            setReady(true);
            return;
          }
        }
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      });

    const handleOnline = () => {
      // Re-run authentication/bootstrap instead of continuing indefinitely
      // with a degraded local shell. initBoutique protects an existing tenant
      // from being replaced by a new anonymous UID if its session was lost.
      if (usedOfflineFallback) {
        window.location.reload();
        return;
      }
      retryAll().catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      realtimeUnsubs.forEach(fn => fn());
    };
  }, []);

  if (error) return <ErrorScreen error={error} />;
  if (!ready) return <SplashScreen />;
  return <>{children}</>;
};
