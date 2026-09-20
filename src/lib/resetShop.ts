/**
 * Remise à zéro de l'exploitation d'une boutique.
 *
 * Efface ce qui décrit l'activité courante - produits, ventes, clients,
 * fournisseurs, dépenses, sorties de caisse - et **conserve les livres** :
 * mouvements de stock, règlements, clôtures, sessions et inventaires.
 *
 * Ce n'est pas une demi-mesure faute de mieux. `firestore.rules` refuse
 * explicitement la suppression de ces journaux (« A closure is an accounting
 * record … its contents are immutable »), et ils restent lisibles seuls
 * puisqu'un mouvement de stock garde le nom du produit en instantané. Un
 * commerçant y retrouve donc l'histoire de sa période précédente même après
 * avoir vidé son catalogue.
 */
import { fsResetShopData, type ResetScope, type ResetReport } from '@/services/firestoreService';
import { getBoutiqueId, getRegisterCode } from '@/services/boutiqueService';
import { useProductStore } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { useSupplierStore } from '@/stores/useSupplierStore';
import { useExpenseStore } from '@/stores/useExpenseStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';

export type { ResetScope, ResetReport };

export const EMPTY_RESET_SCOPE: ResetScope = {
  sales: false, cashOuts: false, products: false,
  customers: false, suppliers: false, expenses: false,
};

/** Vrai si au moins une case est cochée. */
export function hasAnythingToReset(scope: ResetScope): boolean {
  return Object.values(scope).some(Boolean);
}

/**
 * Efface le périmètre demandé, dans Firestore puis en mémoire.
 *
 * L'ordre compte : Firestore d'abord, parce que c'est la source de vérité et
 * que ses listeners rechargeraient aussitôt ce qu'on aurait seulement vidé
 * localement.
 */
export async function resetShopData(scope: ResetScope): Promise<ResetReport> {
  const report = await fsResetShopData(scope, getBoutiqueId());

  if (scope.sales) {
    useSaleStore.getState()._setSales([]);
    useSaleStore.getState().clearCart();
    // Le compteur de vente est aussi local à cette caisse, et `_setSaleCounter`
    // ne redescend jamais sous la valeur enregistrée : sans ce nettoyage, la
    // numérotation repartirait de l'ancienne séquence.
    try { localStorage.removeItem(`legwan-sale-counter-${getRegisterCode()}`); } catch { /* indisponible */ }
    useSaleStore.setState({ saleCounter: 0 });
  }
  if (scope.cashOuts)  useCashSessionStore.getState()._setCashOuts([]);
  if (scope.products)  useProductStore.getState()._setProducts([]);
  if (scope.customers) useCustomerStore.getState()._setCustomers([]);
  if (scope.suppliers) useSupplierStore.getState()._setSuppliers([]);
  if (scope.expenses)  useExpenseStore.getState()._setExpenses([]);

  return report;
}
