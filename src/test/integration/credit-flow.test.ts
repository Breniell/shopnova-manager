/**
 * Test d'intégration du flux complet de crédit.
 *
 * Scénarios couverts :
 *   1. Vendre à crédit → vente créée avec status pending, encours client = total
 *   2. Encaisser un règlement partiel → status partial, encours diminué
 *   3. Encaisser le solde → status paid, encours = 0
 *   4. Refund d'une vente à crédit non soldée → encours retombe à 0
 *   5. Validation : vente crédit sans client → throw
 *   6. Validation : sur-paiement refusé
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSaleStore, type CartItem } from '@/stores/useSaleStore';
import { usePaymentStore } from '@/stores/usePaymentStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { useProductStore } from '@/stores/useProductStore';
import {
  getRemainingBalance,
  getCustomerOutstanding,
  computeCreditStatus,
} from '@/lib/credit';

beforeEach(() => {
  useSaleStore.setState({ sales: [], cart: [], discount: 0, saleCounter: 0 });
  usePaymentStore.setState({ payments: [] });
  useCustomerStore.setState({ customers: [] });
});

const seedCustomer = (overrides: Partial<{ plafondCredit: number }> = {}) => {
  return useCustomerStore.getState().addCustomer({
    prenom: 'Jean',
    nom: 'Dupont',
    telephone: '+237 699 111 222',
    ...overrides,
  });
};

const seedCart = (cart: CartItem[]) => {
  useProductStore.setState({
    products: cart.map(item => ({
      id: item.productId,
      nom: item.nom,
      categorie: 'Autre' as const,
      codeBarre: `test-${item.productId}`,
      prixAchat: 0,
      prixVente: item.prixVente,
      stock: 100,
      seuilAlerte: 0,
    })),
  });
  useSaleStore.setState({ cart });
};

describe('Integration: credit flow end-to-end', () => {
  // ──────────────────────────────────────────────────────────────────────────
  it('full happy path: open → partial → paid', () => {
    const customer = seedCustomer();
    seedCart([
      { productId: 'p1', nom: 'Coca 33cl', prixVente: 500, quantity: 4 },
      { productId: 'p2', nom: 'Pain', prixVente: 1000, quantity: 8 },
    ]);

    // 1. Vente à crédit
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'credit',
      userId: 'u1',
      userName: 'Caissier',
      customerId: customer.id,
      customerName: `${customer.prenom} ${customer.nom}`,
    });

    expect(sale.total).toBe(10000);
    expect(sale.paymentMode).toBe('credit');
    expect(sale.creditStatus).toBe('pending');
    expect(sale.amountPaid).toBe(0);

    // Encours initial : 10000
    let outstanding = getCustomerOutstanding(
      customer.id,
      useSaleStore.getState().sales,
      usePaymentStore.getState().payments
    );
    expect(outstanding).toBe(10000);

    // 2. Règlement partiel de 3000
    useSaleStore.getState().applyCreditPayment(sale.id, {
      amount: 3000,
      channel: 'especes',
      userId: 'u1',
      userName: 'Caissier',
    });

    const saleAfterPartial = useSaleStore.getState().sales.find(s => s.id === sale.id)!;
    expect(saleAfterPartial.creditStatus).toBe('partial');
    expect(saleAfterPartial.amountPaid).toBe(3000);

    outstanding = getCustomerOutstanding(
      customer.id,
      useSaleStore.getState().sales,
      usePaymentStore.getState().payments
    );
    expect(outstanding).toBe(7000);

    // Le Payment a bien été créé
    const payments = usePaymentStore.getState().payments;
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(3000);
    expect(payments[0].channel).toBe('especes');

    // 3. Règlement final de 7000
    useSaleStore.getState().applyCreditPayment(sale.id, {
      amount: 7000,
      channel: 'mobile_money',
      mobileOperator: 'mtn',
      mobileReference: 'REF123',
      userId: 'u1',
      userName: 'Caissier',
    });

    const saleAfterPaid = useSaleStore.getState().sales.find(s => s.id === sale.id)!;
    expect(saleAfterPaid.creditStatus).toBe('paid');
    expect(saleAfterPaid.amountPaid).toBe(10000);

    outstanding = getCustomerOutstanding(
      customer.id,
      useSaleStore.getState().sales,
      usePaymentStore.getState().payments
    );
    expect(outstanding).toBe(0);

    expect(usePaymentStore.getState().payments).toHaveLength(2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('rejects a credit sale without a customer', () => {
    seedCart([{ productId: 'p1', nom: 'Test', prixVente: 1000, quantity: 1 }]);

    expect(() => useSaleStore.getState().completeSale({
      paymentMode: 'credit',
      userId: 'u1',
      userName: 'Caissier',
      // pas de customerId
    })).toThrow(/client/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('rejects overpayment', () => {
    const customer = seedCustomer();
    seedCart([{ productId: 'p1', nom: 'Test', prixVente: 5000, quantity: 1 }]);

    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'credit',
      userId: 'u1',
      userName: 'Caissier',
      customerId: customer.id,
      customerName: `${customer.prenom} ${customer.nom}`,
    });

    // Tentative de payer 6000 alors que le total est 5000
    expect(() => useSaleStore.getState().applyCreditPayment(sale.id, {
      amount: 6000,
      channel: 'especes',
      userId: 'u1',
      userName: 'Caissier',
    })).toThrow(/dépasse|solde/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('refund of an unpaid credit sale brings outstanding back to 0', () => {
    const customer = seedCustomer();
    seedCart([{ productId: 'p1', nom: 'Test', prixVente: 5000, quantity: 1 }]);

    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'credit',
      userId: 'u1',
      userName: 'Caissier',
      customerId: customer.id,
      customerName: `${customer.prenom} ${customer.nom}`,
    });

    expect(getCustomerOutstanding(customer.id, useSaleStore.getState().sales, [])).toBe(5000);

    // Refund la vente
    useSaleStore.getState().refundSale(sale.id, 'Annulation client', 'u1', 'Caissier');

    // L'encours doit retomber à 0 parce que la vente est refunded
    expect(getCustomerOutstanding(
      customer.id,
      useSaleStore.getState().sales,
      usePaymentStore.getState().payments
    )).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('rejects applyCreditPayment on a non-credit sale', () => {
    seedCart([{ productId: 'p1', nom: 'Test', prixVente: 5000, quantity: 1 }]);

    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 5000,
      changeGiven: 0,
      userId: 'u1',
      userName: 'Caissier',
    });

    expect(() => useSaleStore.getState().applyCreditPayment(sale.id, {
      amount: 1000,
      channel: 'especes',
      userId: 'u1',
      userName: 'X',
    })).toThrow(/n'est pas à crédit/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('handles multiple credit sales for the same customer', () => {
    const customer = seedCustomer();

    // Vente 1 : 10000
    seedCart([{ productId: 'p1', nom: 'Test', prixVente: 10000, quantity: 1 }]);
    const sale1 = useSaleStore.getState().completeSale({
      paymentMode: 'credit', userId: 'u1', userName: 'X',
      customerId: customer.id, customerName: 'Jean Dupont',
    });

    // Vente 2 : 5000
    seedCart([{ productId: 'p2', nom: 'Test', prixVente: 5000, quantity: 1 }]);
    const sale2 = useSaleStore.getState().completeSale({
      paymentMode: 'credit', userId: 'u1', userName: 'X',
      customerId: customer.id, customerName: 'Jean Dupont',
    });

    // Encours : 15000
    expect(getCustomerOutstanding(
      customer.id,
      useSaleStore.getState().sales,
      usePaymentStore.getState().payments
    )).toBe(15000);

    // Solder uniquement la 2e vente
    useSaleStore.getState().applyCreditPayment(sale2.id, {
      amount: 5000, channel: 'especes',
      userId: 'u1', userName: 'X',
    });

    // Encours : 10000 (seule sale1 reste due)
    expect(getCustomerOutstanding(
      customer.id,
      useSaleStore.getState().sales,
      usePaymentStore.getState().payments
    )).toBe(10000);

    const sale1AfterCheck = useSaleStore.getState().sales.find(s => s.id === sale1.id)!;
    const sale2AfterCheck = useSaleStore.getState().sales.find(s => s.id === sale2.id)!;
    expect(getRemainingBalance(sale1AfterCheck, usePaymentStore.getState().payments)).toBe(10000);
    expect(getRemainingBalance(sale2AfterCheck, usePaymentStore.getState().payments)).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('computed status matches dynamically-computed value', () => {
    const customer = seedCustomer();
    seedCart([{ productId: 'p1', nom: 'Test', prixVente: 10000, quantity: 1 }]);

    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'credit', userId: 'u1', userName: 'X',
      customerId: customer.id, customerName: 'Jean Dupont',
    });

    // Pending au départ
    expect(computeCreditStatus(sale, [])).toBe('pending');

    // Après règlement partiel
    useSaleStore.getState().applyCreditPayment(sale.id, {
      amount: 3000, channel: 'especes', userId: 'u1', userName: 'X',
    });
    const refreshed = useSaleStore.getState().sales.find(s => s.id === sale.id)!;
    expect(computeCreditStatus(refreshed, usePaymentStore.getState().payments)).toBe('partial');
    // Le statut dénormalisé sur la Sale doit matcher
    expect(refreshed.creditStatus).toBe('partial');
  });
});
