import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hashPinPbkdf2, hashPinLegacy, generateSalt } from '@/lib/crypto';
import { getBoutiqueId, getLocalSnapshotTenantId } from '@/services/boutiqueService';
import { fsSaveUser, fsDeleteUser, fsGetLoginAttempts, fsSetLoginAttempts } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';

export type UserRole = 'gérant' | 'caissier';
export type HashAlgo = 'sha256' | 'pbkdf2';

export interface User {
  id: string;
  prenom: string;
  nom: string;
  role: UserRole;
  pin: string;     // hex hash — ALWAYS set alongside hashAlgo
  salt?: string;   // per-user random 128-bit hex salt (required when hashAlgo === 'pbkdf2')
  /**
   * Identifies which algorithm produced `pin`.
   *
   * - 'pbkdf2' : PBKDF2-SHA-256 with 200 000 iterations + per-user `salt` (v1.4.2+).
   * - 'sha256'  : legacy SHA-256, salt optional (v1.4.1 and earlier).
   * - undefined : treated as legacy sha256 (Firestore documents from before the field existed).
   *
   * INVARIANT: every User object created in application code MUST set this field.
   * The only valid source of undefined is old documents already in Firestore.
   * Keeping it optional (vs required) avoids breaking Firestore-loaded legacy users
   * that pre-date the field — they are migrated to PBKDF2 silently on next login.
   */
  hashAlgo?: HashAlgo;
  color: string;
}

interface LoginResult {
  success: boolean;
  locked?: boolean;
  remainingSeconds?: number;
}

interface AuthState {
  users: User[];
  currentUser: User | null;
  isAuthenticated: boolean;
  // Local cache of attempt counts — Firestore is the authoritative source
  loginAttempts: Record<string, { count: number; lockedUntil: number | null }>;

  _setUsers: (users: User[]) => void;

  login: (userId: string, pin: string) => Promise<LoginResult>;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'salt' | 'hashAlgo'> & { pin: string }) => Promise<void>;
  updateUserPin: (userId: string, newPin: string) => Promise<void>;
  updateUserInfo: (userId: string, info: { prenom: string; nom: string; role: UserRole }) => void;
  deleteUser: (userId: string) => void;
}

const MAX_ATTEMPTS   = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000;

function persistUser(user: User): void {
  fsSaveUser(getBoutiqueId(), user).catch((error) => {
    enqueue('userSave', user);
    toast.error("Utilisateur en attente de synchronisation");
    console.warn('[outbox] user save enqueued:', error);
  });
}

function persistUserDeletion(userId: string): void {
  fsDeleteUser(getBoutiqueId(), userId).catch((error) => {
    enqueue('userDelete', userId);
    toast.error("Suppression utilisateur en attente de synchronisation");
    console.warn('[outbox] user delete enqueued:', error);
  });
}

