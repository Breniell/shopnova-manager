import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveProduct, fsDeleteProduct } from '@/services/firestoreService';

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
    fsSaveProduct(getBoutiqueId(), newProduct).catch(console.error);
  },

  updateProduct: (id, data) => {
    const current = get().products.find(p => p.id === id);
    if (!current) return;
    const updated = { ...current, ...data };
    set(state => ({ products: state.products.map(p => p.id === id ? updated : p) }));
    fsSaveProduct(getBoutiqueId(), updated).catch(console.error);
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
    fsSaveProduct(getBoutiqueId(), updated).catch(console.error);
  },

  getProductByBarcode: (barcode) => get().products.find(p => p.codeBarre === barcode),
}));
