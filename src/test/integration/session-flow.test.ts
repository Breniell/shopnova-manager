/**
 * Tests d'intégration du flux Sessions de caisse.
 *
 * Scénarios :
 *   1. Ouvrir une session → faire des ventes → fermer
 *   2. Une vente effectuée pendant une session est liée à cette session
 *   3. Un règlement crédit effectué pendant une session est lié à la session
 *   4. Les sorties de caisse sont attribuées à la session active
 *   5. Une vente sans session active n'a pas de cashSessionId
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSaleStore } from '@/stores/useSaleStore';
import { usePaymentStore } from '@/stores/usePaymentStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { useProductStore } from '@/stores/useProductStore';

beforeEach(() => {
  useSaleStore.setState({ sales: [], cart: [], discount: 0, saleCounter: 0 });
  usePaymentStore.setState({ payments: [] });
  useCashSessionStore.setState({ sessions: [], cashOuts: [], currentSessionId: null });
  useCustomerStore.setState({ customers: [] });
  useProductStore.setState({ products: [{
    id: 'p1', nom: 'Produit test', categorie: 'Autre', codeBarre: 'p1',
    prixAchat: 100, prixVente: 1500, stock: 100, seuilAlerte: 5,
  }] });
});

describe('Integration: cash session flow', () => {
  it('happy path: open session → sale → close session', () => {
    // 1. Ouverture de session
    const session = useCashSessionStore.getState().openSession({
      userId: 'u1',
      userName: 'Caissier Test',
      fondInitial: 10000,
    });
    expect(session.status).toBe('open');
    expect(useCashSessionStore.getState().getCurrentSession()?.id).toBe(session.id);

    // 2. Vente pendant la session
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Coca', prixVente: 500 });
    useSaleStore.getState().updateCartQuantity('p1', 4);
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 2000,
      changeGiven: 0,
      userId: 'u1',
      userName: 'Caissier Test',
    });
    expect(sale.cashSessionId).toBe(session.id);

    // 3. Sortie de caisse pendant la session
    useCashSessionStore.getState().addCashOut({
      cashSessionId: session.id,
      date: new Date(),
      type: 'achat_impulsif',
      amount: 500,
      motif: 'Achat ampoules',
      userId: 'u1',
      userName: 'Caissier Test',
    });

    // 4. Clôture
    useCashSessionStore.getState().closeSession(session.id, {
      totalCompte: 11500, // fond 10000 + vente 2000 - sortie 500 = 11500
      ecart: 0,
      notesCloture: 'Tout balance',
    });

    const closed = useCashSessionStore.getState().sessions.find(s => s.id === session.id);
    expect(closed?.status).toBe('closed');
    expect(closed?.ecart).toBe(0);
    expect(useCashSessionStore.getState().currentSessionId).toBeNull();
  });

  it('a sale without an active session has no cashSessionId', () => {
    // Pas de session ouverte
    expect(useCashSessionStore.getState().currentSessionId).toBeNull();

    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Pain', prixVente: 200 });
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 200,
      changeGiven: 0,
      userId: 'gerant1',
      userName: 'Gérant',
    });
    expect(sale.cashSessionId).toBeUndefined();
  });

  it('credit payment is linked to the active session', () => {
    // Préparer client + session
    const customer = useCustomerStore.getState().addCustomer({
      prenom: 'Jean', nom: 'Dupont', telephone: '+237 699 111 222',
    });
    const session = useCashSessionStore.getState().openSession({
      userId: 'u1', userName: 'Caissier', fondInitial: 5000,
    });

    // Vente à crédit
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Riz', prixVente: 1500 });
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'credit',
      userId: 'u1', userName: 'Caissier',
      customerId: customer.id,
      customerName: 'Jean Dupont',
    });
    expect(sale.cashSessionId).toBe(session.id);

    // Règlement crédit pendant la même session
    useSaleStore.getState().applyCreditPayment(sale.id, {
      amount: 1500,
      channel: 'especes',
      userId: 'u1',
      userName: 'Caissier',
    });

    const payment = usePaymentStore.getState().payments[0];
    expect(payment.cashSessionId).toBe(session.id);
  });

  it('cannot have two open sessions simultaneously for the same user', () => {
    useCashSessionStore.getState().openSession({
      userId: 'u1', userName: 'A', fondInitial: 1000,
    });
    expect(() => useCashSessionStore.getState().openSession({
      userId: 'u1', userName: 'A', fondInitial: 5000,
    })).toThrow();
  });

  it('after closing, user can open a new session', () => {
    const s1 = useCashSessionStore.getState().openSession({
      userId: 'u1', userName: 'A', fondInitial: 1000,
    });
    useCashSessionStore.getState().closeSession(s1.id, { totalCompte: 1000, ecart: 0 });

    expect(() => useCashSessionStore.getState().openSession({
      userId: 'u1', userName: 'A', fondInitial: 2000,
    })).not.toThrow();
    expect(useCashSessionStore.getState().sessions).toHaveLength(2);
  });

  it('cashOuts from one session are isolated from another', () => {
    const s1 = useCashSessionStore.getState().openSession({
      userId: 'u1', userName: 'A', fondInitial: 1000,
    });
    useCashSessionStore.getState().addCashOut({
      cashSessionId: s1.id, date: new Date(), type: 'autre',
      amount: 100, motif: 'Test s1',
      userId: 'u1', userName: 'A',
    });
    useCashSessionStore.getState().closeSession(s1.id, { totalCompte: 900, ecart: 0 });

    const s2 = useCashSessionStore.getState().openSession({
      userId: 'u1', userName: 'A', fondInitial: 900,
    });
    expect(useCashSessionStore.getState().getSessionCashOuts(s2.id)).toHaveLength(0);
    expect(useCashSessionStore.getState().getSessionCashOuts(s1.id)).toHaveLength(1);
  });
});
