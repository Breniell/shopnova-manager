import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Category = 'Alimentation' | 'Boissons' | 'Hygiène' | 'Électronique' | 'Vêtements' | 'Électroménager' | 'Autre';

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
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  updateStock: (id: string, quantity: number) => void;
  getProductByBarcode: (barcode: string) => Product | undefined;
}

const initialProducts: Product[] = [
  { id: 'p1', nom: 'Bière Castel 33cl', categorie: 'Boissons', codeBarre: '6901234567890', prixAchat: 450, prixVente: 600, stock: 120, seuilAlerte: 24 },
  { id: 'p2', nom: 'Eau minérale Supermont 1.5L', categorie: 'Boissons', codeBarre: '6901234567906', prixAchat: 200, prixVente: 300, stock: 80, seuilAlerte: 20 },
  { id: 'p3', nom: 'Riz parfumé Thaï 5kg', categorie: 'Alimentation', codeBarre: '6901234567913', prixAchat: 3500, prixVente: 4500, stock: 30, seuilAlerte: 10 },
  { id: 'p4', nom: 'Huile végétale Azur 1L', categorie: 'Alimentation', codeBarre: '6901234567920', prixAchat: 1100, prixVente: 1400, stock: 45, seuilAlerte: 12 },
  { id: 'p5', nom: 'Savon OMO 500g', categorie: 'Hygiène', codeBarre: '6901234567937', prixAchat: 800, prixVente: 1100, stock: 60, seuilAlerte: 15 },
  { id: 'p6', nom: 'Mayonnaise Bama 500g', categorie: 'Alimentation', codeBarre: '6901234567944', prixAchat: 1500, prixVente: 2000, stock: 25, seuilAlerte: 8 },
  { id: 'p7', nom: 'Sardines Saupiquet 200g', categorie: 'Alimentation', codeBarre: '6901234567951', prixAchat: 700, prixVente: 950, stock: 50, seuilAlerte: 12 },
  { id: 'p8', nom: 'Biscuits Petit LU 100g', categorie: 'Alimentation', codeBarre: '6901234567968', prixAchat: 250, prixVente: 400, stock: 100, seuilAlerte: 30 },
  { id: 'p9', nom: 'Lait Nido 400g', categorie: 'Alimentation', codeBarre: '6901234567975', prixAchat: 3200, prixVente: 4200, stock: 20, seuilAlerte: 5 },
  { id: 'p10', nom: 'Coca-Cola 33cl', categorie: 'Boissons', codeBarre: '6901234567982', prixAchat: 350, prixVente: 500, stock: 0, seuilAlerte: 24 },
  { id: 'p11', nom: 'Dentifrice Colgate 75ml', categorie: 'Hygiène', codeBarre: '6901234567999', prixAchat: 600, prixVente: 900, stock: 35, seuilAlerte: 10 },
  { id: 'p12', nom: 'Sucre cristallisé 1kg', categorie: 'Alimentation', codeBarre: '6901234568002', prixAchat: 550, prixVente: 750, stock: 3, seuilAlerte: 15 },
  { id: 'p13', nom: 'Farine de blé 1kg', categorie: 'Alimentation', codeBarre: '6901234568019', prixAchat: 480, prixVente: 650, stock: 28, seuilAlerte: 10 },
  { id: 'p14', nom: 'Café Nescafé Classic 200g', categorie: 'Boissons', codeBarre: '6901234568026', prixAchat: 2800, prixVente: 3800, stock: 15, seuilAlerte: 5 },
  { id: 'p15', nom: 'Gaz Butane 6kg', categorie: 'Autre', codeBarre: '6901234568033', prixAchat: 5000, prixVente: 6500, stock: 8, seuilAlerte: 3 },
  { id: 'p16', nom: 'Téléphone Samsung A05', categorie: 'Électronique', codeBarre: '6901234568040', prixAchat: 45000, prixVente: 65000, stock: 4, seuilAlerte: 2 },
  { id: 'p17', nom: 'Câble USB-C 1m', categorie: 'Électronique', codeBarre: '6901234568057', prixAchat: 1200, prixVente: 2500, stock: 22, seuilAlerte: 5 },
  { id: 'p18', nom: 'Couche Pampers taille 3', categorie: 'Hygiène', codeBarre: '6901234568064', prixAchat: 4500, prixVente: 6000, stock: 18, seuilAlerte: 5 },
  { id: 'p19', nom: 'Tomate concentrée Heinz 400g', categorie: 'Alimentation', codeBarre: '6901234568071', prixAchat: 850, prixVente: 1200, stock: 40, seuilAlerte: 10 },
  { id: 'p20', nom: 'Piles AA Duracell x4', categorie: 'Électronique', codeBarre: '6901234568088', prixAchat: 900, prixVente: 1500, stock: 35, seuilAlerte: 10 },
  { id: 'p21', nom: 'Lessive Omo poudre 1kg', categorie: 'Hygiène', codeBarre: '6901234568095', prixAchat: 1400, prixVente: 1900, stock: 25, seuilAlerte: 8 },
  { id: 'p22', nom: 'Tablette de chocolat Noir', categorie: 'Alimentation', codeBarre: '6901234568101', prixAchat: 600, prixVente: 900, stock: 2, seuilAlerte: 10 },
  { id: 'p23', nom: 'Jus de fruit Joker Orange 1L', categorie: 'Boissons', codeBarre: '6901234568118', prixAchat: 900, prixVente: 1300, stock: 30, seuilAlerte: 10 },
  { id: 'p24', nom: 'Chips Pringles Original', categorie: 'Alimentation', codeBarre: '6901234568125', prixAchat: 1800, prixVente: 2800, stock: 15, seuilAlerte: 6 },
  { id: 'p25', nom: 'Spaghetti Barilla 500g', categorie: 'Alimentation', codeBarre: '6901234568132', prixAchat: 700, prixVente: 1000, stock: 55, seuilAlerte: 15 },
];

export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      products: initialProducts,
      categories: ['Alimentation', 'Boissons', 'Hygiène', 'Électronique', 'Vêtements', 'Électroménager', 'Autre'],
      addProduct: (product) => {
        const id = 'p' + Date.now();
        set(state => ({ products: [...state.products, { ...product, id }] }));
      },
      updateProduct: (id, data) => {
        set(state => ({
          products: state.products.map(p => p.id === id ? { ...p, ...data } : p)
        }));
      },
      deleteProduct: (id) => {
        set(state => ({ products: state.products.filter(p => p.id !== id) }));
      },
      updateStock: (id, quantity) => {
        set(state => ({
          products: state.products.map(p => p.id === id ? { ...p, stock: p.stock + quantity } : p)
        }));
      },
      getProductByBarcode: (barcode) => {
        return get().products.find(p => p.codeBarre === barcode);
      },
    }),
    { name: 'legwan-products' }
  )
);
