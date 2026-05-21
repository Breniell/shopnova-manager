import { describe, it, expect, beforeEach } from 'vitest';
import { usePaymentStore, type Payment } from '@/stores/usePaymentStore';

beforeEach(() => {
  usePaymentStore.setState({ payments: [] });
});

describe('usePaymentStore — initial state', () => {
  it('starts with an empty list', () => {
    expect(usePaymentStore.getState().payments).toHaveLength(0);
  });

  it('can be seeded via _setPayments', () => {
    const seed: Payment[] = [
      {
        id: 'p1', saleId: 's1', customerId: 'c1',
        date: new Date(), amount: 1000, channel: 'especes',
        userId: 'u1', userName: 'Test',
      },
    ];
    usePaymentStore.getState()._setPayments(seed);
    expect(usePaymentStore.getState().payments).toHaveLength(1);
  });
});

describe('usePaymentStore — addPayment', () => {
  it('creates a Payment with an id', () => {
    const created = usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1',
      date: new Date(), amount: 2000, channel: 'especes',
      userId: 'u1', userName: 'Caissier',
    });
    expect(created.id).toBeTruthy();
    expect(usePaymentStore.getState().payments).toHaveLength(1);
  });

  it('returns the created Payment (useful for caller to update sale)', () => {
    const created = usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1',
      date: new Date(), amount: 2000, channel: 'especes',
      userId: 'u1', userName: 'Caissier',
    });
    expect(created.amount).toBe(2000);
    expect(created.channel).toBe('especes');
  });

  it('generates unique IDs for rapid consecutive payments', () => {
    // Régression : Date.now() pouvait causer des collisions (cf. fix v1.1.1)
    const p1 = usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 100, channel: 'especes', userId: 'u1', userName: 'X',
    });
    const p2 = usePaymentStore.getState().addPayment({
      saleId: 's2', customerId: 'c2', date: new Date(),
      amount: 200, channel: 'especes', userId: 'u1', userName: 'X',
    });
    const p3 = usePaymentStore.getState().addPayment({
      saleId: 's3', customerId: 'c3', date: new Date(),
      amount: 300, channel: 'especes', userId: 'u1', userName: 'X',
    });
    expect(p1.id).not.toBe(p2.id);
    expect(p2.id).not.toBe(p3.id);
    expect(p1.id).not.toBe(p3.id);
  });

  it('inserts new payments at the top (most recent first)', () => {
    const p1 = usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 100, channel: 'especes', userId: 'u1', userName: 'X',
    });
    const p2 = usePaymentStore.getState().addPayment({
      saleId: 's2', customerId: 'c2', date: new Date(),
      amount: 200, channel: 'especes', userId: 'u1', userName: 'X',
    });
    const all = usePaymentStore.getState().payments;
    expect(all[0].id).toBe(p2.id);
    expect(all[1].id).toBe(p1.id);
  });

  it('persists mobile money fields when channel is mobile_money', () => {
    const created = usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 5000, channel: 'mobile_money',
      mobileOperator: 'mtn', mobileReference: 'ABC123',
      userId: 'u1', userName: 'X',
    });
    expect(created.mobileOperator).toBe('mtn');
    expect(created.mobileReference).toBe('ABC123');
  });
});

describe('usePaymentStore — deletePayment', () => {
  it('removes the payment from the list', () => {
    const p = usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 100, channel: 'especes', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().deletePayment(p.id);
    expect(usePaymentStore.getState().payments).toHaveLength(0);
  });

  it('only removes the targeted payment', () => {
    const p1 = usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 100, channel: 'especes', userId: 'u1', userName: 'X',
    });
    const p2 = usePaymentStore.getState().addPayment({
      saleId: 's2', customerId: 'c2', date: new Date(),
      amount: 200, channel: 'especes', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().deletePayment(p1.id);
    const remaining = usePaymentStore.getState().payments;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(p2.id);
  });

  it('is a no-op if the id does not exist', () => {
    usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 100, channel: 'especes', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().deletePayment('does-not-exist');
    expect(usePaymentStore.getState().payments).toHaveLength(1);
  });
});

describe('usePaymentStore — getPaymentsForSale', () => {
  const seed = () => {
    usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 1000, channel: 'especes', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 500, channel: 'mobile_money', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().addPayment({
      saleId: 's2', customerId: 'c2', date: new Date(),
      amount: 2000, channel: 'especes', userId: 'u1', userName: 'X',
    });
  };

  it('returns all payments for a given sale', () => {
    seed();
    const list = usePaymentStore.getState().getPaymentsForSale('s1');
    expect(list).toHaveLength(2);
  });

  it('returns empty list when no payments match', () => {
    seed();
    expect(usePaymentStore.getState().getPaymentsForSale('nonexistent')).toHaveLength(0);
  });

  it('does not return payments of other sales', () => {
    seed();
    const list = usePaymentStore.getState().getPaymentsForSale('s2');
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(2000);
  });
});

describe('usePaymentStore — getPaymentsForCustomer', () => {
  const seed = () => {
    usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: new Date(),
      amount: 1000, channel: 'especes', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().addPayment({
      saleId: 's2', customerId: 'c1', date: new Date(),
      amount: 500, channel: 'especes', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().addPayment({
      saleId: 's3', customerId: 'c2', date: new Date(),
      amount: 2000, channel: 'especes', userId: 'u1', userName: 'X',
    });
  };

  it('returns all payments for a given customer', () => {
    seed();
    expect(usePaymentStore.getState().getPaymentsForCustomer('c1')).toHaveLength(2);
  });

  it('returns empty list when no payments match', () => {
    seed();
    expect(usePaymentStore.getState().getPaymentsForCustomer('cZZZ')).toHaveLength(0);
  });
});

describe('usePaymentStore — getPaymentsInRange', () => {
  it('returns only payments within the date range (inclusive)', () => {
    const inside = new Date('2026-05-10T10:00:00Z');
    const before = new Date('2026-05-05T10:00:00Z');
    const after = new Date('2026-05-20T10:00:00Z');

    usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1', date: inside,
      amount: 100, channel: 'especes', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().addPayment({
      saleId: 's2', customerId: 'c2', date: before,
      amount: 200, channel: 'especes', userId: 'u1', userName: 'X',
    });
    usePaymentStore.getState().addPayment({
      saleId: 's3', customerId: 'c3', date: after,
      amount: 300, channel: 'especes', userId: 'u1', userName: 'X',
    });

    const range = usePaymentStore.getState().getPaymentsInRange(
      new Date('2026-05-08T00:00:00Z'),
      new Date('2026-05-15T23:59:59Z')
    );
    expect(range).toHaveLength(1);
    expect(range[0].amount).toBe(100);
  });

  it('returns empty list when no payments match the range', () => {
    usePaymentStore.getState().addPayment({
      saleId: 's1', customerId: 'c1',
      date: new Date('2026-01-01T10:00:00Z'),
      amount: 100, channel: 'especes', userId: 'u1', userName: 'X',
    });
    const range = usePaymentStore.getState().getPaymentsInRange(
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-06-30T23:59:59Z')
    );
    expect(range).toHaveLength(0);
  });
});
