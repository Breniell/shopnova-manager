import { describe, it, expect, beforeEach } from 'vitest';
import { useCashSessionStore, type CashSession } from '@/stores/useCashSessionStore';

beforeEach(() => {
  useCashSessionStore.setState({ sessions: [], cashOuts: [], currentSessionId: null });
});

const openParams = (overrides: Partial<{ userId: string; userName: string; fondInitial: number; notesOuverture?: string }> = {}) => ({
  userId: 'u1',
  userName: 'Caissier Test',
  fondInitial: 10000,
  ...overrides,
});

describe('useCashSessionStore — initial state', () => {
  it('starts with empty lists and no current session', () => {
    expect(useCashSessionStore.getState().sessions).toHaveLength(0);
    expect(useCashSessionStore.getState().cashOuts).toHaveLength(0);
    expect(useCashSessionStore.getState().currentSessionId).toBeNull();
  });
});

describe('useCashSessionStore — openSession', () => {
  it('creates an open session and sets currentSessionId', () => {
    const s = useCashSessionStore.getState().openSession(openParams());
    expect(s.status).toBe('open');
    expect(s.fondInitial).toBe(10000);
    expect(useCashSessionStore.getState().currentSessionId).toBe(s.id);
  });

  it('throws if the same user already has an open session', () => {
    useCashSessionStore.getState().openSession(openParams());
    expect(() => useCashSessionStore.getState().openSession(openParams())).toThrow(/déjà ouverte/);
  });

  it('throws on negative fond', () => {
    expect(() => useCashSessionStore.getState().openSession(openParams({ fondInitial: -100 }))).toThrow(/invalide/);
  });

  it('allows different users to have concurrent sessions', () => {
    useCashSessionStore.getState().openSession(openParams({ userId: 'u1', userName: 'A' }));
    expect(() => useCashSessionStore.getState().openSession(openParams({ userId: 'u2', userName: 'B' }))).not.toThrow();
    expect(useCashSessionStore.getState().sessions).toHaveLength(2);
  });

  it('generates unique IDs for rapid consecutive sessions', () => {
    const s1 = useCashSessionStore.getState().openSession(openParams({ userId: 'u1' }));
    useCashSessionStore.getState().closeSession(s1.id, { totalCompte: 0, ecart: 0 });
    const s2 = useCashSessionStore.getState().openSession(openParams({ userId: 'u1' }));
    expect(s1.id).not.toBe(s2.id);
  });
});

describe('useCashSessionStore — closeSession', () => {
  it('closes a session and clears currentSessionId', () => {
    const s = useCashSessionStore.getState().openSession(openParams());
    useCashSessionStore.getState().closeSession(s.id, {
      totalCompte: 25000,
      ecart: 0,
      notesCloture: 'OK',
    });
    const closed = useCashSessionStore.getState().sessions.find(x => x.id === s.id);
    expect(closed?.status).toBe('closed');
    expect(closed?.totalCompte).toBe(25000);
    expect(closed?.closedAt).toBeTruthy();
    expect(useCashSessionStore.getState().currentSessionId).toBeNull();
  });

  it('throws on unknown session', () => {
    expect(() => useCashSessionStore.getState().closeSession('nonexistent', { totalCompte: 0, ecart: 0 })).toThrow(/introuvable/);
  });

  it('throws on already-closed session (immutability)', () => {
    const s = useCashSessionStore.getState().openSession(openParams());
    useCashSessionStore.getState().closeSession(s.id, { totalCompte: 0, ecart: 0 });
    expect(() => useCashSessionStore.getState().closeSession(s.id, { totalCompte: 0, ecart: 0 })).toThrow(/déjà clôturée/);
  });

  it('preserves currentSessionId of other users', () => {
    const s1 = useCashSessionStore.getState().openSession(openParams({ userId: 'u1' }));
    const s2 = useCashSessionStore.getState().openSession(openParams({ userId: 'u2' }));
    // currentSessionId = s2 (dernière ouverte)
    expect(useCashSessionStore.getState().currentSessionId).toBe(s2.id);
    useCashSessionStore.getState().closeSession(s1.id, { totalCompte: 0, ecart: 0 });
    // s2 reste current
    expect(useCashSessionStore.getState().currentSessionId).toBe(s2.id);
  });
});

