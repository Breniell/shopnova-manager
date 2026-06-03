/**
 * PolicyGate â€” Ã‰cran de politique de confidentialitÃ© + crÃ©ation du compte admin
 *
 * AffichÃ© uniquement Ã  la premiÃ¨re installation (ou si la version de politique change).
 *
 * Phase 1 â€” Politique :
 *   1. Lire la politique jusqu'en bas (scroll obligatoire)
 *   2. Entrer son nom complet (signature numÃ©rique)
 *   3. Cocher la case d'acceptation
 *   4. Cliquer sur "J'accepte"
 *
 * Phase 2 â€” Compte administrateur (nouvelles installations uniquement) :
 *   5. Saisir prÃ©nom, nom et code PIN (4 chiffres)
 *   6. Confirmer le PIN
 *   7. Cliquer sur "CrÃ©er mon compte"
 *
 * Le profil ainsi crÃ©Ã© devient l'unique compte gÃ©rant initial de la boutique.
 * Les donnÃ©es du compte en attente sont stockÃ©es sous legwan-pending-admin
 * (PIN hachÃ© + sel par utilisateur) et consommÃ©es par FirebaseProvider.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, ScrollText, Shield, ChevronDown, UserPlus, KeyRound } from 'lucide-react';
import { hashPin, generateSalt } from '@/lib/crypto';

const POLICY_VERSION = '1.4.1';
const STORAGE_KEY    = 'legwan-policy-accepted';
const PENDING_ADMIN_KEY = 'legwan-pending-admin';

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

/** True if the user has never accepted any version of the policy (brand-new install). */
function isNewInstall(): boolean {
  return localStorage.getItem(STORAGE_KEY) === null;
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

// â”€â”€â”€ Policy sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const sections = [
  {
    title: '1. PrÃ©sentation',
    content: `Legwan est un logiciel de gestion de boutique (caisse, stocks, rapports) destinÃ© aux commerÃ§ants d'Afrique subsaharienne. En installant et en utilisant ce logiciel, vous acceptez les conditions dÃ©crites dans cette politique.`,
  },
  {
    title: '2. DonnÃ©es enregistrÃ©es',
    content: `Legwan enregistre uniquement les informations nÃ©cessaires au fonctionnement de votre boutique :
â€¢ Compte administrateur : prÃ©nom, nom, rÃ´le (crÃ©Ã© lors de la premiÃ¨re installation)
â€¢ Comptes utilisateurs supplÃ©mentaires : nom, rÃ´le, code PIN (hachÃ© de maniÃ¨re irrÃ©versible)
â€¢ Informations de la boutique : nom, adresse, tÃ©lÃ©phone
â€¢ Produits : dÃ©signation, prix, stock
â€¢ Ventes et transactions
â€¢ Mouvements de stock
â€¢ Fournisseurs et clients
â€¢ ClÃ´tures de caisse et sessions de caisse

Aucune donnÃ©e bancaire ni de paiement ne sont collectÃ©es.`,
  },
  {
    title: '3. Utilisation des donnÃ©es',
    content: `Vos donnÃ©es servent exclusivement Ã  :
â€¢ Faire fonctionner le logiciel (ventes, stocks, rapports)
â€¢ Synchroniser vos donnÃ©es entre appareils via les serveurs de Google (Firebase)
â€¢ Permettre Ã  l'Ã©diteur de Legwan de monitorer la qualitÃ© du service : des statistiques agrÃ©gÃ©es anonymisÃ©es (nombre de ventes, chiffre d'affaires total, nombre de produits, version de l'application) sont envoyÃ©es Ã  une plateforme centralisÃ©e pour assurer la maintenance et les mises Ã  jour

Ces donnÃ©es agrÃ©gÃ©es ne contiennent aucune donnÃ©e personnelle (noms de clients, dÃ©tails de transactions).

Legwan ne vend pas vos donnÃ©es et n'y accÃ¨de pas Ã  des fins commerciales. Vos donnÃ©es vous appartiennent.`,
  },
  {
    title: '4. SÃ©curitÃ©',
    content: `Vos donnÃ©es sont hÃ©bergÃ©es sur Firebase (Google Cloud), avec chiffrement en transit et au repos. Les codes PIN sont hachÃ©s de maniÃ¨re irrÃ©versible avec un sel cryptographique unique par utilisateur. Chaque boutique dispose de son propre espace de donnÃ©es isolÃ© inaccessible aux autres boutiques.`,
  },
  {
    title: '5. Vos droits',
    content: `Vous pouvez Ã  tout moment :
â€¢ Consulter vos donnÃ©es depuis le logiciel
â€¢ Modifier vos informations dans les paramÃ¨tres
â€¢ Exporter vos donnÃ©es (CSV, PDF)
â€¢ Demander la suppression de vos donnÃ©es

Pour toute demande : support@legwan.cm`,
  },
  {
    title: '6. Mises Ã  jour de cette politique',
    content: `Cette politique peut Ã©voluer. En cas de modification importante, vous serez invitÃ© Ã  l'accepter Ã  nouveau lors de l'ouverture du logiciel.`,
  },
];

