import { describe, it, expect, beforeEach } from 'vitest';
import { useSaleStore } from '@/stores/useSaleStore';
import { useProductStore } from '@/stores/useProductStore';
import type { Product } from '@/stores/useProductStore';
import { useStockStore } from '@/stores/useStockStore';
import {
  useHeldSaleStore,
  reconcileHeldSale,
  loadHeldSales,
  heldSaleTotal,
} from '@/stores/useHeldSaleStore';
import type { HoldMeta } from '@/stores/useHeldSaleStore';
import { getRegisterCode } from '@/services/boutiqueService';

const SALE_INITIAL = useSaleStore.getState();

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'nom'>): Product {
  return {
    categorie: 'Boissons',
    codeBarre: overrides.id,
    prixAchat: 300,
    prixVente: 500,
    stock: 10,
    seuilAlerte: 2,
    ...overrides,
  } as Product;
}

const COCA = product({ id: 'p-coca', nom: 'Coca 50cl', prixVente: 500, stock: 10 });
const PAGNE = product({ id: 'p-pagne', nom: 'Pagne wax', prixAchat: 4000, prixVente: 8000, prixPlancher: 6000, negociable: true, stock: 3 });

const META: HoldMeta = {
  paymentMode: 'mobile_money',
  mobileOperator: 'orange',
  userId: 'u-caissier',
  userName: 'Paul Caissier',
};

function fillCart() {
  const { addToCart, updateCartQuantity, applyPriceOverride, setDiscount } = useSaleStore.getState();
  addToCart({ productId: COCA.id, nom: COCA.nom, prixVente: COCA.prixVente, prixAchat: COCA.prixAchat });
  updateCartQuantity(COCA.id, 4);
  addToCart({ productId: PAGNE.id, nom: PAGNE.nom, prixVente: PAGNE.prixVente, prixAchat: PAGNE.prixAchat });
  applyPriceOverride(PAGNE.id, 5500, true, { userId: 'u-gerant', userName: 'Amina Gérante' });
  setDiscount(5);
}

beforeEach(() => {
  localStorage.clear();
  useSaleStore.setState({ ...SALE_INITIAL, cart: [], discount: 0, sales: [], saleCounter: 0 });
  useProductStore.setState({ products: [COCA, PAGNE] });
  useStockStore.setState({ movements: [] });
  useHeldSaleStore.setState({ heldSales: [] });
});

describe('useHeldSaleStore - holdCurrentCart', () => {
  it('sets the cart aside with its discount, negotiated prices, customer and payment mode, then empties it', () => {
    fillCart();
    const held = useHeldSaleStore.getState().holdCurrentCart(
      { ...META, customerId: 'c1', customerName: 'Jean Mbarga', discountAuthorizedBy: { userId: 'u-gerant', userName: 'Amina Gérante' } },
      [COCA, PAGNE],
    );

    expect(useSaleStore.getState().cart).toEqual([]);
    expect(useSaleStore.getState().discount).toBe(0);
    expect(useHeldSaleStore.getState().heldSales).toHaveLength(1);

    expect(held.label).toBe('Jean Mbarga'); // le client sert d'étiquette
    expect(held.discount).toBe(5);
    expect(held.paymentMode).toBe('mobile_money');
    expect(held.mobileOperator).toBe('orange');
    expect(held.discountAuthorizedBy?.userName).toBe('Amina Gérante');
    const pagne = held.items.find(i => i.productId === PAGNE.id)!;
    expect(pagne.prixUnitaire).toBe(5500);
    expect(pagne.negotiated).toMatchObject({ belowFloor: true, overrideBy: 'u-gerant' });
  });

  it('prefers an explicit label over the customer name', () => {
    fillCart();
    const held = useHeldSaleStore.getState().holdCurrentCart(
      { ...META, label: '  attend la monnaie  ', customerName: 'Jean Mbarga' },
      [COCA, PAGNE],
    );
    expect(held.label).toBe('attend la monnaie');
  });

  it('refuses an empty cart', () => {
    expect(() => useHeldSaleStore.getState().holdCurrentCart(META, [COCA])).toThrow();
    expect(useHeldSaleStore.getState().heldSales).toHaveLength(0);
  });

  it('touches neither stock, movements, sales nor the receipt counter', () => {
    fillCart();
    useHeldSaleStore.getState().holdCurrentCart(META, [COCA, PAGNE]);

    expect(useProductStore.getState().products.map(p => p.stock)).toEqual([10, 3]);
    expect(useStockStore.getState().movements).toHaveLength(0);
    expect(useSaleStore.getState().sales).toHaveLength(0);
    expect(useSaleStore.getState().saleCounter).toBe(0);
    expect(localStorage.getItem(`legwan-sale-counter-${getRegisterCode()}`)).toBeNull();
  });

  it('persists locally per register so held sales survive a restart', () => {
    fillCart();
    useHeldSaleStore.getState().holdCurrentCart({ ...META, label: 'Client 1' }, [COCA, PAGNE]);

    const raw = localStorage.getItem(`legwan-held-sales-${getRegisterCode()}`);
    expect(raw).not.toBeNull();

    // Simule un redémarrage : la mémoire est perdue, le disque reste.
    useHeldSaleStore.setState({ heldSales: [] });
    useHeldSaleStore.getState()._reload();
    const reloaded = useHeldSaleStore.getState().heldSales;
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].label).toBe('Client 1');
    expect(reloaded[0].items).toHaveLength(2);
  });

  it('ignores corrupt storage instead of crashing', () => {
    localStorage.setItem(`legwan-held-sales-${getRegisterCode()}`, '{not json');
    expect(loadHeldSales()).toEqual([]);
    localStorage.setItem(`legwan-held-sales-${getRegisterCode()}`, JSON.stringify([{ id: 1 }, null, 'x']));
    expect(loadHeldSales()).toEqual([]);
  });
});

