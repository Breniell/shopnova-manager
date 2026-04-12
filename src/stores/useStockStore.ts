import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveMovement } from '@/services/firestoreService';

export type MovementType = 'entrée' | 'vente' | 'ajustement';

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
}

interface StockState {
  movements: StockMovement[];

  /** Internal: called by FirebaseProvider on startup */
  _setMovements: (movements: StockMovement[]) => void;

  addMovement: (movement: Omit<StockMovement, 'id'>) => void;
}

export const useStockStore = create<StockState>()((set) => ({
  movements: [],

  _setMovements: (movements) => set({ movements }),

  addMovement: (movement) => {
    const id = 'm' + Date.now();
    const newMovement: StockMovement = { ...movement, id };
    set(state => ({ movements: [newMovement, ...state.movements] }));
    fsSaveMovement(getBoutiqueId(), newMovement).catch(console.error);
  },
}));
