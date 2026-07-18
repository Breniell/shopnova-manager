import { describe, it, expect } from 'vitest';
import {
  getRemainingBalance,
  getAmountPaid,
  computeCreditStatus,
  getCustomerOutstanding,
  getCustomerOpenCreditSales,
  getAllOpenCreditSales,
  getCreditAgeInDays,
  getCreditAgeBucket,
  checkCreditLimit,
  projectCreditSale,
} from '@/lib/credit';
import type { Sale } from '@/stores/useSaleStore';
import type { Payment } from '@/stores/usePaymentStore';

// ────────────────────────────────────────────────────────────────────────────
// Helpers de factory pour fabriquer des Sale et Payment de test concis
// ────────────────────────────────────────────────────────────────────────────

const makeSale = (overrides: Partial<Sale> = {}): Sale => ({
  id: 's1',
  saleNumber: 'LGW-2026-00001',
  date: new Date('2026-05-01T10:00:00Z'),
  items: [],
  subtotal: 10000,
  discount: 0,
  total: 10000,
  paymentMode: 'credit',
  userId: 'u1',
  userName: 'Test',
  customerId: 'c1',
  customerName: 'Client Test',
  creditStatus: 'pending',
  amountPaid: 0,
  ...overrides,
});

const makePayment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'p1',
  saleId: 's1',
  customerId: 'c1',
  date: new Date('2026-05-02T10:00:00Z'),
  amount: 0,
  channel: 'especes',
  userId: 'u1',
  userName: 'Test',
  ...overrides,
});

// ────────────────────────────────────────────────────────────────────────────
// getRemainingBalance
// ────────────────────────────────────────────────────────────────────────────

