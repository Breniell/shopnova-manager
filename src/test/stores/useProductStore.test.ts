import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  useProductStore, DEFAULT_CATEGORIES,
  isParent, isVariant, bearsStock, composeVariantName,
} from '@/stores/useProductStore';
import type { Product } from '@/stores/useProductStore';
import { useSettingsStore, defaultShopSettings, shopCategories } from '@/stores/useSettingsStore';
import * as firestoreService from '@/services/firestoreService';

// Seed products used across tests
const seedProducts: Product[] = [
  { id: 'p1', nom: 'Bière Castel 33cl',   categorie: 'Boissons',      codeBarre: '6901234567890', prixAchat: 450,  prixVente: 600,  stock: 120, seuilAlerte: 24 },
  { id: 'p2', nom: 'Eau Supermont 1.5L',  categorie: 'Boissons',      codeBarre: '6901234567906', prixAchat: 200,  prixVente: 300,  stock: 80,  seuilAlerte: 20 },
  { id: 'p3', nom: 'Riz Thaï 5kg',        categorie: 'Alimentation',  codeBarre: '6901234567913', prixAchat: 3500, prixVente: 4500, stock: 30,  seuilAlerte: 10 },
];

beforeEach(() => {
  localStorage.clear();
  useProductStore.setState({ products: seedProducts.map(p => ({ ...p })) });
  useSettingsStore.setState({ shop: { ...defaultShopSettings } });
});

describe('useProductStore - initial state', () => {
  it('starts with seed products', () => {
    expect(useProductStore.getState().products).toHaveLength(3);
  });
});

// Les catégories ne sont plus figées dans le code : le gérant gère sa propre
// liste, parce qu'aucune des sept d'origine ne convenait à la beauté, à la
// coiffure ou à la quincaillerie.
describe('categories de la boutique', () => {
  it('retombe sur la liste par défaut quand la boutique n\'en a pas', () => {
    const cats = shopCategories(useSettingsStore.getState().shop);
    expect(cats).toEqual(DEFAULT_CATEGORIES);
    expect(cats).toContain('Alimentation');
  });

  it('utilise la liste de la boutique dès qu\'elle en a une', () => {
    useSettingsStore.setState({
      shop: { ...defaultShopSettings, categories: ['Beauté & coiffure', 'Mèches'] },
    });
    expect(shopCategories(useSettingsStore.getState().shop)).toEqual(['Beauté & coiffure', 'Mèches']);
  });

  it('ignore une liste vide plutôt que de ne rien proposer', () => {
    useSettingsStore.setState({ shop: { ...defaultShopSettings, categories: [] } });
    expect(shopCategories(useSettingsStore.getState().shop)).toEqual(DEFAULT_CATEGORIES);
  });
});

describe('useProductStore - addProduct', () => {
  it('adds a new product', () => {
    const before = useProductStore.getState().products.length;
    useProductStore.getState().addProduct({
      nom: 'Produit Test', categorie: 'Autre', codeBarre: '1234567890123',
      prixAchat: 100, prixVente: 150, stock: 10, seuilAlerte: 3,
    });
    expect(useProductStore.getState().products).toHaveLength(before + 1);
  });

  it('assigns a unique id starting with "p"', () => {
    useProductStore.getState().addProduct({
      nom: 'Produit Test', categorie: 'Autre', codeBarre: '1234567890123',
      prixAchat: 100, prixVente: 150, stock: 10, seuilAlerte: 3,
    });
    const products = useProductStore.getState().products;
    const newProduct = products[products.length - 1];
    expect(newProduct.id).toMatch(/^p-[a-zA-Z0-9-]+$/);
  });

  it('stores the correct product data', () => {
    useProductStore.getState().addProduct({
      nom: 'Jus Mangue', categorie: 'Boissons', codeBarre: '6901111111111',
      prixAchat: 400, prixVente: 600, stock: 50, seuilAlerte: 10, description: 'Délicieux jus',
    });
    const p = useProductStore.getState().products.find(pr => pr.nom === 'Jus Mangue')!;
    expect(p.prixAchat).toBe(400);
    expect(p.prixVente).toBe(600);
    expect(p.description).toBe('Délicieux jus');
  });
});

