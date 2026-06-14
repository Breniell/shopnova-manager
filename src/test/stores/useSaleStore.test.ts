import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSaleStore } from '@/stores/useSaleStore';
import { useProductStore } from '@/stores/useProductStore';
import { useStockStore } from '@/stores/useStockStore';
import * as firestoreService from '@/services/firestoreService';

const INITIAL_STATE = useSaleStore.getState();

beforeEach(() => {
  localStorage.clear();
  useSaleStore.setState({
    ...INITIAL_STATE,
    cart: [],
    discount: 0,
  });
});

// ─── Cart operations ──────────────────────────────────────────────────────────
describe('useSaleStore — addToCart', () => {
  it('adds a new item to an empty cart', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Bière Castel', prixVente: 600 });
    const cart = useSaleStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(1);
  });

  it('increments quantity for an existing item', () => {
    const { addToCart } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière Castel', prixVente: 600 });
    addToCart({ productId: 'p1', nom: 'Bière Castel', prixVente: 600 });
    const cart = useSaleStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  it('adds multiple distinct products', () => {
    const { addToCart } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière Castel', prixVente: 600 });
    addToCart({ productId: 'p2', nom: 'Eau Supermont', prixVente: 300 });
    expect(useSaleStore.getState().cart).toHaveLength(2);
  });
});

describe('useSaleStore — removeFromCart', () => {
  it('removes an item from the cart', () => {
    const { addToCart, removeFromCart } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière Castel', prixVente: 600 });
    removeFromCart('p1');
    expect(useSaleStore.getState().cart).toHaveLength(0);
  });

  it('does not affect other items', () => {
    const { addToCart, removeFromCart } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière', prixVente: 600 });
    addToCart({ productId: 'p2', nom: 'Eau', prixVente: 300 });
    removeFromCart('p1');
    expect(useSaleStore.getState().cart).toHaveLength(1);
    expect(useSaleStore.getState().cart[0].productId).toBe('p2');
  });
});

describe('useSaleStore — updateCartQuantity', () => {
  it('updates the quantity of an item', () => {
    const { addToCart, updateCartQuantity } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière', prixVente: 600 });
    updateCartQuantity('p1', 5);
    expect(useSaleStore.getState().cart[0].quantity).toBe(5);
  });

  it('removes the item when quantity is set to 0', () => {
    const { addToCart, updateCartQuantity } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière', prixVente: 600 });
    updateCartQuantity('p1', 0);
    expect(useSaleStore.getState().cart).toHaveLength(0);
  });

  it('removes the item when quantity is negative', () => {
    const { addToCart, updateCartQuantity } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière', prixVente: 600 });
    updateCartQuantity('p1', -1);
    expect(useSaleStore.getState().cart).toHaveLength(0);
  });
});

describe('useSaleStore — clearCart', () => {
  it('empties the cart and resets discount', () => {
    const { addToCart, setDiscount, clearCart } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière', prixVente: 600 });
    setDiscount(10);
    clearCart();
    expect(useSaleStore.getState().cart).toHaveLength(0);
    expect(useSaleStore.getState().discount).toBe(0);
  });
});

describe('useSaleStore — setDiscount', () => {
  it('sets the discount percentage', () => {
    useSaleStore.getState().setDiscount(15);
    expect(useSaleStore.getState().discount).toBe(15);
  });
});

// ─── Computed totals ──────────────────────────────────────────────────────────
describe('useSaleStore — getCartSubtotal', () => {
  it('returns 0 for an empty cart', () => {
    expect(useSaleStore.getState().getCartSubtotal()).toBe(0);
  });

  it('sums price × quantity for all items', () => {
    const { addToCart, updateCartQuantity } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière', prixVente: 600 });
    updateCartQuantity('p1', 3); // 3 × 600 = 1800
    addToCart({ productId: 'p2', nom: 'Eau', prixVente: 300 });
    // 1800 + 300 = 2100
    expect(useSaleStore.getState().getCartSubtotal()).toBe(2100);
  });
});

describe('useSaleStore — getCartTotal', () => {
  it('returns subtotal when discount is 0', () => {
    useSaleStore.getState().addToCart({ productId: 'p1', nom: 'Bière', prixVente: 600 });
    expect(useSaleStore.getState().getCartTotal()).toBe(600);
  });

  it('applies discount correctly', () => {
    const { addToCart, setDiscount } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière', prixVente: 1000 });
    setDiscount(10); // 10% off → 900
    expect(useSaleStore.getState().getCartTotal()).toBe(900);
  });

  it('rounds the total to nearest integer', () => {
    const { addToCart, setDiscount } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Test', prixVente: 999 });
    setDiscount(10); // 999 × 0.9 = 899.1 → rounded to 899
    expect(Number.isInteger(useSaleStore.getState().getCartTotal())).toBe(true);
  });
});

// ─── completeSale ─────────────────────────────────────────────────────────────
describe('useSaleStore — completeSale', () => {
  beforeEach(() => {
    const { addToCart, updateCartQuantity } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière Castel', prixVente: 600 });
    updateCartQuantity('p1', 2); // subtotal = 1200
  });

  it('returns a Sale object with correct id and saleNumber format', () => {
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 1500,
      changeGiven: 300,
      userId: 'u1',
      userName: 'Test User',
    });
    expect(sale.id).toMatch(/^s\d+[a-z0-9]+$/);
    expect(sale.saleNumber).toMatch(/^LGW-\d{4}-[A-Z0-9]{4}-\d{5}$/);
  });

  it('captures cart items in the sale', () => {
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 1200,
      changeGiven: 0,
      userId: 'u1',
      userName: 'Test User',
    });
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0].productId).toBe('p1');
    expect(sale.items[0].quantity).toBe(2);
  });

  it('computes subtotal and total from cart', () => {
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 1200,
      changeGiven: 0,
      userId: 'u1',
      userName: 'Test User',
    });
    expect(sale.subtotal).toBe(1200);
    expect(sale.total).toBe(1200);
  });

  it('clears the cart after completion', () => {
    useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 1200,
      changeGiven: 0,
      userId: 'u1',
      userName: 'Test User',
    });
    expect(useSaleStore.getState().cart).toHaveLength(0);
    expect(useSaleStore.getState().discount).toBe(0);
  });

  it('adds the sale to the sales history', () => {
    const before = useSaleStore.getState().sales.length;
    useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 1200,
      changeGiven: 0,
      userId: 'u1',
      userName: 'Test User',
    });
    expect(useSaleStore.getState().sales).toHaveLength(before + 1);
  });

  it('inserts the new sale at the beginning of the list', () => {
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes',
      amountReceived: 1200,
      changeGiven: 0,
      userId: 'u1',
      userName: 'Test User',
    });
    expect(useSaleStore.getState().sales[0].id).toBe(sale.id);
  });
});

