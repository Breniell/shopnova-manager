/**
 * Ventes en attente (« mettre de côté »).
 *
 * Un client qui prend du temps pour payer (MoMo à valider, monnaie à chercher)
 * ne doit pas bloquer la file : le caissier met son panier de côté, sert le
 * suivant, puis reprend la vente et l'encaisse normalement.
 *
 * Invariants :
 *   • Une vente en attente n'est PAS une vente. Aucun stock décrémenté, aucun
 *     numéro de reçu consommé, rien dans l'outbox ni dans Firestore : tout cela
 *     n'arrive qu'au `completeSale()` qui suit la reprise.
 *   • Le stockage est local à ce poste (localStorage, clé par code-caisse) et
 *     survit à un redémarrage. Pas de synchronisation : un panier en attente
 *     appartient au comptoir où se tient le client.
 *   • À la reprise, le panier est revérifié contre le catalogue actuel
 *     (produit supprimé, stock insuffisant, prix modifié). Une négociation n'est
 *     conservée que si les prix du produit n'ont pas bougé : l'autorisation
 *     d'un gérant valait pour ces prix-là, pas pour de nouveaux.
 */
import { create } from 'zustand';
import { getRegisterCode } from '@/services/boutiqueService';
import { useSaleStore } from '@/stores/useSaleStore';
import type { CartItem, MobileOperator, PaymentMode } from '@/stores/useSaleStore';
import type { Product } from '@/stores/useProductStore';

/** Prix du produit au moment de la mise en attente, pour détecter un changement. */
export interface HeldPriceSnapshot {
  prixVente: number;
  prixPlancher?: number;
  prixCible?: number;
  negociable?: boolean;
}

export interface HeldSale {
  id: string;
  /** ISO. */
  heldAt: string;
  /** Nom du client ou note libre. Peut être vide. */
  label: string;
  items: CartItem[];
  /** Prix du catalogue par productId au moment de la mise en attente. */
  priceSnapshots: Record<string, HeldPriceSnapshot>;
  discount: number;
  /** Gérant ayant autorisé la remise du panier, s'il y en avait une. */
  discountAuthorizedBy?: { userId: string; userName: string };
  customerId?: string;
  customerName?: string;
  paymentMode: PaymentMode;
  mobileOperator?: MobileOperator;
  dueDate?: string;
  heldByUserId: string;
  heldByUserName: string;
}

export interface HoldMeta {
  label?: string;
  discountAuthorizedBy?: { userId: string; userName: string } | null;
  customerId?: string;
  customerName?: string;
  paymentMode: PaymentMode;
  mobileOperator?: MobileOperator;
  dueDate?: string;
  userId: string;
  userName: string;
}

export type HeldSaleIssue =
  | { kind: 'missing'; nom: string }
  | { kind: 'outOfStock'; nom: string }
  | { kind: 'stockReduced'; nom: string; requested: number; available: number }
  | { kind: 'priceChanged'; nom: string; before: number; after: number; negotiationDropped: boolean };

export interface ReconcileResult {
  items: CartItem[];
  issues: HeldSaleIssue[];
}

export interface ResumeResult {
  held: HeldSale;
  issues: HeldSaleIssue[];
  /** Vrai si l'autorisation de remise du gérant peut être reprise telle quelle. */
  discountAuthorizationKept: boolean;
}

function snapshotOf(product: Product): HeldPriceSnapshot {
  return {
    prixVente: product.prixVente,
    prixPlancher: product.prixPlancher,
    prixCible: product.prixCible,
    negociable: product.negociable,
  };
}

function samePrices(a: HeldPriceSnapshot | undefined, b: HeldPriceSnapshot): boolean {
  if (!a) return false;
  return a.prixVente === b.prixVente
    && a.prixPlancher === b.prixPlancher
    && a.prixCible === b.prixCible
    && a.negociable === b.negociable;
}

/**
 * Confronte un panier mis en attente au catalogue actuel. Pure : ne touche à
 * aucun store, pour pouvoir la tester et l'afficher avant d'agir.
 */
export function reconcileHeldSale(held: HeldSale, products: Product[]): ReconcileResult {
  const issues: HeldSaleIssue[] = [];
  const items: CartItem[] = [];

  for (const item of held.items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) {
      issues.push({ kind: 'missing', nom: item.nom });
      continue;
    }
    if (product.stock <= 0) {
      issues.push({ kind: 'outOfStock', nom: product.nom });
      continue;
    }

    let next: CartItem = { ...item, nom: product.nom, prixAchat: product.prixAchat };

    if (item.quantity > product.stock) {
      issues.push({ kind: 'stockReduced', nom: product.nom, requested: item.quantity, available: product.stock });
      next.quantity = product.stock;
    }

    const current = snapshotOf(product);
    if (!samePrices(held.priceSnapshots[item.productId], current)) {
      const before = held.priceSnapshots[item.productId]?.prixVente ?? item.prixVente;
      const negotiationDropped = !!item.negotiated;
      const { negotiated: _drop, ...rest } = next;
      next = { ...rest, prixVente: product.prixVente, prixUnitaire: product.prixVente };
      issues.push({ kind: 'priceChanged', nom: product.nom, before, after: product.prixVente, negotiationDropped });
    }

    items.push(next);
  }

  return { items, issues };
}

