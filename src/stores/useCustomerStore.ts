import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveCustomer, fsDeleteCustomer } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';

/**
 * Customer (Client) — fiche client de la boutique.
 *
 * Notes de design :
 *   • `telephone` est la clé fonctionnelle unique (deux clients ne peuvent pas
 *     avoir le même téléphone). L'ajout d'un doublon throw une erreur.
 *   • `archived` permet d'enlever un client de l'usage courant sans perdre
 *     son historique d'achats. Préférer l'archivage à la suppression.
 *   • `plafondCredit` est utilisé en Étape 2 (Crédit). Stocké ici dès maintenant
 *     pour ne pas avoir à migrer plus tard.
 *   • La balance crédit n'est PAS stockée ici : elle se calcule depuis les
 *     ventes à crédit + paiements. C'est volontaire (cf. legwan-phase1-specs).
 */
export interface Customer {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  email?: string;
  adresse?: string;
  notes?: string;
  dateCreation: string;      // ISO string
  plafondCredit?: number;    // 0 = pas de crédit autorisé ; undefined = pas de limite
  color: string;             // pour l'avatar coloré (palette ci-dessous)
  archived: boolean;         // un client archivé n'apparaît plus dans la recherche par défaut
}

/** Palette utilisée pour générer la couleur d'avatar d'un nouveau client. */
const CUSTOMER_COLORS = [
  '#A93200', // brique Legwan
  '#2B6954', // vert Legwan
  '#3B82F6', // bleu
  '#8B5CF6', // violet
  '#F59E0B', // orange
  '#EC4899', // rose
  '#10B981', // émeraude
  '#06B6D4', // cyan
];

interface CustomerState {
  customers: Customer[];

  /** Internal: called by FirebaseProvider on startup */
  _setCustomers: (customers: Customer[]) => void;

  /**
   * Crée un nouveau client. Throw si un client actif a déjà ce téléphone.
   * Retourne le client créé (utile pour récupérer l'id à la caisse).
   */
  addCustomer: (data: Omit<Customer, 'id' | 'dateCreation' | 'color' | 'archived'>) => Customer;

  updateCustomer: (id: string, data: Partial<Customer>) => void;

  /**
   * Archive un client : il disparaît de la recherche par défaut, mais
   * son historique est préservé.
   */
  archiveCustomer: (id: string) => void;
  unarchiveCustomer: (id: string) => void;

  /**
   * Suppression définitive. À n'utiliser que pour un client sans historique.
   * Le composant appelant doit vérifier l'absence de ventes/paiements avant.
   */
  deleteCustomer: (id: string) => void;

  // Sélecteurs
  getCustomerById: (id: string) => Customer | undefined;
  getCustomerByPhone: (telephone: string) => Customer | undefined;
  /**
   * Recherche par nom OU téléphone, insensible à la casse et aux espaces.
   * Par défaut, les archivés sont exclus.
   */
  searchCustomers: (query: string, options?: { includeArchived?: boolean }) => Customer[];
}

/** Normalise un numéro de téléphone pour la comparaison (retire espaces et +). */
const normalizePhone = (phone: string): string =>
  phone.replace(/[\s+\-.()]/g, '');

export const useCustomerStore = create<CustomerState>()((set, get) => ({
  customers: [],

  _setCustomers: (customers) => set({ customers }),

  addCustomer: (data) => {
    const state = get();
    const normalized = normalizePhone(data.telephone);

    // Anti-doublon : on bloque seulement si un client actif a déjà ce numéro.
    // Un numéro archivé peut être réutilisé (cas: même téléphone, nouvelle personne).
    const duplicate = state.customers.find(
      c => !c.archived && normalizePhone(c.telephone) === normalized
    );
    if (duplicate) {
      throw new Error(
        `Un client actif existe déjà avec ce numéro : ${duplicate.prenom} ${duplicate.nom}`
      );
    }

    // ID = timestamp + suffixe random pour éviter les collisions si plusieurs
    // créations dans la même milliseconde (cas: bulk insert, tests, scripts).
    const id = 'cust' + Date.now() + Math.random().toString(36).slice(2, 7);
    const color = CUSTOMER_COLORS[state.customers.length % CUSTOMER_COLORS.length];
    const newCustomer: Customer = {
      ...data,
      id,
      color,
      dateCreation: new Date().toISOString(),
      archived: false,
    };
    set(state => ({ customers: [...state.customers, newCustomer] }));
    fsSaveCustomer(getBoutiqueId(), newCustomer).catch((error) => {
      enqueue('customerSave', newCustomer);
      toast.error("Client en attente de synchronisation");
      console.warn('[outbox] customer create enqueued:', error);
    });
    return newCustomer;
  },

  updateCustomer: (id, data) => {
    set(state => ({
      customers: state.customers.map(c => c.id === id ? { ...c, ...data } : c),
    }));
    const updated = get().customers.find(c => c.id === id);
    if (updated) fsSaveCustomer(getBoutiqueId(), updated).catch((error) => {
      enqueue('customerSave', updated);
      toast.error("Modification client en attente de synchronisation");
      console.warn('[outbox] customer update enqueued:', error);
    });
  },

  archiveCustomer: (id) => {
    get().updateCustomer(id, { archived: true });
  },

  unarchiveCustomer: (id) => {
    get().updateCustomer(id, { archived: false });
  },

  deleteCustomer: (id) => {
    set(state => ({ customers: state.customers.filter(c => c.id !== id) }));
    fsDeleteCustomer(getBoutiqueId(), id).catch((error) => {
      enqueue('customerDelete', id);
      toast.error("Suppression client en attente de synchronisation");
      console.warn('[outbox] customer delete enqueued:', error);
    });
  },

  getCustomerById: (id) => get().customers.find(c => c.id === id),

  getCustomerByPhone: (telephone) => {
    const normalized = normalizePhone(telephone);
    return get().customers.find(
      c => !c.archived && normalizePhone(c.telephone) === normalized
    );
  },

  searchCustomers: (query, options = {}) => {
    const { includeArchived = false } = options;
    const q = query.toLowerCase().trim();
    let list = get().customers;
    if (!includeArchived) {
      list = list.filter(c => !c.archived);
    }
    if (!q) return list;
    const normalizedQuery = normalizePhone(q);
    return list.filter(c =>
      c.prenom.toLowerCase().includes(q) ||
      c.nom.toLowerCase().includes(q) ||
      `${c.prenom} ${c.nom}`.toLowerCase().includes(q) ||
      normalizePhone(c.telephone).includes(normalizedQuery)
    );
  },
}));
