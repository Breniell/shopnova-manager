import { describe, it, expect, afterEach } from 'vitest';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { formatDate, formatFCFA } from '@/utils/formatters';

const REF_DATE = new Date(2024, 0, 15); // 15 January 2024

function setLang(lang: 'fr' | 'en' | 'ar' | 'ja' | 'zh') {
  useSettingsStore.setState(s => ({ shop: { ...s.shop, langue: lang } }));
}

afterEach(() => setLang('fr'));

describe('formatters — locale-aware dates', () => {
  it('fr: formatDate formats as DD/MM/YYYY', () => {
    setLang('fr');
    expect(formatDate(REF_DATE)).toBe('15/01/2024');
  });

  it('en: formatDate formats as M/D/YYYY', () => {
    setLang('en');
    expect(formatDate(REF_DATE)).toBe('1/15/2024');
  });

  it('ja: formatDate uses year/month/day order', () => {
    setLang('ja');
    expect(formatDate(REF_DATE)).toBe('2024/1/15');
  });

  it('format differs between fr and en', () => {
    setLang('fr');
    const fr = formatDate(REF_DATE);
    setLang('en');
    const en = formatDate(REF_DATE);
    expect(fr).not.toBe(en);
  });
});

describe('formatters — locale-aware numbers', () => {
  it('always appends FCFA regardless of locale', () => {
    for (const lang of ['fr', 'en', 'ar', 'ja'] as const) {
      setLang(lang);
      expect(formatFCFA(1500)).toContain('FCFA');
    }
  });

  it('number format differs between fr and en', () => {
    setLang('fr');
    const fr = formatFCFA(1500);
    setLang('en');
    const en = formatFCFA(1500);
    // fr-FR uses narrow no-break space; en-US uses comma
    expect(fr).not.toBe(en);
  });

  it('ar: formatFCFA still contains FCFA suffix', () => {
    setLang('ar');
    expect(formatFCFA(1500)).toContain('FCFA');
  });
});
