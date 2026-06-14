import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveProduct, fsDeleteProduct, fsAdjustStock, fsUpdateProductFields } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';

export type Category =
  | 'Alimentation'
  | 'Boissons'
  | 'Hygiène'
  | 'Électronique'
  | 'Vêtements'
  | 'Électroménager'
  | 'Autre';

export interface Product {
  id: string;
  nom: string;
  categorie: Category;
  codeBarre: string;
  prixAchat: number;
  prixVente: number;          // = prix affiché / prix de référence pour le client
  prixCible?: number;         // prix idéal (entre plancher et vente) — alerte si vendu en dessous
  prixPlancher?: number;      // prix minimum absolu — bloqué en dessous sauf override gérant
  negociable?: boolean;       // autorise (ou non) la modification du prix à la caisse
  stock: number;
  seuilAlerte: number;
  description?: string;
  imageUrl?: string;
}

interface ProductState {
  products: Product[];
  categories: Category[];

  /** Internal: called by FirebaseProvider on startup */
  _setProducts: (products: Product[]) => void;

  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  updateStock: (id: string, quantity: number) => void;
  getProductByBarcode: (barcode: string) => Product | undefined;
}

export const useProductStore = create<ProductState>()((set, get) => ({
  products: [],
  categories: [
    'Alimentation', 'Boissons', 'Hygiène', 'Électronique',
    'Vêtements', 'Électroménager', 'Autre',
  ],

  _setProducts: (products) => set({ products }),

  addProduct: (product) => {
    const id = 'p' + Date.now();
    const newProduct: Product = { ...product, id };
    set(state => ({ products: [...state.products, newProduct] }));
    // New doc: full setDoc is correct here
    fsSaveProduct(getBoutiqueId(), newProduct).catch(console.error);
  },

  updateProduct: (id, data) => {
    const current = get().products.find(p => p.id === id);
    if (!current) return;
    const updated = { ...current, ...data };
    set(state => ({ products: state.products.map(p => p.id === id ? updated : p) }));
    // Never write stock via updateProduct — stock moves through fsAdjustStock (increment).
    // Destructure stock out so the Firestore doc only receives the edited fields.
    const { stock: _omit, id: _id, ...fields } = updated;
    fsUpdateProductFields(getBoutiqueId(), id, fields).catch(console.error);
  },

  deleteProduct: (id) => {
    set(state => ({ products: state.products.filter(p => p.id !== id) }));
    fsDeleteProduct(getBoutiqueId(), id).catch(console.error);
  },

  updateStock: (id, quantity) => {
    const current = get().products.find(p => p.id === id);
    if (!current) return;
    const updated = { ...current, stock: current.stock + quantity };
    set(state => ({ products: state.products.map(p => p.id === id ? updated : p) }));
    // Use increment() so multi-register merges never overwrite each other's deltas.
    fsAdjustStock(getBoutiqueId(), id, quantity).catch((err) => {
      enqueue('stockAdjust', { productId: id, delta: quantity });
      toast.error("Échec d'enregistrement — nouvelle tentative automatique");
      console.warn('[outbox] stockAdjust enqueued:', err);
    });
  },

  getProductByBarcode: (barcode) => get().products.find(p => p.codeBarre === barcode),
}));
