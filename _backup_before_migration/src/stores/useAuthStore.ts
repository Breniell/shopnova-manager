import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  login: (userId: string, pin: string) => Promise<LoginResult>;
  logout: () => void;
  addUser: (user: Omit<User, 'id'> & { pin: string }) => Promise<void>;
  updateUserPin: (userId: string, newPin: string) => Promise<void>;
  deleteUser: (userId: string) => void;
}

async function hashPin(pin: string): Promise<string> {
  const salt = 'shopnova-salt-2026';
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const defaultUsers: User[] = [
  { id: '1', prenom: 'Marie', nom: 'Nguema', role: 'gérant', pin: '10d9c3dbf8290bb73fa79d01dfe7207167d4537150736562659aeb7fe5a7e776', color: '#6C63FF' },
  { id: '2', prenom: 'Paul', nom: 'Mbarga', role: 'caissier', pin: '4e24766baefc94b9ea152328bde8347bd1f9f8b9e9c6dcb42b31a6b0f47cd841', color: '#00D4AA' },
  { id: '3', prenom: 'Fatou', nom: 'Diallo', role: 'caissier', pin: 'fc87114be3c9a8da05007712aca08ae14cd7747b140dcb7d0de5fe1f6c2c9898', color: '#F59E0B' },
];

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: defaultUsers,
      currentUser: null,
      isAuthenticated: false,
      loginAttempts: {},
      login: async (userId, pin) => {
        const state = get();
        const attempts = state.loginAttempts[userId] || { count: 0, lockedUntil: null };

        // Check lock
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

        // Failed attempt
        const newCount = (attempts.lockedUntil && Date.now() >= attempts.lockedUntil ? 0 : attempts.count) + 1;
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
        set(state => ({ users: [...state.users, { ...userData, id, pin: hashedPin }] }));
      },
      updateUserPin: async (userId, newPin) => {
        const hashedPin = await hashPin(newPin);
        set(state => ({
          users: state.users.map(u => u.id === userId ? { ...u, pin: hashedPin } : u)
        }));
      },
      deleteUser: (userId) => {
        set(state => ({ users: state.users.filter(u => u.id !== userId) }));
      },
    }),
    {
      name: 'shopnova-auth',
      partialize: (state) => ({ users: state.users, loginAttempts: state.loginAttempts }),
    }
  )
);
