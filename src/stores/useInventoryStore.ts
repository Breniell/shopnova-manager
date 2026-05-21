/**
 * useInventoryStore — sessions d'inventaire & réconciliation de stock.
 *
 * Concept :
 *   Un inventaire = comparer le stock théorique (calculé par l'app) avec le
 *   stock physique compté à la main. Les écarts détectés sont qualifiés
 *   (avarié, vol, casse, ...) et donnent lieu à des mouvements de stock
 *   d'ajustement.
 *
 * Cycle de vie d'une InventorySession :
 *   draft     → session créée, lignes générées, rien validé
 *   in_progress → au moins une ligne saisie
 *   validated → session figée, mouvements de stock générés, stocks à jour
 *   cancelled → session annulée sans effet sur les stocks
 *
 * Garde-fou métier : à la validation, toutes les lignes avec écart ≠ 0
 * DOIVENT avoir un motif renseigné. Sinon `validateSession` retourne
 * { success: false, missingReasons: [productNames] } et le composant
 * affiche les produits problématiques.
 */
import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import {
  fsSaveInventorySession,
  fsDeleteInventorySession,
} from '@/services/firestoreService';
import type { Product } from '@/stores/useProductStore';
import type { AdjustmentReason } from '@/stores/useStockStore';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type InventoryStatus = 'draft' | 'in_progress' | 'validated' | 'cancelled';

export type InventoryScope = 'complet' | 'categorie' | 'manuel';

export interface InventoryLine {
  productId: string;
  productName: string;          // dénormalisé pour préserver l'identité même si le produit est renommé
  stockTheorique: number;       // stock du produit au moment de la création de la session
  stockCompte: number | null;   // null = pas encore compté
  ecart: number;                // calculé : stockCompte - stockTheorique
  reason?: AdjustmentReason;    // obligatoire si ecart != 0 à la validation
  notes?: string;
}

export interface InventorySession {
  id: string;
  numero: string;                 // ex: INV-2026-001
  scope: InventoryScope;
  scopeCategorie?: string;        // si scope='categorie'
  status: InventoryStatus;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  validatedAt?: string;
  validatedBy?: string;
  validatedByName?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  lines: InventoryLine[];
  totalEcartQty?: number;         // somme algébrique des écarts en quantité
  totalEcartValue?: number;       // valorisation des écarts au prix d'achat
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

interface InventoryState {
  sessions: InventorySession[];

  _setSessions: (sessions: InventorySession[]) => void;

  /**
   * Crée une nouvelle session d'inventaire en mode draft.
   * Génère une ligne par produit fourni avec stockTheorique = product.stock.
   */
  createSession: (params: {
    scope: InventoryScope;
    scopeCategorie?: string;
    products: Product[];
    userId: string;
    userName: string;
    notes?: string;
  }) => InventorySession;

  /**
   * Met à jour une ligne d'une session. Recalcule l'écart automatiquement.
   * Passe la session en 'in_progress' si elle était en 'draft'.
   * Refuse si la session est déjà validée ou annulée.
   */
  updateLine: (sessionId: string, productId: string, data: Partial<Omit<InventoryLine, 'productId' | 'productName' | 'ecart'>>) => void;

  /**
   * Met à jour les notes d'une session.
   */
  updateNotes: (sessionId: string, notes: string) => void;

  /**
   * Annule une session draft / in_progress (sans effet sur les stocks).
   */
  cancelSession: (sessionId: string, userId: string) => void;

  /**
   * Valide la session : crée les StockMovement d'ajustement,
   * met à jour les stocks produits, marque la session 'validated'.
   *
   * Retourne :
   *   { success: true, session } si OK
   *   { success: false, missingReasons } si des lignes ont un écart sans motif
   *
   * NOTE : cette fonction reçoit deux callbacks externes pour ne pas dépendre
   * directement de useStockStore / useProductStore (évite les cycles d'import
   * et facilite le test). Les callbacks sont fournis par la page Inventaire.
   */
  validateSession: (
    sessionId: string,
    userId: string,
    userName: string,
    deps: {
      getProductPrixAchat: (productId: string) => number;
      addMovementAndUpdateStock: (params: {
        productId: string;
        productName: string;
        ecart: number;
        stockTheorique: number;
        stockCompte: number;
        reason: AdjustmentReason;
        notes?: string;
        inventorySessionId: string;
        userId: string;
        userName: string;
      }) => void;
    }
  ) => { success: true; session: InventorySession } | { success: false; missingReasons: string[] };