describe('useHeldSaleStore - resumeHeldSale', () => {
  it('restores the cart unchanged when catalogue is unchanged, and keeps the discount authorization', () => {
    fillCart();
    const cartBefore = useSaleStore.getState().cart;
    const held = useHeldSaleStore.getState().holdCurrentCart(
      { ...META, discountAuthorizedBy: { userId: 'u-gerant', userName: 'Amina Gérante' } },
      [COCA, PAGNE],
    );

    const result = useHeldSaleStore.getState().resumeHeldSale(held.id, [COCA, PAGNE]);

    expect(result.issues).toEqual([]);
    expect(result.discountAuthorizationKept).toBe(true);
    expect(useSaleStore.getState().cart).toEqual(cartBefore);
    expect(useSaleStore.getState().discount).toBe(5);
    expect(useHeldSaleStore.getState().heldSales).toHaveLength(0);
    expect(localStorage.getItem(`legwan-held-sales-${getRegisterCode()}`)).toBeNull();
  });

  it('refuses to overwrite a non-empty cart', () => {
    fillCart();
    const held = useHeldSaleStore.getState().holdCurrentCart(META, [COCA, PAGNE]);
    useSaleStore.getState().addToCart({ productId: COCA.id, nom: COCA.nom, prixVente: 500 });

    expect(() => useHeldSaleStore.getState().resumeHeldSale(held.id, [COCA, PAGNE])).toThrow();
    expect(useHeldSaleStore.getState().heldSales).toHaveLength(1);
    expect(useSaleStore.getState().cart).toHaveLength(1);
  });

  it('can hold the current cart and resume another one (swap)', () => {
    fillCart();
    const first = useHeldSaleStore.getState().holdCurrentCart({ ...META, label: 'A' }, [COCA, PAGNE]);
    useSaleStore.getState().addToCart({ productId: COCA.id, nom: COCA.nom, prixVente: 500 });

    useHeldSaleStore.getState().holdCurrentCart({ ...META, label: 'B' }, [COCA, PAGNE]);
    useHeldSaleStore.getState().resumeHeldSale(first.id, [COCA, PAGNE]);

    expect(useSaleStore.getState().cart).toHaveLength(2);
    expect(useHeldSaleStore.getState().heldSales.map(h => h.label)).toEqual(['B']);
  });

  it('completing a resumed sale decrements stock and uses one receipt number, normally', () => {
    fillCart();
    const held = useHeldSaleStore.getState().holdCurrentCart(META, [COCA, PAGNE]);
    useHeldSaleStore.getState().resumeHeldSale(held.id, [COCA, PAGNE]);

    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'mobile_money', mobileOperator: 'orange', mobileReference: 'OM123456',
      userId: 'u-caissier', userName: 'Paul Caissier',
    });

    expect(sale.saleNumber).toMatch(/-00001$/);
    // 4 × 500 + 5500 = 7500, remise 5 % → 7125
    expect(sale.total).toBe(7125);
    const stocks = Object.fromEntries(useProductStore.getState().products.map(p => [p.id, p.stock]));
    expect(stocks).toEqual({ [COCA.id]: 6, [PAGNE.id]: 2 });
  });

  it('throws on an unknown id', () => {
    expect(() => useHeldSaleStore.getState().resumeHeldSale('nope', [COCA])).toThrow();
  });
});

