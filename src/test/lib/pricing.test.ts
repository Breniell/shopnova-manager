import { describe, it, expect } from 'vitest';
import {
  checkPrice,
  getEffectiveFloor,
  getEffectiveTarget,
  isNegociable,
  getMarginPercent,
  getLossFromNegotiation,
  getAppliedPrice,
  getLineFloor,
  checkCartDiscount,
} from '@/lib/pricing';
import type { Product } from '@/stores/useProductStore';
import type { CartItem } from '@/stores/useSaleStore';

// ────────────────────────────────────────────────────────────────────────────
// Factories
// ────────────────────────────────────────────────────────────────────────────

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  nom: 'Test Product',
  categorie: 'Autre',
  codeBarre: '0000000000000',
  prixAchat: 1000,
  prixVente: 2000,
  stock: 10,
  seuilAlerte: 2,
  ...overrides,
});

const makeItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  productId: 'p1',
  nom: 'Test',
  prixVente: 2000,
  prixUnitaire: 2000,
  quantity: 1,
  ...overrides,
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

describe('getEffectiveFloor', () => {
  it('returns explicit prixPlancher if set', () => {
    const p = makeProduct({ prixAchat: 1000, prixPlancher: 1300 });
    expect(getEffectiveFloor(p)).toBe(1300);
  });

  it('falls back to prixAchat if prixPlancher absent', () => {
    const p = makeProduct({ prixAchat: 1000, prixPlancher: undefined });
    expect(getEffectiveFloor(p)).toBe(1000);
  });
});

describe('getEffectiveTarget', () => {
  it('returns explicit prixCible if set', () => {
    const p = makeProduct({ prixVente: 2000, prixCible: 1800 });
    expect(getEffectiveTarget(p)).toBe(1800);
  });

  it('falls back to prixVente if prixCible absent', () => {
    const p = makeProduct({ prixVente: 2000, prixCible: undefined });
    expect(getEffectiveTarget(p)).toBe(2000);
  });
});

