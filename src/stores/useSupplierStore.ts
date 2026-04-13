import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveSupplier, fsDeleteSupplier } from '@/services/firestoreService';

export interface Supplier {
  id: string;
  nom: string;
  telephone: string;
  email?: string;
  adresse?: string;
  notes?: string;
}

interface SupplierState {
  suppliers: Supplier[];

  /** Internal: called by FirebaseProvider on startup */
  _setSuppliers: (suppliers: Supplier[]) => void;

  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateSupplier: (id: string, data: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
}

export const useSupplierStore = create<SupplierState>()((set, get) => ({
  suppliers: [],

  _setSuppliers: (suppliers) => set({ suppliers }),

  addSupplier: (supplier) => {
    const id = 'sup' + Date.now();
    const newSupplier: Supplier = { ...supplier, id };
    set(state => ({ suppliers: [...state.suppliers, newSupplier] }));
    fsSaveSupplier(getBoutiqueId(), newSupplier).catch(console.error);
  },

  updateSupplier: (id, data) => {
    set(state => ({
      suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...data } : s),
    }));
    const updated = get().suppliers.find(s => s.id === id);
    if (updated) fsSaveSupplier(getBoutiqueId(), updated).catch(console.error);
  },

  deleteSupplier: (id) => {
    set(state => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
    fsDeleteSupplier(getBoutiqueId(), id).catch(console.error);
  },
}));
