import { describe, it, expect } from 'vitest';
import {
  checkPrice,
  getEffectiveFloor,
  getEffectiveTarget,
  isNegociable,
  getMarginPercent,
  getLossFromNegotiation,
  getAppliedPrice,
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
// checkPrice — la fonction critique
// ────────────────────────────────────────────────────────────────────────────

describe('checkPrice — produit NON négociable', () => {
  const p = makeProduct({ negociable: false, prixVente: 2000 });

  it('accepts only the exact prixVente', () => {
    expect(checkPrice(p, 2000)).toEqual({ status: 'ok', level: 'normal' });
  });

  it('blocks any other price', () => {
    expect(checkPrice(p, 1500)).toEqual({ status: 'blocked', reason: 'not_negotiable' });
    expect(checkPrice(p, 2500)).toEqual({ status: 'blocked', reason: 'not_negotiable' });
  });
});

describe('checkPrice — produit négociable', () => {
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

describe('checkPrice — sans prixCible (fallback)', () => {
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

describe('checkPrice — sans prixPlancher (fallback)', () => {
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