// ─── refundSale ───────────────────────────────────────────────────────────────
const SEED_SALES = [
  {
    id: 'refund-s1', saleNumber: 'LGW-2026-00001', date: new Date('2026-01-01'),
    items: [{ productId: 'p1', nom: 'Bière Castel', prixVente: 600, quantity: 2 }],
    subtotal: 1200, discount: 0, total: 1200,
    paymentMode: 'especes' as const, amountReceived: 1200, changeGiven: 0,
    userId: 'u1', userName: 'Manager', status: 'completed' as const,
  },
  {
    id: 'refund-s2', saleNumber: 'LGW-2026-00002', date: new Date('2026-01-02'),
    items: [{ productId: 'p2', nom: 'Eau Supermont', prixVente: 300, quantity: 1 }],
    subtotal: 300, discount: 0, total: 300,
    paymentMode: 'especes' as const, amountReceived: 300, changeGiven: 0,
    userId: 'u1', userName: 'Manager', status: 'completed' as const,
  },
];

describe('useSaleStore — refundSale', () => {
  beforeEach(() => {
    useSaleStore.getState()._setSales([...SEED_SALES]);
  });

  it('marks a sale as refunded', () => {
    const { sales, refundSale } = useSaleStore.getState();
    const target = sales[0];
    refundSale(target.id, 'Produit défectueux', 'u1', 'Manager');
    const updated = useSaleStore.getState().sales.find(s => s.id === target.id)!;
    expect(updated.status).toBe('refunded');
  });

  it('records the refund reason and actor', () => {
    const { sales, refundSale } = useSaleStore.getState();
    const target = sales[0];
    refundSale(target.id, 'Raison test', 'u1', 'Marie Nguema');
    const updated = useSaleStore.getState().sales.find(s => s.id === target.id)!;
    expect(updated.refundReason).toBe('Raison test');
    expect(updated.refundedBy).toBe('Marie Nguema');
    expect(updated.refundedAt).toBeDefined();
  });

  it('does not affect other sales', () => {
    const { sales, refundSale } = useSaleStore.getState();
    const target = sales[0];
    const other = sales[1];
    refundSale(target.id, 'test', 'u1', 'Manager');
    const updatedOther = useSaleStore.getState().sales.find(s => s.id === other.id)!;
    expect(updatedOther.status).toBe('completed');
  });
});