  // Sélecteurs
  getOpenSessions: () => InventorySession[];
  getValidatedInRange: (start: Date, end: Date) => InventorySession[];
}

/** Génère le prochain numéro de session au format INV-{année}-{compteur 3 chiffres}. */
const nextNumero = (sessions: InventorySession[]): string => {
  const year = new Date().getFullYear();
  const sameYear = sessions.filter(s => s.numero.startsWith(`INV-${year}-`));
  const max = sameYear.reduce((m, s) => {
    const n = parseInt(s.numero.slice(`INV-${year}-`.length), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `INV-${year}-${String(max + 1).padStart(3, '0')}`;
};

export const useInventoryStore = create<InventoryState>()((set, get) => ({
  sessions: [],

  _setSessions: (sessions) => set({ sessions }),

  createSession: ({ scope, scopeCategorie, products, userId, userName, notes }) => {
    if (products.length === 0) {
      throw new Error('Aucun produit dans le périmètre de l\'inventaire');
    }
    const id = 'inv' + Date.now() + Math.random().toString(36).slice(2, 7);
    const numero = nextNumero(get().sessions);

    const lines: InventoryLine[] = products.map(p => ({
      productId: p.id,
      productName: p.nom,
      stockTheorique: p.stock,
      stockCompte: null,
      ecart: 0,
    }));

    const session: InventorySession = {
      id,
      numero,
      scope,
      scopeCategorie,
      status: 'draft',
      createdAt: new Date().toISOString(),
      createdBy: userId,
      createdByName: userName,
      lines,
      notes,
    };

    set(state => ({ sessions: [session, ...state.sessions] }));
    fsSaveInventorySession(getBoutiqueId(), session).catch(console.error);
    return session;
  },

  updateLine: (sessionId, productId, data) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session introuvable');
    if (session.status === 'validated' || session.status === 'cancelled') {
      throw new Error('Session figée, modification impossible');
    }

    const updated: InventorySession = {
      ...session,
      status: 'in_progress',
      lines: session.lines.map(line => {
        if (line.productId !== productId) return line;
        const merged = { ...line, ...data };
        // Recalcul automatique de l'écart
        const ecart = merged.stockCompte !== null
          ? merged.stockCompte - merged.stockTheorique
          : 0;
        return { ...merged, ecart };
      }),
    };

    set(state => ({ sessions: state.sessions.map(s => s.id === sessionId ? updated : s) }));
    fsSaveInventorySession(getBoutiqueId(), updated).catch(console.error);
  },

  updateNotes: (sessionId, notes) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session introuvable');
    if (session.status === 'validated' || session.status === 'cancelled') return;
    const updated = { ...session, notes };
    set(state => ({ sessions: state.sessions.map(s => s.id === sessionId ? updated : s) }));
    fsSaveInventorySession(getBoutiqueId(), updated).catch(console.error);
  },

  cancelSession: (sessionId, userId) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session introuvable');
    if (session.status === 'validated') {
      throw new Error('Une session validée ne peut pas être annulée');
    }
    const updated: InventorySession = {
      ...session,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelledBy: userId,
    };
    set(state => ({ sessions: state.sessions.map(s => s.id === sessionId ? updated : s) }));
    fsSaveInventorySession(getBoutiqueId(), updated).catch(console.error);
  },

  validateSession: (sessionId, userId, userName, deps) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session introuvable');
    if (session.status === 'validated') throw new Error('Session déjà validée');
    if (session.status === 'cancelled') throw new Error('Session annulée, impossible de valider');

    // Lignes avec écart et sans motif → bloquant
    const linesWithEcart = session.lines.filter(l => l.stockCompte !== null && l.ecart !== 0);
    const missingReasons = linesWithEcart
      .filter(l => !l.reason)
      .map(l => l.productName);
    if (missingReasons.length > 0) {
      return { success: false, missingReasons };
    }

    // Génération des mouvements d'ajustement + maj des stocks via callback
    let totalEcartQty = 0;
    let totalEcartValue = 0;
    linesWithEcart.forEach(line => {
      const prixAchat = deps.getProductPrixAchat(line.productId);
      totalEcartQty += line.ecart;
      totalEcartValue += line.ecart * prixAchat; // négatif si perte

      deps.addMovementAndUpdateStock({
        productId: line.productId,
        productName: line.productName,
        ecart: line.ecart,
        stockTheorique: line.stockTheorique,
        stockCompte: line.stockCompte!,
        reason: line.reason!,
        notes: line.notes,
        inventorySessionId: sessionId,
        userId,
        userName,
      });
    });

    const validated: InventorySession = {
      ...session,
      status: 'validated',
      validatedAt: new Date().toISOString(),
      validatedBy: userId,
      validatedByName: userName,
      totalEcartQty,
      totalEcartValue,
    };

    set(state => ({ sessions: state.sessions.map(s => s.id === sessionId ? validated : s) }));
    fsSaveInventorySession(getBoutiqueId(), validated).catch(console.error);
    return { success: true, session: validated };
  },

  getOpenSessions: () =>
    get().sessions.filter(s => s.status === 'draft' || s.status === 'in_progress'),

  getValidatedInRange: (start, end) =>
    get().sessions.filter(s => {
      if (s.status !== 'validated' || !s.validatedAt) return false;
      const d = new Date(s.validatedAt);
      return d >= start && d <= end;
    }),
}));
