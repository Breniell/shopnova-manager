/**
 * Tests unitaires de l'outbox (src/lib/outbox.ts).
 *
 * Couvre :
 *   1. enqueue — ajoute une entrée dans localStorage
 *   2. retryAll — appelle le dispatcher et supprime l'entrée en cas de succès
 *   3. retryAll — incrémente attempts en cas d'échec
 *   4. Plafond de tentatives — après MAX_ATTEMPTS (3) l'entrée passe à 'failed'
 *      et n'est plus retraitée
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enqueue,
  retryAll,
  retryFailed,
  getAll,
  getPersistenceState,
  resetOutboxMemoryForTests,
  type OutboxEntry,
} from '@/lib/outbox';

const boutiqueMock = vi.hoisted(() => ({ id: 'boutique-a' }));

vi.mock('@/services/boutiqueService', () => ({
  getBoutiqueId: () => boutiqueMock.id,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  resetOutboxMemoryForTests();
  localStorage.clear();
  boutiqueMock.id = 'boutique-a';
});

afterEach(() => vi.restoreAllMocks());

describe('outbox — enqueue', () => {
  it('adds an entry to localStorage', () => {
    enqueue('sale', { sale: { id: 's1' } });
    const entries = getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('sale');
    expect(entries[0].boutiqueId).toBe('boutique-a');
    expect(entries[0].status).toBe('pending');
    expect(entries[0].attempts).toBe(0);
  });

  it('accumulates multiple entries', () => {
    enqueue('sale', { id: 's1' });
    enqueue('expense', { id: 'e1' });
    enqueue('cloture', { id: 'cl1' });
    expect(getAll()).toHaveLength(3);
  });

  it('assigns a unique id to each entry', () => {
    enqueue('sale', {});
    enqueue('sale', {});
    const [a, b] = getAll();
    expect(a.id).not.toBe(b.id);
  });

  it('keeps a real in-memory fallback and reports non-durable storage', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    const result = enqueue('sale', { id: 'memory-only' });

    expect(result.durable).toBe(false);
    expect(result.error).toContain('uniquement en mémoire');
    expect(getAll()).toHaveLength(1);
    expect(getAll()[0].payload).toEqual({ id: 'memory-only' });
    expect(getPersistenceState()).toEqual({
      durable: false,
      error: expect.stringContaining('Quota exceeded'),
    });
  });

  it('quarantines legacy entries whose tenant is unknown', () => {
    localStorage.setItem('legwan-outbox', JSON.stringify([{
      id: 'legacy', type: 'sale', payload: {}, attempts: 0,
      createdAt: new Date().toISOString(), status: 'pending',
    }]));

    const [entry] = getAll();
    expect(entry.boutiqueId).toBe('__unknown__');
    expect(entry.status).toBe('quarantined');
  });
});

describe('outbox — retryAll success', () => {
  it('removes the entry after a successful dispatch', async () => {
    enqueue('sale', { sale: { id: 's1' } });
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await retryAll(dispatch);

    expect(dispatch).toHaveBeenCalledOnce();
    expect(getAll()).toHaveLength(0);
  });

  it('dispatches with the correct entry type and payload', async () => {
    const payload = { productId: 'p1', delta: -3 };
    enqueue('stockAdjust', payload);
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await retryAll(dispatch);

    const call = dispatch.mock.calls[0][1] as OutboxEntry;
    expect(call.type).toBe('stockAdjust');
    expect(call.payload).toEqual(payload);
  });

  it('coalesces concurrent drains so a stock delta is dispatched only once', async () => {
    enqueue('stockAdjust', { productId: 'p1', delta: 4 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const dispatch = vi.fn(async () => gate);

    const startupRetry = retryAll(dispatch);
    const onlineRetry = retryAll(dispatch);

    await Promise.resolve();
    expect(dispatch).toHaveBeenCalledOnce();
    release();
    await Promise.all([startupRetry, onlineRetry]);

    expect(dispatch).toHaveBeenCalledOnce();
    expect(getAll()).toHaveLength(0);
  });

  it('preserves an entry enqueued while a drain is awaiting Firestore', async () => {
    enqueue('sale', { sale: { id: 'already-pending' } });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const dispatch = vi.fn(async () => gate);

    const retry = retryAll(dispatch);
    await Promise.resolve();
    enqueue('expense', { id: 'failed-during-drain' });
    release();
    await retry;

    expect(getAll()).toHaveLength(1);
    expect(getAll()[0]).toMatchObject({
      type: 'expense',
      payload: { id: 'failed-during-drain' },
      status: 'pending',
    });
  });

  it('quarantines an entry from another boutique and never dispatches it', async () => {
    enqueue('sale', { sale: { id: 'tenant-a-sale' } });
    boutiqueMock.id = 'boutique-b';
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await retryAll(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
    const [entry] = getAll();
    expect(entry.boutiqueId).toBe('boutique-a');
    expect(entry.status).toBe('quarantined');
    expect(entry.lastError).toContain('Rejeu interdit');
  });
});

describe('outbox — retryAll failure and attempt tracking', () => {
  it('increments attempts on failure and keeps entry as pending', async () => {
    enqueue('expense', { id: 'e1' });
    const dispatch = vi.fn().mockRejectedValue(new Error('rules/permission-denied'));

    await retryAll(dispatch);

    const entries = getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].attempts).toBe(1);
    expect(entries[0].status).toBe('pending');
    expect(entries[0].lastError).toContain('rules/permission-denied');
  });

  it('sets status to failed after MAX_ATTEMPTS (3) rejections', async () => {
    enqueue('cashSession', { id: 'sess1' });
    const dispatch = vi.fn().mockRejectedValue(new Error('quota-exceeded'));

    await retryAll(dispatch); // attempt 1
    await retryAll(dispatch); // attempt 2
    await retryAll(dispatch); // attempt 3 → failed

    const entries = getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].attempts).toBe(3);
    expect(entries[0].status).toBe('failed');
  });

  it('does not retry an entry that has already reached failed status', async () => {
    enqueue('refund', { saleId: 'r1' });
    const dispatch = vi.fn().mockRejectedValue(new Error('error'));

    await retryAll(dispatch); // 1
    await retryAll(dispatch); // 2
    await retryAll(dispatch); // 3 → failed
    const callsAfterCap = dispatch.mock.calls.length;

    await retryAll(dispatch); // 4 — should NOT be dispatched
    expect(dispatch.mock.calls.length).toBe(callsAfterCap);
    expect(getAll()[0].attempts).toBe(3); // unchanged
  });

  it('allows an operator to reset and retry failed entries explicitly', async () => {
    enqueue('expense', { id: 'e-retry' });
    const failing = vi.fn().mockRejectedValue(new Error('temporary'));
    await retryAll(failing);
    await retryAll(failing);
    await retryAll(failing);
    expect(getAll()[0].status).toBe('failed');

    const recovered = vi.fn().mockResolvedValue(undefined);
    await retryFailed(recovered);

    expect(recovered).toHaveBeenCalledOnce();
    expect(getAll()).toHaveLength(0);
  });

  it('never deletes a failed entry — data is preserved', async () => {
    enqueue('sale', { sale: { id: 's-precious' } });
    const dispatch = vi.fn().mockRejectedValue(new Error('x'));

    for (let i = 0; i < 5; i++) await retryAll(dispatch);

    const entries = getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('failed');
  });
});
