/**
 * usePaymentStore — règlements reçus sur les ventes à crédit.
 *
 * Un Payment représente un encaissement partiel ou total sur une Sale dont le
 * paymentMode est 'credit'. Plusieurs Payment peuvent référencer la même Sale
 * (cas de règlements échelonnés).
 *
 * Le registre est append-only : une correction crée une opération d'annulation
 * immuable au lieu de supprimer le paiement d'origine. Les projections de crédit
 * sont recalculées depuis ce registre après chaque synchronisation.
 */
import { create } from 'zustand';
import { enqueue, retryAll } from '@/lib/outbox';
import { isFirebaseConfigured } from '@/lib/firebase';
import { toast } from 'sonner';
import { useSaleStore } from '@/stores/useSaleStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { runLocalStateTransaction } from '@/lib/localStateTransaction';

export type PaymentChannel = 'especes' | 'mobile_money';

export interface Payment {
  id: string;
  /** Identifiant immuable de l'opération. Absent uniquement sur l'historique v1. */
  operationId?: string;
  /** Les documents v1 sans kind sont des paiements normaux. */
  kind?: 'payment' | 'reversal';
  /** Renseigné seulement pour une annulation comptable. */
  reversesPaymentId?: string;
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

  /** Crée un encaissement immuable avec un ID stable. */
  addPayment: (payment: Omit<Payment, 'id' | 'operationId' | 'kind' | 'reversesPaymentId'>) => Payment;

  /** Annule comptablement un paiement sans jamais supprimer l'original. */
  reversePayment: (id: string, actor: { userId: string; userName: string; notes?: string }) => Payment;

  // Sélecteurs
  getPaymentsForSale: (saleId: string) => Payment[];
  getPaymentsForCustomer: (customerId: string) => Payment[];
  getPaymentsInRange: (start: Date, end: Date) => Payment[];
}

function newOperationId(prefix: 'pay' | 'rev'): string {
  const uuid = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${uuid}`;
}

function reconcileCreditSales(payments: Payment[]): void {
  useSaleStore.getState()._reconcileCreditProjections(payments);
}

function sortAndDedupe(payments: Payment[]): Payment[] {
  const byId = new Map<string, Payment>();
  for (const payment of payments) byId.set(payment.id, payment);
  return [...byId.values()].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export const usePaymentStore = create<PaymentState>()((set, get) => ({
  payments: [],

  _setPayments: (payments) => {
    const next = sortAndDedupe(payments);
    runLocalStateTransaction(() => {
      set({ payments: next });
      reconcileCreditSales(next);
    });
  },

  addPayment: (data) => {
    const id = newOperationId('pay');
    const newPayment: Payment = { ...data, id, operationId: id, kind: 'payment' };
    if (isFirebaseConfigured) {
      const queued = enqueue('payment', newPayment);
      if (!queued.durable) {
        toast.error("Journal local non durable : gardez l'application ouverte jusqu'à la synchronisation");
      }
    }
    const next = sortAndDedupe([newPayment, ...get().payments]);
    runLocalStateTransaction(() => {
      set({ payments: next });
      reconcileCreditSales(next);
    });
    if (isFirebaseConfigured) void retryAll();
    return newPayment;
  },

  reversePayment: (id, actor) => {
    const original = get().payments.find(p => p.id === id);
    if (!original) throw new Error('Paiement introuvable');
    if (original.kind === 'reversal') throw new Error('Une annulation ne peut pas être annulée directement');

    const reversalId = `rev-${original.id}`;
    const existing = get().payments.find(p => p.id === reversalId);
    if (existing) return existing;

    const reversal: Payment = {
      id: reversalId,
      operationId: reversalId,
      kind: 'reversal',
      reversesPaymentId: original.id,
      saleId: original.saleId,
      customerId: original.customerId,
      date: new Date(),
      amount: original.amount,
      channel: original.channel,
      mobileOperator: original.mobileOperator,
      mobileReference: original.mobileReference,
      userId: actor.userId,
      userName: actor.userName,
      notes: actor.notes,
      cashSessionId: useCashSessionStore.getState().currentSessionId ?? undefined,
    };
    if (isFirebaseConfigured) {
      const queued = enqueue('payment', reversal);
      if (!queued.durable) {
        toast.error("Journal local non durable : gardez l'application ouverte jusqu'à la synchronisation");
      }
    }
    const next = sortAndDedupe([reversal, ...get().payments]);
    runLocalStateTransaction(() => {
      set({ payments: next });
      reconcileCreditSales(next);
    });
    if (isFirebaseConfigured) void retryAll();
    return reversal;
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
