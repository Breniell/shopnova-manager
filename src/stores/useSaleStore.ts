import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveSale, fsUpdateSale, fsSaveSaleCounter } from '@/services/firestoreService';

export type SaleStatus = 'completed' | 'refunded';
export type PaymentMode = 'especes' | 'mobile_money';
export type MobileOperator = 'mtn' | 'orange';

export interface CartItem {
  productId: string;
  nom: string;
  prixVente: number;
  quantity: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  date: Date;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMode: PaymentMode;
  mobileOperator?: MobileOperator;
  mobileReference?: string;
  amountReceived?: number;
  changeGiven?: number;
  userId: string;
  userName: string;
  status?: SaleStatus;
  refundedAt?: string;
  refundReason?: string;
  refundedBy?: string;
}

interface SaleState {
  sales: Sale[];
  cart: CartItem[];
  discount: number;
  saleCounter: number;

  /** Internal: called by FirebaseProvider on startup */
  _setSales: (sales: Sale[]) => void;
  _setSaleCounter: (counter: number) => void;

  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setDiscount: (discount: number) => void;
  getCartTotal: () => number;
  getCartSubtotal: () => number;
  refundSale: (saleId: string, reason: string, userId: string, userName: string) => void;
  completeSale: (
    sale: Omit<Sale, 'id' | 'saleNumber' | 'date' | 'items' | 'subtotal' | 'total' | 'discount'>
  ) => Sale;
}

export const useSaleStore = create<SaleState>()((set, get) => ({
  sales: [],
  cart: [],
  discount: 0,
  saleCounter: 0,

  _setSales: (sales) => set({ sales }),
  _setSaleCounter: (counter) => set({ saleCounter: counter }),

  addToCart: (item) => {
    const existing = get().cart.find(c => c.productId === item.productId);
    if (existing) {
      set(state => ({
        cart: state.cart.map(c =>
          c.productId === item.productId ? { ...c, quantity: c.quantity + 1 } : c
        ),
      }));
    } else {
      set(state => ({ cart: [...state.cart, { ...item, quantity: 1 }] }));
    }
  },

  removeFromCart: (productId) =>
    set(state => ({ cart: state.cart.filter(c => c.productId !== productId) })),

  updateCartQuantity: (productId, quantity) => {
    if (quantity <= 0) { get().removeFromCart(productId); return; }
    set(state => ({
      cart: state.cart.map(c => c.productId === productId ? { ...c, quantity } : c),
    }));
  },

  clearCart: () => set({ cart: [], discount: 0 }),
  setDiscount: (discount) => set({ discount }),

  getCartSubtotal: () =>
    get().cart.reduce((sum, item) => sum + item.prixVente * item.quantity, 0),

  getCartTotal: () => {
    const subtotal = get().getCartSubtotal();
    return Math.round(subtotal * (1 - get().discount / 100));
  },

  refundSale: (saleId, reason, userId, userName) => {
    const sale = get().sales.find(s => s.id === saleId);
    if (!sale || sale.status === 'refunded') return;

    const now = new Date().toISOString();
    const update = {
      status: 'refunded' as const,
      refundedAt: now,
      refundReason: reason,
      refundedBy: userName,
    };

    set(state => ({
      sales: state.sales.map(s => s.id === saleId ? { ...s, ...update } : s),
    }));

    // Reverse stock for each item in the cancelled sale
    const bid = getBoutiqueId();
    sale.items.forEach(item => {
      // Dynamically import stores to avoid circular imports at module load time
      import('@/stores/useProductStore').then(({ useProductStore }) => {
        const product = useProductStore.getState().products.find(p => p.id === item.productId);
        const stockBefore = product?.stock ?? 0;
        useProductStore.getState().updateStock(item.productId, item.quantity);

        import('@/stores/useStockStore').then(({ useStockStore }) => {
          useStockStore.getState().addMovement({
            date: new Date(),
            productId: item.productId,
            productName: item.nom,
            type: 'entrée',
            quantity: item.quantity,
            stockBefore,
            stockAfter: stockBefore + item.quantity,
            userId,
            userName,
          });
        });
      });
    });

    fsUpdateSale(bid, saleId, update).catch(console.error);
  },

  completeSale: (saleData) => {
    const state = get();
    const newCounter = state.saleCounter + 1;
    const sale: Sale = {
      id: 's' + Date.now(),
      saleNumber: `LGW-${new Date().getFullYear()}-${String(newCounter).padStart(5, '0')}`,
      date: new Date(),
      items: [...state.cart],
      subtotal: state.getCartSubtotal(),
      discount: state.discount,
      total: state.getCartTotal(),
      ...saleData,
    };
    set(state => ({ sales: [sale, ...state.sales], cart: [], discount: 0, saleCounter: newCounter }));
    const bid = getBoutiqueId();
    fsSaveSale(bid, sale).catch(console.error);
    fsSaveSaleCounter(bid, newCounter).catch(console.error);
    return sale;
  },
}));
