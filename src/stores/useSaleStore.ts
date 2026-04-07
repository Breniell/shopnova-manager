import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

interface SaleState {
  sales: Sale[];
  cart: CartItem[];
  discount: number;
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setDiscount: (discount: number) => void;
  getCartTotal: () => number;
  getCartSubtotal: () => number;
  refundSale: (saleId: string, reason: string, userId: string, userName: string) => void;
  completeSale: (sale: Omit<Sale, 'id' | 'saleNumber' | 'date' | 'items' | 'subtotal' | 'total' | 'discount'>) => Sale;
}

const now = new Date();
const day = (daysAgo: number, hour: number, min: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d;
};

const initialSales: Sale[] = [
  { id: 's1', saleNumber: 'SHP-2026-00001', date: day(0, 8, 15), items: [{ productId: 'p1', nom: 'Bière Castel 33cl', prixVente: 600, quantity: 6 }, { productId: 'p8', nom: 'Biscuits Petit LU 100g', prixVente: 400, quantity: 3 }], subtotal: 4800, discount: 0, total: 4800, paymentMode: 'especes', amountReceived: 5000, changeGiven: 200, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's2', saleNumber: 'SHP-2026-00002', date: day(0, 9, 30), items: [{ productId: 'p3', nom: 'Riz parfumé Thaï 5kg', prixVente: 4500, quantity: 2 }, { productId: 'p4', nom: 'Huile végétale Azur 1L', prixVente: 1400, quantity: 1 }], subtotal: 10400, discount: 0, total: 10400, paymentMode: 'mobile_money', mobileOperator: 'mtn', mobileReference: 'MTN-78291', userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's3', saleNumber: 'SHP-2026-00003', date: day(0, 11, 45), items: [{ productId: 'p16', nom: 'Téléphone Samsung A05', prixVente: 65000, quantity: 1 }], subtotal: 65000, discount: 0, total: 65000, paymentMode: 'mobile_money', mobileOperator: 'orange', mobileReference: 'OM-44521', userId: '1', userName: 'Marie Nguema', status: 'completed' as const },
  { id: 's4', saleNumber: 'SHP-2026-00004', date: day(0, 14, 20), items: [{ productId: 'p5', nom: 'Savon OMO 500g', prixVente: 1100, quantity: 2 }, { productId: 'p11', nom: 'Dentifrice Colgate 75ml', prixVente: 900, quantity: 1 }], subtotal: 3100, discount: 0, total: 3100, paymentMode: 'especes', amountReceived: 3500, changeGiven: 400, userId: '3', userName: 'Fatou Diallo', status: 'completed' as const },
  { id: 's5', saleNumber: 'SHP-2026-00005', date: day(1, 8, 0), items: [{ productId: 'p9', nom: 'Lait Nido 400g', prixVente: 4200, quantity: 1 }, { productId: 'p12', nom: 'Sucre cristallisé 1kg', prixVente: 750, quantity: 2 }], subtotal: 5700, discount: 0, total: 5700, paymentMode: 'especes', amountReceived: 6000, changeGiven: 300, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's6', saleNumber: 'SHP-2026-00006', date: day(1, 10, 30), items: [{ productId: 'p14', nom: 'Café Nescafé Classic 200g', prixVente: 3800, quantity: 1 }, { productId: 'p25', nom: 'Spaghetti Barilla 500g', prixVente: 1000, quantity: 3 }], subtotal: 6800, discount: 0, total: 6800, paymentMode: 'especes', amountReceived: 6800, changeGiven: 0, userId: '3', userName: 'Fatou Diallo', status: 'completed' as const },
  { id: 's7', saleNumber: 'SHP-2026-00007', date: day(1, 15, 0), items: [{ productId: 'p1', nom: 'Bière Castel 33cl', prixVente: 600, quantity: 12 }, { productId: 'p2', nom: 'Eau minérale Supermont 1.5L', prixVente: 300, quantity: 6 }], subtotal: 9000, discount: 0, total: 9000, paymentMode: 'especes', amountReceived: 10000, changeGiven: 1000, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's8', saleNumber: 'SHP-2026-00008', date: day(2, 9, 15), items: [{ productId: 'p18', nom: 'Couche Pampers taille 3', prixVente: 6000, quantity: 2 }], subtotal: 12000, discount: 0, total: 12000, paymentMode: 'mobile_money', mobileOperator: 'mtn', mobileReference: 'MTN-55123', userId: '3', userName: 'Fatou Diallo', status: 'completed' as const },
  { id: 's9', saleNumber: 'SHP-2026-00009', date: day(2, 12, 0), items: [{ productId: 'p7', nom: 'Sardines Saupiquet 200g', prixVente: 950, quantity: 4 }, { productId: 'p19', nom: 'Tomate concentrée Heinz 400g', prixVente: 1200, quantity: 2 }], subtotal: 6200, discount: 0, total: 6200, paymentMode: 'especes', amountReceived: 6500, changeGiven: 300, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's10', saleNumber: 'SHP-2026-00010', date: day(2, 16, 45), items: [{ productId: 'p15', nom: 'Gaz Butane 6kg', prixVente: 6500, quantity: 1 }], subtotal: 6500, discount: 0, total: 6500, paymentMode: 'especes', amountReceived: 7000, changeGiven: 500, userId: '1', userName: 'Marie Nguema', status: 'completed' as const },
  { id: 's11', saleNumber: 'SHP-2026-00011', date: day(3, 8, 30), items: [{ productId: 'p6', nom: 'Mayonnaise Bama 500g', prixVente: 2000, quantity: 1 }, { productId: 'p13', nom: 'Farine de blé 1kg', prixVente: 650, quantity: 2 }], subtotal: 3300, discount: 0, total: 3300, paymentMode: 'especes', amountReceived: 3500, changeGiven: 200, userId: '3', userName: 'Fatou Diallo', status: 'completed' as const },
  { id: 's12', saleNumber: 'SHP-2026-00012', date: day(3, 11, 15), items: [{ productId: 'p20', nom: 'Piles AA Duracell x4', prixVente: 1500, quantity: 2 }, { productId: 'p17', nom: 'Câble USB-C 1m', prixVente: 2500, quantity: 1 }], subtotal: 5500, discount: 0, total: 5500, paymentMode: 'mobile_money', mobileOperator: 'orange', mobileReference: 'OM-33789', userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's13', saleNumber: 'SHP-2026-00013', date: day(3, 14, 0), items: [{ productId: 'p24', nom: 'Chips Pringles Original', prixVente: 2800, quantity: 3 }, { productId: 'p23', nom: 'Jus de fruit Joker Orange 1L', prixVente: 1300, quantity: 2 }], subtotal: 11000, discount: 5, total: 10450, paymentMode: 'especes', amountReceived: 11000, changeGiven: 550, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's14', saleNumber: 'SHP-2026-00014', date: day(4, 9, 0), items: [{ productId: 'p21', nom: 'Lessive Omo poudre 1kg', prixVente: 1900, quantity: 1 }, { productId: 'p5', nom: 'Savon OMO 500g', prixVente: 1100, quantity: 2 }], subtotal: 4100, discount: 0, total: 4100, paymentMode: 'especes', amountReceived: 4500, changeGiven: 400, userId: '3', userName: 'Fatou Diallo', status: 'completed' as const },
  { id: 's15', saleNumber: 'SHP-2026-00015', date: day(4, 13, 30), items: [{ productId: 'p3', nom: 'Riz parfumé Thaï 5kg', prixVente: 4500, quantity: 1 }, { productId: 'p4', nom: 'Huile végétale Azur 1L', prixVente: 1400, quantity: 2 }], subtotal: 7300, discount: 0, total: 7300, paymentMode: 'especes', amountReceived: 7300, changeGiven: 0, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's16', saleNumber: 'SHP-2026-00016', date: day(5, 8, 45), items: [{ productId: 'p1', nom: 'Bière Castel 33cl', prixVente: 600, quantity: 24 }], subtotal: 14400, discount: 0, total: 14400, paymentMode: 'especes', amountReceived: 15000, changeGiven: 600, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's17', saleNumber: 'SHP-2026-00017', date: day(5, 12, 15), items: [{ productId: 'p22', nom: 'Tablette de chocolat Noir', prixVente: 900, quantity: 5 }, { productId: 'p8', nom: 'Biscuits Petit LU 100g', prixVente: 400, quantity: 10 }], subtotal: 8500, discount: 0, total: 8500, paymentMode: 'mobile_money', mobileOperator: 'mtn', mobileReference: 'MTN-99234', userId: '3', userName: 'Fatou Diallo', status: 'completed' as const },
  { id: 's18', saleNumber: 'SHP-2026-00018', date: day(6, 9, 30), items: [{ productId: 'p2', nom: 'Eau minérale Supermont 1.5L', prixVente: 300, quantity: 10 }, { productId: 'p7', nom: 'Sardines Saupiquet 200g', prixVente: 950, quantity: 3 }], subtotal: 5850, discount: 0, total: 5850, paymentMode: 'especes', amountReceived: 6000, changeGiven: 150, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
  { id: 's19', saleNumber: 'SHP-2026-00019', date: day(6, 14, 0), items: [{ productId: 'p9', nom: 'Lait Nido 400g', prixVente: 4200, quantity: 2 }, { productId: 'p14', nom: 'Café Nescafé Classic 200g', prixVente: 3800, quantity: 1 }], subtotal: 12200, discount: 0, total: 12200, paymentMode: 'mobile_money', mobileOperator: 'orange', mobileReference: 'OM-77123', userId: '1', userName: 'Marie Nguema', status: 'completed' as const },
  { id: 's20', saleNumber: 'SHP-2026-00020', date: day(6, 17, 0), items: [{ productId: 'p15', nom: 'Gaz Butane 6kg', prixVente: 6500, quantity: 2 }, { productId: 'p25', nom: 'Spaghetti Barilla 500g', prixVente: 1000, quantity: 5 }], subtotal: 18000, discount: 0, total: 18000, paymentMode: 'especes', amountReceived: 18000, changeGiven: 0, userId: '2', userName: 'Paul Mbarga', status: 'completed' as const },
];

export const useSaleStore = create<SaleState>()(
  persist(
    (set, get) => ({
      sales: initialSales,
      cart: [],
      discount: 0,
      addToCart: (item) => {
        const existing = get().cart.find(c => c.productId === item.productId);
        if (existing) {
          set(state => ({
            cart: state.cart.map(c => c.productId === item.productId ? { ...c, quantity: c.quantity + 1 } : c)
          }));
        } else {
          set(state => ({ cart: [...state.cart, { ...item, quantity: 1 }] }));
        }
      },
      removeFromCart: (productId) => {
        set(state => ({ cart: state.cart.filter(c => c.productId !== productId) }));
      },
      updateCartQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(productId);
          return;
        }
        set(state => ({
          cart: state.cart.map(c => c.productId === productId ? { ...c, quantity } : c)
        }));
      },
      clearCart: () => set({ cart: [], discount: 0 }),
      setDiscount: (discount) => set({ discount }),
      getCartSubtotal: () => get().cart.reduce((sum, item) => sum + item.prixVente * item.quantity, 0),
      getCartTotal: () => {
        const subtotal = get().getCartSubtotal();
        const discount = get().discount;
        return Math.round(subtotal * (1 - discount / 100));
      },
      refundSale: (saleId, reason, userId, userName) => {
        set(state => ({
          sales: state.sales.map(s => s.id === saleId ? {
            ...s,
            status: 'refunded' as const,
            refundedAt: new Date().toISOString(),
            refundReason: reason,
            refundedBy: userName,
          } : s)
        }));
      },
      completeSale: (saleData) => {
        const state = get();
        const sale: Sale = {
          id: 's' + Date.now(),
          saleNumber: `SHP-${new Date().getFullYear()}-${String(state.sales.length + 1).padStart(5, '0')}`,
          date: new Date(),
          items: [...state.cart],
          subtotal: state.getCartSubtotal(),
          discount: state.discount,
          total: state.getCartTotal(),
          ...saleData,
        };
        set(state => ({ sales: [sale, ...state.sales], cart: [], discount: 0 }));
        return sale;
      },
    }),
    {
      name: 'shopnova-sales',
      partialize: (state) => ({ sales: state.sales }),
    }
  )
);