// â”€â”€â”€ PIN digit pad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PinDots: React.FC<{ length: number; error: boolean }> = ({ length, error }) => (
  <div className={cn('flex justify-center gap-3 my-4', error && 'animate-[pin-shake_0.4s_ease-in-out]')}>
    {[0, 1, 2, 3].map(i => (
      <div
        key={i}
        className={cn(
          'w-3.5 h-3.5 rounded-full transition-all duration-150',
          i < length
            ? error ? 'bg-destructive scale-110' : 'bg-primary scale-110'
            : 'bg-muted-foreground/30'
        )}
      />
    ))}
  </div>
);

// â”€â”€â”€ PolicyGate component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Phase = 'policy' | 'admin-setup';

export const PolicyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accepted, setAccepted] = useState(isPolicyAccepted);
  const [phase, setPhase] = useState<Phase>('policy');

  // Phase 1 state
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [sigName, setSigName] = useState('');
  const [checked, setChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Phase 2 state â€” admin account creation
  const [adminPrenom, setAdminPrenom] = useState('');
  const [adminNom, setAdminNom] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [adminConfirmPin, setAdminConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [pinError, setPinError] = useState(false);
  const [showPinText, setShowPinText] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // â”€â”€ Phase 1: scroll tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollDown = () => {
    scrollRef.current?.scrollBy({ top: 300, behavior: 'smooth' });
  };

  const canSubmitPolicy = scrolledToBottom && sigName.trim().length >= 3 && checked && !submitted;

  const handlePolicyAccept = () => {
    if (!canSubmitPolicy) return;
    setSubmitted(true);

    if (isNewInstall()) {
      // Pre-fill admin name from signature
      const parts = sigName.trim().split(' ');
      setAdminPrenom(parts[0] ?? '');
      setAdminNom(parts.slice(1).join(' ') ?? '');
      // Go to admin setup instead of finishing immediately
      setTimeout(() => {
        setPhase('admin-setup');
        setSubmitted(false);
      }, 400);
    } else {
      // Existing install re-accepting after version update â€” no admin setup needed
      savePolicyAcceptance(sigName);
      setTimeout(() => setAccepted(true), 800);
    }
  };

  // â”€â”€ Phase 2: PIN numpad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const currentPin = pinStep === 'enter' ? adminPin : adminConfirmPin;

  const handlePinDigit = (digit: string) => {
    if (currentPin.length >= 4 || isCreating) return;
    const next = currentPin + digit;

    if (pinStep === 'enter') {
      setAdminPin(next);
      if (next.length === 4) {
        setTimeout(() => setPinStep('confirm'), 200);
      }
    } else {
      setAdminConfirmPin(next);
      if (next.length === 4) {
        if (next === adminPin) {
          // PINs match â€” create account
          handleCreateAdmin(next);
        } else {
          // Mismatch â€” shake and reset confirm
          setPinError(true);
          setTimeout(() => {
            setAdminConfirmPin('');
            setPinError(false);
          }, 600);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    if (isCreating) return;
    if (pinStep === 'enter') {
      setAdminPin(p => p.slice(0, -1));
    } else {
      if (adminConfirmPin.length === 0) {
        // Go back to entry step
        setPinStep('enter');
        setAdminPin('');
      } else {
        setAdminConfirmPin(p => p.slice(0, -1));
      }
    }
  };

  // Keyboard support in phase 2
  useEffect(() => {
    if (phase !== 'admin-setup') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handlePinDigit(e.key);
      else if (e.key === 'Backspace') handlePinBackspace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, adminPin, adminConfirmPin, pinStep, isCreating]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateAdmin = async (confirmedPin: string) => {
    if (!adminPrenom.trim() || !adminNom.trim()) return;
    setIsCreating(true);

    const salt = generateSalt();
    const hashedPin = await hashPin(confirmedPin, salt);

    localStorage.setItem(PENDING_ADMIN_KEY, JSON.stringify({
      prenom: adminPrenom.trim(),
      nom: adminNom.trim(),
      hashedPin,
      salt,
    }));

    savePolicyAcceptance(sigName);
    setTimeout(() => setAccepted(true), 600);
  };

  const canProceedToPin = adminPrenom.trim().length >= 2 && adminNom.trim().length >= 2;

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (accepted) return <>{children}</>;

  // â”€â”€ Phase 2: admin account creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (phase === 'admin-setup') {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md nova-card p-8 animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">CrÃ©ez votre compte administrateur</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ce compte vous donne accÃ¨s Ã  toutes les fonctions de gestion.
              </p>
            </div>
          </div>

          {/* Name fields (only editable before PIN entry) */}
          {pinStep === 'enter' && adminPin.length === 0 ? (
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">PrÃ©nom <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={adminPrenom}
                    onChange={e => setAdminPrenom(e.target.value)}
                    className="nova-input w-full"
                    placeholder="Jean-Paul"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nom <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={adminNom}
                    onChange={e => setAdminNom(e.target.value)}
                    className="nova-input w-full"
                    placeholder="Nkomo"
                  />
                </div>
              </div>

              <div className="nova-card p-3 border-primary/20 bg-primary/5 text-xs text-muted-foreground">
                <KeyRound className="w-3.5 h-3.5 text-primary inline mr-1.5" />
                Vous choisirez un code PIN Ã  4 chiffres Ã  l'Ã©tape suivante. Vous pourrez ajouter d'autres utilisateurs depuis les ParamÃ¨tres.
              </div>

              <button
                onClick={() => canProceedToPin && undefined}
                disabled={!canProceedToPin}
                className={cn(
                  'w-full py-3 rounded-xl font-semibold text-sm transition-all',
                  canProceedToPin
                    ? 'nova-btn-primary cursor-default'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
                style={{ pointerEvents: canProceedToPin ? 'none' : undefined }}
              >
                {canProceedToPin
                  ? 'Choisissez votre code PIN ci-dessous â†“'
                  : 'Renseignez prÃ©nom et nom pour continuer'}
              </button>
            </div>
          ) : (
            <div className="mb-2 nova-card p-3 border-border/60 bg-muted/30 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold text-white shrink-0"
                style={{ backgroundColor: '#A93200' }}
              >
                {adminPrenom[0]}{adminNom[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{adminPrenom} {adminNom}</p>
                <span className="text-[10px] font-medium bg-primary/15 text-primary px-2 py-0.5 rounded-full">GÃ©rant</span>
              </div>
            </div>
          )}

          {/* PIN section */}
          {canProceedToPin && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground text-center mb-1">
                {pinStep === 'enter'
                  ? 'Choisissez votre code PIN (4 chiffres)'
                  : 'Confirmez votre code PIN'}
              </p>

              <PinDots length={currentPin.length} error={pinError} />

              {pinError && (
                <p className="text-center text-xs text-destructive mb-2 animate-fade-in">
                  Les codes PIN ne correspondent pas â€” recommencez
                </p>
              )}

              {isCreating && (
                <p className="text-center text-xs text-secondary mb-2 animate-fade-in">
                  CrÃ©ation du compteâ€¦
                </p>
              )}

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto mt-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'â†'].map((key, i) => {
                  if (key === '') return <div key={i} />;
                  return (
                    <button
                      key={i}
                      onClick={() => key === 'â†' ? handlePinBackspace() : handlePinDigit(key)}
                      disabled={isCreating}
                      className="w-16 h-16 rounded-xl bg-muted border border-border text-foreground text-xl font-medium hover:bg-muted/80 active:scale-95 transition-all duration-100 mx-auto flex items-center justify-center disabled:opacity-40"
                    >
                      {key}
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] text-muted-foreground text-center mt-4">
                Votre PIN ne sera jamais affichÃ© ni stockÃ© en clair.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // â”€â”€ Phase 1: policy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-4 bg-card">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">
            Politique de ConfidentialitÃ© â€” Legwan
          </h1>
          <p className="text-xs text-muted-foreground">
            Version {POLICY_VERSION} Â· Veuillez lire et accepter avant d'utiliser le logiciel
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
          style={{ width: scrolledToBottom ? '100%' : '0%' }}
        />
      </div>

      {/* Scrollable policy content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 lg:px-12 lg:py-8"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="max-w-3xl mx-auto space-y-6 pb-8">
          <div className="nova-card p-5 border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <ScrollText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Lisez cette politique avant d'utiliser Legwan.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Elle explique comment vos donnÃ©es sont gÃ©rÃ©es et protÃ©gÃ©es. Faites dÃ©filer jusqu'en bas, puis signez pour continuer.
                </p>
              </div>
            </div>
          </div>

          {sections.map((section, i) => (
            <div key={i} className="nova-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">{section.title}</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}

          <p className="text-xs text-muted-foreground text-center pb-4">
            Politique de confidentialitÃ© Legwan â€” Version {POLICY_VERSION} â€” En vigueur depuis le 1er janvier 2026
          </p>
        </div>
      </div>

      {/* Scroll-to-bottom hint */}
      {!scrolledToBottom && (
        <button
          onClick={scrollDown}
          className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border px-4 py-2 rounded-full shadow-lg hover:text-foreground transition-colors animate-bounce"
          aria-label="Faire dÃ©filer vers le bas"
        >
          <ChevronDown className="w-3 h-3" />
          Faites dÃ©filer pour lire la suite
        </button>
      )}

      {/* Signature & acceptance panel */}
      <div className="shrink-0 border-t border-border bg-card p-4 lg:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {!scrolledToBottom && (
            <p className="text-xs text-amber-500 text-center">
              Lisez l'intÃ©gralitÃ© de la politique de confidentialitÃ© pour continuer.
            </p>
          )}

          {scrolledToBottom && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Votre nom complet <span className="text-destructive">*</span>
                  <span className="text-muted-foreground/60 ml-1">(signature numÃ©rique)</span>
                </label>
                <input
                  type="text"
                  value={sigName}
                  onChange={e => setSigName(e.target.value)}
                  className="nova-input w-full"
                  placeholder="Ex: Jean-Paul Nkomo"
                  autoFocus
                  aria-label="Votre nom complet pour signer"
                />
              </div>
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
                <strong className="text-foreground">Politique de confidentialitÃ© Legwan</strong>
                {' '}(version {POLICY_VERSION}).
              </span>
            </label>
          )}

          <button
            onClick={handlePolicyAccept}
            disabled={!canSubmitPolicy}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2',
              canSubmitPolicy
                ? 'nova-btn-primary'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
              submitted && 'bg-secondary text-secondary-foreground'
            )}
            aria-disabled={!canSubmitPolicy}
          >
            {submitted ? (
              <><CheckCircle2 className="w-5 h-5" /> AcceptÃ©â€¦</>
            ) : (
              <>J'accepte et je continue vers Legwan</>
            )}
          </button>

          <p className="text-[10px] text-muted-foreground text-center">
            Votre acceptation est enregistrÃ©e localement sur cet appareil.
          </p>
        </div>
      </div>
    </div>
  );
};