/**
 * Déclinaisons : une variante est un produit à part entière, rattaché à un
 * parent. Ce sont ces règles-là qui permettent aux ventes, au stock et aux
 * prix plancher de continuer à fonctionner sans être modifiés.
 */
describe('déclinaisons', () => {
  /** Crée un parent à deux axes et ses déclinaisons. Renvoie les ids. */
  const seedWig = () => {
    const parent = useProductStore.getState().addProduct({
      nom: 'Perruque Bob', categorie: 'Autre', codeBarre: '',
      prixAchat: 0, prixVente: 0, stock: 0, seuilAlerte: 0,
      variantAxes: ['Longueur', 'Couleur'],
    });
    const noir = useProductStore.getState().addProduct({
      nom: composeVariantName('Perruque Bob', ['Longueur', 'Couleur'], { Longueur: '12 pouces', Couleur: 'Noir' }),
      categorie: 'Autre', codeBarre: '2000000000001',
      prixAchat: 8000, prixVente: 15000, stock: 4, seuilAlerte: 2,
      parentId: parent.id, variantValues: { Longueur: '12 pouces', Couleur: 'Noir' },
    });
    const brun = useProductStore.getState().addProduct({
      nom: composeVariantName('Perruque Bob', ['Longueur', 'Couleur'], { Longueur: '12 pouces', Couleur: 'Brun' }),
      categorie: 'Autre', codeBarre: '2000000000002',
      prixAchat: 8000, prixVente: 15000, stock: 2, seuilAlerte: 2,
      parentId: parent.id, variantValues: { Longueur: '12 pouces', Couleur: 'Brun' },
    });
    return { parent, noir, brun };
  };

  it('compose un nom lisible à partir des axes', () => {
    expect(composeVariantName('Perruque Bob', ['Longueur', 'Couleur'], { Longueur: '12 pouces', Couleur: 'Noir' }))
      .toBe('Perruque Bob — 12 pouces / Noir');
  });

  it('retombe sur le nom du parent quand aucune valeur n\'est renseignée', () => {
    expect(composeVariantName('Perruque Bob', ['Couleur'], {})).toBe('Perruque Bob');
  });

  it('distingue parent, déclinaison et produit ordinaire', () => {
    const { parent, noir } = seedWig();
    const ordinary = useProductStore.getState().products.find(p => p.id === 'p1')!;
    expect(isParent(parent)).toBe(true);
    expect(isVariant(parent)).toBe(false);
    expect(isVariant(noir)).toBe(true);
    expect(isParent(noir)).toBe(false);
    expect(isParent(ordinary)).toBe(false);
    expect(isVariant(ordinary)).toBe(false);
  });

  it('exclut le parent du stock, mais pas ses déclinaisons', () => {
    // Un parent laissé dans les listes de stock s'afficherait en rupture
    // permanente et fausserait la valorisation.
    const { parent, noir } = seedWig();
    expect(bearsStock(parent)).toBe(false);
    expect(bearsStock(noir)).toBe(true);

    const valuation = useProductStore.getState().products
      .filter(bearsStock)
      .reduce((sum, p) => sum + p.prixAchat * p.stock, 0);
    const withParent = useProductStore.getState().products
      .reduce((sum, p) => sum + p.prixAchat * p.stock, 0);
    expect(valuation).toBe(withParent); // le parent vaut 0, mais il fausserait les alertes
    expect(useProductStore.getState().products.filter(bearsStock)).not.toContainEqual(parent);
  });

  it('renomme les déclinaisons quand le parent est renommé', () => {
    // Le nom composé part dans le panier, le reçu et l'étiquette : le laisser
    // périmé afficherait l'ancien nom au client.
    const { parent } = seedWig();
    useProductStore.getState().updateProduct(parent.id, { nom: 'Perruque Carré' });
    const names = useProductStore.getState().products
      .filter(p => p.parentId === parent.id).map(p => p.nom);
    expect(names).toEqual([
      'Perruque Carré — 12 pouces / Noir',
      'Perruque Carré — 12 pouces / Brun',
    ]);
  });

  it('supprime les déclinaisons avec leur parent', () => {
    // Sinon elles resteraient vendables au scan tout en étant invisibles dans
    // la grille, qui n'affiche que les parents.
    const { parent } = seedWig();
    useProductStore.getState().deleteProduct(parent.id);
    const left = useProductStore.getState().products;
    expect(left.find(p => p.id === parent.id)).toBeUndefined();
    expect(left.filter(p => p.parentId === parent.id)).toHaveLength(0);
    expect(left).toHaveLength(3); // les trois produits ordinaires du seed
  });

  it('retrouve une déclinaison par son code-barres, sans passer par le parent', () => {
    const { noir } = seedWig();
    expect(useProductStore.getState().getProductByBarcode('2000000000001')?.id).toBe(noir.id);
  });

  it('liste les déclinaisons d\'un parent', () => {
    const { parent, noir, brun } = seedWig();
    expect(useProductStore.getState().getVariants(parent.id).map(v => v.id)).toEqual([noir.id, brun.id]);
  });
});

