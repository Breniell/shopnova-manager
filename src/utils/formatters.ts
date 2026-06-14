import { useSettingsStore } from '@/stores/useSettingsStore';
import { LOCALE_TO_BCP47 } from '@/i18n/types';

/** Returns the BCP 47 locale string for the current app language. */
export function getCurrentBcp47(): string {
  const langue = useSettingsStore.getState().shop.langue;
  return LOCALE_TO_BCP47[langue] ?? 'fr-FR';
}

export function formatPrice(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0 FCFA';
  return new Intl.NumberFormat(getCurrentBcp47()).format(num) + ' FCFA';
}

export const formatFCFA = formatPrice;

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getCurrentBcp47()).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getCurrentBcp47(), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getCurrentBcp47(), {
    timeStyle: 'short',
  }).format(d);
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getCurrentBcp47(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateLong(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(getCurrentBcp47(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}
