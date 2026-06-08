/**
 * Legwan i18n — 9 locales: fr, en, es, pt, de, tr, ar, ja, zh.
 * Language is stored in useSettingsStore.shop.langue (persisted to Firestore).
 * Arabic uses RTL — the document dir is set in App.tsx via useRtl().
 */
import { useSettingsStore } from '@/stores/useSettingsStore';
import fr from './fr';
import en from './en';
import es from './es';
import pt from './pt';
import de from './de';
import tr from './tr';
import ar from './ar';
import ja from './ja';
import zh from './zh';
import type { Translations } from './fr';
import { RTL_LOCALES } from './types';

export type { SupportedLocale } from './types';
export { ALL_LOCALES, RTL_LOCALES, LOCALE_LABELS } from './types';

const translations: Record<string, Translations> = { fr, en, es, pt, de, tr, ar, ja, zh };

/** Resolve a dot-path like 'nav.dashboard' into a nested value */
function resolve(obj: unknown, path: string): string {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return path;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : path;
}

/** React hook — returns a translation function for the current locale (reactive) */
export function useTranslation() {
  const locale: string =
    useSettingsStore(state => state.shop.langue) ?? 'fr';

  const t = (key: string): string => {
    const dict = translations[locale] ?? translations.fr;
    return resolve(dict, key);
  };

  return { t, locale };
}

/** Static translation (outside React — for non-hook contexts) */
export function translate(key: string, locale?: string): string {
  const l = locale ?? useSettingsStore.getState().shop.langue ?? 'fr';
  return resolve(translations[l] ?? translations.fr, key);
}

/** Whether the current locale is RTL */
export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale as never);
}

export { fr, en, es, pt, de, tr, ar, ja, zh };
