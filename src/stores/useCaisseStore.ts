import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  addCloture: (cloture: Omit<ClotureCaisse, 'id'>) => void;
  setFondDeCaisse: (amount: number) => void;
}

export const useCaisseStore = create<CaisseState>()(
  persist(
    (set) => ({
      clotures: [],
      fondDeCaisse: 10000,
      addCloture: (cloture) => {
        const id = 'cl' + Date.now();
        set(state => ({ clotures: [{ ...cloture, id }, ...state.clotures] }));
      },
      setFondDeCaisse: (amount) => set({ fondDeCaisse: amount }),
    }),
    { name: 'legwan-clotures' }
  )
);
