import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ShopSettings {
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  nui: string;
  enteteRecu: string;
  piedPageRecu: string;
  devise: string;
}

interface SettingsState {
  shop: ShopSettings;
  updateShop: (data: Partial<ShopSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      shop: {
        nom: 'Legwan Store',
        adresse: 'Rue de la Joie, Douala, Cameroun',
        telephone: '+237 699 123 456',
        email: 'contact@legwan.cm',
        nui: '',
        enteteRecu: 'Bienvenue chez Legwan !',
        piedPageRecu: 'Merci pour votre achat ! À bientôt.',
        devise: 'FCFA',
      },
      updateShop: (data) => set(state => ({ shop: { ...state.shop, ...data } })),
    }),
    { name: 'legwan-settings' }
  )
);
