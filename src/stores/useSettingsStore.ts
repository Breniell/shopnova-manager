import { create } from 'zustand';

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

export const useSettingsStore = create<SettingsState>((set) => ({
  shop: {
    nom: 'ShopNova Store',
    adresse: 'Rue de la Joie, Douala, Cameroun',
    telephone: '+237 699 123 456',
    email: 'contact@shopnova.cm',
    nui: '',
    enteteRecu: 'Bienvenue chez ShopNova !',
    piedPageRecu: 'Merci pour votre achat ! À bientôt.',
    devise: 'FCFA',
  },
  updateShop: (data) => set(state => ({ shop: { ...state.shop, ...data } })),
}));
