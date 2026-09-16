/**
 * src/lib/pricing.ts - Fonctions pures pour le prix négociable.
 *
 * Architecture :
 *   • Toutes les fonctions sont stateless et testables en isolation
 *   • Pas de side-effects, pas d'accès aux stores
 *   • `checkPrice` est le point d'entrée central : il décide si un prix
 *     demandé est OK, alerte, ou bloqué
 *
 * Règles métier :
 *   • Si un produit n'est pas négociable → seul prixVente est accepté
 *   • Si prix demandé > prixVente → refusé (on ne vend pas plus cher qu'affiché)
 *   • Si prix demandé < plancher → bloqué (sauf override gérant)
 *   • Si plancher < prix < cible → ok mais alerte ("marge réduite")
 *   • Si cible <= prix <= vente → ok silencieux
 *
 * Valeurs implicites quand champs non renseignés :
 *   • prixPlancher absent → plancher = prixAchat (vendre à perte interdit)
 *   • prixCible absent    → cible = prixVente (pas d'alerte intermédiaire)
 */
import type { Product } from '@/stores/useProductStore';
import type { CartItem } from '@/stores/useSaleStore';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** Résultat d'une vérification de prix. */
export type PriceCheckResult =
  | { status: 'ok'; level: 'normal' }                // entre cible et prix de vente
  | { status: 'ok'; level: 'below_target' }          // entre plancher et cible (alerte jaune)
  | { status: 'blocked'; reason: 'below_floor'; floor: number }    // sous plancher (rouge, override requis)
  | { status: 'blocked'; reason: 'above_display'; display: number } // au-dessus du prix affiché (refusé)
  | { status: 'blocked'; reason: 'not_negotiable' }; // produit non négociable, prix demandé ≠ prixVente

// ────────────────────────────────────────────────────────────────────────────
// Helpers internes
// ────────────────────────────────────────────────────────────────────────────

/** Plancher effectif d'un produit (explicite si défini, sinon prixAchat). */
export function getEffectiveFloor(product: Product): number {
  return product.prixPlancher ?? product.prixAchat;
}

/** Cible effective d'un produit (explicite si défini, sinon prixVente). */
export function getEffectiveTarget(product: Product): number {
  return product.prixCible ?? product.prixVente;
}

/** True si le produit autorise la négociation (false par défaut si non renseigné). */
export function isNegociable(product: Product): boolean {
  return product.negociable === true;
}

// ────────────────────────────────────────────────────────────────────────────
// Vérification de prix
// ────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie si un prix demandé est acceptable pour un produit donné.
 * C'est la fonction centrale utilisée par la caisse au moment de modifier
 * un prix dans le panier.
 */
export function checkPrice(product: Product, requestedPrice: number): PriceCheckResult {
  // 1. Produit non négociable : seul le prix affiché est accepté
  if (!isNegociable(product)) {
    if (requestedPrice === product.prixVente) {
      return { status: 'ok', level: 'normal' };
    }
    return { status: 'blocked', reason: 'not_negotiable' };
  }

  // 2. Pas vendre plus cher que le prix affiché (protection client)
  if (requestedPrice > product.prixVente) {
    return { status: 'blocked', reason: 'above_display', display: product.prixVente };
  }

  const floor = getEffectiveFloor(product);
  const target = getEffectiveTarget(product);

  // 3. Sous le plancher → bloqué (override gérant requis)
  if (requestedPrice < floor) {
    return { status: 'blocked', reason: 'below_floor', floor };
  }

  // 4. Entre plancher et cible → ok avec alerte
  if (requestedPrice < target) {
    return { status: 'ok', level: 'below_target' };
  }

  // 5. Entre cible et prix de vente → ok silencieux
  return { status: 'ok', level: 'normal' };
}

// ────────────────────────────────────────────────────────────────────────────
// Calculs économiques
// ────────────────────────────────────────────────────────────────────────────

/** Marge brute en % sur une ligne au prix donné. 0 si prixAchat indéfini ou prix nul. */
export function getMarginPercent(product: Product, sellingPrice: number): number {
  if (!product.prixAchat || sellingPrice <= 0) return 0;
  return ((sellingPrice - product.prixAchat) / sellingPrice) * 100;
}

/** Manque à gagner d'une ligne du panier par rapport au prix affiché. */
export function getLossFromNegotiation(item: Pick<CartItem, 'prixVente' | 'prixUnitaire' | 'quantity'>): number {
  const applied = item.prixUnitaire ?? item.prixVente;
  return Math.max(0, (item.prixVente - applied) * item.quantity);
}

/** Prix unitaire effectif d'un item (fallback sur prixVente si non négocié). */
export function getAppliedPrice(item: Pick<CartItem, 'prixVente' | 'prixUnitaire'>): number {
  return item.prixUnitaire ?? item.prixVente;
}

// ────────────────────────────────────────────────────────────────────────────
// Remise globale sur le panier
// ────────────────────────────────────────────────────────────────────────────

/**
 * Prix unitaire minimum d'une ligne, en dessous duquel une remise globale
 * nécessite l'accord d'un gérant.
 *
 * Même logique que checkPrice, transposée à la remise :
 *   • ligne déjà autorisée sous le plancher → le prix autorisé fait foi,
 *     une remise ne peut pas descendre encore plus bas sans un nouvel accord
 *   • produit négociable → son plancher
 *   • produit à prix fixe → son prix appliqué : le gérant a précisément indiqué
 *     que ce prix ne se discute pas
 *   • produit introuvable (supprimé du catalogue) → prix appliqué, au plus sûr
 */
export function getLineFloor(item: CartItem, product: Product | undefined): number {
  const applied = getAppliedPrice(item);
  if (item.negotiated?.belowFloor) return applied;
  if (product && isNegociable(product)) return getEffectiveFloor(product);
  return applied;
}

/** Ligne qu'une remise ferait passer sous son minimum. */
export interface DiscountedLineBelowFloor {
  productId: string;
  nom: string;
  floor: number;
  priceAfterDiscount: number;
}

export type DiscountCheckResult =
  | { status: 'ok' }
  | { status: 'blocked'; lines: DiscountedLineBelowFloor[] };

/**
 * Vérifie qu'une remise en pourcentage respecte les limites fixées par le gérant.
 *
 * Sans ce contrôle, la remise contournait entièrement la protection des prix :
 * baisser une ligne sous son plancher exigeait le PIN d'un gérant, mais une
 * remise de 100 % sur tout le panier passait sans rien demander.
 *
 * La remise s'applique au total ; elle revient donc à multiplier chaque prix
 * unitaire par (1 - taux). On vérifie ligne par ligne.
 */
export function checkCartDiscount(
  items: CartItem[],
  findProduct: (productId: string) => Product | undefined,
  discountPercent: number,
): DiscountCheckResult {
  if (!(discountPercent > 0)) return { status: 'ok' };

  const factor = 1 - discountPercent / 100;
  const lines: DiscountedLineBelowFloor[] = [];

  for (const item of items) {
    const floor = getLineFloor(item, findProduct(item.productId));
    const priceAfterDiscount = getAppliedPrice(item) * factor;
    // Tolérance : les pourcentages produisent des arrondis flottants, et un
    // écart d'un millième de franc ne doit pas réclamer un gérant.
    if (priceAfterDiscount + 0.001 < floor) {
      lines.push({ productId: item.productId, nom: item.nom, floor, priceAfterDiscount });
    }
  }

  return lines.length > 0 ? { status: 'blocked', lines } : { status: 'ok' };
}
