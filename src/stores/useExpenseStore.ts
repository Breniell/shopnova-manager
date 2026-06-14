/**
 * useExpenseStore — dépenses opérationnelles de la boutique.
 *
 * Une dépense = sortie d'argent qui n'est pas un remboursement de vente :
 * loyer, électricité, eau, transport, salaires, achats marchandises, etc.
 *
 * Impact métier :
 *   • Permet de calculer le bénéfice NET (CA – COGS – Dépenses)
 *   • Sans ce module, on confond chiffre d'affaires et profit, c'est l'erreur
 *     classique des commerçants débutants.
 *
 * Note : si une dépense est payée en espèces depuis la caisse, elle sort
 * physiquement du tiroir. Pour Phase 1, on documente cette logique au
 * niveau UI (info dans la page) sans la lier automatiquement à la clôture.
 * À industrialiser en Phase 2 avec les sessions de caisse (CashOut).
 */
import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveExpense, fsDeleteExpense } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | 'loyer'
  | 'electricite'
  | 'eau'
  | 'internet_telephone'
  | 'transport'
  | 'salaires'
  | 'achats_marchandises'    // achats stock hors workflow d'entrée stock
  | 'maintenance'
  | 'marketing'
  | 'taxes_impots'
  | 'frais_bancaires'
  | 'autre';

export type ExpensePaymentMode = 'especes' | 'mobile_money' | 'virement' | 'cheque';

export interface Expense {
  id: string;
  date: Date;
  categorie: ExpenseCategory;
  description: string;            // max 200 char (validé par Zod)
  montant: number;                // FCFA, > 0
  paymentMode: ExpensePaymentMode;
  beneficiaire?: string;          // "Eneo", "Bailleur X", "MTN"...
  reference?: string;             // n° facture, ref MoMo, n° chèque
  justificatifUrl?: string;       // upload photo — pour évolution future, vide en v1.1.3
  userId: string;                 // qui a saisi
  userName: string;
  notes?: string;
}

/** Métadonnées d'affichage par catégorie (label FR + couleur pour graphiques). */
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; color: string }[] = [
  { value: 'loyer',                label: 'Loyer',                color: '#8B5CF6' },
  { value: 'electricite',          label: 'Électricité',          color: '#F59E0B' },
  { value: 'eau',                  label: 'Eau',                  color: '#3B82F6' },
  { value: 'internet_telephone',   label: 'Internet & téléphone', color: '#06B6D4' },
  { value: 'transport',            label: 'Transport',            color: '#10B981' },
  { value: 'salaires',             label: 'Salaires',             color: '#EC4899' },
  { value: 'achats_marchandises',  label: 'Achats marchandises',  color: '#6366F1' },
  { value: 'maintenance',          label: 'Maintenance',          color: '#84CC16' },
  { value: 'marketing',            label: 'Marketing & com.',     color: '#F472B6' },
  { value: 'taxes_impots',         label: 'Taxes & impôts',       color: '#EF4444' },
  { value: 'frais_bancaires',      label: 'Frais bancaires',      color: '#6B7280' },
  { value: 'autre',                label: 'Autre',                color: '#64748B' },
];

/** Lookup rapide label/couleur depuis la valeur enum. */
export const getCategoryMeta = (cat: ExpenseCategory) =>
  EXPENSE_CATEGORIES.find(c => c.value === cat) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

export const PAYMENT_MODE_LABELS: Record<ExpensePaymentMode, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  virement: 'Virement',
  cheque: 'Chèque',
};

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

interface ExpenseState {
  expenses: Expense[];

  _setExpenses: (expenses: Expense[]) => void;

  /** Ajoute une dépense. Retourne l'Expense créée. */
  addExpense: (data: Omit<Expense, 'id'>) => Expense;

  updateExpense: (id: string, data: Partial<Omit<Expense, 'id'>>) => void;

  deleteExpense: (id: string) => void;

  // ── Sélecteurs ────────────────────────────────────────────────────────────

  /** Toutes les dépenses dans une plage de dates (inclusive). */
  getExpensesInRange: (start: Date, end: Date) => Expense[];

  /** Total des dépenses dans une plage de dates. */
  getTotalInRange: (start: Date, end: Date) => number;

  /** Total par catégorie dans une plage de dates. */
  getByCategoryInRange: (start: Date, end: Date) => Record<ExpenseCategory, number>;
}

export const useExpenseStore = create<ExpenseState>()((set, get) => ({
  expenses: [],

  _setExpenses: (expenses) => set({ expenses }),

  addExpense: (data) => {
    // ID avec random suffix pour éviter les collisions (cf. bug fixé v1.1.1)
    const id = 'exp' + Date.now() + Math.random().toString(36).slice(2, 7);
    const newExpense: Expense = { ...data, id };
    set(state => ({ expenses: [newExpense, ...state.expenses] }));
    fsSaveExpense(getBoutiqueId(), newExpense).catch((err) => {
      enqueue('expense', newExpense);
      toast.error("Échec d'enregistrement — nouvelle tentative automatique");
      console.warn('[outbox] expense enqueued:', err);
    });
    return newExpense;
  },

  updateExpense: (id, data) => {
    set(state => ({
      expenses: state.expenses.map(e => e.id === id ? { ...e, ...data } : e),
    }));
    const updated = get().expenses.find(e => e.id === id);
    if (updated) fsSaveExpense(getBoutiqueId(), updated).catch((err) => {
      enqueue('expense', updated);
      toast.error("Échec d'enregistrement — nouvelle tentative automatique");
      console.warn('[outbox] expense (update) enqueued:', err);
    });
  },

  deleteExpense: (id) => {
    set(state => ({ expenses: state.expenses.filter(e => e.id !== id) }));
    fsDeleteExpense(getBoutiqueId(), id).catch(console.error);
  },

  getExpensesInRange: (start, end) =>
    get().expenses.filter(e => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    }),

  getTotalInRange: (start, end) =>
    get().getExpensesInRange(start, end).reduce((sum, e) => sum + e.montant, 0),

  getByCategoryInRange: (start, end) => {
    const initial = EXPENSE_CATEGORIES.reduce((acc, c) => {
      acc[c.value] = 0;
      return acc;
    }, {} as Record<ExpenseCategory, number>);
    return get().getExpensesInRange(start, end).reduce((acc, e) => {
      acc[e.categorie] = (acc[e.categorie] ?? 0) + e.montant;
      return acc;
    }, initial);
  },
}));
