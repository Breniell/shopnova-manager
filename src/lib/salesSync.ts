import type { Sale } from '@/stores/useSaleStore';

/**
 * Merge the bounded recent-sales query with the complete credit-sales query.
 * Older non-credit sales already stored on this device are retained so a
 * routine online bootstrap never truncates the autonomous local history.
 */
export function mergeSyncedSales(
  recentSales: Sale[],
  creditSales: Sale[],
  localSales: Sale[],
  cutoff: Date,
): Sale[] {
  const byId = new Map<string, Sale>();

  for (const sale of localSales) {
    if (sale.paymentMode !== 'credit' && new Date(sale.date) < cutoff) {
      byId.set(sale.id, sale);
    }
  }
  for (const sale of creditSales) byId.set(sale.id, sale);
  for (const sale of recentSales) byId.set(sale.id, sale);

  return [...byId.values()].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
  );
}
