import { describe, it, expect, beforeEach } from 'vitest';
import {
  useInventoryStore,
  type InventoryScope,
} from '@/stores/useInventoryStore';
import { useProductStore, type Product } from '@/stores/useProductStore';
import { useStockStore } from '@/stores/useStockStore';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  nom: 'Test Product',
  categorie: 'Autre',
  codeBarre: '0000000000000',
  prixAchat: 1000,
  prixVente: 2000,
  stock: 10,
  seuilAlerte: 2,
  ...overrides,
});

beforeEach(() => {
  useInventoryStore.setState({ sessions: [] });
  useProductStore.setState({ products: [] });
  useStockStore.setState({ movements: [] });
});

describe('useInventoryStore — initial state', () => {
  it('starts with empty sessions', () => {
    expect(useInventoryStore.getState().sessions).toHaveLength(0);
  });
});

describe('useInventoryStore — createSession', () => {
  it('creates a session in draft state with lines generated from products', () => {
    const products = [makeProduct({ id: 'p1', stock: 10 }), makeProduct({ id: 'p2', stock: 20 })];
    const s = useInventoryStore.getState().createSession({
      scope: 'complet',
      products,
      userId: 'u1',
      userName: 'Gérant',
    });
    expect(s.status).toBe('draft');
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0].stockTheorique).toBe(10);
    expect(s.lines[0].stockCompte).toBeNull();
    expect(s.lines[1].stockTheorique).toBe(20);
  });

  it('generates sequential numero (INV-{year}-{NNN})', () => {
    const products = [makeProduct()];
    const s1 = useInventoryStore.getState().createSession({
      scope: 'complet', products, userId: 'u1', userName: 'X',
    });
    const s2 = useInventoryStore.getState().createSession({
      scope: 'complet', products, userId: 'u1', userName: 'X',
    });
    const year = new Date().getFullYear();
    expect(s1.numero).toBe(`INV-${year}-001`);
    expect(s2.numero).toBe(`INV-${year}-002`);
  });

  it('throws on empty product list', () => {
    expect(() => useInventoryStore.getState().createSession({
      scope: 'complet', products: [], userId: 'u1', userName: 'X',
    })).toThrow(/Aucun produit/);
  });

  it('persists scopeCategorie for categorie scope', () => {
    const s = useInventoryStore.getState().createSession({
      scope: 'categorie',
      scopeCategorie: 'Alimentation',
      products: [makeProduct({ categorie: 'Alimentation' })],
      userId: 'u1', userName: 'X',
    });
    expect(s.scope).toBe('categorie');
    expect(s.scopeCategorie).toBe('Alimentation');
  });

  it('generates unique IDs for rapid consecutive sessions', () => {
    const products = [makeProduct()];
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const s = useInventoryStore.getState().createSession({
        scope: 'complet', products, userId: 'u1', userName: 'X',
      });
      ids.add(s.id);
    }
    expect(ids.size).toBe(5);
  });
});

