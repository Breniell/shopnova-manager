import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveSettings } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';
import type { SupportedLocale } from '@/i18n/types';

export interface ShopSettings {
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  nui: string;
  enteteRecu: string;
  piedPageRecu: string;
  devise: string;
  langue: SupportedLocale;
  momoMerchantCodeMtn?: string;
  momoMerchantCodeOrange?: string;
  // Thermal printer
  printerName?: string;
  paperWidth: '58' | '80';
  openDrawerOnSale: boolean;
  autoPrintOnSale: boolean;
}

export const defaultShopSettings: ShopSettings = {
  nom:              'Ma Boutique',
  adresse:          '',
  telephone:        '',
  email:            '',
  nui:              '',
  enteteRecu:       'Bienvenue !',
  piedPageRecu:     'Merci pour votre achat. À bientôt !',
  devise:           'FCFA',
  langue:           'fr',
  paperWidth:       '80',
  openDrawerOnSale: false,
  autoPrintOnSale:  false,
};

interface SettingsState {
  shop: ShopSettings;
  _setSettings: (settings: ShopSettings) => void;
  updateShop: (data: Partial<ShopSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  shop: defaultShopSettings,

  _setSettings: (settings) => set({ shop: { ...defaultShopSettings, ...settings } }),

  updateShop: (data) => {
    const updated = { ...get().shop, ...data };
    set({ shop: updated });
    fsSaveSettings(getBoutiqueId(), updated).catch((error) => {
      enqueue('settingsSave', updated);
      toast.error("Paramètres en attente de synchronisation");
      console.warn('[outbox] settings enqueued:', error);
    });
  },
}));
