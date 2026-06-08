/**
 * PolicyGate - Privacy policy + admin account creation (first install only).
 *
 * Phase 1: Scroll policy, sign with full name, check acceptance.
 * Phase 2: Create admin profile with PIN (new installs only).
 *
 * Supports French (fr) and English (en) — language auto-detected from browser.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, ScrollText, Shield, ChevronDown, UserPlus, KeyRound } from 'lucide-react';
import { hashPin, generateSalt } from '@/lib/crypto';
import { setGeoConsent } from '@/lib/consent';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { fr, en, es, pt, de, tr, ar, ja, zh } from '@/i18n';
import type { Translations } from '@/i18n/fr';
import { ALL_LOCALES, LOCALE_LABELS } from '@/i18n/types';
import type { SupportedLocale } from '@/i18n/types';

const POLICY_VERSION    = '1.4.2';
const STORAGE_KEY       = 'legwan-policy-accepted';
const PENDING_ADMIN_KEY = 'legwan-pending-admin';
const LOCALE_KEY        = 'legwan-locale';

// ─── Locale detection ─────────────────────────────────────────────────────────

function detectLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY) as SupportedLocale | null;
    if (stored && ALL_LOCALES.includes(stored)) return stored;
  } catch { /* localStorage indisponible */ }
  const lang = (typeof navigator !== 'undefined' ? navigator.language : '').slice(0, 2).toLowerCase() as SupportedLocale;
  return ALL_LOCALES.includes(lang) ? lang : 'fr';
}

function saveLocale(l: SupportedLocale) {
  try { localStorage.setItem(LOCALE_KEY, l); } catch { /* ignore */ }
}

const dicts: Record<SupportedLocale, Translations> = { fr, en, es, pt, de, tr, ar, ja, zh };

// ─── Policy acceptance ────────────────────────────────────────────────────────

interface PolicyRecord {
  version: string;
  accepted: boolean;
  name: string;
  date: string;
}

function isPolicyAccepted(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const record: PolicyRecord = JSON.parse(raw);
    return record.accepted && record.version === POLICY_VERSION;
  } catch { return false; }
}

function isNewInstall(): boolean {
  return localStorage.getItem(STORAGE_KEY) === null;
}

function savePolicyAcceptance(name: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: POLICY_VERSION,
    accepted: true,
    name: name.trim(),
    date: new Date().toISOString(),
  }));
}

// ─── PIN dots ─────────────────────────────────────────────────────────────────

const PinDots: React.FC<{ length: number; error: boolean }> = ({ length, error }) => (
  <div className={cn('flex justify-center gap-3 my-4', error && 'animate-[pin-shake_0.4s_ease-in-out]')}>
    {[0, 1, 2, 3].map(i => (
      <div
        key={i}
        className={cn(
          'w-3.5 h-3.5 rounded-full transition-all duration-150',
          i < length ? error ? 'bg-destructive scale-110' : 'bg-primary scale-110' : 'bg-muted-foreground/30'
        )}
      />
    ))}
  </div>
);

// ─── PolicyGate ───────────────────────────────────────────────────────────────

type Phase = 'policy' | 'admin-setup';

