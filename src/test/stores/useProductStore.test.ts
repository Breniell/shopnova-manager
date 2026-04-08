import { describe, it, expect, beforeEach } from 'vitest';
import { useProductStore } from '@/stores/useProductStore';

// Reset store to its default initial state before each test
const INITIAL_STATE = useProductStore.getState();

beforeEach(() => {
  localStorage.clear();
  useProductStore.setState({ ...INITIAL_STATE });
});

describe('useProductStore — initial state', () => {
  it('loads 25 default products', () => {
    expect(useProductStore.getState().products).toHaveLength(25);
  });

  it('exposes 7 categories', () => {
    expect(useProductStore.getState().categories).toHaveLength(7);
  });

  it('includes expected categories', () => {
    const cats = useProductStore.getState().categories;
    expect(cats).toContain('Alimentation');
    expect(cats).toContain('Boissons');
    expect(cats).toContain('Électronique');
  });
});

describe('useProductStore — addProduct', () => {
  it('adds a new product', () => {
    const before = useProductStore.getState().products.length;
    useProductStore.getState().addProduct({
      nom: 'Produit Test',
      categorie: 'Autre',
      codeBarre: '1234567890123',
      prixAchat: 100,
      prixVente: 150,
      stock: 10,
      seuilAlerte: 3,
    });
    expect(useProductStore.getState().products).toHaveLength(before + 1);
  });

  it('assigns a unique id starting with "p"', () => {
    useProductStore.getState().addProduct({
      nom: 'Produit Test',
      categorie: 'Autre',
      codeBarre: '1234567890123',
      prixAchat: 100,
      prixVente: 150,
      stock: 10,
      seuilAlerte: 3,
    });
    const products = useProductStore.getState().products;
    const newProduct = products[products.length - 1];
    expect(newProduct.id).toMatch(/^p\d+$/);
  });

  it('stores the correct product data', () => {
    useProductStore.getState().addProduct({
      nom: 'Jus Mangue',
      categorie: 'Boissons',
      codeBarre: '6901111111111',
      prixAchat: 400,
      prixVente: 600,
      stock: 50,
      seuilAlerte: 10,
      description: 'Délicieux jus',
    });
    const products = useProductStore.getState().products;
    const p = products.find(pr => pr.nom === 'Jus Mangue')!;
    expect(p.prixAchat).toBe(400);
    expect(p.prixVente).toBe(600);
    expect(p.description).toBe('Délicieux jus');
  });
});

describe('useProductStore — updateProduct', () => {
  it('updates specific fields of a product', () => {
    const { updateProduct, products } = useProductStore.getState();
    const target = products[0];
    updateProduct(target.id, { prixVente: 9999, stock: 77 });
    const updated = useProductStore.getState().products.find(p => p.id === target.id)!;
    expect(updated.prixVente).toBe(9999);
    expect(updated.stock).toBe(77);
    // Untouched fields remain
    expect(updated.nom).toBe(target.nom);
  });

  it('does not affect other products', () => {
    const { updateProduct, products } = useProductStore.getState();
    const target = products[0];
    const other = products[1];
    updateProduct(target.id, { prixVente: 9999 });
    const updatedOther = useProductStore.getState().products.find(p => p.id === other.id)!;
    expect(updatedOther.prixVente).toBe(other.prixVente);
  });
});

describe('useProductStore — deleteProduct', () => {
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

describe('useProductStore — updateStock', () => {
  it('increases stock when quantity is positive', () => {
    const { updateStock, products } = useProductStore.getState();
    const target = products[0];
    const initialStock = target.stock;
    updateStock(target.id, 10);
    const updated = useProductStore.getState().products.find(p => p.id === target.id)!;
    expect(updated.stock).toBe(initialStock + 10);
  });

  it('decreases stock when quantity is negative', () => {
    const { updateStock, products } = useProductStore.getState();
    const target = products.find(p => p.stock >= 5)!;
    const initialStock = target.stock;
    updateStock(target.id, -5);
    const updated = useProductStore.getState().products.find(p => p.id === target.id)!;
    expect(updated.stock).toBe(initialStock - 5);
  });
});

describe('useProductStore — getProductByBarcode', () => {
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