// ─── completeSale — décrément de stock atomique (v1.4.3) ──────────────────────
describe('useSaleStore — completeSale (stock atomique)', () => {
  beforeEach(() => {
    localStorage.clear();
    useStockStore.setState({ movements: [] });
    useProductStore.setState({
      products: [
        {
          id: 'p1', nom: 'Bière Castel', categorie: 'Boissons', codeBarre: '111',
          prixAchat: 400, prixVente: 600, stock: 10, seuilAlerte: 5,
        },
        {
          id: 'p2', nom: 'Coca', categorie: 'Boissons', codeBarre: '222',
          prixAchat: 300, prixVente: 500, stock: 4, seuilAlerte: 2,
        },
      ],
    });
    const { addToCart, updateCartQuantity } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière Castel', prixVente: 600 });
    updateCartQuantity('p1', 3);
    addToCart({ productId: 'p2', nom: 'Coca', prixVente: 500 });
    updateCartQuantity('p2', 1);
  });

  it('décrémente le stock de chaque produit vendu', () => {
    useSaleStore.getState().completeSale({
      paymentMode: 'especes', amountReceived: 5000, changeGiven: 0,
      userId: 'u1', userName: 'Test',
    });
    const products = useProductStore.getState().products;
    expect(products.find(p => p.id === 'p1')!.stock).toBe(7); // 10 - 3
    expect(products.find(p => p.id === 'p2')!.stock).toBe(3); // 4 - 1
  });

  it('enregistre un mouvement de stock "vente" par produit avec stockBefore/After corrects', () => {
    useSaleStore.getState().completeSale({
      paymentMode: 'especes', amountReceived: 5000, changeGiven: 0,
      userId: 'u1', userName: 'Test',
    });
    const movements = useStockStore.getState().movements;
    const m1 = movements.find(m => m.productId === 'p1')!;
    expect(m1.type).toBe('vente');
    expect(m1.quantity).toBe(-3);
    expect(m1.stockBefore).toBe(10);
    expect(m1.stockAfter).toBe(7);
    expect(movements.filter(m => m.type === 'vente')).toHaveLength(2);
  });

  it('le numéro de vente porte un préfixe de code-caisse (unicité multi-caisses)', () => {
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes', amountReceived: 5000, changeGiven: 0,
      userId: 'u1', userName: 'Test',
    });
    // Format : LGW-AAAA-XXXX-NNNNN (XXXX = code caisse)
    const parts = sale.saleNumber.split('-');
    expect(parts).toHaveLength(4);
    expect(parts[2]).toMatch(/^[A-Z0-9]{4}$/);
  });

  it('ne crée aucun mouvement pour un produit absent du catalogue mais enregistre la vente', () => {
    useSaleStore.getState().clearCart();
    useSaleStore.getState().addToCart({ productId: 'inconnu', nom: 'Fantôme', prixVente: 100 });
    const sale = useSaleStore.getState().completeSale({
      paymentMode: 'especes', amountReceived: 100, changeGiven: 0,
      userId: 'u1', userName: 'Test',
    });
    expect(sale.items).toHaveLength(1);
    expect(useStockStore.getState().movements).toHaveLength(0);
  });
});

// ─── fsCommitSale reçoit des deltas négatifs (pas des produits complets) ───────
describe('useSaleStore — fsCommitSale payload uses stockDeltas', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fsCommitSale is called with negative stockDeltas — never with absolute product values', () => {
    localStorage.clear();
    useStockStore.setState({ movements: [] });
    useProductStore.setState({
      products: [
        { id: 'p1', nom: 'Bière', categorie: 'Boissons', codeBarre: '111',
          prixAchat: 400, prixVente: 600, stock: 10, seuilAlerte: 5 },
      ],
    });
    useSaleStore.setState({ cart: [], discount: 0, saleCounter: 0 });

    const spy = vi.spyOn(firestoreService, 'fsCommitSale');

    const { addToCart, updateCartQuantity, completeSale } = useSaleStore.getState();
    addToCart({ productId: 'p1', nom: 'Bière', prixVente: 600 });
    updateCartQuantity('p1', 3);
    completeSale({ paymentMode: 'especes', amountReceived: 1800, changeGiven: 0, userId: 'u1', userName: 'Test' });

    expect(spy).toHaveBeenCalledOnce();
    const payload = spy.mock.calls[0][1];
    // Must carry stockDeltas, not products
    expect(payload).toHaveProperty('stockDeltas');
    expect((payload as { stockDeltas: unknown[] }).stockDeltas).toHaveLength(1);
    const delta = (payload as { stockDeltas: Array<{ productId: string; delta: number }> }).stockDeltas[0];
    expect(delta.productId).toBe('p1');
    expect(delta.delta).toBe(-3); // negative — decrement
    // Must NOT contain a 'products' key
    expect(payload).not.toHaveProperty('products');
  });
});