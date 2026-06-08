import { create } from 'zustand';
import { getBoutiqueId, getRegisterCode } from '@/services/boutiqueService';
import { fsUpdateSale, fsCommitSale, fsCommitCreditPayment, fsSaveSaleCounter } from '@/services/firestoreService';
import { usePaymentStore } from '@/stores/usePaymentStore';
import type { Payment } from '@/stores/usePaymentStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { useProductStore } from '@/stores/useProductStore';
import { useStockStore } from '@/stores/useStockStore';
import type { Product } from '@/stores/useProductStore';
import type { StockMovement } from '@/stores/useStockStore';

export type SaleStatus = 'completed' | 'refunded';
export type PaymentMode = 'especes' | 'mobile_money' | 'credit';
export type MobileOperator = 'mtn' | 'orange';

/**
 * Statut d'une vente à crédit.
 *   • pending : aucun règlement reçu
 *   • partial : règlement(s) partiel(s) reçu(s), il reste un solde
 *   • paid    : totalité réglée
 */
export type CreditStatus = 'pending' | 'partial' | 'paid';

export interface CartItem {
  productId: string;
  nom: string;
  prixVente: number;          // prix affiché (référence) — préservé pour l'historique
  prixUnitaire?: number;      // prix réellement appliqué — peut différer si négocié
                              // (optionnel pour rétro-compatibilité des Sale existantes)
  quantity: number;
  /**
   * Détails de la négociation si le prix a été modifié à la caisse.
   * Absent = vente au prix affiché.
   */
  negotiated?: {
    discount: number;          // (prixVente - prixUnitaire), par unité, en FCFA
    belowFloor: boolean;       // true si vente en dessous du plancher (override gérant utilisé)
    overrideBy?: string;       // userId du gérant ayant autorisé l'override
    overrideByName?: string;
  };
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
  // ─── Client (optionnel) ────────────────────────────────────────────────
  // Présent si la vente est associée à un client identifié. `customerName`
  // est dénormalisé pour l'affichage rapide dans les listes (et préserve
  // le nom au moment de la vente même si le client est renommé plus tard).
  customerId?: string;
  customerName?: string;
  // ─── Crédit ───────────────────────────────────────────────────────────
  // Présent seulement quand paymentMode === 'credit'.
  //   • creditStatus est recalculé à chaque règlement reçu (computeCreditStatus)
  //   • amountPaid est dénormalisé pour affichage rapide. La source de vérité
  //     reste la somme des Payment liés (cf. src/lib/credit.ts).
  //   • dueDate est facultative (échéance souhaitée). ISO date string.
  creditStatus?: CreditStatus;
  amountPaid?: number;
  dueDate?: string;
  // ─── Sessions de caisse (v1.2.2) ───────────────────────────────────────
  // Renseigné si la vente a été faite pendant une session ouverte.
  // Optionnel pour rétro-compatibilité des ventes historiques.
  cashSessionId?: string;
  // ─── Refund ────────────────────────────────────────────────────────────
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
  /**
   * Applique un prix négocié sur une ligne du panier (issu du PriceEditor).
   * Met à jour `prixUnitaire` et le bloc `negotiated` si le prix diffère du prixVente.
   * Si newPrice === prixVente, le champ negotiated est supprimé (retour au prix normal).
   */
  applyPriceOverride: (
    productId: string,
    newPrice: number,
    belowFloor: boolean,
    override?: { userId: string; userName: string }
  ) => void;
  clearCart: () => void;
  setDiscount: (discount: number) => void;
  getCartTotal: () => number;
  getCartSubtotal: () => number;
  refundSale: (saleId: string, reason: string, userId: string, userName: string) => void;
  /**
   * Enregistre un règlement sur une vente à crédit, met à jour les champs
   * dénormalisés (amountPaid, creditStatus) et persiste la vente.
   * Throw si la vente n'est pas trouvée, pas en crédit, ou si le montant invalide.
   */
  applyCreditPayment: (
    saleId: string,
    payment: { amount: number; channel: 'especes' | 'mobile_money'; mobileOperator?: 'mtn' | 'orange'; mobileReference?: string; userId: string; userName: string; notes?: string }
  ) => void;
  completeSale: (
    sale: Omit<Sale, 'id' | 'saleNumber' | 'date' | 'items' | 'subtotal' | 'total' | 'discount'>
  ) => Sale;
}

