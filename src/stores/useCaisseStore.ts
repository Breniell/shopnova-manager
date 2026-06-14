import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveCloture } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';

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
    fsSaveCloture(getBoutiqueId(), newCloture).catch((err) => {
      enqueue('cloture', newCloture);
      toast.error("Échec d'enregistrement — nouvelle tentative automatique");
      console.warn('[outbox] cloture enqueued:', err);
    });
  },

  setFondDeCaisse: (amount) => set({ fondDeCaisse: amount }),
}));
