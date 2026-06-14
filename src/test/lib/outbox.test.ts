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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueue, retryAll, getAll, type OutboxEntry } from '@/lib/outbox';

beforeEach(() => {
  localStorage.clear();
});

describe('outbox — enqueue', () => {
  it('adds an entry to localStorage', () => {
    enqueue('sale', { sale: { id: 's1' } });
    const entries = getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('sale');
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

  it('never deletes a failed entry — data is preserved', async () => {
    enqueue('sale', { sale: { id: 's-precious' } });
    const dispatch = vi.fn().mockRejectedValue(new Error('x'));

    for (let i = 0; i < 5; i++) await retryAll(dispatch);

    const entries = getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('failed');
  });
});