// ─── Compteur de ventes local, propre à cette caisse ──────────────────────────
// Chaque caisse conserve sa propre séquence (le préfixe de code-caisse dans le
// saleNumber garantit l'unicité globale). Persister localement permet de
// reprendre la séquence après un redémarrage, sans dépendre d'un compteur
// partagé que plusieurs caisses écraseraient.
function counterKey(): string {
  return `legwan-sale-counter-${getRegisterCode()}`;
}

function loadLocalCounter(): number {
  try {
    const raw = localStorage.getItem(counterKey());
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function persistLocalCounter(value: number): void {
  try {
    localStorage.setItem(counterKey(), String(value));
  } catch {
    /* localStorage indisponible */
  }
}

export const useSaleStore = create<SaleState>()((set, get) => ({
  sales: [],
  cart: [],
  discount: 0,
  saleCounter: loadLocalCounter(),

  _setSales: (sales) => set({ sales }),
  _setSaleCounter: (counter) => set(s => {
    // On adopte la valeur (ex. issue de Firestore au démarrage) sans jamais
    // régresser sous la séquence locale déjà atteinte par cette caisse.
    const next = Math.max(counter, s.saleCounter, loadLocalCounter());
    persistLocalCounter(next);
    return { saleCounter: next };
  }),

  addToCart: (item) => {
    const existing = get().cart.find(c => c.productId === item.productId);
    if (existing) {
      set(state => ({
        cart: state.cart.map(c =>
          c.productId === item.productId ? { ...c, quantity: c.quantity + 1 } : c
        ),
      }));
    } else {
      // À l'ajout, prixUnitaire = prixVente (pas de négociation par défaut)
      set(state => ({
        cart: [...state.cart, { ...item, quantity: 1, prixUnitaire: item.prixVente }],
      }));
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

  applyPriceOverride: (productId, newPrice, belowFloor, override) => {
    set(state => ({
      cart: state.cart.map(item => {
        if (item.productId !== productId) return item;
        const discount = item.prixVente - newPrice;
        // Si on remet le prix au prix de vente (annulation négociation),
        // on retire le champ negotiated pour rester propre.
        if (discount <= 0) {
          const { negotiated: _omit, ...rest } = item;
          return { ...rest, prixUnitaire: newPrice };
        }
        return {
          ...item,
          prixUnitaire: newPrice,
          negotiated: {
            discount,
            belowFloor,
            overrideBy: override?.userId,
            overrideByName: override?.userName,
          },
        };
      }),
    }));
  },

  clearCart: () => set({ cart: [], discount: 0 }),
  setDiscount: (discount) => set({ discount }),

  // Calcule le sous-total à partir du prix appliqué (prixUnitaire ?? prixVente)
  // pour prendre en compte les négociations éventuelles. Fallback rétro-compatible.
  getCartSubtotal: () =>
    get().cart.reduce((sum, item) => sum + (item.prixUnitaire ?? item.prixVente) * item.quantity, 0),

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

  applyCreditPayment: (saleId, payment) => {
    const state = get();
    const sale = state.sales.find(s => s.id === saleId);
    if (!sale) throw new Error('Vente introuvable');
    if (sale.paymentMode !== 'credit') throw new Error('Cette vente n\'est pas à crédit');
    if (sale.status === 'refunded') throw new Error('Cette vente est remboursée');
    if (!sale.customerId) throw new Error('Vente à crédit sans client (incohérence)');
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      throw new Error('Montant invalide');
    }

    // Calcul du nouveau total payé et du statut résultant
    const previouslyPaid = sale.amountPaid ?? 0;
    const newAmountPaid = previouslyPaid + payment.amount;
    const remaining = Math.max(0, sale.total - newAmountPaid);

    if (payment.amount > sale.total - previouslyPaid) {
      throw new Error(`Le montant (${payment.amount}) dépasse le solde restant (${sale.total - previouslyPaid})`);
    }

    const newCreditStatus: CreditStatus = remaining === 0 ? 'paid' : 'partial';

    // Construit le Payment (source de vérité) et la mise à jour dénormalisée
    // de la Sale, puis applique les deux en mémoire et les persiste dans un
    // unique batch atomique — impossible d'avoir l'un sans l'autre.
    const activeSessionId = useCashSessionStore.getState().currentSessionId ?? undefined;
    const newPayment: Payment = {
      id: 'pay' + Date.now() + Math.random().toString(36).slice(2, 7),
      saleId,
      customerId: sale.customerId!,
      date: new Date(),
      amount: payment.amount,
      channel: payment.channel,
      mobileOperator: payment.mobileOperator,
      mobileReference: payment.mobileReference,
      userId: payment.userId,
      userName: payment.userName,
      notes: payment.notes,
      cashSessionId: activeSessionId,
    };

    const update = {
      amountPaid: newAmountPaid,
      creditStatus: newCreditStatus,
    };

    // Mise à jour en mémoire (optimiste) des deux stores.
    usePaymentStore.setState(s => ({ payments: [newPayment, ...s.payments] }));
    set(s => ({
      sales: s.sales.map(x => x.id === saleId ? { ...x, ...update } : x),
    }));

    // Persistance atomique : Payment + MAJ vente dans un seul batch.
    const bid = getBoutiqueId();
    fsCommitCreditPayment(bid, { payment: newPayment, saleId, saleUpdate: update }).catch(console.error);
  },

  completeSale: (saleData) => {
    // Garde-fou : une vente à crédit DOIT avoir un client identifié.
    if (saleData.paymentMode === 'credit' && !saleData.customerId) {
      throw new Error('Une vente à crédit nécessite un client identifié');
    }

    const state = get();
    const newCounter = state.saleCounter + 1;
    const isCredit = saleData.paymentMode === 'credit';
    const registerCode = getRegisterCode();

    // Rattache la vente à la session de caisse active s'il y en a une.
    const activeSessionId = useCashSessionStore.getState().currentSessionId ?? undefined;

    const items = [...state.cart];

    const sale: Sale = {
      id: 's' + Date.now() + Math.random().toString(36).slice(2, 7),
      // Numéro préfixé par le code-caisse → unique même avec plusieurs caisses
      // hors-ligne en parallèle (ex. LGW-2026-A1B2-00042).
      saleNumber: `LGW-${new Date().getFullYear()}-${registerCode}-${String(newCounter).padStart(5, '0')}`,
      date: new Date(),
      items,
      subtotal: state.getCartSubtotal(),
      discount: state.discount,
      total: state.getCartTotal(),
      ...saleData,
      cashSessionId: activeSessionId,
      // Initialisation des champs crédit (créditStatus 'pending', amountPaid 0)
      creditStatus: isCredit ? 'pending' : undefined,
      amountPaid: isCredit ? 0 : undefined,
    };

    // ── Conséquences sur le stock, calculées ici pour un commit ATOMIQUE ──────
    // La vente, les nouveaux stocks et les mouvements forment un tout : ils sont
    // appliqués ensemble en mémoire puis écrits dans un unique batch Firestore.
    const products = useProductStore.getState().products;
    const updatedProducts: Product[] = [];
    const movements: StockMovement[] = [];
    const movDate = new Date();
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue; // produit inconnu → vente enregistrée sans ligne de stock
      const stockBefore = product.stock;
      const stockAfter = stockBefore - item.quantity;
      updatedProducts.push({ ...product, stock: stockAfter });
      movements.push({
        id: 'm' + Date.now() + Math.random().toString(36).slice(2, 7),
        date: movDate,
        productId: item.productId,
        productName: item.nom,
        type: 'vente',
        quantity: -item.quantity,
        stockBefore,
        stockAfter,
        userId: sale.userId,
        userName: sale.userName,
      });
    }

    // ── Mise à jour en mémoire (optimiste — l'UI réagit immédiatement) ────────
    set(s => ({ sales: [sale, ...s.sales], cart: [], discount: 0, saleCounter: newCounter }));
    if (updatedProducts.length) {
      const byId = new Map(updatedProducts.map(p => [p.id, p]));
      useProductStore.setState(s => ({ products: s.products.map(p => byId.get(p.id) ?? p) }));
    }
    if (movements.length) {
      useStockStore.setState(s => ({ movements: [...movements, ...s.movements] }));
    }
    persistLocalCounter(newCounter);

    // ── Persistance atomique : vente + stocks + mouvements en un seul batch ───
    const bid = getBoutiqueId();
    fsCommitSale(bid, { sale, products: updatedProducts, movements }).catch(console.error);
    fsSaveSaleCounter(bid, newCounter).catch(() => {});
    return sale;
  },
}));