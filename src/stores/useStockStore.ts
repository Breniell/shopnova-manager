import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveMovement } from '@/services/firestoreService';

export type MovementType = 'entrée' | 'vente' | 'ajustement';

/**
 * Motif d'un mouvement de stock de type 'ajustement'.
 * Utilisé essentiellement par les sessions d'inventaire pour catégoriser
 * les écarts détectés (pertes / gains).
 */
export type AdjustmentReason =
  | 'avarie'                 // produit endommagé / pourri
  | 'casse'                  // bouteille cassée, etc.
  | 'vol'                    // disparition / vol présumé
  | 'peremption'             // date dépassée
  | 'erreur_saisie'          // correction d'une erreur antérieure
  | 'consommation_interne'   // consommé par le personnel
  | 'cadeau_don'             // offert (client fidèle, association)
  | 'non_identifie';         // écart sans explication

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  avarie:               'Avarié / endommagé',
  casse:                'Casse',
  vol:                  'Vol / disparition',
  peremption:           'Périmé',
  erreur_saisie:        'Erreur de saisie',
  consommation_interne: 'Consommation interne',
  cadeau_don:           'Cadeau / don',
  non_identifie:        'Non identifié',
};

export interface StockMovement {
  id: string;
  date: Date;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  userId: string;
  userName: string;
  supplier?: string;
  unitPrice?: number;
  notes?: string;
  // ─── Inventaire (v1.3) ──────────────────────────────────────────────────
  // Renseigné quand type='ajustement' et que la cause est connue.
  reason?: AdjustmentReason;
  // Lien vers la session d'inventaire qui a généré ce mouvement.
  inventorySessionId?: string;
}

interface StockState {
  movements: StockMovement[];

  /** Internal: called by FirebaseProvider on startup */
  _setMovements: (movements: StockMovement[]) => void;

  addMovement: (movement: Omit<StockMovement, 'id'>) => StockMovement;
}

export const useStockStore = create<StockState>()((set) => ({
  movements: [],

  _setMovements: (movements) => set({ movements }),

  addMovement: (movement) => {
    // ID avec random suffix pour éviter les collisions (cf. bug fixé v1.1.1)
    const id = 'm' + Date.now() + Math.random().toString(36).slice(2, 7);
    const newMovement: StockMovement = { ...movement, id };
    set(state => ({ movements: [newMovement, ...state.movements] }));
    fsSaveMovement(getBoutiqueId(), newMovement).catch(console.error);
    return newMovement;
  },
}));
