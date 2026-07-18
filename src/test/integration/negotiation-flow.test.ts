/**
 * Tests d'intégration du flux Prix négociable.
 *
 * Scénarios couverts :
 *   1. addToCart initialise prixUnitaire = prixVente
 *   2. applyPriceOverride met à jour prixUnitaire et negotiated
 *   3. Annuler la négociation (remettre prixVente) nettoie negotiated
 *   4. getCartSubtotal utilise prixUnitaire pour le calcul
 *   5. Le bloc negotiated capture overrideBy quand le manager autorise
 *   6. completeSale persiste les négociations dans Sale.items
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSaleStore } from '@/stores/useSaleStore';
import { useProductStore } from '@/stores/useProductStore';
import { getAppliedPrice, getLossFromNegotiation } from '@/lib/pricing';

beforeEach(() => {
  useSaleStore.setState({ sales: [], cart: [], discount: 0, saleCounter: 0 });
  useProductStore.setState({ products: [{
    id: 'p1', nom: 'Coca', categorie: 'Boissons', codeBarre: 'p1',
    prixAchat: 300, prixVente: 500, stock: 100, seuilAlerte: 5,
  }] });
});

describe('Integration: price negotiation flow', () => {
  it('addToCart initializes prixUnitaire = prixVente', () => {
    useSaleStore.getState().addToCart({
      productId: 'p1', nom: 'Coca', prixVente: 500,
    });
    const cart = useSaleStore.getState().cart;
    expect(cart[0].prixUnitaire).toBe(500);
    expect(cart[0].negotiated).toBeUndefined();
  });

  it('applyPriceOverride updates prixUnitaire and adds negotiated block', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Coca', prixVente: 500 });
    useSaleStore.getState().applyPriceOverride('p1', 400, false);

    const item = useSaleStore.getState().cart[0];
    expect(item.prixUnitaire).toBe(400);
    expect(item.negotiated).toBeDefined();
    expect(item.negotiated!.discount).toBe(100);
    expect(item.negotiated!.belowFloor).toBe(false);
  });

  it('applyPriceOverride with override records manager info', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Coca', prixVente: 500 });
    useSaleStore.getState().applyPriceOverride('p1', 200, true, {
      userId: 'mgr1', userName: 'Manager Test',
    });

    const item = useSaleStore.getState().cart[0];
    expect(item.negotiated!.belowFloor).toBe(true);
    expect(item.negotiated!.overrideBy).toBe('mgr1');
    expect(item.negotiated!.overrideByName).toBe('Manager Test');
  });

  it('reverting price to prixVente removes the negotiated block', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Coca', prixVente: 500 });
    useSaleStore.getState().applyPriceOverride('p1', 400, false);
    expect(useSaleStore.getState().cart[0].negotiated).toBeDefined();

    // Remettre le prix au prix de vente
    useSaleStore.getState().applyPriceOverride('p1', 500, false);
    expect(useSaleStore.getState().cart[0].negotiated).toBeUndefined();
    expect(useSaleStore.getState().cart[0].prixUnitaire).toBe(500);
  });

  it('getCartSubtotal sums applied prices, not display prices', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'A', prixVente: 1000 });
    useSaleStore.getState().addToCart({ productId: 'p2', nom: 'B', prixVente: 2000 });
    // Négocie le premier de 1000 à 800
    useSaleStore.getState().applyPriceOverride('p1', 800, false);
    // Subtotal devrait être 800 + 2000 = 2800 (pas 1000 + 2000 = 3000)
    expect(useSaleStore.getState().getCartSubtotal()).toBe(2800);
  });

  it('getCartSubtotal takes into account quantities × negotiated prices', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'A', prixVente: 500 });
    useSaleStore.getState().updateCartQuantity('p1', 4);
    useSaleStore.getState().applyPriceOverride('p1', 400, false);
    // 4 × 400 = 1600
    expect(useSaleStore.getState().getCartSubtotal()).toBe(1600);
  });

  it('completeSale persists negotiated items', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Coca', prixVente: 500 });
    useSaleStore.getState().applyPriceOverride('p1', 400, false);

    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 400,
      changeGiven: 0,
      userId: 'u1', userName: 'Caissier',
    });

    expect(sale.items[0].prixUnitaire).toBe(400);
    expect(sale.items[0].negotiated).toBeDefined();
    expect(sale.items[0].negotiated!.discount).toBe(100);
    expect(sale.total).toBe(400);
  });

  it('getLossFromNegotiation reflects the lost margin per item', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'A', prixVente: 500 });
    useSaleStore.getState().updateCartQuantity('p1', 3);
    useSaleStore.getState().applyPriceOverride('p1', 400, false);
    const item = useSaleStore.getState().cart[0];
    // (500 - 400) × 3 = 300
    expect(getLossFromNegotiation(item)).toBe(300);
  });

  it('getAppliedPrice returns prixUnitaire when set, prixVente otherwise', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'A', prixVente: 500 });
    const itemA = useSaleStore.getState().cart[0];
    expect(getAppliedPrice(itemA)).toBe(500);

    useSaleStore.getState().applyPriceOverride('p1', 400, false);
    const itemB = useSaleStore.getState().cart[0];
    expect(getAppliedPrice(itemB)).toBe(400);
  });
});
