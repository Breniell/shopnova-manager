import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveProduct, fsDeleteProduct, fsUpdateProductFields } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';

/**
 * Une catégorie est désormais une chaîne libre : le commerçant gère sa propre
 * liste depuis les Paramètres (`ShopSettings.categories`). Les sept ci-dessous
 * ne servent plus qu'à amorcer une boutique neuve - aucune boutique de beauté
 * ou de coiffure ne se reconnaissait dans la liste figée d'avant.
 */
export type Category = string;

export const DEFAULT_CATEGORIES: string[] = [
  'Alimentation', 'Boissons', 'Hygiène', 'Électronique',
  'Vêtements', 'Électroménager', 'Autre',
];

/** Axes proposés à la saisie ; le commerçant peut en nommer d'autres. */
export const VARIANT_AXIS_SUGGESTIONS: string[] = [
  'Taille', 'Couleur', 'Modèle', 'Pointure', 'Capacité', 'Longueur', 'Densité',
];

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

  // ── Déclinaisons ────────────────────────────────────────────────────────
  // Une variante est un Product à part entière, pas un élément d'un tableau
  // imbriqué. Le stock se décrémente par increment() sur le document du
  // produit, et Firestore ne sait pas appliquer increment() à un élément de
  // tableau : un modèle imbriqué casserait la réconciliation entre deux
  // caisses qui vendent le même article en même temps.
  /** Sur une variante : l'id du produit dont elle est une déclinaison. */
  parentId?: string;
  /** Sur un parent : les axes déclarés, dans l'ordre d'affichage. */
  variantAxes?: string[];
  /** Sur une variante : la valeur retenue pour chaque axe. */
  variantValues?: Record<string, string>;
}

/** Un parent regroupe des déclinaisons ; il ne se vend pas et n'a pas de stock. */
export function isParent(product: Product): boolean {
  return !!product.variantAxes && product.variantAxes.length > 0;
}

/** Une déclinaison : un vrai produit, vendable, avec ses prix et son stock. */
export function isVariant(product: Product): boolean {
  return !!product.parentId;
}

/**
 * Les produits qui portent réellement du stock.
 *
 * Un parent n'en porte aucun. Laissé dans les listes de stock, il
 * s'afficherait en rupture permanente, polluerait les alertes du tableau de
 * bord et fausserait la valorisation.
 */
export function bearsStock(product: Product): boolean {
  return !isParent(product);
}

/**
 * Nom affiché d'une déclinaison : « Perruque Bob — 12 pouces / Noir ».
 *
 * Ce nom est recopié tel quel dans le panier, la ligne de vente, le reçu,
 * l'étiquette thermique et l'historique crédit. Le composer ici permet à
 * toutes ces surfaces d'afficher la bonne chose sans être modifiées.
 */
export function composeVariantName(
  parentName: string,
  axes: string[],
  values: Record<string, string>,
): string {
  const parts = axes.map(axis => values[axis]?.trim()).filter((v): v is string => !!v);
  return parts.length > 0 ? `${parentName} — ${parts.join(' / ')}` : parentName;
}

interface ProductState {
  products: Product[];
  /** Internal: called by FirebaseProvider on startup. */
  _setProducts: (products: Product[]) => void;
  addProduct: (product: Omit<Product, 'id'>) => Product;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  getProductByBarcode: (barcode: string) => Product | undefined;
  /** Les déclinaisons d'un parent, dans l'ordre de création. */
  getVariants: (parentId: string) => Product[];
}

export const useProductStore = create<ProductState>()((set, get) => ({
  products: [],

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
    return newProduct;
  },

  updateProduct: (id, data) => {
    const current = get().products.find(product => product.id === id);
    if (!current) return;
    const { stock: _ignoredStock, id: _ignoredId, ...editableFields } = data;
    const updated = { ...current, ...editableFields };

    // Renommer un parent doit renommer ses déclinaisons : leur nom composé est
    // ce qui s'affiche au panier, sur le reçu et sur l'étiquette. Sans cela,
    // « Perruque Bob — 12 pouces » survivrait au renommage du parent.
    const renamedVariants = isParent(updated) && updated.nom !== current.nom
      ? get().products
          .filter(product => product.parentId === id)
          .map(variant => ({
            ...variant,
            nom: composeVariantName(updated.nom, updated.variantAxes ?? [], variant.variantValues ?? {}),
          }))
      : [];

    const touched = new Map([updated, ...renamedVariants].map(product => [product.id, product]));
    set(state => ({
      products: state.products.map(product => touched.get(product.id) ?? product),
    }));

    // Stock is deliberately omitted: every stock mutation must go through an
    // atomic stock operation together with its immutable ledger movement.
    for (const product of touched.values()) {
      const { stock: _stock, id: _id, ...fields } = product;
      fsUpdateProductFields(getBoutiqueId(), product.id, fields).catch((error) => {
        enqueue('productUpdate', { productId: product.id, fields });
        toast.error("Modification produit en attente de synchronisation");
        console.warn('[outbox] product update enqueued:', error);
      });
    }
  },

  deleteProduct: (id) => {
    // Supprimer un parent emporte ses déclinaisons : le parent seul laisserait
    // des variantes orphelines, invisibles dans la grille (qui n'affiche que
    // les parents) mais toujours vendables au scan.
    const doomed = get().products
      .filter(product => product.id === id || product.parentId === id)
      .map(product => product.id);

    set(state => ({ products: state.products.filter(product => !doomed.includes(product.id)) }));
    for (const doomedId of doomed) {
      fsDeleteProduct(getBoutiqueId(), doomedId).catch((error) => {
        enqueue('productDelete', doomedId);
        toast.error("Suppression produit en attente de synchronisation");
        console.warn('[outbox] product delete enqueued:', error);
      });
    }
  },

  getProductByBarcode: (barcode) => get().products.find(product => product.codeBarre === barcode),

  getVariants: (parentId) => get().products.filter(product => product.parentId === parentId),
}));
