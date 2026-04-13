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
    title: '1. Qui sommes-nous ?',
    content: `Legwan est un logiciel de gestion commerciale (point de vente, stocks, rapports financiers) conçu pour les petites et moyennes boutiques. Il est développé et distribué sous la marque Legwan.`,
  },
  {
    title: '2. Données collectées',
    content: `Le logiciel collecte et stocke les données suivantes dans votre compte boutique :
• Informations sur la boutique (nom, adresse, téléphone, email)
• Produits, catégories, prix d'achat et de vente, stocks
• Historique complet des ventes et transactions
• Mouvements de stock (entrées, sorties, ajustements)
• Informations sur les fournisseurs
• Clôtures de caisse et rapports financiers
• Informations sur les utilisateurs (prénom, nom, rôle, code PIN chiffré SHA-256)

Aucune donnée bancaire, de carte de crédit ou de paiement mobile n'est collectée ou stockée par Legwan.`,
  },
  {
    title: '3. Utilisation des données',
    content: `Vos données sont utilisées exclusivement pour :
• Le fonctionnement normal du logiciel (enregistrement des ventes, gestion des stocks, rapports)
• La synchronisation entre vos appareils via Firebase (infrastructure Google Cloud)
• La génération de statistiques et rapports locaux pour votre boutique

Legwan ne vend jamais vos données à des tiers. Vos données commerciales restent votre propriété exclusive.`,
  },
  {
    title: '4. Stockage et sécurité',
    content: `Les données sont stockées dans Firebase Firestore (Google Cloud Platform) avec :
• Chiffrement des données en transit via TLS 1.2+
• Chiffrement des données au repos par Google
• Codes PIN utilisateurs hachés avec SHA-256 (non réversibles)
• Accès sécurisé par authentification Firebase liée à votre identifiant appareil unique
• Isolation complète des données par boutique : chaque installation a son propre espace isolé`,
  },
  {
    title: '5. Conservation des données',
    content: `Vos données sont conservées tant que vous utilisez le logiciel. Vous pouvez à tout moment exporter ou supprimer vos données en nous contactant. En cas de désinstallation du logiciel, les données restent accessibles dans Firebase jusqu'à demande de suppression explicite.`,
  },
  {
    title: '6. Droits de l\'utilisateur',
    content: `Conformément à la réglementation applicable, vous disposez des droits suivants :
• Droit d'accès : consulter toutes les données depuis le logiciel
• Droit de rectification : modifier vos informations dans les paramètres
• Droit à l'exportation : exporter vos données au format CSV ou PDF
• Droit à la suppression : demander la suppression complète de vos données
• Droit à la portabilité : récupérer vos données dans un format standard

Pour exercer ces droits, contactez-nous à support@legwan.cm`,
  },
  {
    title: '7. Partage des données',
    content: `Vos données ne sont accessibles qu'à travers votre identifiant boutique unique. Nous ne partageons pas vos données avec des tiers, sauf :
• Obligation légale (réquisition judiciaire, autorité compétente)
• Infrastructure technique nécessaire (Google Firebase/Firestore)

Google traite les données en tant que sous-traitant selon ses propres politiques de confidentialité.`,
  },
  {
    title: '8. Modifications de la politique',
    content: `Cette politique de confidentialité peut être mise à jour. En cas de modification substantielle, vous serez informé lors de la prochaine ouverture du logiciel et devrez accepter la nouvelle version pour continuer à utiliser Legwan.`,
  },
  {
    title: '9. Contact et support',
    content: `Pour toute question, réclamation ou exercice de vos droits concernant vos données personnelles :

Email : support@legwan.cm
Adresse : Douala, Cameroun

Nous nous engageons à répondre à toute demande dans un délai de 30 jours ouvrables.`,
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
          <svg viewBox="0 0 40 40" className="w-8 h-8">
            <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#A93200" strokeWidth="2" />
            <path d="M20,12 L20,28 M16,20 L20,12 L24,20" stroke="#A93200" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
                  Avant d'utiliser Legwan, veuillez lire attentivement cette politique de confidentialité.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Elle explique quelles données sont collectées, comment elles sont utilisées et protégées,
                  et quels sont vos droits. Vous devez lire l'intégralité du document et signer pour continuer.
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
                J'ai lu et j'accepte intégralement la{' '}
                <strong className="text-foreground">Politique de Confidentialité de Legwan</strong>
                {' '}dans sa version {POLICY_VERSION}. Je comprends comment mes données sont collectées,
                utilisées et protégées.
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
            En cliquant sur ce bouton, vous signez électroniquement votre accord avec cette politique.
            Cette acceptation est enregistrée localement sur votre appareil.
          </p>
        </div>
      </div>
    </div>
  );
};