describe('useCashSessionStore — addCashOut', () => {
  it('creates a cashOut for the session', () => {
    const s = useCashSessionStore.getState().openSession(openParams());
    const co = useCashSessionStore.getState().addCashOut({
      cashSessionId: s.id,
      date: new Date(),
      type: 'avance_salaire',
      amount: 5000,
      motif: 'Avance mai',
      userId: 'u1',
      userName: 'Caissier',
    });
    expect(co.id).toBeTruthy();
    expect(useCashSessionStore.getState().cashOuts).toHaveLength(1);
  });

  it('throws on invalid amount', () => {
    const s = useCashSessionStore.getState().openSession(openParams());
    expect(() => useCashSessionStore.getState().addCashOut({
      cashSessionId: s.id, date: new Date(),
      type: 'autre', amount: 0, motif: 'X',
      userId: 'u1', userName: 'X',
    })).toThrow(/invalide/);
    expect(() => useCashSessionStore.getState().addCashOut({
      cashSessionId: s.id, date: new Date(),
      type: 'autre', amount: -100, motif: 'X',
      userId: 'u1', userName: 'X',
    })).toThrow();
  });

  it('generates unique IDs for rapid consecutive cashOuts', () => {
    const s = useCashSessionStore.getState().openSession(openParams());
    const c1 = useCashSessionStore.getState().addCashOut({
      cashSessionId: s.id, date: new Date(),
      type: 'autre', amount: 100, motif: 'A',
      userId: 'u1', userName: 'X',
    });
    const c2 = useCashSessionStore.getState().addCashOut({
      cashSessionId: s.id, date: new Date(),
      type: 'autre', amount: 200, motif: 'B',
      userId: 'u1', userName: 'X',
    });
    const c3 = useCashSessionStore.getState().addCashOut({
      cashSessionId: s.id, date: new Date(),
      type: 'autre', amount: 300, motif: 'C',
      userId: 'u1', userName: 'X',
    });
    expect(c1.id).not.toBe(c2.id);
    expect(c2.id).not.toBe(c3.id);
    expect(c1.id).not.toBe(c3.id);
  });
});

describe('useCashSessionStore — deleteCashOut', () => {
  it('removes the cashOut', () => {
    const s = useCashSessionStore.getState().openSession(openParams());
    const co = useCashSessionStore.getState().addCashOut({
      cashSessionId: s.id, date: new Date(),
      type: 'autre', amount: 100, motif: 'X',
      userId: 'u1', userName: 'X',
    });
    useCashSessionStore.getState().deleteCashOut(co.id);
    expect(useCashSessionStore.getState().cashOuts).toHaveLength(0);
  });
});

describe('useCashSessionStore — selectors', () => {
  it('getCurrentSession returns null when no current session', () => {
    expect(useCashSessionStore.getState().getCurrentSession()).toBeNull();
  });

  it('getCurrentSession returns the open session', () => {
    const s = useCashSessionStore.getState().openSession(openParams());
    expect(useCashSessionStore.getState().getCurrentSession()?.id).toBe(s.id);
  });

  it('getOpenSessionForUser finds the open session of a specific user', () => {
    useCashSessionStore.getState().openSession(openParams({ userId: 'u1' }));
    useCashSessionStore.getState().openSession(openParams({ userId: 'u2' }));
    const open = useCashSessionStore.getState().getOpenSessionForUser('u1');
    expect(open?.userId).toBe('u1');
  });

  it('getOpenSessionForUser returns null if user has no open session', () => {
    const s = useCashSessionStore.getState().openSession(openParams({ userId: 'u1' }));
    useCashSessionStore.getState().closeSession(s.id, { totalCompte: 0, ecart: 0 });
    expect(useCashSessionStore.getState().getOpenSessionForUser('u1')).toBeNull();
  });

  it('getSessionCashOuts returns only the cashOuts of the given session', () => {
    const s1 = useCashSessionStore.getState().openSession(openParams({ userId: 'u1' }));
    const s2 = useCashSessionStore.getState().openSession(openParams({ userId: 'u2' }));

    useCashSessionStore.getState().addCashOut({
      cashSessionId: s1.id, date: new Date(), type: 'autre', amount: 100,
      motif: 'A', userId: 'u1', userName: 'X',
    });
    useCashSessionStore.getState().addCashOut({
      cashSessionId: s1.id, date: new Date(), type: 'autre', amount: 200,
      motif: 'B', userId: 'u1', userName: 'X',
    });
    useCashSessionStore.getState().addCashOut({
      cashSessionId: s2.id, date: new Date(), type: 'autre', amount: 300,
      motif: 'C', userId: 'u2', userName: 'Y',
    });

    const co1 = useCashSessionStore.getState().getSessionCashOuts(s1.id);
    const co2 = useCashSessionStore.getState().getSessionCashOuts(s2.id);
    expect(co1).toHaveLength(2);
    expect(co2).toHaveLength(1);
  });
});
