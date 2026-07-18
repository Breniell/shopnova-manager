import { create } from 'zustand';
import { validateStockCommit, type StockCommitPayload } from '@/services/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase';
import { enqueue, retryAll } from '@/lib/outbox';
import { runLocalStateTransaction } from '@/lib/localStateTransaction';
import { useProductStore } from '@/stores/useProductStore';
import { toast } from 'sonner';

export type MovementType = 'entrée' | 'vente' | 'ajustement';

export type AdjustmentReason =
  | 'avarie'
  | 'casse'
  | 'vol'
  | 'peremption'
  | 'erreur_saisie'
  | 'consommation_interne'
  | 'cadeau_don'
  | 'non_identifie';

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
  /** Stable identifier of the atomic business operation that created it. */
  operationId?: string;
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
  reason?: AdjustmentReason;
  inventorySessionId?: string;
}

type ManualStockChange = Omit<
  StockMovement,
  'id' | 'operationId' | 'stockBefore' | 'stockAfter'
> & { type: Extract<MovementType, 'entrée' | 'ajustement'> };

interface StockState {
  movements: StockMovement[];
  /** Internal: called by FirebaseProvider on startup. */
  _setMovements: (movements: StockMovement[]) => void;
  /** Atomically records a manual stock delta and its immutable movement. */
  commitStockChange: (movement: ManualStockChange) => StockMovement;
}

export const useStockStore = create<StockState>()((set) => ({
  movements: [],

  _setMovements: (movements) => set({ movements }),

  commitStockChange: (movement) => {
    if (!Number.isInteger(movement.quantity) || movement.quantity === 0) {
      throw new Error('Quantité de stock invalide');
    }
    if (movement.type === 'entrée' && movement.quantity < 0) {
      throw new Error('Une entrée de stock doit être positive');
    }
    const product = useProductStore.getState().products.find(item => item.id === movement.productId);
    if (!product) throw new Error('Produit introuvable');
    if (product.stock + movement.quantity < 0) {
      throw new Error('Le stock ne peut pas devenir négatif');
    }

    const id = 'm' + Date.now() + Math.random().toString(36).slice(2, 7);
    const operationId = `stock-${id}`;
    const newMovement: StockMovement = {
      ...movement,
      id,
      operationId,
      stockBefore: product.stock,
      stockAfter: product.stock + movement.quantity,
    };
    const payload: StockCommitPayload = {
      operation: {
        operationId,
        kind: 'manual',
        date: movement.date,
        userId: movement.userId,
        userName: movement.userName,
      },
      stockDeltas: [{ productId: movement.productId, delta: movement.quantity }],
      movements: [newMovement],
    };
    validateStockCommit(payload);

    // Write-ahead journal: after a crash, the whole operation is replayed or
    // none of it is. Local-only installations persist the final snapshot below.
    if (isFirebaseConfigured) {
      const queued = enqueue('stockCommit', payload);
      if (!queued.durable) {
        toast.error("Journal local non durable : gardez l'application ouverte jusqu'à la synchronisation");
      }
    }

    runLocalStateTransaction(() => {
      useProductStore.setState(state => ({
        products: state.products.map(item => item.id === product.id
          ? { ...item, stock: item.stock + movement.quantity }
          : item),
      }));
      set(state => ({ movements: [newMovement, ...state.movements] }));
    });

    if (isFirebaseConfigured) void retryAll();
    return newMovement;
  },
}));
