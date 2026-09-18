/**
 * Super-admin store - manages authentication and boutique registry data.
 * Uses the secondary Firebase app (legwan-superadmin) so the boutique's
 * anonymous auth session is never disturbed.
 */
import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { getSuperAdminFirebase } from '@/lib/firebase';
import type { RegistryEntry } from '@/services/registryService';

// Injected at build time - never hardcoded in source
const SUPERADMIN_EMAIL = import.meta.env.VITE_SUPERADMIN_EMAIL as string;

interface SuperAdminState {
  isAuthenticated: boolean;
  adminEmail: string | null;
  boutiques: RegistryEntry[];
  loading: boolean;
  error: string | null;

  initAuthListener: () => () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadBoutiques: () => Promise<void>;
  clearError: () => void;
}

export const useSuperAdminStore = create<SuperAdminState>((set, get) => ({
  isAuthenticated: false,
  adminEmail: null,
  boutiques: [],
  loading: false,
  error: null,

  initAuthListener: () => {
    const firebase = getSuperAdminFirebase();
    if (!firebase) return () => {};

    const unsub = onAuthStateChanged(firebase.saAuth, user => {
      const allowed = !!user && user.email === SUPERADMIN_EMAIL;
      set({
        isAuthenticated: allowed,
        adminEmail: allowed ? user!.email : null,
      });
      if (allowed && get().boutiques.length === 0) {
        get().loadBoutiques();
      }
    });
    return unsub;
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const firebase = getSuperAdminFirebase();
      if (!firebase) throw new Error('Firebase non configuré.');

      const cred = await signInWithEmailAndPassword(
        firebase.saAuth,
        email.trim().toLowerCase(),
        password
      );

      if (cred.user.email !== SUPERADMIN_EMAIL) {
        await signOut(firebase.saAuth);
        throw new Error('Accès non autorisé.');
      }

      set({ isAuthenticated: true, adminEmail: cred.user.email });
      await get().loadBoutiques();
    } catch (err) {
      // Read the code as well as the wording: only two of the codes a failed
      // sign-in can carry were mapped, so an unknown address showed the raw
      // "Firebase: Error (auth/user-not-found)." on screen. Which code comes
      // back also depends on the environment - production hides whether an
      // account exists and answers auth/invalid-credential, the emulator says
      // auth/user-not-found - so both must land on the same sentence.
      const code = String((err as { code?: unknown })?.code ?? '');
      const msg = err instanceof Error ? err.message : 'Erreur inconnue.';
      const signals = (needle: string) => code.includes(needle) || msg.includes(needle);
      const friendly =
        signals('auth/too-many-requests') ? 'Trop de tentatives. Réessayez dans quelques minutes.'
        : signals('auth/network') ? 'Connexion réseau indisponible.'
        : signals('auth/invalid-credential') || signals('auth/wrong-password')
          || signals('auth/user-not-found') || signals('auth/invalid-email')
          || signals('auth/user-disabled')
          ? 'Email ou mot de passe incorrect.'
        : msg;
      set({ error: friendly });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    const firebase = getSuperAdminFirebase();
    if (firebase) await signOut(firebase.saAuth).catch(() => {});
    set({ isAuthenticated: false, adminEmail: null, boutiques: [] });
  },

  loadBoutiques: async () => {
    set({ loading: true, error: null });
    try {
      const firebase = getSuperAdminFirebase();
      if (!firebase) throw new Error('Firebase non configuré.');

      const snap = await getDocs(
        collection(firebase.saDb, 'registry')
      );

      const entries: RegistryEntry[] = snap.docs.map(d => ({
        ...(d.data() as Omit<RegistryEntry, 'boutiqueId'>),
        boutiqueId: d.id,
        // Convert Firestore Timestamps to plain dates for display
        registeredAt: (d.data().registeredAt?.toDate?.() ?? new Date()) as unknown as import('firebase/firestore').Timestamp,
        lastSeen:     (d.data().lastSeen?.toDate?.()     ?? new Date()) as unknown as import('firebase/firestore').Timestamp,
      }));

      set({ boutiques: entries });
    } catch (err) {
      // Match on the FirebaseError code, not on the wording: production says
      // "Missing or insufficient permissions." while the emulator returns the
      // rule that refused ("Property superadmin is undefined on object ... @
      // L400"), and a merchant-facing message must not depend on which one.
      //
      // The old wording sent the reader to the Firestore rules. That is the
      // wrong place most of the time: the rules check a custom claim that only
      // the Admin SDK can grant (npm run staff:claims), so deploying rules
      // again changes nothing. This cost weeks of looking in the wrong file.
      const code = (err as { code?: unknown })?.code;
      const msg = err instanceof Error ? err.message : 'Erreur de chargement.';
      const denied = code === 'permission-denied' || msg.includes('permission');
      set({
        error: denied
          ? "Accès refusé. Ce compte doit porter le droit superadmin (npm run staff:claims), "
            + 'et les règles Firestore doivent être déployées.'
          : msg,
      });
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

/** Helper: compute boutique status from lastSeen */
export function getBoutiqueStatus(lastSeen: Date | null): 'active' | 'recent' | 'inactive' | 'unknown' {
  if (!lastSeen) return 'unknown';
  const hoursAgo = (Date.now() - lastSeen.getTime()) / 3_600_000;
  if (hoursAgo < 24) return 'active';
  if (hoursAgo < 24 * 7) return 'recent';
  return 'inactive';
}

export const STATUS_COLORS = {
  active:   '#2B6954',
  recent:   '#F59E0B',
  inactive: '#EF4444',
  unknown:  '#6B7280',
} as const;

export const STATUS_LABELS = {
  active:   'Actif',
  recent:   'Récent',
  inactive: 'Inactif',
  unknown:  'Inconnu',
} as const;