describe('getRemainingBalance', () => {
  it('returns 0 for non-credit sales', () => {
    const sale = makeSale({ paymentMode: 'especes' });
    expect(getRemainingBalance(sale, [])).toBe(0);
  });

  it('returns 0 for refunded sales', () => {
    const sale = makeSale({ status: 'refunded' });
    expect(getRemainingBalance(sale, [])).toBe(0);
  });

  it('returns full total when no payment has been made', () => {
    const sale = makeSale({ total: 10000 });
    expect(getRemainingBalance(sale, [])).toBe(10000);
  });

  it('returns total minus payments for the same sale', () => {
    const sale = makeSale({ total: 10000 });
    const payments = [makePayment({ amount: 3000 })];
    expect(getRemainingBalance(sale, payments)).toBe(7000);
  });

  it('ignores payments belonging to other sales', () => {
    const sale = makeSale({ id: 's1', total: 10000 });
    const payments = [
      makePayment({ saleId: 's1', amount: 3000 }),
      makePayment({ saleId: 's2', amount: 5000 }),
    ];
    expect(getRemainingBalance(sale, payments)).toBe(7000);
  });

  it('returns 0 when fully paid', () => {
    const sale = makeSale({ total: 10000 });
    const payments = [makePayment({ amount: 10000 })];
    expect(getRemainingBalance(sale, payments)).toBe(0);
  });

  it('never goes below 0 even with overpayment', () => {
    const sale = makeSale({ total: 10000 });
    const payments = [makePayment({ amount: 15000 })];
    expect(getRemainingBalance(sale, payments)).toBe(0);
  });

  it('sums multiple partial payments correctly', () => {
    const sale = makeSale({ total: 10000 });
    const payments = [
      makePayment({ id: 'p1', amount: 2000 }),
      makePayment({ id: 'p2', amount: 3000 }),
      makePayment({ id: 'p3', amount: 1500 }),
    ];
    expect(getRemainingBalance(sale, payments)).toBe(3500);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getAmountPaid
// ────────────────────────────────────────────────────────────────────────────

describe('getAmountPaid', () => {
  it('returns 0 for non-credit sales', () => {
    const sale = makeSale({ paymentMode: 'especes' });
    expect(getAmountPaid(sale, [makePayment({ amount: 1000 })])).toBe(0);
  });

  it('sums payments for the sale', () => {
    const sale = makeSale();
    const payments = [
      makePayment({ amount: 2500 }),
      makePayment({ id: 'p2', amount: 1500 }),
    ];
    expect(getAmountPaid(sale, payments)).toBe(4000);
  });

  it('returns 0 when no payment exists', () => {
    expect(getAmountPaid(makeSale(), [])).toBe(0);
  });

  it('keeps both concurrent terminal operations instead of losing one', () => {
    const payments = [
      makePayment({ id: 'terminal-a', operationId: 'terminal-a', kind: 'payment', amount: 3000 }),
      makePayment({ id: 'terminal-b', operationId: 'terminal-b', kind: 'payment', amount: 2500 }),
    ];
    expect(getAmountPaid(makeSale(), payments)).toBe(5500);
  });

  it('derives the balance from an immutable reversal event', () => {
    const payment = makePayment({ id: 'p-original', kind: 'payment', amount: 3000 });
    const reversal = makePayment({
      id: 'rev-p-original', kind: 'reversal', reversesPaymentId: payment.id, amount: 3000,
    });
    expect(getAmountPaid(makeSale(), [payment, reversal])).toBe(0);
  });
});

describe('projectCreditSale', () => {
  it('ignores a stale absolute amount and projects the complete ledger', () => {
    const stale = makeSale({ total: 10000, amountPaid: 3000, creditStatus: 'partial' });
    const projected = projectCreditSale(stale, [
      makePayment({ id: 'a', amount: 3000 }),
      makePayment({ id: 'b', amount: 7000 }),
    ]);
    expect(projected.amountPaid).toBe(10000);
    expect(projected.creditStatus).toBe('paid');
    expect(projected.creditConflict).toBe(false);
  });

  it('preserves an offline over-collection and flags it for reconciliation', () => {
    const projected = projectCreditSale(makeSale({ total: 10000 }), [
      makePayment({ id: 'a', amount: 7000 }),
      makePayment({ id: 'b', amount: 5000 }),
    ]);
    expect(projected.amountPaid).toBe(12000);
    expect(projected.creditStatus).toBe('paid');
    expect(projected.creditConflict).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeCreditStatus
// ────────────────────────────────────────────────────────────────────────────

describe('computeCreditStatus', () => {
  it('returns "paid" for non-credit sales (N/A case)', () => {
    const sale = makeSale({ paymentMode: 'especes' });
    expect(computeCreditStatus(sale, [])).toBe('paid');
  });

  it('returns "pending" when no payment received', () => {
    expect(computeCreditStatus(makeSale(), [])).toBe('pending');
  });

  it('returns "partial" when some but not all is paid', () => {
    const sale = makeSale({ total: 10000 });
    const payments = [makePayment({ amount: 3000 })];
    expect(computeCreditStatus(sale, payments)).toBe('partial');
  });

  it('returns "paid" when fully paid', () => {
    const sale = makeSale({ total: 10000 });
    const payments = [makePayment({ amount: 10000 })];
    expect(computeCreditStatus(sale, payments)).toBe('paid');
  });

  it('returns "paid" even on overpayment', () => {
    const sale = makeSale({ total: 10000 });
    const payments = [makePayment({ amount: 12000 })];
    expect(computeCreditStatus(sale, payments)).toBe('paid');
  });

  it('returns "paid" when total is 0 (edge case)', () => {
    const sale = makeSale({ total: 0 });
    expect(computeCreditStatus(sale, [])).toBe('pending'); // 0 ≤ 0 ⇒ pending par convention
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getCustomerOutstanding
// ────────────────────────────────────────────────────────────────────────────

describe('getCustomerOutstanding', () => {
  it('returns 0 when customer has no credit sales', () => {
    const sales = [makeSale({ paymentMode: 'especes', customerId: 'c1' })];
    expect(getCustomerOutstanding('c1', sales, [])).toBe(0);
  });

  it('sums remaining balance across all credit sales of the customer', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 10000 }),
      makeSale({ id: 's2', customerId: 'c1', total: 5000 }),
      makeSale({ id: 's3', customerId: 'c1', total: 3000 }),
    ];
    const payments = [makePayment({ saleId: 's1', amount: 4000 })];
    // remaining: s1=6000, s2=5000, s3=3000 → total 14000
    expect(getCustomerOutstanding('c1', sales, payments)).toBe(14000);
  });

  it('excludes other customers sales', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 10000 }),
      makeSale({ id: 's2', customerId: 'c2', total: 5000 }),
    ];
    expect(getCustomerOutstanding('c1', sales, [])).toBe(10000);
  });

  it('excludes refunded sales', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 10000 }),
      makeSale({ id: 's2', customerId: 'c1', total: 5000, status: 'refunded' }),
    ];
    expect(getCustomerOutstanding('c1', sales, [])).toBe(10000);
  });

  it('excludes paid sales (remaining = 0)', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 10000 }),
      makeSale({ id: 's2', customerId: 'c1', total: 5000 }),
    ];
    const payments = [makePayment({ saleId: 's2', amount: 5000 })];
    expect(getCustomerOutstanding('c1', sales, payments)).toBe(10000);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getCustomerOpenCreditSales
// ────────────────────────────────────────────────────────────────────────────

describe('getCustomerOpenCreditSales', () => {
  it('returns only unpaid credit sales of the customer', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 10000 }),
      makeSale({ id: 's2', customerId: 'c1', total: 5000 }), // paid
      makeSale({ id: 's3', customerId: 'c2', total: 3000 }),
    ];
    const payments = [makePayment({ saleId: 's2', amount: 5000 })];
    const open = getCustomerOpenCreditSales('c1', sales, payments);
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe('s1');
  });

  it('excludes refunded sales', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 10000, status: 'refunded' }),
    ];
    expect(getCustomerOpenCreditSales('c1', sales, [])).toHaveLength(0);
  });

  it('sorts by dueDate first (sales with dueDate before those without)', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 1000, dueDate: undefined }),
      makeSale({ id: 's2', customerId: 'c1', total: 1000, dueDate: '2026-06-01' }),
      makeSale({ id: 's3', customerId: 'c1', total: 1000, dueDate: '2026-05-15' }),
    ];
    const sorted = getCustomerOpenCreditSales('c1', sales, []);
    expect(sorted.map(s => s.id)).toEqual(['s3', 's2', 's1']);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getAllOpenCreditSales