describe('useInventoryStore — updateLine', () => {
  it('updates stockCompte and recomputes ecart', () => {
    const products = [makeProduct({ id: 'p1', stock: 10 })];
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products, userId: 'u1', userName: 'X',
    });
    useInventoryStore.getState().updateLine(s.id, 'p1', { stockCompte: 8 });
    const updated = useInventoryStore.getState().sessions.find(x => x.id === s.id);
    expect(updated?.lines[0].stockCompte).toBe(8);
    expect(updated?.lines[0].ecart).toBe(-2); // 8 - 10
  });

  it('transitions from draft to in_progress on first update', () => {
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products: [makeProduct()], userId: 'u1', userName: 'X',
    });
    expect(s.status).toBe('draft');
    useInventoryStore.getState().updateLine(s.id, 'p1', { stockCompte: 10 });
    const updated = useInventoryStore.getState().sessions.find(x => x.id === s.id);
    expect(updated?.status).toBe('in_progress');
  });

  it('handles positive ecart (stock found higher than theoretical)', () => {
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products: [makeProduct({ id: 'p1', stock: 5 })],
      userId: 'u1', userName: 'X',
    });
    useInventoryStore.getState().updateLine(s.id, 'p1', { stockCompte: 7 });
    expect(useInventoryStore.getState().sessions[0].lines[0].ecart).toBe(2);
  });

  it('sets ecart to 0 when stockCompte is null', () => {
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products: [makeProduct({ stock: 10 })],
      userId: 'u1', userName: 'X',
    });
    useInventoryStore.getState().updateLine(s.id, 'p1', { stockCompte: 5 });
    useInventoryStore.getState().updateLine(s.id, 'p1', { stockCompte: null });
    expect(useInventoryStore.getState().sessions[0].lines[0].ecart).toBe(0);
  });

  it('updates reason on a line', () => {
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products: [makeProduct({ stock: 10 })],
      userId: 'u1', userName: 'X',
    });
    useInventoryStore.getState().updateLine(s.id, 'p1', { stockCompte: 8, reason: 'casse' });
    expect(useInventoryStore.getState().sessions[0].lines[0].reason).toBe('casse');
  });

  it('throws if session is validated', () => {
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products: [makeProduct({ stock: 10 })],
      userId: 'u1', userName: 'X',
    });
    // Forcer status à validated pour le test
    useInventoryStore.setState({
      sessions: useInventoryStore.getState().sessions.map(x =>
        x.id === s.id ? { ...x, status: 'validated' } : x
      ),
    });
    expect(() => useInventoryStore.getState().updateLine(s.id, 'p1', { stockCompte: 5 }))
      .toThrow(/figée/);
  });
});

describe('useInventoryStore — cancelSession', () => {
  it('marks session as cancelled', () => {
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products: [makeProduct()], userId: 'u1', userName: 'X',
    });
    useInventoryStore.getState().cancelSession(s.id, 'u1');
    const cancelled = useInventoryStore.getState().sessions[0];
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeTruthy();
    expect(cancelled.cancelledBy).toBe('u1');
  });

  it('throws if session is already validated', () => {
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products: [makeProduct()], userId: 'u1', userName: 'X',
    });
    useInventoryStore.setState({
      sessions: useInventoryStore.getState().sessions.map(x =>
        x.id === s.id ? { ...x, status: 'validated' } : x
      ),
    });
    expect(() => useInventoryStore.getState().cancelSession(s.id, 'u1'))
      .toThrow(/validée/);
  });
});