// ─── Persistance locale, propre à ce poste ─────────────────────────────────────
function storageKey(): string {
  return `legwan-held-sales-${getRegisterCode()}`;
}

function isHeldSale(value: unknown): value is HeldSale {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<HeldSale>;
  return typeof v.id === 'string'
    && typeof v.heldAt === 'string'
    && Array.isArray(v.items)
    && v.items.every(i => i && typeof i.productId === 'string' && typeof i.quantity === 'number')
    && typeof v.paymentMode === 'string';
}

export function loadHeldSales(): HeldSale[] {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHeldSale).map(h => ({
      ...h,
      label: typeof h.label === 'string' ? h.label : '',
      priceSnapshots: h.priceSnapshots && typeof h.priceSnapshots === 'object' ? h.priceSnapshots : {},
      discount: Number.isFinite(h.discount) ? h.discount : 0,
    }));
  } catch {
    return [];
  }
}

function persist(heldSales: HeldSale[]): void {
  try {
    if (heldSales.length === 0) localStorage.removeItem(storageKey());
    else localStorage.setItem(storageKey(), JSON.stringify(heldSales));
  } catch {
    /* localStorage indisponible : la liste reste en mémoire pour la session */
  }
}

function newId(): string {
  return `held-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}

interface HeldSaleState {
  heldSales: HeldSale[];
  /**
   * Met le panier courant de côté et le vide. Lève une erreur si le panier est
   * vide. Ne touche ni au stock ni au compteur de reçus.
   */
  holdCurrentCart: (meta: HoldMeta, products: Product[]) => HeldSale;
  /**
   * Remplace le panier courant par la vente en attente, après vérification
   * contre le catalogue, et la retire de la liste. Lève une erreur si le panier
   * courant n'est pas vide : l'appelant doit d'abord le mettre en attente.
   */
  resumeHeldSale: (id: string, products: Product[]) => ResumeResult;
  removeHeldSale: (id: string) => void;
  clearAll: () => void;
  /** Relit le stockage local (après un changement de code-caisse, en test). */
  _reload: () => void;
}

export const useHeldSaleStore = create<HeldSaleState>()((set, get) => ({
  heldSales: loadHeldSales(),

  holdCurrentCart: (meta, products) => {
    const { cart, discount, clearCart } = useSaleStore.getState();
    if (cart.length === 0) throw new Error('Panier vide : rien à mettre en attente');

    const priceSnapshots: Record<string, HeldPriceSnapshot> = {};
    for (const item of cart) {
      const product = products.find(p => p.id === item.productId);
      if (product) priceSnapshots[item.productId] = snapshotOf(product);
    }

    const label = (meta.label ?? '').trim() || (meta.customerName ?? '').trim();
    const held: HeldSale = {
      id: newId(),
      heldAt: new Date().toISOString(),
      label,
      // Copie profonde, identique à ce qui sera relu du disque.
      items: JSON.parse(JSON.stringify(cart)) as CartItem[],
      priceSnapshots,
      discount,
      discountAuthorizedBy: meta.discountAuthorizedBy ?? undefined,
      customerId: meta.customerId,
      customerName: meta.customerName,
      paymentMode: meta.paymentMode,
      mobileOperator: meta.mobileOperator,
      dueDate: meta.dueDate || undefined,
      heldByUserId: meta.userId,
      heldByUserName: meta.userName,
    };
    const next = [...get().heldSales, held];
    persist(next);
    set({ heldSales: next });
    clearCart();
    return held;
  },

  resumeHeldSale: (id, products) => {
    const held = get().heldSales.find(h => h.id === id);
    if (!held) throw new Error('Vente en attente introuvable');
    if (useSaleStore.getState().cart.length > 0) {
      throw new Error('Le panier courant n\'est pas vide');
    }

    const { items, issues } = reconcileHeldSale(held, products);
    useSaleStore.setState({ cart: items, discount: held.discount });

    const next = get().heldSales.filter(h => h.id !== id);
    persist(next);
    set({ heldSales: next });

    return {
      held,
      issues,
      discountAuthorizationKept: !!held.discountAuthorizedBy && issues.length === 0,
    };
  },

  removeHeldSale: (id) => {
    const next = get().heldSales.filter(h => h.id !== id);
    persist(next);
    set({ heldSales: next });
  },

  clearAll: () => {
    persist([]);
    set({ heldSales: [] });
  },

  _reload: () => set({ heldSales: loadHeldSales() }),
}));

/** Total indicatif d'une vente en attente, aux prix mémorisés. */
export function heldSaleTotal(held: HeldSale): number {
  const subtotal = held.items.reduce((sum, item) => sum + (item.prixUnitaire ?? item.prixVente) * item.quantity, 0);
  return Math.round(subtotal * (1 - held.discount / 100));
}

export function heldSaleItemCount(held: HeldSale): number {
  return held.items.reduce((sum, item) => sum + item.quantity, 0);
}
