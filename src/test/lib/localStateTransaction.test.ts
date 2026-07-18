import { describe, expect, it, vi } from 'vitest';
import {
  deferCriticalSnapshotIfTransactionActive,
  onLocalStateTransactionCommit,
  runLocalStateTransaction,
} from '@/lib/localStateTransaction';

describe('localStateTransaction', () => {
  it('coalesces all critical store notifications into one final snapshot signal', () => {
    const committed = vi.fn();
    const unsubscribe = onLocalStateTransactionCommit(committed);

    runLocalStateTransaction(() => {
      expect(deferCriticalSnapshotIfTransactionActive()).toBe(true);
      expect(deferCriticalSnapshotIfTransactionActive()).toBe(true);
      runLocalStateTransaction(() => {
        expect(deferCriticalSnapshotIfTransactionActive()).toBe(true);
      });
      expect(committed).not.toHaveBeenCalled();
    });

    expect(committed).toHaveBeenCalledTimes(1);
    expect(deferCriticalSnapshotIfTransactionActive()).toBe(false);
    unsubscribe();
  });

  it('releases the transaction and emits the final signal even when a mutation throws', () => {
    const committed = vi.fn();
    const unsubscribe = onLocalStateTransactionCommit(committed);

    expect(() => runLocalStateTransaction(() => {
      deferCriticalSnapshotIfTransactionActive();
      throw new Error('power-loss-simulation');
    })).toThrow('power-loss-simulation');

    expect(committed).toHaveBeenCalledTimes(1);
    expect(deferCriticalSnapshotIfTransactionActive()).toBe(false);
    unsubscribe();
  });
});
