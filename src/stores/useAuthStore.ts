import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hashPin } from '@/lib/crypto';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveUser, fsDeleteUser } from '@/services/firestoreService';

export type UserRole = 'gérant' | 'caissier';

export interface User {
  id: string;
  prenom: string;
  nom: string;
  role: UserRole;
  pin: string; // SHA-256 hash
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
  addUser: (user: Omit<User, 'id'> & { pin: string }) => Promise<void>;
  updateUserPin: (userId: string, newPin: string) => Promise<void>;
  deleteUser: (userId: string) => void;
}

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // users is populated by FirebaseProvider on startup
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
        const hashedPin = await hashPin(pin);

        if (user && user.pin === hashedPin) {
          set({
            currentUser: user,
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
        const id = Date.now().toString();
        const hashedPin = await hashPin(userData.pin);
        const newUser: User = { ...userData, id, pin: hashedPin };
        set(state => ({ users: [...state.users, newUser] }));
        fsSaveUser(getBoutiqueId(), newUser).catch(console.error);
      },

      updateUserPin: async (userId, newPin) => {
        const hashedPin = await hashPin(newPin);
        const updated = get().users.map(u => u.id === userId ? { ...u, pin: hashedPin } : u);
        set({ users: updated });
        const user = updated.find(u => u.id === userId);
        if (user) fsSaveUser(getBoutiqueId(), user).catch(console.error);
      },

      deleteUser: (userId) => {
        set(state => ({ users: state.users.filter(u => u.id !== userId) }));
        fsDeleteUser(getBoutiqueId(), userId).catch(console.error);
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
