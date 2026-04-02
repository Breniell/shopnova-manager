import { create } from 'zustand';

export type UserRole = 'gérant' | 'caissier';

export interface User {
  id: string;
  prenom: string;
  nom: string;
  role: UserRole;
  pin: string;
  color: string;
}

interface AuthState {
  users: User[];
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (userId: string, pin: string) => boolean;
  logout: () => void;
  addUser: (user: Omit<User, 'id'>) => void;
  updateUserPin: (userId: string, newPin: string) => void;
  deleteUser: (userId: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  users: [
    { id: '1', prenom: 'Marie', nom: 'Nguema', role: 'gérant', pin: '0000', color: '#6C63FF' },
    { id: '2', prenom: 'Paul', nom: 'Mbarga', role: 'caissier', pin: '1234', color: '#00D4AA' },
    { id: '3', prenom: 'Fatou', nom: 'Diallo', role: 'caissier', pin: '5678', color: '#F59E0B' },
  ],
  currentUser: null,
  isAuthenticated: false,
  login: (userId, pin) => {
    const user = get().users.find(u => u.id === userId);
    if (user && user.pin === pin) {
      set({ currentUser: user, isAuthenticated: true });
      return true;
    }
    return false;
  },
  logout: () => set({ currentUser: null, isAuthenticated: false }),
  addUser: (userData) => {
    const id = Date.now().toString();
    set(state => ({ users: [...state.users, { ...userData, id }] }));
  },
  updateUserPin: (userId, newPin) => {
    set(state => ({
      users: state.users.map(u => u.id === userId ? { ...u, pin: newPin } : u)
    }));
  },
  deleteUser: (userId) => {
    set(state => ({ users: state.users.filter(u => u.id !== userId) }));
  },
}));