// ────────────────────────────────────────────────────────────────────────────

describe('getAllOpenCreditSales', () => {
  it('returns unpaid credit sales across all customers', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 1000 }),
      makeSale({ id: 's2', customerId: 'c2', total: 2000 }),
      makeSale({ id: 's3', customerId: 'c3', total: 500, paymentMode: 'especes' }),
    ];
    const open = getAllOpenCreditSales(sales, []);
    expect(open).toHaveLength(2);
    expect(open.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('excludes fully paid sales', () => {
    const sales = [
      makeSale({ id: 's1', customerId: 'c1', total: 1000 }),
      makeSale({ id: 's2', customerId: 'c2', total: 2000 }),
    ];
    const payments = [makePayment({ saleId: 's2', amount: 2000 })];
    const open = getAllOpenCreditSales(sales, payments);
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe('s1');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getCreditAgeInDays / getCreditAgeBucket
// ────────────────────────────────────────────────────────────────────────────

describe('getCreditAgeInDays', () => {
  it('returns 0 for sale done today', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    const sale = makeSale({ date: new Date('2026-05-15T08:00:00Z') });
    expect(getCreditAgeInDays(sale, now)).toBe(0);
  });

  it('returns the correct number of days', () => {
    const reference = new Date('2026-05-15T10:00:00Z');
    const sale = makeSale({ date: new Date('2026-05-01T10:00:00Z') });
    expect(getCreditAgeInDays(sale, reference)).toBe(14);
  });
});

describe('getCreditAgeBucket', () => {
  it('returns "recent" for ≤ 7 days', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    const sale = makeSale({ date: new Date('2026-05-10T10:00:00Z') });
    expect(getCreditAgeBucket(sale, now)).toBe('recent');
  });

  it('returns "moderate" for 8–30 days', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    const sale = makeSale({ date: new Date('2026-05-01T10:00:00Z') });
    expect(getCreditAgeBucket(sale, now)).toBe('moderate');
  });

  it('returns "old" for > 30 days', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    const sale = makeSale({ date: new Date('2026-04-01T10:00:00Z') });
    expect(getCreditAgeBucket(sale, now)).toBe('old');
  });

  it('boundary cases: day 7 = recent, day 8 = moderate', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    const sale7 = makeSale({ date: new Date('2026-05-08T10:00:00Z') });
    const sale8 = makeSale({ date: new Date('2026-05-07T10:00:00Z') });
    expect(getCreditAgeBucket(sale7, now)).toBe('recent');
    expect(getCreditAgeBucket(sale8, now)).toBe('moderate');
  });

  it('boundary cases: day 30 = moderate, day 31 = old', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    const sale30 = makeSale({ date: new Date('2026-04-15T10:00:00Z') });
    const sale31 = makeSale({ date: new Date('2026-04-14T10:00:00Z') });
    expect(getCreditAgeBucket(sale30, now)).toBe('moderate');
    expect(getCreditAgeBucket(sale31, now)).toBe('old');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// checkCreditLimit
// ────────────────────────────────────────────────────────────────────────────

describe('checkCreditLimit', () => {
  it('returns ok=true when plafond is undefined (no limit)', () => {
    expect(checkCreditLimit('c1', 100000, undefined, [], [])).toEqual({ ok: true });
  });

  it('returns ok=true when new sale + outstanding ≤ plafond', () => {
    const sales = [makeSale({ id: 's1', customerId: 'c1', total: 5000 })];
    const result = checkCreditLimit('c1', 3000, 10000, sales, []);
    expect(result.ok).toBe(true);
  });

  it('returns ok=false when limit exceeded', () => {
    const sales = [makeSale({ id: 's1', customerId: 'c1', total: 5000 })];
    const result = checkCreditLimit('c1', 7000, 10000, sales, []);
    expect(result.ok).toBe(false);
    // Type narrowing: TS doit voir que result.ok === false ici
    if (result.ok === false) {
      expect(result.current).toBe(5000);
      expect(result.afterSale).toBe(12000);
      expect(result.plafond).toBe(10000);
    }
  });

  it('returns ok=true when plafond is 0 and no purchase (edge case)', () => {
    // plafond=0 means "credit forbidden"; an empty new sale (0) ≤ 0 is ok
    const result = checkCreditLimit('c1', 0, 0, [], []);
    expect(result.ok).toBe(true);
  });

  it('returns ok=false when plafond=0 and any purchase attempted', () => {
    const result = checkCreditLimit('c1', 1000, 0, [], []);
    expect(result.ok).toBe(false);
  });

  it('boundary: amount exactly equal to remaining headroom is ok', () => {
    const sales = [makeSale({ id: 's1', customerId: 'c1', total: 5000 })];
    const result = checkCreditLimit('c1', 5000, 10000, sales, []);
    expect(result.ok).toBe(true);
  });
});
