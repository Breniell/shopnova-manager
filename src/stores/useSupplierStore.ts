import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveSupplier, fsDeleteSupplier } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';

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
    const id = `sup-${globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`}`;
    const newSupplier: Supplier = { ...supplier, id };
    set(state => ({ suppliers: [...state.suppliers, newSupplier] }));
    fsSaveSupplier(getBoutiqueId(), newSupplier).catch((error) => {
      enqueue('supplierSave', newSupplier);
      toast.error("Fournisseur en attente de synchronisation");
      console.warn('[outbox] supplier create enqueued:', error);
    });
  },

  updateSupplier: (id, data) => {
    set(state => ({
      suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...data } : s),
    }));
    const updated = get().suppliers.find(s => s.id === id);
    if (updated) fsSaveSupplier(getBoutiqueId(), updated).catch((error) => {
      enqueue('supplierSave', updated);
      toast.error("Modification fournisseur en attente de synchronisation");
      console.warn('[outbox] supplier update enqueued:', error);
    });
  },

  deleteSupplier: (id) => {
    set(state => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
    fsDeleteSupplier(getBoutiqueId(), id).catch((error) => {
      enqueue('supplierDelete', id);
      toast.error("Suppression fournisseur en attente de synchronisation");
      console.warn('[outbox] supplier delete enqueued:', error);
    });
  },
}));
