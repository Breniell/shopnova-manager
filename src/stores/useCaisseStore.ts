import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveCloture } from '@/services/firestoreService';

export interface ClotureCaisse {
  id: string;
  date: string;
  userId: string;
  userName: string;
  totalVentesEspeces: number;
  totalVentesMobile: number;
  totalAttendu: number;
  totalCompte: number;
  ecart: number;
  details: Record<string, number>;
  notes?: string;
}

interface CaisseState {
  clotures: ClotureCaisse[];
  fondDeCaisse: number;

  /** Internal: called by FirebaseProvider on startup */
  _setClotures: (clotures: ClotureCaisse[]) => void;

  addCloture: (cloture: Omit<ClotureCaisse, 'id'>) => void;
  setFondDeCaisse: (amount: number) => void;
}

export const useCaisseStore = create<CaisseState>()((set) => ({
  clotures: [],
  fondDeCaisse: 10000,

  _setClotures: (clotures) => set({ clotures }),

  addCloture: (cloture) => {
    const id = 'cl' + Date.now();
    const newCloture: ClotureCaisse = { ...cloture, id };
    set(state => ({ clotures: [newCloture, ...state.clotures] }));
    fsSaveCloture(getBoutiqueId(), newCloture).catch(console.error);
  },

  setFondDeCaisse: (amount) => set({ fondDeCaisse: amount }),
}));