/** Exported for unit-testing only — do not call from application code. */
export async function verifyPin(pin: string, user: User): Promise<boolean> {
  if (user.hashAlgo === 'pbkdf2' && user.salt) {
    const hash = await hashPinPbkdf2(pin, user.salt);
    return hash === user.pin;
  }
  // Legacy: sha256 with per-user salt or global salt
  const hash = await hashPinLegacy(pin, user.salt);
  return hash === user.pin;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUser: null,
      isAuthenticated: false,
      loginAttempts: {},

      _setUsers: (users) => set({ users }),

      login: async (userId, pin) => {
        const state = get();
        const localAttempts = state.loginAttempts[userId] || { count: 0, lockedUntil: null };

        // Check local cache first (fast path)
        if (localAttempts.lockedUntil && Date.now() < localAttempts.lockedUntil) {
          return { success: false, locked: true, remainingSeconds: Math.ceil((localAttempts.lockedUntil - Date.now()) / 1000) };
        }

        // Sync with Firestore for authoritative lockout (prevents localStorage clearing)
        let firestoreAttempts = localAttempts;
        try {
          const bid = getBoutiqueId();
          const remote = await fsGetLoginAttempts(bid, userId);
          if (remote) {
            firestoreAttempts = remote;
            // Sync back to local cache
            set(s => ({ loginAttempts: { ...s.loginAttempts, [userId]: remote } }));
            if (remote.lockedUntil && Date.now() < remote.lockedUntil) {
              return { success: false, locked: true, remainingSeconds: Math.ceil((remote.lockedUntil - Date.now()) / 1000) };
            }
          }
        } catch { /* Offline — fall back to local */ }

        const user = state.users.find(u => u.id === userId);
        if (!user) return { success: false };

        const ok = await verifyPin(pin, user);

        if (ok) {
          // Reset attempt counter in both local and Firestore
          const reset = { count: 0, lockedUntil: null };
          set(s => ({ loginAttempts: { ...s.loginAttempts, [userId]: reset } }));
          try { fsSetLoginAttempts(getBoutiqueId(), userId, reset).catch(() => {}); } catch { /* hors-ligne : ignore */ }

          // Migrate legacy hash to PBKDF2 silently on successful login
          let finalUser = user;
          if (!user.hashAlgo || user.hashAlgo === 'sha256') {
            const newSalt = generateSalt();
            const newHash = await hashPinPbkdf2(pin, newSalt);
            finalUser = { ...user, pin: newHash, salt: newSalt, hashAlgo: 'pbkdf2' };
            set(s => ({ users: s.users.map(u => u.id === userId ? finalUser : u) }));
            persistUser(finalUser);
          }

          set({ currentUser: finalUser, isAuthenticated: true });
          return { success: true };
        }

        // Failed attempt
        const prevCount = firestoreAttempts.lockedUntil && Date.now() >= firestoreAttempts.lockedUntil
          ? 0 : firestoreAttempts.count;
        const newCount = prevCount + 1;
        const lockedUntil = newCount >= MAX_ATTEMPTS ? Date.now() + LOCK_DURATION_MS : null;
        const newAttempts = { count: newCount, lockedUntil };

        set(s => ({ loginAttempts: { ...s.loginAttempts, [userId]: newAttempts } }));
        try { fsSetLoginAttempts(getBoutiqueId(), userId, newAttempts).catch(() => {}); } catch { /* hors-ligne : ignore */ }

        if (lockedUntil) {
          return { success: false, locked: true, remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000) };
        }
        return { success: false };
      },

      logout: () => set({ currentUser: null, isAuthenticated: false }),

      addUser: async (userData) => {
        const id = crypto.randomUUID();
        const salt = generateSalt();
        const hashedPin = await hashPinPbkdf2(userData.pin, salt);
        const newUser: User = { ...userData, id, pin: hashedPin, salt, hashAlgo: 'pbkdf2' };
        set(s => ({ users: [...s.users, newUser] }));
        persistUser(newUser);
      },

      updateUserPin: async (userId, newPin) => {
        const salt = generateSalt();
        const hashedPin = await hashPinPbkdf2(newPin, salt);
        const updated = get().users.map(u =>
          u.id === userId ? { ...u, pin: hashedPin, salt, hashAlgo: 'pbkdf2' as HashAlgo } : u
        );
        set({ users: updated });
        const user = updated.find(u => u.id === userId);
        if (user) persistUser(user);
      },

      updateUserInfo: (userId, info) => {
        const updated = get().users.map(u => u.id === userId ? { ...u, ...info } : u);
        set({ users: updated });
        const user = updated.find(u => u.id === userId);
        if (user) persistUser(user);
        const current = get().currentUser;
        if (current?.id === userId) set({ currentUser: { ...current, ...info } });
      },

      deleteUser: (userId) => {
        set(s => ({ users: s.users.filter(u => u.id !== userId) }));
        persistUserDeletion(userId);
      },
    }),
    {
      name: 'legwan-auth',
      partialize: (state) => ({
        // PINs are already irreversibly hashed. Keeping the user directory
        // locally is required to authenticate staff when Firebase is offline.
        users:           state.users,
        loginAttempts:   state.loginAttempts,
        tenantId:        getLocalSnapshotTenantId(),
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<AuthState> & { tenantId?: string };
        const tenantId = getLocalSnapshotTenantId();
        const sameTenant = saved.tenantId === tenantId
          || (!saved.tenantId && tenantId === 'unregistered');
        return {
          ...current,
          ...(sameTenant ? saved : {}),
          // Every process start requires a fresh PIN. This also neutralizes old
          // persisted payloads that contained an authenticated manager session.
          currentUser: null,
          isAuthenticated: false,
        };
      },
    }
  )
);