export const PolicyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accepted, setAccepted] = useState(isPolicyAccepted);
  const [locale, setLocale]     = useState<SupportedLocale>(detectLocale);
  const [phase, setPhase]       = useState<Phase>('policy');

  const T = dicts[locale].policy;
  const C = dicts[locale].common;

  // Phase 1
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [sigName, setSigName]   = useState('');
  const [checked, setChecked]   = useState(false);
  const [geoConsent, setGeoConsentState] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Phase 2
  const [adminPrenom, setAdminPrenom]       = useState('');
  const [adminNom, setAdminNom]             = useState('');
  const [adminPin, setAdminPin]             = useState('');
  const [adminConfirmPin, setAdminConfirmPin] = useState('');
  const [pinStep, setPinStep]               = useState<'enter' | 'confirm'>('enter');
  const [pinError, setPinError]             = useState(false);
  const [isCreating, setIsCreating]         = useState(false);

  const today = new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Policy sections from translations
  const sections = [
    { title: T.sections.s1title, content: T.sections.s1 },
    { title: T.sections.s2title, content: T.sections.s2 },
    { title: T.sections.s3title, content: T.sections.s3 },
    { title: T.sections.s4title, content: T.sections.s4 },
    { title: T.sections.s5title, content: T.sections.s5 },
    { title: T.sections.s6title, content: T.sections.s6 },
  ];

  // ── Scroll tracking ─────────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolledToBottom(true);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollDown = () => scrollRef.current?.scrollBy({ top: 300, behavior: 'smooth' });

  const canSubmitPolicy = scrolledToBottom && sigName.trim().length >= 3 && checked && !submitted;

  const handlePolicyAccept = () => {
    if (!canSubmitPolicy) return;
    setSubmitted(true);
    // Persist the explicit geolocation consent choice (opt-in, defaults to off)
    setGeoConsent(geoConsent);
    // Save locale to settings store
    try {
      useSettingsStore.getState().updateShop({ langue: locale });
    } catch { /* localStorage indisponible */ }
    saveLocale(locale);

    if (isNewInstall()) {
      const parts = sigName.trim().split(' ');
      setAdminPrenom(parts[0] ?? '');
      setAdminNom(parts.slice(1).join(' ') ?? '');
      setTimeout(() => { setPhase('admin-setup'); setSubmitted(false); }, 400);
    } else {
      savePolicyAcceptance(sigName);
      setTimeout(() => setAccepted(true), 800);
    }
  };

  // ── PIN numpad ──────────────────────────────────────────────────────────────

  const currentPin = pinStep === 'enter' ? adminPin : adminConfirmPin;

  const handlePinDigit = (digit: string) => {
    if (currentPin.length >= 4 || isCreating) return;
    const next = currentPin + digit;
    if (pinStep === 'enter') {
      setAdminPin(next);
      if (next.length === 4) setTimeout(() => setPinStep('confirm'), 200);
    } else {
      setAdminConfirmPin(next);
      if (next.length === 4) {
        if (next === adminPin) handleCreateAdmin(next);
        else {
          setPinError(true);
          setTimeout(() => { setAdminConfirmPin(''); setPinError(false); }, 600);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    if (isCreating) return;
    if (pinStep === 'enter') {
      setAdminPin(p => p.slice(0, -1));
    } else {
      if (adminConfirmPin.length === 0) { setPinStep('enter'); setAdminPin(''); }
      else setAdminConfirmPin(p => p.slice(0, -1));
    }
  };

  useEffect(() => {
    if (phase !== 'admin-setup') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handlePinDigit(e.key);
      else if (e.key === 'Backspace') handlePinBackspace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, adminPin, adminConfirmPin, pinStep, isCreating]); // eslint-disable-line

  const handleCreateAdmin = async (confirmedPin: string) => {
    if (!adminPrenom.trim() || !adminNom.trim()) return;
    setIsCreating(true);
    const salt = generateSalt();
    const hashedPin = await hashPin(confirmedPin, salt);
    localStorage.setItem(PENDING_ADMIN_KEY, JSON.stringify({ prenom: adminPrenom.trim(), nom: adminNom.trim(), hashedPin, salt }));
    savePolicyAcceptance(sigName);
    setTimeout(() => setAccepted(true), 600);
  };

  const canProceedToPin = adminPrenom.trim().length >= 2 && adminNom.trim().length >= 2;

  const switchLocale = (l: SupportedLocale) => { setLocale(l); saveLocale(l); };

  if (accepted) return <>{children}</>;

  // ── Phase 2: admin creation ─────────────────────────────────────────────────

  if (phase === 'admin-setup') {
    const A = T.admin;
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md nova-card p-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">{A.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{A.subtitle}</p>
            </div>
          </div>

          {pinStep === 'enter' && adminPin.length === 0 ? (
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{A.prenom} <span className="text-destructive">*</span></label>
                  <input type="text" value={adminPrenom} onChange={e => setAdminPrenom(e.target.value)} className="nova-input w-full" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{A.nom} <span className="text-destructive">*</span></label>
                  <input type="text" value={adminNom} onChange={e => setAdminNom(e.target.value)} className="nova-input w-full" />
                </div>
              </div>
              <div className="nova-card p-3 border-primary/20 bg-primary/5 text-xs text-muted-foreground">
                <KeyRound className="w-3.5 h-3.5 text-primary inline mr-1.5" />
                {A.pinInfo}
              </div>
              <div className={cn('w-full py-3 rounded-xl font-semibold text-sm text-center', canProceedToPin ? 'nova-btn-primary' : 'bg-muted text-muted-foreground')}>
                {canProceedToPin ? A.proceedHint + ' ↓' : A.waitHint}
              </div>
            </div>
          ) : (
            <div className="mb-2 nova-card p-3 border-border/60 bg-muted/30 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold text-white shrink-0" style={{ backgroundColor: '#A93200' }}>
                {adminPrenom[0]}{adminNom[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{adminPrenom} {adminNom}</p>
                <span className="text-[10px] font-medium bg-primary/15 text-primary px-2 py-0.5 rounded-full">{C.gerant}</span>
              </div>
            </div>
          )}

          {canProceedToPin && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground text-center mb-1">
                {pinStep === 'enter' ? A.pinEnter : A.pinConfirm}
              </p>
              <PinDots length={currentPin.length} error={pinError} />
              {pinError && <p className="text-center text-xs text-destructive mb-2 animate-fade-in">{A.pinMismatch}</p>}
              {isCreating && <p className="text-center text-xs text-secondary mb-2">{A.creating}</p>}
              <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto mt-3">
                {['1','2','3','4','5','6','7','8','9','','0','←'].map((key, i) => {
                  if (key === '') return <div key={i} />;
                  return (
                    <button key={i} onClick={() => key === '←' ? handlePinBackspace() : handlePinDigit(key)} disabled={isCreating}
                      className="w-16 h-16 rounded-xl bg-muted border border-border text-foreground text-xl font-medium hover:bg-muted/80 active:scale-95 transition-all mx-auto flex items-center justify-center disabled:opacity-40">
                      {key}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-4">{A.pinHint}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase 1: policy ─────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-4 bg-card">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">{T.title}</h1>
          <p className="text-xs text-muted-foreground">{T.version} {POLICY_VERSION} · {T.readHint}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* Language selector */}
          <select
            value={locale}
            onChange={e => switchLocale(e.target.value as SupportedLocale)}
            className="bg-muted text-foreground text-xs rounded-lg px-2 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            {ALL_LOCALES.map(l => (
              <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
            ))}
          </select>
          <svg viewBox="0 0 80 80" className="w-8 h-8" fill="none">
            <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="#A93200" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="20" y1="13" x2="20" y2="60" stroke="#A93200" strokeWidth="5" strokeLinecap="round"/>
            <line x1="20" y1="60" x2="34" y2="60" stroke="#A93200" strokeWidth="5" strokeLinecap="round"/>
          </svg>
          <span className="text-lg font-bold text-foreground">Legwan</span>
        </div>
      </div>

      {/* Scroll progress */}
      <div className="shrink-0 h-1 bg-muted">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: scrolledToBottom ? '100%' : '0%' }} />
      </div>

      {/* Policy content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 lg:px-12 lg:py-8" style={{ scrollBehavior: 'smooth' }}>
        <div className="max-w-3xl mx-auto space-y-6 pb-8">
          <div className="nova-card p-5 border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <ScrollText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">{T.intro}</p>
                <p className="text-xs text-muted-foreground mt-1">{T.introSub}</p>
              </div>
            </div>
          </div>

          {sections.map((section, i) => (
            <div key={i} className="nova-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">{section.title}</h2>
              <div className="text-sm text-muted-foreground leading-relaxed space-y-1.5">
                {section.content.split('\n').map((line, j) => {
                  if (line.startsWith('•')) return (
                    <div key={j} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      <span>{line.slice(1).trim()}</span>
                    </div>
                  );
                  if (line === '') return <div key={j} className="h-1" />;
                  return <p key={j}>{line}</p>;
                })}
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground text-center pb-4">
            Legwan Privacy Policy — {T.version} {POLICY_VERSION} — {T.inForce}
          </p>
        </div>
      </div>

      {/* Scroll hint */}
      {!scrolledToBottom && (
        <button onClick={scrollDown}
          className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border px-4 py-2 rounded-full shadow-lg hover:text-foreground transition-colors animate-bounce">
          <ChevronDown className="w-3 h-3" />
          {T.scrollDown}
        </button>
      )}

      {/* Signature & acceptance */}
      <div className="shrink-0 border-t border-border bg-card p-4 lg:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {!scrolledToBottom && (
            <p className="text-xs text-amber-500 text-center">{T.scrollHint}</p>
          )}

          {scrolledToBottom && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  {T.yourName} <span className="text-destructive">*</span>
                  <span className="text-muted-foreground/60 ml-1">{T.signature}</span>
                </label>
                <input type="text" value={sigName} onChange={e => setSigName(e.target.value)}
                  className="nova-input w-full" placeholder="Jean-Paul Nkomo" autoFocus />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">{T.date}</label>
                <div className="nova-input w-full text-muted-foreground bg-muted/50 cursor-not-allowed">{today}</div>
              </div>
            </div>
          )}

          {scrolledToBottom && (
            <label className="flex items-start gap-3 cursor-pointer">
              <div
                className={cn('w-5 h-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all',
                  checked ? 'bg-primary border-primary' : 'bg-transparent border-border hover:border-primary/50')}
                onClick={() => setChecked(c => !c)}
                role="checkbox" aria-checked={checked} tabIndex={0}
                onKeyDown={e => e.key === ' ' && setChecked(c => !c)}>
                {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <span className="text-sm text-muted-foreground">
                {T.checkLabel}{' '}<strong className="text-foreground">{T.checkBold}</strong>{' '}({T.version} {POLICY_VERSION}).
              </span>
            </label>
          )}

          {scrolledToBottom && (
            <label className="flex items-start gap-3 cursor-pointer">
              <div
                className={cn('w-5 h-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all',
                  geoConsent ? 'bg-primary border-primary' : 'bg-transparent border-border hover:border-primary/50')}
                onClick={() => setGeoConsentState(c => !c)}
                role="checkbox" aria-checked={geoConsent} tabIndex={0}
                onKeyDown={e => e.key === ' ' && setGeoConsentState(c => !c)}>
                {geoConsent && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <span className="text-sm text-muted-foreground">{T.geoConsent}</span>
            </label>
          )}

          <button onClick={handlePolicyAccept} disabled={!canSubmitPolicy}
            className={cn('w-full py-3 rounded-xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2',
              canSubmitPolicy ? 'nova-btn-primary' : 'bg-muted text-muted-foreground cursor-not-allowed',
              submitted && 'bg-secondary text-secondary-foreground')}
            aria-disabled={!canSubmitPolicy}>
            {submitted ? <><CheckCircle2 className="w-5 h-5" /> {T.accepted}</> : T.acceptBtn}
          </button>

          <p className="text-[10px] text-muted-foreground text-center">{T.local}</p>
        </div>
      </div>
    </div>
  );
};