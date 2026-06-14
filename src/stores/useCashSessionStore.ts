/**
 * useCashSessionStore — sessions de caisse et sorties exceptionnelles.
 *
 * Une SESSION = un cycle ouverture → ventes/règlements/sorties → clôture,
 * attaché à un caissier précis avec son fond initial déclaré. Le but est
 * de pouvoir attribuer un écart de caisse à la bonne personne et à la
 * bonne plage horaire (matin/après-midi, changement d'équipe).
 *
 * Un CASHOUT = sortie d'argent depuis la caisse pendant une session :
 *   • avance de salaire au caissier
 *   • prêt patron/gérant
 *   • remboursement client en espèces
 *   • achat impulsif auprès d'un fournisseur de passage
 *   • dépense payée espèces (liée automatiquement à une Expense)
 *   • autre
 *
 * Une dépense payée en espèces génère automatiquement un CashOut sur la
 * session active (cf. DepensesPage). C'est ce qui résout la limite documentée
 * en v1.1.3.
 */
import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveCashSession, fsSaveCashOut, fsDeleteCashOut } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type CashSessionStatus = 'open' | 'closed';

export interface CashSession {
  id: string;
  openedAt: string;             // ISO
  closedAt?: string;            // ISO si status='closed'
  userId: string;
  userName: string;
  fondInitial: number;          // déclaré à l'ouverture
  notesOuverture?: string;

  // Champs renseignés à la clôture
  totalCompte?: number;         // montant compté physiquement
  details?: Record<string, number>; // dénominations
  ecart?: number;
  notesCloture?: string;

  status: CashSessionStatus;
}

export type CashOutType =
  | 'avance_salaire'    // avance au caissier
  | 'pret'              // prêt patron/gérant
  | 'remboursement'     // remboursement client en espèces
  | 'achat_impulsif'    // achat imprévu auprès d'un fournisseur
  | 'depense_caisse'    // lien avec Expense (déclenché par DepensesPage)
  | 'autre';

export interface CashOut {
  id: string;
  cashSessionId: string;
  date: Date;
  type: CashOutType;
  amount: number;                 // > 0
  beneficiaire?: string;
  motif: string;
  relatedExpenseId?: string;      // lien vers Expense si type='depense_caisse'
  userId: string;
  userName: string;
}

export const CASHOUT_TYPE_LABELS: Record<CashOutType, string> = {
  avance_salaire:   'Avance salaire',
  pret:             'Prêt',
  remboursement:    'Remboursement client',
  achat_impulsif:   'Achat impulsif',
  depense_caisse:   'Dépense (caisse)',
  autre:            'Autre',
};

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

interface CashSessionState {
  sessions: CashSession[];
  cashOuts: CashOut[];
  /** ID de la session active de l'utilisateur connecté, ou null si aucune. */
  currentSessionId: string | null;

  _setSessions: (sessions: CashSession[]) => void;
  _setCashOuts: (cashOuts: CashOut[]) => void;
  _setCurrentSessionId: (id: string | null) => void;

  /**
   * Ouvre une nouvelle session. Throw si l'utilisateur a déjà une session ouverte.
   * Retourne la session créée et la définit comme courante.
   */
  openSession: (params: {
    userId: string;
    userName: string;
    fondInitial: number;
    notesOuverture?: string;
  }) => CashSession;

  /**
   * Ferme une session en enregistrant le comptage et l'écart.
   * Si la session courante est fermée, currentSessionId redevient null.
   */
  closeSession: (
    sessionId: string,
    payload: {
      totalCompte: number;
      details?: Record<string, number>;
      ecart: number;
      notesCloture?: string;
    }
  ) => void;

  addCashOut: (cashOut: Omit<CashOut, 'id'>) => CashOut;
  deleteCashOut: (id: string) => void;

  // Sélecteurs purs (les fonctions lourdes prennent sales/payments en argument)
  getCurrentSession: () => CashSession | null;
  getOpenSessionForUser: (userId: string) => CashSession | null;
  getSessionCashOuts: (sessionId: string) => CashOut[];
}

export const useCashSessionStore = create<CashSessionState>()((set, get) => ({
  sessions: [],
  cashOuts: [],
  currentSessionId: null,

  _setSessions: (sessions) => set({ sessions }),
  _setCashOuts: (cashOuts) => set({ cashOuts }),
  _setCurrentSessionId: (id) => set({ currentSessionId: id }),

  openSession: ({ userId, userName, fondInitial, notesOuverture }) => {
    // Garde-fou : un utilisateur ne peut pas avoir 2 sessions ouvertes simultanément
    const existing = get().sessions.find(s => s.status === 'open' && s.userId === userId);
    if (existing) {
      throw new Error('Une session est déjà ouverte pour cet utilisateur');
    }
    if (!Number.isFinite(fondInitial) || fondInitial < 0) {
      throw new Error('Fond de caisse invalide');
    }

    const id = 'sess' + Date.now() + Math.random().toString(36).slice(2, 7);
    const session: CashSession = {
      id,
      openedAt: new Date().toISOString(),
      userId,
      userName,
      fondInitial,
      notesOuverture,
      status: 'open',
    };

    set(state => ({
      sessions: [session, ...state.sessions],
      currentSessionId: id,
    }));
    fsSaveCashSession(getBoutiqueId(), session).catch((err) => {
      enqueue('cashSession', session);
      toast.error("Échec d'enregistrement — nouvelle tentative automatique");
      console.warn('[outbox] cashSession enqueued:', err);
    });
    return session;
  },

  closeSession: (sessionId, { totalCompte, details, ecart, notesCloture }) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session introuvable');
    if (session.status === 'closed') throw new Error('Session déjà clôturée');

    const closed: CashSession = {
      ...session,
      closedAt: new Date().toISOString(),
      totalCompte,
      details,
      ecart,
      notesCloture,
      status: 'closed',
    };

    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? closed : s),
      currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
    }));
    fsSaveCashSession(getBoutiqueId(), closed).catch((err) => {
      enqueue('cashSession', closed);
      toast.error("Échec d'enregistrement — nouvelle tentative automatique");
      console.warn('[outbox] cashSession (close) enqueued:', err);
    });
  },

  addCashOut: (data) => {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('Montant invalide');
    }
    const id = 'co' + Date.now() + Math.random().toString(36).slice(2, 7);
    const cashOut: CashOut = { ...data, id };
    set(state => ({ cashOuts: [cashOut, ...state.cashOuts] }));
    fsSaveCashOut(getBoutiqueId(), cashOut).catch((err) => {
      enqueue('cashOut', cashOut);
      toast.error("Échec d'enregistrement — nouvelle tentative automatique");
      console.warn('[outbox] cashOut enqueued:', err);
    });
    return cashOut;
  },

  deleteCashOut: (id) => {
    set(state => ({ cashOuts: state.cashOuts.filter(c => c.id !== id) }));
    fsDeleteCashOut(getBoutiqueId(), id).catch(console.error);
  },

  getCurrentSession: () => {
    const { sessions, currentSessionId } = get();
    if (!currentSessionId) return null;
    return sessions.find(s => s.id === currentSessionId) ?? null;
  },

  getOpenSessionForUser: (userId) => {
    return get().sessions.find(s => s.status === 'open' && s.userId === userId) ?? null;
  },

  getSessionCashOuts: (sessionId) =>
    get().cashOuts.filter(c => c.cashSessionId === sessionId),
}));