describe('useProductStore - updateProduct', () => {
  it('updates specific fields of a product', () => {
    const { updateProduct, products } = useProductStore.getState();
    const target = products[0];
    updateProduct(target.id, { prixVente: 9999, stock: 77 });
    const updated = useProductStore.getState().products.find(p => p.id === target.id)!;
    expect(updated.prixVente).toBe(9999);
    expect(updated.stock).toBe(target.stock);
    expect(updated.nom).toBe(target.nom);
  });

  it('does not affect other products', () => {
    const { updateProduct, products } = useProductStore.getState();
    const other = products[1];
    updateProduct(products[0].id, { prixVente: 9999 });
    const updatedOther = useProductStore.getState().products.find(p => p.id === other.id)!;
    expect(updatedOther.prixVente).toBe(other.prixVente);
  });
});

describe('useProductStore - deleteProduct', () => {
  it('removes the product from the list', () => {
    const { deleteProduct, products } = useProductStore.getState();
    const target = products[0];
    deleteProduct(target.id);
    expect(useProductStore.getState().products.find(p => p.id === target.id)).toBeUndefined();
  });

  it('reduces product count by 1', () => {
    const before = useProductStore.getState().products.length;
    useProductStore.getState().deleteProduct(useProductStore.getState().products[0].id);
    expect(useProductStore.getState().products).toHaveLength(before - 1);
  });

  it('does nothing for an unknown id', () => {
    const before = useProductStore.getState().products.length;
    useProductStore.getState().deleteProduct('nonexistent-id');
    expect(useProductStore.getState().products).toHaveLength(before);
  });
});

describe('useProductStore - getProductByBarcode', () => {
  it('returns the product with the matching barcode', () => {
    const { getProductByBarcode, products } = useProductStore.getState();
    const target = products[0];
    const found = getProductByBarcode(target.codeBarre);
    expect(found).toBeDefined();
    expect(found!.id).toBe(target.id);
  });

  it('returns undefined for an unknown barcode', () => {
    expect(useProductStore.getState().getProductByBarcode('0000000000000')).toBeUndefined();
  });
});

// ─── updateProduct ne persiste jamais le champ stock ──────────────────────────
describe('useProductStore - updateProduct never persists stock', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls fsUpdateProductFields without a stock field', () => {
    const spy = vi.spyOn(firestoreService, 'fsUpdateProductFields');
    const { updateProduct, products } = useProductStore.getState();
    updateProduct(products[0].id, { prixVente: 9999 });

    expect(spy).toHaveBeenCalledOnce();
    const fields = spy.mock.calls[0][2] as Record<string, unknown>;
    expect(fields).not.toHaveProperty('stock');
    expect(fields).not.toHaveProperty('id');
  });

  it('never calls fsSaveProduct during updateProduct', () => {
    const saveSpy = vi.spyOn(firestoreService, 'fsSaveProduct');
    useProductStore.getState().updateProduct(useProductStore.getState().products[0].id, { prixVente: 500 });
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
