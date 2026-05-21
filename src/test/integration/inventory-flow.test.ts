/**
 * Tests d'intégration du flux Inventaire & Réconciliation.
 *
 * Scénarios :
 *   1. Créer une session → compter → valider → stock produit mis à jour
 *   2. Validation refusée si motif manquant
 *   3. Mouvements d'ajustement de type='ajustement' avec reason et inventorySessionId
 *   4. Session validée gèle les modifications
 *   5. Calcul de valorisation correct
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore } from '@/stores/useInventoryStore';
import { useStockStore } from '@/stores/useStockStore';
import { useProductStore, type Product } from '@/stores/useProductStore';

beforeEach(() => {
  useInventoryStore.setState({ sessions: [] });
  useStockStore.setState({ movements: [] });
  useProductStore.setState({ products: [] });
});

const seedProducts = (specs: { id: string; nom: string; stock: number; prixAchat: number }[]) => {
  const products: Product[] = specs.map(s => ({
    id: s.id, nom: s.nom, categorie: 'Autre', codeBarre: '0',
    prixAchat: s.prixAchat, prixVente: s.prixAchat * 2,
    stock: s.stock, seuilAlerte: 2,
  }));
  useProductStore.setState({ products });
  return products;
};

describe('Integration: inventory flow end-to-end', () => {
  it('happy path: create → count → validate → stock updated + movement created', () => {
    const products = seedProducts([
      { id: 'p1', nom: 'Coca 33cl', stock: 50, prixAchat: 300 },
      { id: 'p2', nom: 'Pain', stock: 20, prixAchat: 100 },
    ]);

    // 1. Créer session
    const session = useInventoryStore.getState().createSession({
      scope: 'complet', products,
      userId: 'mgr1', userName: 'Gérant',
    });
    expect(session.lines).toHaveLength(2);
    expect(useStockStore.getState().movements).toHaveLength(0);

    // 2. Compter — p1 a perdu 3 unités (casse), p2 = OK
    useInventoryStore.getState().updateLine(session.id, 'p1', {
      stockCompte: 47, reason: 'casse',
    });
    useInventoryStore.getState().updateLine(session.id, 'p2', {
      stockCompte: 20,
    });

    // 3. Valider — avec callbacks branchés sur les vrais stores
    const result = useInventoryStore.getState().validateSession(
      session.id, 'mgr1', 'Gérant',
      {
        getProductPrixAchat: (id) =>
          useProductStore.getState().products.find(p => p.id === id)?.prixAchat ?? 0,
        addMovementAndUpdateStock: ({ productId, productName, ecart, stockTheorique, stockCompte, reason, inventorySessionId, userId, userName }) => {
          useStockStore.getState().addMovement({
            date: new Date(),
            productId, productName,
            type: 'ajustement',
            quantity: ecart,
            stockBefore: stockTheorique,
            stockAfter: stockCompte,
            userId, userName,
            reason, inventorySessionId,
          });
          useProductStore.getState().updateStock(productId, ecart);
        },
      }
    );

    expect(result.success).toBe(true);

    // 4. Vérifications :
    // - stock produit p1 doit être 47 (50 + (-3))
    const p1Updated = useProductStore.getState().products.find(p => p.id === 'p1');
    expect(p1Updated?.stock).toBe(47);
    // - stock produit p2 inchangé
    const p2Updated = useProductStore.getState().products.find(p => p.id === 'p2');
    expect(p2Updated?.stock).toBe(20);

    // - 1 mouvement d'ajustement créé pour p1
    const moves = useStockStore.getState().movements;
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe('ajustement');
    expect(moves[0].productId).toBe('p1');
    expect(moves[0].quantity).toBe(-3);
    expect(moves[0].reason).toBe('casse');
    expect(moves[0].inventorySessionId).toBe(session.id);

    // - session figée
    const validated = useInventoryStore.getState().sessions.find(s => s.id === session.id);
    expect(validated?.status).toBe('validated');
    expect(validated?.totalEcartQty).toBe(-3);
    expect(validated?.totalEcartValue).toBe(-900); // -3 × 300
  });

  it('refuses validation when reason missing on a line with ecart', () => {
    const products = seedProducts([{ id: 'p1', nom: 'X', stock: 10, prixAchat: 500 }]);
    const session = useInventoryStore.getState().createSession({
      scope: 'complet', products,
      userId: 'mgr1', userName: 'Gérant',
    });
    useInventoryStore.getState().updateLine(session.id, 'p1', {
      stockCompte: 7,
      // pas de reason !
    });

    let movementsAdded = 0;
    let stockChanges = 0;
    const result = useInventoryStore.getState().validateSession(
      session.id, 'mgr1', 'Gérant',
      {
        getProductPrixAchat: () => 500,
        addMovementAndUpdateStock: () => { movementsAdded++; stockChanges++; },
      }
    );

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.missingReasons).toContain('X');
    }
    expect(movementsAdded).toBe(0);
    expect(stockChanges).toBe(0);

    // Le stock du produit ne doit PAS avoir bougé
    expect(useProductStore.getState().products[0].stock).toBe(10);
  });

  it('validates a session with mixed positive and negative ecarts', () => {
    const products = seedProducts([
      { id: 'p1', nom: 'A', stock: 100, prixAchat: 100 },
      { id: 'p2', nom: 'B', stock: 50, prixAchat: 200 },
      { id: 'p3', nom: 'C', stock: 30, prixAchat: 300 },
    ]);
    const session = useInventoryStore.getState().createSession({
      scope: 'complet', products,
      userId: 'mgr1', userName: 'Gérant',
    });

    useInventoryStore.getState().updateLine(session.id, 'p1', { stockCompte: 95, reason: 'vol' });
    useInventoryStore.getState().updateLine(session.id, 'p2', { stockCompte: 52, reason: 'erreur_saisie' });
    useInventoryStore.getState().updateLine(session.id, 'p3', { stockCompte: 30 }); // pas d'écart

    const result = useInventoryStore.getState().validateSession(
      session.id, 'mgr1', 'Gérant',
      {
        getProductPrixAchat: (id) =>
          useProductStore.getState().products.find(p => p.id === id)?.prixAchat ?? 0,
        addMovementAndUpdateStock: ({ productId, ecart }) => {
          useProductStore.getState().updateStock(productId, ecart);
        },
      }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.session.totalEcartQty).toBe(-3); // -5 + 2
      expect(result.session.totalEcartValue).toBe(-100); // -5×100 + 2×200 = -500 + 400 = -100
    }

    expect(useProductStore.getState().products.find(p => p.id === 'p1')?.stock).toBe(95);
    expect(useProductStore.getState().products.find(p => p.id === 'p2')?.stock).toBe(52);
    expect(useProductStore.getState().products.find(p => p.id === 'p3')?.stock).toBe(30);
  });

  it('cancelled session does not affect stock', () => {
    const products = seedProducts([{ id: 'p1', nom: 'X', stock: 10, prixAchat: 100 }]);
    const session = useInventoryStore.getState().createSession({
      scope: 'complet', products,
      userId: 'mgr1', userName: 'Gérant',
    });
    useInventoryStore.getState().updateLine(session.id, 'p1', {
      stockCompte: 5, reason: 'casse',
    });
    useInventoryStore.getState().cancelSession(session.id, 'mgr1');

    // Stock du produit inchangé
    expect(useProductStore.getState().products[0].stock).toBe(10);
    expect(useStockStore.getState().movements).toHaveLength(0);

    const cancelled = useInventoryStore.getState().sessions[0];
    expect(cancelled.status).toBe('cancelled');
  });

  it('two sequential inventories work correctly', () => {
    const products = seedProducts([{ id: 'p1', nom: 'X', stock: 100, prixAchat: 100 }]);

    // Premier inventaire : -5 unités
    const s1 = useInventoryStore.getState().createSession({
      scope: 'complet', products,
      userId: 'mgr1', userName: 'Gérant',
    });
    useInventoryStore.getState().updateLine(s1.id, 'p1', { stockCompte: 95, reason: 'vol' });
    useInventoryStore.getState().validateSession(s1.id, 'mgr1', 'Gérant', {
      getProductPrixAchat: () => 100,
      addMovementAndUpdateStock: ({ productId, ecart }) => {
        useProductStore.getState().updateStock(productId, ecart);
      },
    });
    expect(useProductStore.getState().products[0].stock).toBe(95);

    // Deuxième inventaire : encore -2 unités (sur le nouveau stock)
    // Note : il faut re-créer la session avec le nouveau stock théorique = 95
    const updatedProducts = useProductStore.getState().products;
    const s2 = useInventoryStore.getState().createSession({
      scope: 'complet', products: updatedProducts,
      userId: 'mgr1', userName: 'Gérant',
    });
    expect(s2.lines[0].stockTheorique).toBe(95); // nouveau théorique
    useInventoryStore.getState().updateLine(s2.id, 'p1', { stockCompte: 93, reason: 'peremption' });
    useInventoryStore.getState().validateSession(s2.id, 'mgr1', 'Gérant', {
      getProductPrixAchat: () => 100,
      addMovementAndUpdateStock: ({ productId, ecart }) => {
        useProductStore.getState().updateStock(productId, ecart);
      },
    });
    expect(useProductStore.getState().products[0].stock).toBe(93);
  });
});
