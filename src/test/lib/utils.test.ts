import { describe, it, expect } from 'vitest';
import { cn, generateEAN13, generateSaleId, getStockStatus } from '@/lib/utils';

// ─── cn (class merger) ────────────────────────────────────────────────────────
describe('cn', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null, '')).toBe('foo');
  });

  it('resolves Tailwind conflicts (last wins)', () => {
    // tailwind-merge: p-4 overrides p-2
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('handles conditional object syntax', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500');
  });
});

// ─── generateEAN13 ────────────────────────────────────────────────────────────
describe('generateEAN13', () => {
  it('returns a 13-character string', () => {
    expect(generateEAN13()).toHaveLength(13);
  });

  it('starts with 690', () => {
    expect(generateEAN13().startsWith('690')).toBe(true);
  });

  it('contains only digits', () => {
    expect(/^\d{13}$/.test(generateEAN13())).toBe(true);
  });

  it('has a valid EAN-13 check digit', () => {
    const code = generateEAN13();
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    expect(parseInt(code[12])).toBe(checkDigit);
  });

  it('generates different codes each call', () => {
    const codes = new Set(Array.from({ length: 20 }, generateEAN13));
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ─── generateSaleId ───────────────────────────────────────────────────────────
describe('generateSaleId', () => {
  const currentYear = new Date().getFullYear();

  it('starts with LGW-{year}-', () => {
    expect(generateSaleId(1).startsWith(`LGW-${currentYear}-`)).toBe(true);
  });

  it('zero-pads the count to 5 digits', () => {
    expect(generateSaleId(1)).toBe(`LGW-${currentYear}-00001`);
    expect(generateSaleId(42)).toBe(`LGW-${currentYear}-00042`);
    expect(generateSaleId(99999)).toBe(`LGW-${currentYear}-99999`);
  });
});

// ─── getStockStatus ───────────────────────────────────────────────────────────
describe('getStockStatus', () => {
  it('returns "stockout" when stock is 0', () => {
    expect(getStockStatus(0, 10)).toBe('stockout');
  });

  it('returns "stockout" when stock is negative', () => {
    expect(getStockStatus(-5, 10)).toBe('stockout');
  });

  it('returns "low" when stock is at the threshold', () => {
    expect(getStockStatus(10, 10)).toBe('low');
  });

  it('returns "low" when stock is below the threshold', () => {
    expect(getStockStatus(3, 10)).toBe('low');
  });

  it('returns "healthy" when stock is above the threshold', () => {
    expect(getStockStatus(11, 10)).toBe('healthy');
    expect(getStockStatus(100, 10)).toBe('healthy');
  });

  it('handles threshold of 0', () => {
    expect(getStockStatus(1, 0)).toBe('healthy');
    expect(getStockStatus(0, 0)).toBe('stockout');
  });
});
