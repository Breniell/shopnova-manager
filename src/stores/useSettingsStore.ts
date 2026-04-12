import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveSettings } from '@/services/firestoreService';

export interface ShopSettings {
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  nui: string;
  enteteRecu: string;
  piedPageRecu: string;
  devise: string;
}

export const defaultShopSettings: ShopSettings = {
  nom: 'Ma Boutique',
  adresse: '',
  telephone: '',
  email: '',
  nui: '',
  enteteRecu: 'Bienvenue !',
  piedPageRecu: 'Merci pour votre achat. À bientôt !',
  devise: 'FCFA',
};

interface SettingsState {
  shop: ShopSettings;
  /** Internal: called by FirebaseProvider on startup */
  _setSettings: (settings: ShopSettings) => void;
  updateShop: (data: Partial<ShopSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  shop: defaultShopSettings,

  _setSettings: (settings) => set({ shop: settings }),

  updateShop: (data) => {
    const updated = { ...get().shop, ...data };
    set({ shop: updated });
    fsSaveSettings(getBoutiqueId(), updated).catch(console.error);
  },
}));
