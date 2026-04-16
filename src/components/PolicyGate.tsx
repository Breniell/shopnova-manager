/**
 * PolicyGate — Écran de politique de confidentialité
 *
 * Affiché au premier lancement du logiciel (ou après une mise à jour de politique).
 * L'utilisateur doit :
 *   1. Lire la politique jusqu'en bas (scroll obligatoire)
 *   2. Entrer son nom (signature numérique)
 *   3. Cocher la case d'acceptation
 *   4. Cliquer sur "J'accepte et je continue"
 *
 * L'acceptation est enregistrée dans localStorage avec date et version.
 * Si la version de la politique change, l'écran réapparaît.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, ScrollText, Shield, ChevronDown } from 'lucide-react';

const POLICY_VERSION = '1.0';
const STORAGE_KEY    = 'legwan-policy-accepted';

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
  } catch {
    return false;
  }
}

function savePolicyAcceptance(name: string): void {
  const record: PolicyRecord = {
    version: POLICY_VERSION,
    accepted: true,
    name: name.trim(),
    date: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

// ─── Policy text ──────────────────────────────────────────────────────────────

const sections = [
  {
    title: '1. Présentation',
    content: `Legwan est un logiciel de gestion de boutique (caisse, stocks, rapports) destiné aux commerçants. En utilisant ce logiciel, vous acceptez les conditions décrites dans cette politique.`,
  },
  {
    title: '2. Données enregistrées',
    content: `Legwan enregistre uniquement les informations nécessaires au fonctionnement de votre boutique :
• Informations de la boutique : nom, adresse, téléphone
• Produits : désignation, prix, stock
• Ventes et transactions
• Mouvements de stock
• Fournisseurs
• Clôtures de caisse
• Comptes utilisateurs : nom, rôle, code PIN (chiffré, non lisible)

Aucune donnée bancaire ni de paiement n'est collectée.`,
  },
  {
    title: '3. Utilisation des données',
    content: `Vos données servent exclusivement à :
• Faire fonctionner le logiciel (ventes, stocks, rapports)
• Synchroniser vos données entre appareils via les serveurs de Google (Firebase)

Legwan ne vend pas vos données et n'y accède pas à des fins commerciales. Vos données vous appartiennent.`,
  },
  {
    title: '4. Sécurité',
    content: `Vos données sont hébergées sur Firebase (Google Cloud), avec chiffrement en transit et au repos. Les codes PIN sont hachés de manière irréversible. Chaque boutique dispose de son propre espace de données isolé.`,
  },
  {
    title: '5. Vos droits',
    content: `Vous pouvez à tout moment :
• Consulter vos données depuis le logiciel
• Modifier vos informations dans les paramètres
• Exporter vos données (CSV, PDF)
• Demander la suppression de vos données

Pour toute demande : support@legwan.cm`,
  },
  {
    title: '6. Mises à jour de cette politique',
    content: `Cette politique peut évoluer. En cas de modification, vous serez invité à l'accepter à nouveau lors de l'ouverture du logiciel.`,
  },
];

// ─── PolicyGate component ─────────────────────────────────────────────────────

export const PolicyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accepted, setAccepted] = useState(isPolicyAccepted);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [name, setName] = useState('');
  const [checked, setChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) setScrolledToBottom(true);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    // Check immediately in case content is short
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollDown = () => {
    scrollRef.current?.scrollBy({ top: 300, behavior: 'smooth' });
  };

  const canSubmit = scrolledToBottom && name.trim().length >= 3 && checked && !submitted;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSubmitted(true);
    savePolicyAcceptance(name);
    setTimeout(() => setAccepted(true), 800);
  };

  if (accepted) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-4 bg-card">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">
            Politique de Confidentialité — Legwan
          </h1>
          <p className="text-xs text-muted-foreground">
            Version {POLICY_VERSION} · Veuillez lire et accepter avant d'utiliser le logiciel
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <svg viewBox="0 0 80 80" className="w-8 h-8" fill="none">
            <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="#A93200" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="20" y1="13" x2="20" y2="60" stroke="#A93200" strokeWidth="5" strokeLinecap="round"/>
            <line x1="20" y1="60" x2="34" y2="60" stroke="#A93200" strokeWidth="5" strokeLinecap="round"/>
          </svg>
          <span className="text-lg font-bold text-foreground">Legwan</span>
        </div>
      </div>

      {/* Scroll progress indicator */}
      <div className="shrink-0 h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{
            width: scrolledToBottom ? '100%' : '0%',
          }}
        />
      </div>

      {/* Scrollable policy content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 lg:px-12 lg:py-8"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="max-w-3xl mx-auto space-y-6 pb-8">
          {/* Intro */}
          <div className="nova-card p-5 border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <ScrollText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Lisez cette politique avant d'utiliser Legwan.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Elle explique comment vos données sont gérées et protégées. Faites défiler jusqu'en bas, puis signez pour continuer.
                </p>
              </div>
            </div>
          </div>

          {/* Sections */}
          {sections.map((section, i) => (
            <div key={i} className="nova-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">{section.title}</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}

          {/* Last updated */}
          <p className="text-xs text-muted-foreground text-center pb-4">
            Politique de confidentialité Legwan — Version {POLICY_VERSION} — En vigueur depuis le 1er janvier 2026
          </p>
        </div>
      </div>

      {/* Scroll-to-bottom hint */}
      {!scrolledToBottom && (
        <button
          onClick={scrollDown}
          className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border px-4 py-2 rounded-full shadow-lg hover:text-foreground transition-colors animate-bounce"
          aria-label="Faire défiler vers le bas"
        >
          <ChevronDown className="w-3 h-3" />
          Faites défiler pour lire la suite
        </button>
      )}

      {/* Signature & acceptance panel */}
      <div className="shrink-0 border-t border-border bg-card p-4 lg:p-6">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* Status message */}
          {!scrolledToBottom && (
            <p className="text-xs text-amber-500 text-center">
              Lisez l'intégralité de la politique de confidentialité pour continuer.
            </p>
          )}

          {scrolledToBottom && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Signature */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Votre nom complet <span className="text-destructive">*</span>
                  <span className="text-muted-foreground/60 ml-1">(signature numérique)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="nova-input w-full"
                  placeholder="Ex: Jean-Paul Nkomo"
                  autoFocus
                  aria-label="Votre nom complet pour signer"
                />
              </div>
              {/* Date */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Date d'acceptation</label>
                <div className="nova-input w-full text-muted-foreground bg-muted/50 cursor-not-allowed">
                  {today}
                </div>
              </div>
            </div>
          )}

          {scrolledToBottom && (
            <label className="flex items-start gap-3 cursor-pointer">
              <div
                className={cn(
                  'w-5 h-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all',
                  checked
                    ? 'bg-primary border-primary'
                    : 'bg-transparent border-border hover:border-primary/50'
                )}
                onClick={() => setChecked(c => !c)}
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                onKeyDown={e => e.key === ' ' && setChecked(c => !c)}
              >
                {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <span className="text-sm text-muted-foreground">
                J'ai lu et j'accepte la{' '}
                <strong className="text-foreground">Politique de confidentialité Legwan</strong>
                {' '}(version {POLICY_VERSION}).
              </span>
            </label>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2',
              canSubmit
                ? 'nova-btn-primary'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
              submitted && 'bg-secondary text-secondary-foreground'
            )}
            aria-disabled={!canSubmit}
          >
            {submitted ? (
              <><CheckCircle2 className="w-5 h-5" /> Accepté — Chargement…</>
            ) : (
              <>J'accepte et je continue vers Legwan</>
            )}
          </button>

          <p className="text-[10px] text-muted-foreground text-center">
            Votre acceptation est enregistrée localement sur cet appareil.
          </p>
        </div>
      </div>
    </div>
  );
};
