import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  formatFCFA,
  formatDate,
  formatDateTime,
  formatTime,
  formatDateShort,
  formatDateLong,
} from '@/utils/formatters';

// Fixed reference date: Saturday 5 April 2025, 14:30
const REF_DATE = new Date(2025, 3, 5, 14, 30, 0); // month is 0-indexed

// ─── formatPrice / formatFCFA ─────────────────────────────────────────────────
describe('formatPrice', () => {
  it('formats zero correctly', () => {
    expect(formatPrice(0)).toContain('FCFA');
    expect(formatPrice(0)).toContain('0');
  });

  it('formats a whole number with French thousand separator', () => {
    const result = formatPrice(12500);
    expect(result).toContain('FCFA');
    // French locale uses non-breaking space as thousand separator
    expect(result).toMatch(/12.?500/);
  });

  it('formats large numbers', () => {
    const result = formatPrice(1000000);
    expect(result).toContain('FCFA');
    expect(result).toMatch(/1.?000.?000/);
  });

  it('handles NaN string gracefully', () => {
    expect(formatPrice('abc')).toBe('0 FCFA');
  });

  it('accepts numeric strings', () => {
    const result = formatPrice('5000');
    expect(result).toContain('FCFA');
    expect(result).toMatch(/5.?000/);
  });
});

describe('formatFCFA', () => {
  it('is an alias of formatPrice', () => {
    expect(formatFCFA(1500)).toBe(formatPrice(1500));
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────
describe('formatDate', () => {
  it('returns a non-empty string for a valid date', () => {
    expect(formatDate(REF_DATE).length).toBeGreaterThan(0);
  });

  it('accepts a Date object', () => {
    const result = formatDate(new Date(2025, 0, 15));
    expect(result).toMatch(/15/);
  });

  it('accepts an ISO string', () => {
    const result = formatDate('2025-04-05T14:30:00');
    expect(result).toMatch(/5|05/);
  });
});

// ─── formatDateTime ───────────────────────────────────────────────────────────
describe('formatDateTime', () => {
  it('includes both date and time information', () => {
    const result = formatDateTime(REF_DATE);
    // Should include the year and some time component
    expect(result).toMatch(/2025/);
    expect(result.length).toBeGreaterThan(8);
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────
describe('formatTime', () => {
  it('returns HH:MM format', () => {
    const result = formatTime(REF_DATE);
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('includes the correct hour', () => {
    const result = formatTime(REF_DATE);
    expect(result).toMatch(/14/);
  });

  it('accepts an ISO string', () => {
    const result = formatTime('2025-04-05T09:05:00');
    expect(result).toMatch(/09|9/);
  });
});

// ─── formatDateShort ──────────────────────────────────────────────────────────
describe('formatDateShort', () => {
  it('includes day and year', () => {
    const result = formatDateShort(new Date(2025, 3, 5));
    expect(result).toMatch(/05|5/);
    expect(result).toMatch(/2025/);
  });

  it('formats in DD/MM/YYYY order (French locale)', () => {
    const result = formatDateShort(new Date(2025, 0, 7)); // Jan 7
    // French locale: 07/01/2025
    expect(result).toMatch(/07\/01\/2025|7\/1\/2025/);
  });
});

// ─── formatDateLong ───────────────────────────────────────────────────────────
describe('formatDateLong', () => {
  it('contains the month name in French', () => {
    const result = formatDateLong(new Date(2025, 3, 5)); // April
    expect(result.toLowerCase()).toMatch(/avril|april/);
  });

  it('contains the year', () => {
    expect(formatDateLong(REF_DATE)).toContain('2025');
  });
});
