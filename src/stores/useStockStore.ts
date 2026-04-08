import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  addMovement: (movement: Omit<StockMovement, 'id'>) => void;
}

const now = new Date();
const day = (daysAgo: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return d;
};

export const useStockStore = create<StockState>()(
  persist(
    (set) => ({
      movements: [
        { id: 'm1', date: day(1), productId: 'p1', productName: 'Bière Castel 33cl', type: 'entrée', quantity: 48, stockBefore: 72, stockAfter: 120, userId: '1', userName: 'Marie Nguema', supplier: 'Brasseries du Cameroun', unitPrice: 450 },
        { id: 'm2', date: day(2), productId: 'p3', productName: 'Riz parfumé Thaï 5kg', type: 'entrée', quantity: 20, stockBefore: 10, stockAfter: 30, userId: '1', userName: 'Marie Nguema', supplier: 'SOCOPRAL', unitPrice: 3500 },
        { id: 'm3', date: day(3), productId: 'p9', productName: 'Lait Nido 400g', type: 'entrée', quantity: 15, stockBefore: 5, stockAfter: 20, userId: '1', userName: 'Marie Nguema', supplier: 'Nestlé Cameroun', unitPrice: 3200 },
        { id: 'm4', date: day(0), productId: 'p1', productName: 'Bière Castel 33cl', type: 'vente', quantity: -6, stockBefore: 126, stockAfter: 120, userId: '2', userName: 'Paul Mbarga' },
        { id: 'm5', date: day(0), productId: 'p16', productName: 'Téléphone Samsung A05', type: 'vente', quantity: -1, stockBefore: 5, stockAfter: 4, userId: '1', userName: 'Marie Nguema' },
      ],
      addMovement: (movement) => {
        const id = 'm' + Date.now();
        set(state => ({ movements: [{ ...movement, id }, ...state.movements] }));
      },
    }),
    { name: 'legwan-stock' }
  )
);
