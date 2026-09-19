import { create } from 'zustand';
import { getBoutiqueId } from '@/services/boutiqueService';
import { fsSaveSettings } from '@/services/firestoreService';
import { enqueue } from '@/lib/outbox';
import { toast } from 'sonner';
import type { SupportedLocale } from '@/i18n/types';
// Import à sens unique : le store produits n'importe rien d'ici, donc pas de
// cycle. Les catégories restent définies dans le domaine produit.
import { DEFAULT_CATEGORIES } from '@/stores/useProductStore';

export interface ShopSettings {
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  nui: string;
  enteteRecu: string;
  piedPageRecu: string;
  logoDataUrl?: string;
  devise: string;
  langue: SupportedLocale;
  momoMerchantCodeMtn?: string;
  momoMerchantCodeOrange?: string;
  // Thermal printer
  printerName?: string;
  paperWidth: '58' | '80';
  openDrawerOnSale: boolean;
  autoPrintOnSale: boolean;
  /**
   * Catégories de produits de la boutique, gérées par le gérant.
   *
   * Stockées ici plutôt que dans le store produits pour deux raisons : le
   * `onSnapshot` des réglages les partage déjà entre toutes les caisses, et la
   * sauvegarde les emporte sans changement (son schéma est en `.passthrough()`).
   * Absent = boutique antérieure à cette version, on retombe sur la liste par
   * défaut.
   */
  categories?: string[];
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

/**
 * Liste des catégories de la boutique, avec repli sur la liste par défaut.
 *
 * Passe par une fonction plutôt que par une valeur stockée : une boutique
 * créée avant cette version n'a pas le champ, et doit continuer à voir des
 * catégories.
 */
export function shopCategories(shop: ShopSettings): string[] {
  return shop.categories?.length ? shop.categories : DEFAULT_CATEGORIES;
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