describe('reconcileHeldSale', () => {
  function heldFrom() {
    fillCart();
    return useHeldSaleStore.getState().holdCurrentCart(META, [COCA, PAGNE]);
  }

  it('drops products removed from the catalogue', () => {
    const held = heldFrom();
    const { items, issues } = reconcileHeldSale(held, [PAGNE]);
    expect(items.map(i => i.productId)).toEqual([PAGNE.id]);
    expect(issues).toEqual([{ kind: 'missing', nom: COCA.nom }]);
  });

  it('drops out-of-stock products and caps quantities to current stock', () => {
    const held = heldFrom();
    const { items, issues } = reconcileHeldSale(held, [{ ...COCA, stock: 2 }, { ...PAGNE, stock: 0 }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: COCA.id, quantity: 2 });
    expect(issues).toEqual([
      { kind: 'stockReduced', nom: COCA.nom, requested: 4, available: 2 },
      { kind: 'outOfStock', nom: PAGNE.nom },
    ]);
  });

  it('applies the new price of a changed product and reports it', () => {
    const held = heldFrom();
    const { items, issues } = reconcileHeldSale(held, [{ ...COCA, prixVente: 600 }, PAGNE]);
    expect(items.find(i => i.productId === COCA.id)).toMatchObject({ prixVente: 600, prixUnitaire: 600 });
    expect(issues).toEqual([{ kind: 'priceChanged', nom: COCA.nom, before: 500, after: 600, negotiationDropped: false }]);
  });

  it('cancels a negotiation (and its manager override) when the product prices changed', () => {
    const held = heldFrom();
    const { items, issues } = reconcileHeldSale(held, [COCA, { ...PAGNE, prixPlancher: 7000 }]);
    const pagne = items.find(i => i.productId === PAGNE.id)!;
    expect(pagne.negotiated).toBeUndefined();
    expect(pagne.prixUnitaire).toBe(8000);
    expect(issues).toEqual([{ kind: 'priceChanged', nom: PAGNE.nom, before: 8000, after: 8000, negotiationDropped: true }]);
  });

  it('withdraws the discount authorization as soon as anything changed', () => {
    fillCart();
    const held = useHeldSaleStore.getState().holdCurrentCart(
      { ...META, discountAuthorizedBy: { userId: 'u-gerant', userName: 'Amina' } },
      [COCA, PAGNE],
    );
    const result = useHeldSaleStore.getState().resumeHeldSale(held.id, [{ ...COCA, stock: 1 }, PAGNE]);
    expect(result.discountAuthorizationKept).toBe(false);
  });

  it('refreshes the cost price silently (historical margin) without flagging', () => {
    const held = heldFrom();
    const { items, issues } = reconcileHeldSale(held, [{ ...COCA, prixAchat: 320 }, PAGNE]);
    expect(items.find(i => i.productId === COCA.id)?.prixAchat).toBe(320);
    expect(issues).toEqual([]);
  });
});

describe('removeHeldSale / clearAll / heldSaleTotal', () => {
  it('removes one held sale and keeps the others', () => {
    fillCart();
    const a = useHeldSaleStore.getState().holdCurrentCart({ ...META, label: 'A' }, [COCA, PAGNE]);
    useSaleStore.getState().addToCart({ productId: COCA.id, nom: COCA.nom, prixVente: 500 });
    useHeldSaleStore.getState().holdCurrentCart({ ...META, label: 'B' }, [COCA, PAGNE]);

    useHeldSaleStore.getState().removeHeldSale(a.id);
    expect(useHeldSaleStore.getState().heldSales.map(h => h.label)).toEqual(['B']);
    expect(loadHeldSales().map(h => h.label)).toEqual(['B']);

    useHeldSaleStore.getState().clearAll();
    expect(useHeldSaleStore.getState().heldSales).toEqual([]);
    expect(loadHeldSales()).toEqual([]);
  });

  it('computes the indicative total with negotiated prices and discount', () => {
    fillCart();
    const held = useHeldSaleStore.getState().holdCurrentCart(META, [COCA, PAGNE]);
    expect(heldSaleTotal(held)).toBe(7125);
  });
});
