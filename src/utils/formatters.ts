/**
 * Fonctions de formatage pour ShopNova Manager
 */

/**
 * Formate un nombre en prix FCFA
 * @param amount - Montant à formater
 * @returns Prix formaté (ex: "12,500 FCFA")
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

/**
 * Formate un nombre en prix FCFA (alias)
 */
export function formatFCFA(amount: number): string {
  return formatPrice(amount);
}

/**
 * Formate une date en français
 * @param date - Date à formater
 * @returns Date formatée (ex: "07/04/2026")
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR').format(d);
}

/**
 * Formate une date avec heure
 * @param date - Date à formater
 * @returns Date et heure formatées (ex: "07/04/2026 14:30")
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Formate un pourcentage
 * @param value - Valeur décimale (0.15 = 15%)
 * @returns Pourcentage formaté (ex: "15%")
 */
export function formatPercentage(value: number): string {
  return (value * 100).toFixed(1) + '%';
}