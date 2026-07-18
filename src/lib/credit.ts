/**
 * src/lib/credit.ts — Fonctions pures pour le calcul des encours et statuts crédit.
 *
 * Toutes les fonctions sont stateless : elles prennent les ventes et paiements
 * en argument et retournent des valeurs. Aucune mutation, aucun side-effect.
 * Ce design facilite les tests et évite le couplage aux stores Zustand.
 *
 * Source de vérité :
 *   • `Sale.total` : le montant dû initial
 *   • `Payment[]` : la liste des règlements reçus pour cette vente
 *   • Le solde restant = Sale.total - Σ(Payment.amount sur cette vente)
 *
 * Les champs `Sale.amountPaid` et `Sale.creditStatus` sont uniquement des
 * projections compatibles avec les anciennes sauvegardes. Le registre
 * immuable `Payment[]` reste la seule source de vérité.
 */
import type { Sale, CreditStatus } from '@/stores/useSaleStore';
import type { Payment } from '@/stores/usePaymentStore';

/**
 * Valeur comptable d'une opération du registre. Les paiements historiques
 * n'ont pas de `kind` et sont donc traités comme des encaissements normaux.
 */
export function getPaymentSignedAmount(payment: Payment): number {
  return payment.kind === 'reversal' ? -payment.amount : payment.amount;
}

/**
 * Solde restant à régler sur une vente à crédit.
 * Retourne 0 si la vente n'est pas à crédit ou si elle est remboursée.
 * Jamais négatif (clamp à 0 en cas de sur-paiement).
 */
export function getRemainingBalance(sale: Sale, payments: Payment[]): number {
  if (sale.paymentMode !== 'credit') return 0;
  if (sale.status === 'refunded') return 0;
  const paid = payments
    .filter(p => p.saleId === sale.id)
    .reduce((sum, p) => sum + getPaymentSignedAmount(p), 0);
  return Math.max(0, sale.total - paid);
}

/**
 * Montant total déjà payé sur une vente à crédit.
 * Utile pour mettre à jour Sale.amountPaid dénormalisé après un règlement.
 */
export function getAmountPaid(sale: Sale, payments: Payment[]): number {
  if (sale.paymentMode !== 'credit') return 0;
  return payments
    .filter(p => p.saleId === sale.id)
    .reduce((sum, p) => sum + getPaymentSignedAmount(p), 0);
}

/**
 * Recalcule les champs de compatibilité depuis le registre. Cette projection
 * est volontairement locale : aucune caisse n'écrit un total absolu pouvant
 * écraser le calcul d'une autre caisse.
 */
export function projectCreditSale(sale: Sale, payments: Payment[]): Sale {
  if (sale.paymentMode !== 'credit') return sale;
  const amountPaid = Math.max(0, getAmountPaid(sale, payments));
  return {
    ...sale,
    amountPaid,
    creditStatus: computeCreditStatus(sale, payments),
    creditConflict: amountPaid > sale.total,
  };
}

export function projectCreditSales(sales: Sale[], payments: Payment[]): Sale[] {
  return sales.map(sale => projectCreditSale(sale, payments));
}

/**
 * Détermine le statut crédit d'une vente à partir de ses paiements.
 *   • pending : aucun règlement
 *   • partial : règlements reçus mais solde > 0
 *   • paid    : solde = 0
 */
export function computeCreditStatus(sale: Sale, payments: Payment[]): CreditStatus {
  if (sale.paymentMode !== 'credit') return 'paid';
  const paid = getAmountPaid(sale, payments);
  if (paid <= 0) return 'pending';
  const remaining = Math.max(0, sale.total - paid);
  if (remaining === 0) return 'paid';
  return 'partial';
}

/**
 * Encours total d'un client : somme des soldes restants sur toutes ses ventes
 * à crédit (non remboursées, non soldées).
 */
export function getCustomerOutstanding(
  customerId: string,
  sales: Sale[],
  payments: Payment[],
): number {
  return sales
    .filter(s => s.customerId === customerId && s.paymentMode === 'credit')
    .reduce((sum, s) => sum + getRemainingBalance(s, payments), 0);
}

/**
 * Liste des ventes à crédit non soldées d'un client (statut pending ou partial).
 * Triées par date d'échéance puis par date de vente.
 */
export function getCustomerOpenCreditSales(
  customerId: string,
  sales: Sale[],
  payments: Payment[],
): Sale[] {
  return sales
    .filter(s =>
      s.customerId === customerId &&
      s.paymentMode === 'credit' &&
      s.status !== 'refunded' &&
      getRemainingBalance(s, payments) > 0
    )
    .sort((a, b) => {
      // Ventes avec échéance avant celles sans
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
}

/**
 * Toutes les ventes à crédit non soldées, toutes clients confondus.
 */
export function getAllOpenCreditSales(sales: Sale[], payments: Payment[]): Sale[] {
  return sales
    .filter(s =>
      s.paymentMode === 'credit' &&
      s.status !== 'refunded' &&
      getRemainingBalance(s, payments) > 0
    );
}

/**
 * Calcule l'ancienneté d'une vente à crédit (en jours depuis sa date).
 * Sert à classer les créances par criticité.
 */
export function getCreditAgeInDays(sale: Sale, reference: Date = new Date()): number {
  const saleDate = new Date(sale.date);
  const diffMs = reference.getTime() - saleDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Catégorise une créance selon son ancienneté.
 * Seuils : ≤ 7j = récent, 8-30j = modéré, > 30j = ancien.
 */
export type CreditAgeBucket = 'recent' | 'moderate' | 'old';

export function getCreditAgeBucket(sale: Sale, reference: Date = new Date()): CreditAgeBucket {
  const days = getCreditAgeInDays(sale, reference);
  if (days <= 7) return 'recent';
  if (days <= 30) return 'moderate';
  return 'old';
}

/**
 * Vérifie si une nouvelle vente à crédit dépasserait le plafond du client.
 * Retourne null si OK, ou un objet décrivant le dépassement.
 */
export function checkCreditLimit(
  customerId: string,
  newSaleAmount: number,
  plafondCredit: number | undefined,
  sales: Sale[],
  payments: Payment[],
): { ok: true } | { ok: false; current: number; afterSale: number; plafond: number } {
  if (plafondCredit === undefined) return { ok: true }; // pas de limite
  const current = getCustomerOutstanding(customerId, sales, payments);
  const afterSale = current + newSaleAmount;
  if (afterSale > plafondCredit) {
    return { ok: false, current, afterSale, plafond: plafondCredit };
  }
  return { ok: true };
}
