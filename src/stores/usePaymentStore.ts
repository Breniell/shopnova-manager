/**
 * usePaymentStore — règlements reçus sur les ventes à crédit.
 *
 * Un Payment représente un encaissement partiel ou total sur une Sale dont le
 * paymentMode est 'credit'. Plusieurs Payment peuvent référencer la même Sale
 * (cas de règlements échelonnés).
 *
 * Note : à chaque ajout de Payment, le composant appelant doit recalculer
 * Sale.amountPaid et Sale.creditStatus via computeCreditStatus (cf. lib/credit.ts).
 * Cette responsabilité n'est PAS dans le store pour éviter des dépendances
 * croisées avec useSaleStore et garder le code testable.
 */
import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSavePayment, fsDeletePayment } from '@/services/firestoreService';

export type PaymentChannel = 'especes' | 'mobile_money';

export interface Payment {
  id: string;
  saleId: string;                   // référence à la vente à crédit
  customerId: string;               // dénormalisé pour les filtres par client
  date: Date;
  amount: number;
  channel: PaymentChannel;
  mobileOperator?: 'mtn' | 'orange';
  mobileReference?: string;
  userId: string;                   // qui a encaissé
  userName: string;
  notes?: string;
  /**
   * ID de la session de caisse active au moment du règlement (v1.2.2).
   * Optionnel pour rétro-compatibilité des paiements historiques.
   */
  cashSessionId?: string;
}

interface PaymentState {
  payments: Payment[];

  /** Internal: called by FirebaseProvider on startup */
  _setPayments: (payments: Payment[]) => void;

  /** Crée un règlement. Retourne le Payment créé (utile au composant pour MAJ vente). */
  addPayment: (payment: Omit<Payment, 'id'>) => Payment;

  /** Supprime un règlement (correction). Le composant doit MAJ creditStatus de la vente. */
  deletePayment: (id: string) => void;

  // Sélecteurs
  getPaymentsForSale: (saleId: string) => Payment[];
  getPaymentsForCustomer: (customerId: string) => Payment[];
  getPaymentsInRange: (start: Date, end: Date) => Payment[];
}

export const usePaymentStore = create<PaymentState>()((set, get) => ({
  payments: [],

  _setPayments: (payments) => set({ payments }),

  addPayment: (data) => {
    // ID = timestamp + suffixe random pour éviter les collisions (cf. bug fixé v1.1.1)
    const id = 'pay' + Date.now() + Math.random().toString(36).slice(2, 7);
    const newPayment: Payment = { ...data, id };
    set(state => ({ payments: [newPayment, ...state.payments] }));
    fsSavePayment(getBoutiqueId(), newPayment).catch(console.error);
    return newPayment;
  },

  deletePayment: (id) => {
    set(state => ({ payments: state.payments.filter(p => p.id !== id) }));
    fsDeletePayment(getBoutiqueId(), id).catch(console.error);
  },

  getPaymentsForSale: (saleId) =>
    get().payments.filter(p => p.saleId === saleId),

  getPaymentsForCustomer: (customerId) =>
    get().payments.filter(p => p.customerId === customerId),

  getPaymentsInRange: (start, end) =>
    get().payments.filter(p => {
      const d = new Date(p.date);
      return d >= start && d <= end;
    }),
}));
