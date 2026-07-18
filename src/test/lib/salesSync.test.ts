import { describe, expect, it } from 'vitest';
import { mergeSyncedSales } from '@/lib/salesSync';
import type { Sale } from '@/stores/useSaleStore';

function sale(id: string, date: string, paymentMode: Sale['paymentMode'], total = 1000): Sale {
  return {
    id,
    saleNumber: id,
    date: new Date(date),
    items: [],
    subtotal: total,
    discount: 0,
    total,
    paymentMode,
    userId: 'user-1',
    userName: 'Test',
  };
}

describe('mergeSyncedSales', () => {
  const cutoff = new Date('2026-04-17T00:00:00.000Z');

  it('retains historical local cash sales while replacing the recent window', () => {
    const historical = sale('old-cash', '2025-01-01T00:00:00.000Z', 'especes');
    const staleRecent = sale('deleted-recent', '2026-07-01T00:00:00.000Z', 'especes');
    const cloudRecent = sale('cloud-recent', '2026-07-02T00:00:00.000Z', 'mobile_money');

    expect(mergeSyncedSales([cloudRecent], [], [historical, staleRecent], cutoff))
      .toEqual([cloudRecent, historical]);
  });

  it('keeps every cloud credit sale even when it predates the recent window', () => {
    const oldCredit = sale('old-credit', '2024-01-01T00:00:00.000Z', 'credit');
    const localStaleCredit = sale('removed-credit', '2023-01-01T00:00:00.000Z', 'credit');

    expect(mergeSyncedSales([], [oldCredit], [localStaleCredit], cutoff))
      .toEqual([oldCredit]);
  });

  it('deduplicates a recent credit sale and gives the recent snapshot precedence', () => {
    const fromCreditQuery = sale('credit', '2026-07-01T00:00:00.000Z', 'credit', 1000);
    const fromRecentQuery = sale('credit', '2026-07-01T00:00:00.000Z', 'credit', 1200);

    expect(mergeSyncedSales([fromRecentQuery], [fromCreditQuery], [], cutoff))
      .toEqual([fromRecentQuery]);
  });
});