describe('isNegociable', () => {
  it('returns true when explicitly true', () => {
    expect(isNegociable(makeProduct({ negociable: true }))).toBe(true);
  });

  it('returns false when explicitly false', () => {
    expect(isNegociable(makeProduct({ negociable: false }))).toBe(false);
  });

  it('returns false when undefined (default = non négociable)', () => {
    expect(isNegociable(makeProduct({ negociable: undefined }))).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// checkPrice - la fonction critique
// ────────────────────────────────────────────────────────────────────────────

describe('checkPrice - produit NON négociable', () => {
  const p = makeProduct({ negociable: false, prixVente: 2000 });

  it('accepts only the exact prixVente', () => {
    expect(checkPrice(p, 2000)).toEqual({ status: 'ok', level: 'normal' });
  });

  it('blocks any other price', () => {
    expect(checkPrice(p, 1500)).toEqual({ status: 'blocked', reason: 'not_negotiable' });
    expect(checkPrice(p, 2500)).toEqual({ status: 'blocked', reason: 'not_negotiable' });
  });
});

describe('checkPrice - produit négociable', () => {
  const p = makeProduct({
    negociable: true,
    prixAchat: 1000,
    prixPlancher: 1300,
    prixCible: 1700,
    prixVente: 2000,
  });

  it('OK normal when price = prixVente', () => {
    expect(checkPrice(p, 2000)).toEqual({ status: 'ok', level: 'normal' });
  });

  it('OK normal when price = prixCible (boundary)', () => {
    expect(checkPrice(p, 1700)).toEqual({ status: 'ok', level: 'normal' });
  });

  it('OK normal when price between prixCible and prixVente', () => {
    expect(checkPrice(p, 1800)).toEqual({ status: 'ok', level: 'normal' });
  });

  it('OK below_target when price between plancher and cible', () => {
    expect(checkPrice(p, 1500)).toEqual({ status: 'ok', level: 'below_target' });
  });

  it('OK below_target when price = prixPlancher (boundary)', () => {
    expect(checkPrice(p, 1300)).toEqual({ status: 'ok', level: 'below_target' });
  });

  it('blocked below_floor when price strictly below plancher', () => {
    expect(checkPrice(p, 1299)).toEqual({ status: 'blocked', reason: 'below_floor', floor: 1300 });
  });

  it('blocked above_display when price > prixVente', () => {
    expect(checkPrice(p, 2001)).toEqual({ status: 'blocked', reason: 'above_display', display: 2000 });
  });
});

describe('checkPrice - sans prixCible (fallback)', () => {
  it('uses prixVente as target when prixCible absent', () => {
    const p = makeProduct({
      negociable: true,
      prixAchat: 1000,
      prixPlancher: 1500,
      prixCible: undefined,
      prixVente: 2000,
    });
    // 1800 < prixVente (cible implicite) → below_target
    expect(checkPrice(p, 1800)).toEqual({ status: 'ok', level: 'below_target' });
    // 2000 = prixVente → normal
    expect(checkPrice(p, 2000)).toEqual({ status: 'ok', level: 'normal' });
  });
});

describe('checkPrice - sans prixPlancher (fallback)', () => {
  it('uses prixAchat as floor when prixPlancher absent', () => {
    const p = makeProduct({
      negociable: true,
      prixAchat: 1000,
      prixPlancher: undefined,
      prixCible: 1700,
      prixVente: 2000,
    });
    // 1000 = prixAchat (plancher implicite) → ok below_target
    expect(checkPrice(p, 1000)).toEqual({ status: 'ok', level: 'below_target' });
    // 999 < prixAchat → blocked below_floor
    expect(checkPrice(p, 999)).toEqual({ status: 'blocked', reason: 'below_floor', floor: 1000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Calculs économiques
// ────────────────────────────────────────────────────────────────────────────

describe('getMarginPercent', () => {
  it('returns correct margin in %', () => {
    const p = makeProduct({ prixAchat: 1000 });
    expect(getMarginPercent(p, 2000)).toBe(50);
  });

  it('returns 0 when prixAchat is 0', () => {
    const p = makeProduct({ prixAchat: 0 });
    expect(getMarginPercent(p, 1000)).toBe(0);
  });

  it('returns 0 when sellingPrice is 0', () => {
    const p = makeProduct({ prixAchat: 1000 });
    expect(getMarginPercent(p, 0)).toBe(0);
  });

  it('can be negative when selling below cost', () => {
    const p = makeProduct({ prixAchat: 1000 });
    const margin = getMarginPercent(p, 800);
    expect(margin).toBeLessThan(0);
  });
});

describe('getLossFromNegotiation', () => {
  it('returns 0 when no negotiation (prixUnitaire = prixVente)', () => {
    expect(getLossFromNegotiation(makeItem({ prixVente: 2000, prixUnitaire: 2000 }))).toBe(0);
  });

  it('returns 0 when prixUnitaire absent (legacy)', () => {
    expect(getLossFromNegotiation({ prixVente: 2000, prixUnitaire: undefined, quantity: 1 })).toBe(0);
  });

  it('returns (prixVente - prixUnitaire) * quantity', () => {
    expect(getLossFromNegotiation(makeItem({ prixVente: 2000, prixUnitaire: 1500, quantity: 3 }))).toBe(1500);
  });

  it('never negative even if prixUnitaire > prixVente (defensive)', () => {
    expect(getLossFromNegotiation(makeItem({ prixVente: 2000, prixUnitaire: 2500, quantity: 1 }))).toBe(0);
  });
});

describe('getAppliedPrice', () => {
  it('returns prixUnitaire when defined', () => {
    expect(getAppliedPrice({ prixVente: 2000, prixUnitaire: 1500 })).toBe(1500);
  });

  it('falls back to prixVente when prixUnitaire absent (legacy Sale)', () => {
    expect(getAppliedPrice({ prixVente: 2000, prixUnitaire: undefined })).toBe(2000);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Remise globale
// ────────────────────────────────────────────────────────────────────────────

describe('getLineFloor', () => {
  it('uses the product floor for a negotiable product', () => {
    const product = makeProduct({ negociable: true, prixPlancher: 1500 });
    expect(getLineFloor(makeItem(), product)).toBe(1500);
  });

  it('falls back to the purchase price when a negotiable product has no floor', () => {
    const product = makeProduct({ negociable: true, prixAchat: 1200, prixPlancher: undefined });
    expect(getLineFloor(makeItem(), product)).toBe(1200);
  });

  it('treats a fixed-price product as its own floor', () => {
    // The gérant marked it non-negotiable: that price is not open to discussion,
    // by a cart discount any more than by editing the line.
    const product = makeProduct({ negociable: false });
    expect(getLineFloor(makeItem({ prixUnitaire: 2000 }), product)).toBe(2000);
  });

  it('keeps an already authorized below-floor price as the new limit', () => {
    // A gérant allowed 1200 once; a discount must not quietly push it lower.
    const product = makeProduct({ negociable: true, prixPlancher: 1500 });
    const item = makeItem({
      prixUnitaire: 1200,
      negotiated: { discount: 800, belowFloor: true, overrideBy: 'u1', overrideByName: 'Amina' },
    });
    expect(getLineFloor(item, product)).toBe(1200);
  });

  it('protects a product missing from the catalogue', () => {
    expect(getLineFloor(makeItem({ prixUnitaire: 2000 }), undefined)).toBe(2000);
  });
});

describe('checkCartDiscount', () => {
  const negotiable = makeProduct({ id: 'p1', negociable: true, prixPlancher: 1500, prixVente: 2000 });
  const fixed = makeProduct({ id: 'p2', negociable: false, prixVente: 2000 });
  const find = (products: Product[]) => (id: string) => products.find(p => p.id === id);

  it('accepts no discount at all', () => {
    expect(checkCartDiscount([makeItem()], find([negotiable]), 0)).toEqual({ status: 'ok' });
  });

  it('accepts a discount that stays above the floor', () => {
    // 2000 → 1800, floor 1500.
    expect(checkCartDiscount([makeItem()], find([negotiable]), 10)).toEqual({ status: 'ok' });
  });

  it('accepts a discount landing exactly on the floor', () => {
    // 2000 → 1500 exactly.
    expect(checkCartDiscount([makeItem()], find([negotiable]), 25)).toEqual({ status: 'ok' });
  });

  it('blocks a discount that dips below the floor', () => {
    const result = checkCartDiscount([makeItem()], find([negotiable]), 30);
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') throw new Error('expected blocked');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].floor).toBe(1500);
    expect(result.lines[0].priceAfterDiscount).toBe(1400);
  });

  it('blocks any discount on a fixed-price product', () => {
    const result = checkCartDiscount([makeItem({ productId: 'p2' })], find([fixed]), 5);
    expect(result.status).toBe('blocked');
  });

  it('blocks the 100% discount that used to go through unchecked', () => {
    // The whole point: a cashier could hand the cart over for free.
    const result = checkCartDiscount([makeItem()], find([negotiable]), 100);
    expect(result.status).toBe('blocked');
  });

  it('names every offending line, not just the first', () => {
    const items = [makeItem({ productId: 'p1', nom: 'Négociable' }), makeItem({ productId: 'p2', nom: 'Prix fixe' })];
    const result = checkCartDiscount(items, find([negotiable, fixed]), 40);
    if (result.status !== 'blocked') throw new Error('expected blocked');
    expect(result.lines.map(l => l.nom)).toEqual(['Négociable', 'Prix fixe']);
  });

  it('ignores lines that stay within their own limit', () => {
    const cheapFloor = makeProduct({ id: 'p3', negociable: true, prixPlancher: 100, prixVente: 2000 });
    const items = [makeItem({ productId: 'p3', nom: 'Marge large' }), makeItem({ productId: 'p2', nom: 'Prix fixe' })];
    const result = checkCartDiscount(items, find([cheapFloor, fixed]), 20);
    if (result.status !== 'blocked') throw new Error('expected blocked');
    expect(result.lines.map(l => l.nom)).toEqual(['Prix fixe']);
  });

  it('does not demand authorisation for a rounding-sized shortfall', () => {
    // 3000 at 33.333…% lands a hair under 2000; that is arithmetic, not a discount.
    const product = makeProduct({ id: 'p4', negociable: true, prixPlancher: 2000, prixVente: 3000 });
    const item = makeItem({ productId: 'p4', prixVente: 3000, prixUnitaire: 3000 });
    expect(checkCartDiscount([item], find([product]), 100 / 3)).toEqual({ status: 'ok' });
  });
});
