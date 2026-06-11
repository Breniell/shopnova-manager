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
import { useTranslation } from '@/i18n';
import { initBoutique } from '@/services/boutiqueService';
import { isFirebaseConfigured } from '@/lib/firebase';
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
async function buildDefaultUsers(): Promise<User[]> {
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

  const [pinMarie, pinPaul, pinFatou] = await Promise.all([
    hashPin('1234'),
    hashPin('5678'),
    hashPin('0000'),
  ]);
  return [
    { id: 'u-marie', prenom: 'Marie', nom: 'Nguema', role: 'gérant',   pin: pinMarie, color: '#A93200' },
    { id: 'u-paul',  prenom: 'Paul',  nom: 'Mbarga', role: 'caissier', pin: pinPaul,  color: '#00D4AA' },
    { id: 'u-fatou', prenom: 'Fatou', nom: 'Diallo', role: 'caissier', pin: pinFatou, color: '#F59E0B' },
  ];
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
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <span className="text-2xl">⚠️</span>
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

// ─── Main bootstrap ─────────────────────────────────────────────────────────────

async function bootstrapFirebase(): Promise<void> {
  // 1. Authenticate + get boutiqueId
  const boutiqueId = await initBoutique();

  // 2. Check if this boutique already exists in Firestore
  let initialized = false;
  try {
    initialized = await fsIsBoutiqueInitialized(boutiqueId);
  } catch (err) {
    console.warn('Firebase bootstrap offline fallback (isBoutiqueInitialized failed):', err);
  }

  if (!initialized) {
    // Brand-new boutique: seed Firestore with the admin account from PolicyGate
    // (or demo accounts in dev mode), then seed local state.
    const defaultUsers = await buildDefaultUsers();

    try {
      await fsInitializeBoutique(boutiqueId, {
        settings: defaultShopSettings,
        users: defaultUsers,
      });
    } catch (err) {
      // Offline on first launch — still seed local state so app is usable
      console.warn('Firebase bootstrap offline: boutique init deferred', err);
    }

    useAuthStore.getState()._setUsers(defaultUsers);
    useSettingsStore.getState()._setSettings(defaultShopSettings);
    return;
  }

  // 3. Load all data from Firestore (IndexedDB cache → instant offline)
  let results: BootstrapData;
  try {
    results = await Promise.all([
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
    ]);
  } catch (err) {
    console.warn('Firebase bootstrap offline fallback (data load failed):', err);
    if (!await trySeedLocalMode()) {
      throw err;
    }
    return;
  }

  const [
    settings, users, products, sales, movements, suppliers, customers, payments, expenses,
    cashSessions, cashOuts, inventorySessions, clotures, saleCounter
  ] = results;

  // 4. Populate Zustand stores
  if (settings)            useSettingsStore.getState()._setSettings(settings);
  if (users.length) {
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
  if (products.length)     useProductStore.getState()._setProducts(products);
  if (sales.length)        useSaleStore.getState()._setSales(sales);
  if (movements.length)    useStockStore.getState()._setMovements(movements);
  if (suppliers.length)    useSupplierStore.getState()._setSuppliers(suppliers);
  if (customers.length)    useCustomerStore.getState()._setCustomers(customers);
  if (payments.length)     usePaymentStore.getState()._setPayments(payments);
  if (expenses.length)     useExpenseStore.getState()._setExpenses(expenses);
  if (cashSessions.length) useCashSessionStore.getState()._setSessions(cashSessions);
  if (cashOuts.length)     useCashSessionStore.getState()._setCashOuts(cashOuts);
  if (inventorySessions.length) useInventoryStore.getState()._setSessions(inventorySessions);
  if (clotures.length)     useCaisseStore.getState()._setClotures(clotures);
  if (typeof saleCounter === 'number' && saleCounter > 0) useSaleStore.getState()._setSaleCounter(saleCounter);

  // 5. Send platform registry heartbeat (fire-and-forget, never blocks startup)
  const isRecoveryEnabled = !!(await import('@/services/boutiqueService')
    .then(m => m.getBoutiqueRecoveryStatus())
    .then(s => s.isRecoveryEnabled)
    .catch(() => false));
  sendRegistryHeartbeat(isRecoveryEnabled).catch(() => {});
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
    if (!isFirebaseConfigured) {
      seedLocalMode().then(() => setReady(true));
      return;
    }

    bootstrapFirebase()
      .then(() => setReady(true))
      .catch((err: unknown) => {
        console.error('Firebase bootstrap error:', err);
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      });
  }, []);

  if (error) return <ErrorScreen error={error} />;
  if (!ready) return <SplashScreen />;
  return <>{children}</>;
};