import { describe, it, expect } from 'vitest';
import { isValidMomoRef, canValidateMomo, momoDialString } from '@/lib/momoValidation';

describe('isValidMomoRef', () => {
  it('accepts a reference of exactly 6 characters', () => {
    expect(isValidMomoRef('ABC123')).toBe(true);
  });

  it('accepts a realistic MTN reference', () => {
    expect(isValidMomoRef('CI240612.1534.A12345')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidMomoRef('')).toBe(false);
  });

  it('rejects a string shorter than 6 characters', () => {
    expect(isValidMomoRef('AB12')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(isValidMomoRef('      ')).toBe(false);
  });

  it('trims before checking length', () => {
    expect(isValidMomoRef('  AB  ')).toBe(false); // only 2 non-space chars trimmed = "AB"
    expect(isValidMomoRef('  ABCDEF  ')).toBe(true);
  });
});

describe('canValidateMomo', () => {
  const validOpts = {
    mobileOperator: 'mtn' as const,
    momoMerchantCode: '123456',
    confirmationReceived: true,
    mobileRef: 'CI240612.1534.A12345',
  };

  it('returns true when all conditions are met', () => {
    expect(canValidateMomo(validOpts)).toBe(true);
  });

  it('returns false when SMS confirmation not checked', () => {
    expect(canValidateMomo({ ...validOpts, confirmationReceived: false })).toBe(false);
  });

  it('returns false when merchant code is missing', () => {
    expect(canValidateMomo({ ...validOpts, momoMerchantCode: undefined })).toBe(false);
  });

  it('returns false when merchant code is empty string', () => {
    expect(canValidateMomo({ ...validOpts, momoMerchantCode: '' })).toBe(false);
  });

  it('returns false when merchant code is whitespace only', () => {
    expect(canValidateMomo({ ...validOpts, momoMerchantCode: '   ' })).toBe(false);
  });

  it('returns false when reference is too short', () => {
    expect(canValidateMomo({ ...validOpts, mobileRef: 'AB12' })).toBe(false);
  });

  it('returns false when reference is empty', () => {
    expect(canValidateMomo({ ...validOpts, mobileRef: '' })).toBe(false);
  });

  it('works correctly with Orange operator', () => {
    expect(canValidateMomo({ ...validOpts, mobileOperator: 'orange' })).toBe(true);
  });
});

describe('momoDialString', () => {
  it('returns correct MTN MoMo USSD string', () => {
    expect(momoDialString('mtn', '123456', 5000)).toBe('*126*4*123456*5000#');
  });

  it('returns correct Orange Money USSD string', () => {
    expect(momoDialString('orange', '654321', 12500)).toBe('#150*4*654321*12500#');
  });
});
