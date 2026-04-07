import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateSupplier: (id: string, data: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
}

const initialSuppliers: Supplier[] = [
  { id: 'sup1', nom: 'Brasseries du Cameroun', telephone: '+237 699 111 222', adresse: 'Douala, Zone Industrielle' },
  { id: 'sup2', nom: 'SOCOPRAL', telephone: '+237 699 333 444', adresse: 'Douala, Bassa' },
  { id: 'sup3', nom: 'Nestlé Cameroun', telephone: '+237 699 555 666', adresse: 'Douala, Bonabéri' },
];

export const useSupplierStore = create<SupplierState>()(
  persist(
    (set) => ({
      suppliers: initialSuppliers,
      addSupplier: (supplier) => {
        const id = 'sup' + Date.now();
        set(state => ({ suppliers: [...state.suppliers, { ...supplier, id }] }));
      },
      updateSupplier: (id, data) => {
        set(state => ({
          suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...data } : s)
        }));
      },
      deleteSupplier: (id) => {
        set(state => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
      },
    }),
    { name: 'shopnova-suppliers' }
  )
);
