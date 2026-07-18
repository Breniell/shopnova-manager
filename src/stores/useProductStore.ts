import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveProduct, fsDeleteProduct, fsUpdateProductFields } from '@/services/firestoreService';
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
  prixVente: number;
  prixCible?: number;
  prixPlancher?: number;
  negociable?: boolean;
  stock: number;
  seuilAlerte: number;
  description?: string;
  imageUrl?: string;
}

interface ProductState {
  products: Product[];
  categories: Category[];
  /** Internal: called by FirebaseProvider on startup. */
  _setProducts: (products: Product[]) => void;
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
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
    const id = `p-${globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`}`;
    const newProduct: Product = { ...product, id };
    set(state => ({ products: [...state.products, newProduct] }));
    fsSaveProduct(getBoutiqueId(), newProduct).catch((error) => {
      enqueue('productCreate', newProduct);
      toast.error("Produit en attente de synchronisation");
      console.warn('[outbox] product create enqueued:', error);
    });
  },

  updateProduct: (id, data) => {
    const current = get().products.find(product => product.id === id);
    if (!current) return;
    const { stock: _ignoredStock, id: _ignoredId, ...editableFields } = data;
    const updated = { ...current, ...editableFields };
    set(state => ({
      products: state.products.map(product => product.id === id ? updated : product),
    }));
    // Stock is deliberately omitted: every stock mutation must go through an
    // atomic stock operation together with its immutable ledger movement.
    const { stock: _stock, id: _id, ...fields } = updated;
    fsUpdateProductFields(getBoutiqueId(), id, fields).catch((error) => {
      enqueue('productUpdate', { productId: id, fields });
      toast.error("Modification produit en attente de synchronisation");
      console.warn('[outbox] product update enqueued:', error);
    });
  },

  deleteProduct: (id) => {
    set(state => ({ products: state.products.filter(product => product.id !== id) }));
    fsDeleteProduct(getBoutiqueId(), id).catch((error) => {
      enqueue('productDelete', id);
      toast.error("Suppression produit en attente de synchronisation");
      console.warn('[outbox] product delete enqueued:', error);
    });
  },

  getProductByBarcode: (barcode) => get().products.find(product => product.codeBarre === barcode),
}));
