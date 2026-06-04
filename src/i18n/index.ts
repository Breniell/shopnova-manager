/**
 * Lightweight i18n for Legwan.
 * Supports: French (fr), English (en).
 * Language stored in settings store — persisted via Firestore.
 *
 * Usage:
 *   const { t } = useTranslation();
 *   t('nav.dashboard')  // → 'Tableau de bord' or 'Dashboard'
 *   t('common.save')    // → 'Enregistrer' or 'Save'
 */
import { useSettingsStore } from '@/stores/useSettingsStore';
import fr from './fr';
import en from './en';
import type { Translations } from './fr';

export type SupportedLocale = 'fr' | 'en';

const translations: Record<SupportedLocale, Translations> = { fr, en };

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
  const locale: SupportedLocale =
    (useSettingsStore(state => state.shop.langue) as SupportedLocale) ?? 'fr';

  const t = (key: string): string => {
    const dict = translations[locale] ?? translations.fr;
    return resolve(dict, key);
  };

  return { t, locale };
}

/** Static translation (outside React — for non-hook contexts) */
export function translate(key: string, locale?: SupportedLocale): string {
  const l = locale ?? (useSettingsStore.getState().shop.langue as SupportedLocale) ?? 'fr';
  return resolve(translations[l] ?? translations.fr, key);
}

export { fr, en };
