import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hashPin, generateSalt } from '@/lib/crypto';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveUser, fsDeleteUser } from '@/services/firestoreService';

export type UserRole = 'gérant' | 'caissier';

export interface User {
  id: string;
  prenom: string;
  nom: string;
  role: UserRole;
  pin: string; // SHA-256 hash
  salt?: string; // per-user random salt (undefined = legacy global salt)
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
  loginAttempts: Record<string, { count: number; lockedUntil: number | null }>;

  /** Internal: called by FirebaseProvider on startup with Firestore users */
  _setUsers: (users: User[]) => void;

  login: (userId: string, pin: string) => Promise<LoginResult>;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'salt'> & { pin: string }) => Promise<void>;
  updateUserPin: (userId: string, newPin: string) => Promise<void>;
  deleteUser: (userId: string) => void;
}

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000;

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
        const attempts = state.loginAttempts[userId] || { count: 0, lockedUntil: null };

        if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
          const remainingSeconds = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
          return { success: false, locked: true, remainingSeconds };
        }

        const user = state.users.find(u => u.id === userId);
        // Use per-user salt when present, fall back to legacy global salt for old users
        const hashedPin = await hashPin(pin, user?.salt);

        if (user && user.pin === hashedPin) {
          let finalUser = user;

          // Transparent migration: upgrade legacy-salt users to per-user salt on first login
          if (!user.salt) {
            const newSalt = generateSalt();
            const newHash = await hashPin(pin, newSalt);
            finalUser = { ...user, salt: newSalt, pin: newHash };
            set(state => ({ users: state.users.map(u => u.id === userId ? finalUser : u) }));
            try {
              fsSaveUser(getBoutiqueId(), finalUser).catch(console.error);
            } catch { /* Firebase not yet initialized — will sync later */ }
          }

          set({
            currentUser: finalUser,
            isAuthenticated: true,
            loginAttempts: { ...state.loginAttempts, [userId]: { count: 0, lockedUntil: null } },
          });
          return { success: true };
        }

        const newCount =
          (attempts.lockedUntil && Date.now() >= attempts.lockedUntil ? 0 : attempts.count) + 1;
        const lockedUntil = newCount >= MAX_ATTEMPTS ? Date.now() + LOCK_DURATION_MS : null;
        set({
          loginAttempts: { ...state.loginAttempts, [userId]: { count: newCount, lockedUntil } },
        });

        if (lockedUntil) {
          return { success: false, locked: true, remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000) };
        }
        return { success: false };
      },

      logout: () => set({ currentUser: null, isAuthenticated: false }),

      addUser: async (userData) => {
        const id = crypto.randomUUID();
        const salt = generateSalt();
        const hashedPin = await hashPin(userData.pin, salt);
        const newUser: User = { ...userData, id, pin: hashedPin, salt };
        set(state => ({ users: [...state.users, newUser] }));
        try {
          fsSaveUser(getBoutiqueId(), newUser).catch(console.error);
        } catch { /* Firebase not yet initialized */ }
      },

      updateUserPin: async (userId, newPin) => {
        const newSalt = generateSalt();
        const hashedPin = await hashPin(newPin, newSalt);
        const updated = get().users.map(u =>
          u.id === userId ? { ...u, pin: hashedPin, salt: newSalt } : u
        );
        set({ users: updated });
        const user = updated.find(u => u.id === userId);
        if (user) {
          try {
            fsSaveUser(getBoutiqueId(), user).catch(console.error);
          } catch { /* Firebase not yet initialized */ }
        }
      },

      deleteUser: (userId) => {
        set(state => ({ users: state.users.filter(u => u.id !== userId) }));
        try {
          fsDeleteUser(getBoutiqueId(), userId).catch(console.error);
        } catch { /* Firebase not yet initialized */ }
      },
    }),
    {
      name: 'legwan-auth',
      // Only persist session data locally — users come from Firestore
      partialize: (state) => ({
        currentUser:     state.currentUser,
        isAuthenticated: state.isAuthenticated,
        loginAttempts:   state.loginAttempts,
      }),
    }
  )
);
