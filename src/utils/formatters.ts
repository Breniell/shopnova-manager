/**
 * Utilitaires de formatage pour ShopNova Manager
 * @module utils/formatters
 */

/**
 * Formate un montant en FCFA
 * @param amount - Montant à formater
 * @returns Montant formaté avec séparateurs de milliers et " FCFA"
 * @example formatPrice(12500) // "12,500 FCFA"
 */
export function formatPrice(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(num) + ' FCFA';
}

/**
 * Alias de formatPrice pour compatibilité
 */
export const formatFCFA = formatPrice;

/**
 * Formate une date
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR').format(d);
}

/**
 * Formate une date avec heure
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Formate l'heure uniquement
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    timeStyle: 'short',
  }).format(d);
}

/**
 * Formate une date courte (JJ/MM/AAAA)
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Formate une date longue (jour de la semaine, jour mois année)
 */
export function formatDateLong(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}