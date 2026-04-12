/**
 * FirebaseProvider
 *
 * Bootstraps the Firebase connection on app startup:
 *   1. Signs in anonymously → gets the permanent boutiqueId
 *   2. Checks if this boutique already exists in Firestore
 *   3. If new: seeds default settings + default gérant user
 *   4. Loads all collections (uses IndexedDB cache when offline → instant)
 *   5. Populates all Zustand stores
 *   6. Renders children (the app)
 *
 * Shows a branded splash screen while initializing.
 * If Firebase is not configured (missing env vars), skips cloud sync
 * and runs in pure-local mode with localStorage via Zustand persist.
 */
import React, { useState, useEffect } from 'react';
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
} from '@/services/firestoreService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useStockStore } from '@/stores/useStockStore';
import { useSettingsStore, defaultShopSettings, type ShopSettings } from '@/stores/useSettingsStore';
import { hashPin } from '@/lib/crypto';
import type { User } from '@/stores/useAuthStore';

// ─── Default data for brand-new boutiques ─────────────────────────────────────

async function buildDefaultUsers(): Promise<User[]> {
  const gerantPin = await hashPin('1234');
  return [
    {
      id: 'u-gerant',
      prenom: 'Gérant',
      nom: '',
      role: 'gérant',
      pin: gerantPin,
      color: '#A93200',
    },
  ];
}

// ─── Splash screen ─────────────────────────────────────────────────────────────

const SplashScreen: React.FC<{ message?: string }> = ({ message }) => (
  <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-6 z-[9999]">
    {/* Logo mark */}
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M32 4L58.5 19V45L32 60L5.5 45V19L32 4Z"
        fill="#A93200"
      />
      <path
        d="M22 28h20M22 36h12"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>

    <div className="text-center">
      <p className="text-xl font-bold text-foreground font-['Space_Grotesk']">Legwan</p>
      <p className="text-sm text-muted-foreground mt-1">
        {message ?? 'Chargement…'}
      </p>
    </div>

    {/* Progress bar */}
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

const ErrorScreen: React.FC<{ error: string }> = ({ error }) => (
  <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4 p-6 z-[9999]">
    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
      <span className="text-2xl">⚠️</span>
    </div>
    <h2 className="text-lg font-semibold text-foreground text-center">
      Erreur de connexion Firebase
    </h2>
    <p className="text-sm text-muted-foreground text-center max-w-sm">{error}</p>
    <p className="text-xs text-muted-foreground text-center max-w-sm">
      Vérifiez votre fichier <code className="bg-muted px-1 rounded">.env</code> et les credentials Firebase.
    </p>
    <button
      onClick={() => window.location.reload()}
      className="nova-btn-primary px-6 py-2 rounded-lg text-sm"
    >
      Réessayer
    </button>
  </div>
);

// ─── Main provider ─────────────────────────────────────────────────────────────

async function bootstrapFirebase(): Promise<void> {
  // 1. Authenticate + get boutiqueId
  const boutiqueId = await initBoutique();

  // 2. Check if this boutique exists in Firestore
  const initialized = await fsIsBoutiqueInitialized(boutiqueId);

  if (!initialized) {
    // 3. First launch — seed defaults
    const defaultUsers = await buildDefaultUsers();
    await fsInitializeBoutique(boutiqueId, {
      settings: defaultShopSettings,
      users: defaultUsers,
    });

    // Populate stores with the seeded defaults
    useAuthStore.getState()._setUsers(defaultUsers);
    useSettingsStore.getState()._setSettings(defaultShopSettings);
    // Products and sales start empty for a new boutique
    return;
  }

  // 4. Load all data from Firestore (uses IndexedDB cache offline — instant)
  const [settings, users, products, sales, movements] = await Promise.all([
    fsLoadSettings(boutiqueId),
    fsLoadUsers(boutiqueId),
    fsLoadProducts(boutiqueId),
    fsLoadSales(boutiqueId),
    fsLoadMovements(boutiqueId),
  ]);

  // 5. Populate Zustand stores
  if (settings) useSettingsStore.getState()._setSettings(settings as ShopSettings);
  if (users.length)     useAuthStore.getState()._setUsers(users);
  if (products.length)  useProductStore.getState()._setProducts(products);
  if (sales.length)     useSaleStore.getState()._setSales(sales);
  if (movements.length) useStockStore.getState()._setMovements(movements);
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(!isFirebaseConfigured); // if no Firebase, show immediately
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return; // pure-local mode, nothing to do

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