describe('useInventoryStore — validateSession', () => {
  const setupSession = (lines: { id: string; stock: number; counted: number | null; reason?: string }[]) => {
    const products = lines.map(l => makeProduct({ id: l.id, stock: l.stock }));
    useProductStore.setState({ products });
    const s = useInventoryStore.getState().createSession({
      scope: 'complet', products, userId: 'u1', userName: 'Gérant',
    });
    lines.forEach(l => {
      if (l.counted !== null) {
        useInventoryStore.getState().updateLine(s.id, l.id, {
          stockCompte: l.counted,
          reason: l.reason as never,
        });
      }
    });
    return s;
  };

  it('returns success=true when no ecart, no movements created', () => {
    const s = setupSession([
      { id: 'p1', stock: 10, counted: 10 },
      { id: 'p2', stock: 20, counted: 20 },
    ]);
    const result = useInventoryStore.getState().validateSession(s.id, 'u1', 'Gérant', {
      getProductPrixAchat: () => 1000,
    });
    expect(result.success).toBe(true);
    expect(useStockStore.getState().movements).toHaveLength(0);
  });

  it('returns success=false when ecart present without reason', () => {
    const s = setupSession([
      { id: 'p1', stock: 10, counted: 7 },                 // ecart -3 sans reason
      { id: 'p2', stock: 20, counted: 20 },
    ]);
    const result = useInventoryStore.getState().validateSession(s.id, 'u1', 'Gérant', {
      getProductPrixAchat: () => 1000,
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.missingReasons).toContain('Test Product');
    }
  });

  it('returns success=true when all ecart have reasons, creates movements and updates stock', () => {
    const s = setupSession([
      { id: 'p1', stock: 10, counted: 8, reason: 'casse' },     // ecart -2
      { id: 'p2', stock: 5, counted: 7, reason: 'erreur_saisie' }, // ecart +2
      { id: 'p3', stock: 15, counted: 15 },                    // pas d'ecart
    ]);
    const result = useInventoryStore.getState().validateSession(s.id, 'u1', 'Gérant', {
      getProductPrixAchat: () => 1000,
    });
    expect(result.success).toBe(true);
    expect(useStockStore.getState().movements).toHaveLength(2);
  });

  it('computes totalEcartQty and totalEcartValue correctly', () => {
    const s = setupSession([
      { id: 'p1', stock: 10, counted: 8, reason: 'casse' },     // ecart -2 × 1000 = -2000
      { id: 'p2', stock: 5, counted: 7, reason: 'erreur_saisie' }, // ecart +2 × 1500 = +3000
    ]);
    const result = useInventoryStore.getState().validateSession(s.id, 'u1', 'Gérant', {
      getProductPrixAchat: (id) => id === 'p1' ? 1000 : 1500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.session.totalEcartQty).toBe(0); // -2 + 2
      expect(result.session.totalEcartValue).toBe(1000); // -2000 + 3000
    }
  });

  it('marks session as validated with validatedBy + validatedAt', () => {
    const s = setupSession([{ id: 'p1', stock: 10, counted: 10 }]);
    useInventoryStore.getState().validateSession(s.id, 'mgr1', 'Manager X', {
      getProductPrixAchat: () => 0,
    });
    const validated = useInventoryStore.getState().sessions.find(x => x.id === s.id);
    expect(validated?.status).toBe('validated');
    expect(validated?.validatedBy).toBe('mgr1');
    expect(validated?.validatedByName).toBe('Manager X');
    expect(validated?.validatedAt).toBeTruthy();
  });

  it('throws if session already validated', () => {
    const s = setupSession([{ id: 'p1', stock: 10, counted: 10 }]);
    useInventoryStore.getState().validateSession(s.id, 'u1', 'X', {
      getProductPrixAchat: () => 0,
    });
    expect(() => useInventoryStore.getState().validateSession(s.id, 'u1', 'X', {
      getProductPrixAchat: () => 0,
    })).toThrow(/déjà validée/);
  });
});

describe('useInventoryStore — selectors', () => {
  it('getOpenSessions returns only draft + in_progress', () => {
    const products = [makeProduct()];
    const s1 = useInventoryStore.getState().createSession({
      scope: 'complet', products, userId: 'u1', userName: 'X',
    });
    const s2 = useInventoryStore.getState().createSession({
      scope: 'complet', products, userId: 'u1', userName: 'X',
    });
    useInventoryStore.getState().validateSession(s2.id, 'u1', 'X', {
      getProductPrixAchat: () => 0,
    });
    const open = useInventoryStore.getState().getOpenSessions();
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe(s1.id);
  });

  it('getValidatedInRange filters by validation date', () => {
    const products = [makeProduct()];
    const s1 = useInventoryStore.getState().createSession({
      scope: 'complet', products, userId: 'u1', userName: 'X',
    });
    useInventoryStore.getState().validateSession(s1.id, 'u1', 'X', {
      getProductPrixAchat: () => 0,
    });

    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);

    expect(useInventoryStore.getState().getValidatedInRange(yesterday, tomorrow)).toHaveLength(1);
    expect(useInventoryStore.getState().getValidatedInRange(
      new Date('2020-01-01'),
      new Date('2020-12-31'),
    )).toHaveLength(0);
  });
});
