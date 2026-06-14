export type SupportedLocale = 'fr' | 'en' | 'es' | 'pt' | 'de' | 'tr' | 'ar' | 'ja' | 'zh';

export const ALL_LOCALES: SupportedLocale[] = ['fr', 'en', 'es', 'pt', 'de', 'tr', 'ar', 'ja', 'zh'];

export const RTL_LOCALES = new Set<SupportedLocale>(['ar']);

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  tr: 'Türkçe',
  ar: 'العربية',
  ja: '日本語',
  zh: '中文',
};

export const LOCALE_TO_BCP47: Record<SupportedLocale, string> = {
  fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', de: 'de-DE',
  tr: 'tr-TR', ar: 'ar',    ja: 'ja-JP', zh: 'zh-CN',
};
