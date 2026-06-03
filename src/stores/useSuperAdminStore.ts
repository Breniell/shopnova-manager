/**
 * Super-admin store — manages authentication and boutique registry data.
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

// The only email allowed to access the super-admin dashboard
const SUPERADMIN_EMAIL = 'breniellkouda@gmail.com';

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

      if (email.trim().toLowerCase() !== SUPERADMIN_EMAIL) {
        throw new Error('Accès non autorisé.');
      }

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
      const msg = err instanceof Error ? err.message : 'Erreur inconnue.';
      const friendly = msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')
        ? 'Email ou mot de passe incorrect.'
        : msg.includes('auth/too-many-requests')
        ? 'Trop de tentatives. Réessayez dans quelques minutes.'
        : msg.includes('auth/network')
        ? 'Connexion réseau indisponible.'
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
        collection(firebase.saDb, 'platform/registry')
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
      const msg = err instanceof Error ? err.message : 'Erreur de chargement.';
      set({ error: msg.includes('permission') ? 'Accès refusé — vérifiez les règles Firestore.' : msg });
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
