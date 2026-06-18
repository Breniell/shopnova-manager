/**
 * LicenseGate — wraps the app and enforces licence validity.
 *
 * Mount order: FirebaseProvider → HashRouter → LicenseGate → Routes
 * Superadmin path (/superadmin) is always accessible (publisher's console).
 *
 * The gate SKIPS all checks when VITE_LICENSE_PUBKEY is not set, so
 * developers can run the app in local mode without a key.
 *
 * Exports LicenseGateContext so child routes (e.g. ParametresPage) can read
 * the current status and trigger a recheck after manual activation.
 */
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation }        from 'react-router-dom';
import { AlertTriangle, X, KeyRound } from 'lucide-react';
import { LoadingSpinner }     from '@/components/ui/LoadingSpinner';
import { LicenseBlockedScreen } from '@/components/LicenseBlockedScreen';
import { LicenseActivationForm } from '@/components/LicenseActivationForm';
import { useTranslation }     from '@/i18n';
import { verifyLicense }      from '@/lib/license/verify';
import {
  getLicenseString,
  getOrCreateInstallDate,
  getLastSeenTime,
  setLastSeenTime,
  fsGetLicense,
  fsSaveLicense,
} from '@/lib/license/store';
import { getTrustedNow }      from '@/lib/license/clock';
import {
  computeGateStatus,
  trialDaysLeft,
  graceDaysLeft,
  isBlocked,
  type GateStatus,
} from '@/lib/license/gate';
import { getBoutiqueId } from '@/services/boutiqueService';

const PUBKEY_CONFIGURED = !!import.meta.env.VITE_LICENSE_PUBKEY;
const SUPPORT_CONTACT   = import.meta.env.VITE_SUPPORT_CONTACT ?? 'contact@legwan.com';

// ─── Gate context (read by child routes) ─────────────────────────────────────

export interface LicenseGateCtx {
  status:    GateStatus;
  trialLeft: number;
  graceLeft: number;
  expiresAt: number | null;
  recheck:   () => void;
}

export const LicenseGateContext = React.createContext<LicenseGateCtx | null>(null);

/** Access the current licence gate state from any child of LicenseGate. */
export function useLicenseGate(): LicenseGateCtx | null {
  return React.useContext(LicenseGateContext);
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface GateState {
  status:        GateStatus;
  clockWarning:  boolean;
  trialLeft:     number;
  graceLeft:     number;
  expiresAt:     number | null;
}

const INITIAL: GateState = {
  status: 'checking', clockWarning: false, trialLeft: 0, graceLeft: 0, expiresAt: null,
};

// ─── Activation modal ─────────────────────────────────────────────────────────

function ActivationModal({ onClose, onActivated }: { onClose: () => void; onActivated: () => void }) {
  const { t } = useTranslation();
  let boutiqueId = '–';
  try { boutiqueId = getBoutiqueId(); } catch {}

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">{t('license.settingsTitle')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <p className="text-xs text-muted-foreground">{t('license.boutiqueIdLabel')}</p>
          <p className="font-mono text-xs font-semibold select-all break-all text-foreground">{boutiqueId}</p>
        </div>

        <div className="text-xs text-muted-foreground">
          <span className="font-medium">{t('license.contactLabel')} </span>
          <span className="font-semibold text-foreground">{SUPPORT_CONTACT}</span>
        </div>

        <LicenseActivationForm onActivated={onActivated} />
      </div>
    </div>
  );
}

// ─── Banners ──────────────────────────────────────────────────────────────────

function ClockWarningBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-2
                    flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{t('license.clockWarning')}</span>
      <button onClick={onDismiss} className="p-0.5 rounded hover:bg-amber-500/20">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TrialBanner({ daysLeft, onActivate }: { daysLeft: number; onActivate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="w-full bg-blue-500/10 border-b border-blue-500/30 px-4 py-2
                    flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{t('license.trialBanner').replace('{days}', String(daysLeft))}</span>
      <button
        onClick={onActivate}
        className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline transition-all"
      >
        {t('license.activateBannerBtn')}
      </button>
    </div>
  );
}

function GraceBanner({ daysExpired, daysLeft, onActivate }: { daysExpired: number; daysLeft: number; onActivate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/30 px-4 py-2
                    flex items-center gap-2 text-destructive text-sm font-medium">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        {t('license.graceBanner')
          .replace('{days}',      String(daysExpired))
          .replace('{remaining}', String(daysLeft))}
      </span>
      <button
        onClick={onActivate}
        className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline transition-all"
      >
        {t('license.activateBannerBtn')}
      </button>
    </div>
  );
}

// ─── LicenseGate ─────────────────────────────────────────────────────────────

interface LicenseGateProps { children: ReactNode }

export const LicenseGate: React.FC<LicenseGateProps> = ({ children }) => {
  const location                  = useLocation();
  const [gate, setGate]           = useState<GateState>(INITIAL);
  const [cwDismissed, setCwDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const checkingRef               = useRef(false);

  // Superadmin path is never gated — it's the publisher's console.
  const isSuperAdmin = import.meta.env.VITE_ENABLE_SUPERADMIN === 'true' && location.pathname.startsWith('/superadmin');

  // Dev mode without a key → skip all checks.
  const shouldSkip = !PUBKEY_CONFIGURED || isSuperAdmin;

  const openModal  = () => setShowModal(true);
  const closeModal = () => setShowModal(false);
  const handleModalActivated = () => { closeModal(); void runCheck(); };

  const runCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;

    try {
      const { getBoutiqueId } = await import('@/services/boutiqueService');
      let bid: string;
      try { bid = getBoutiqueId(); } catch { bid = 'local-boutique'; }

      // ── 1. Load timestamps ──────────────────────────────────────────────────
      const [installDate, lastSeenMs] = await Promise.all([
        getOrCreateInstallDate(bid),
        getLastSeenTime(bid),
      ]);

      // ── 2. Get trusted time ────────────────────────────────────────────────
      const { now, clockWarning } = await getTrustedNow(lastSeenMs);

      // Persist the new trusted time (do not await — non-blocking).
      setLastSeenTime(now, bid).catch(() => {});

      // ── 3. Verify licence ──────────────────────────────────────────────────
      const licStr = getLicenseString();
      let licenseResult = licStr
        ? await verifyLicense(licStr, { now, boutiqueId: bid })
        : null;

      // ── 4. Check Firestore revocation (soft, online-only) ──────────────────
      let revoked = false;
      const fsDoc = await fsGetLicense(bid);
      if (fsDoc?.revoked) {
        revoked = true;
      } else if (fsDoc?.licenseStr && !licStr) {
        // Licence present in Firestore but missing locally (reinstall) → restore it.
        const { setLicenseString } = await import('@/lib/license/store');
        setLicenseString(fsDoc.licenseStr);
        licenseResult = await verifyLicense(fsDoc.licenseStr, { now, boutiqueId: bid });
        if (licenseResult.valid && licenseResult.payload) {
          await fsSaveLicense(bid, fsDoc.licenseStr, licenseResult.payload);
        }
      }

      // ── 5. Compute status ──────────────────────────────────────────────────
      const status  = computeGateStatus({ licenseResult, now, installDate, revoked });
      const expAt   = licenseResult?.payload?.expiresAt ?? 0;

      setGate({
        status,
        clockWarning,
        trialLeft: trialDaysLeft(now, installDate),
        graceLeft: expAt > 0 ? graceDaysLeft(now, expAt) : 0,
        expiresAt: expAt > 0 ? expAt : null,
      });

    } catch {
      // On unexpected error, default to 'valid' to avoid blocking honest users.
      setGate({ status: 'valid', clockWarning: false, trialLeft: 0, graceLeft: 0, expiresAt: null });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // Initial check.
  useEffect(() => {
    if (shouldSkip) { setGate({ status: 'valid', clockWarning: false, trialLeft: 0, graceLeft: 0, expiresAt: null }); return; }
    void runCheck();
  }, [shouldSkip, runCheck]);

  // Re-check when the window regains focus (clock may have changed).
  useEffect(() => {
    if (shouldSkip) return;
    const onFocus = () => void runCheck();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [shouldSkip, runCheck]);

  // ── Rendering ──────────────────────────────────────────────────────────────

  if (gate.status === 'checking') {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  }

  if (isBlocked(gate.status)) {
    return (
      <LicenseBlockedScreen
        status={gate.status as never}
        onActivated={runCheck}
      />
    );
  }

  // Days-since-expiry for the grace banner.
  // grace = expired within GRACE_DAYS; compute days since expiry.
  const graceExpiredDays = gate.status === 'grace' ? (7 - gate.graceLeft) : 0;

  const ctx: LicenseGateCtx = {
    status:    gate.status,
    trialLeft: gate.trialLeft,
    graceLeft: gate.graceLeft,
    expiresAt: gate.expiresAt,
    recheck:   runCheck,
  };

  return (
    <LicenseGateContext.Provider value={ctx}>
      {gate.clockWarning && !cwDismissed && (
        <ClockWarningBanner onDismiss={() => setCwDismissed(true)} />
      )}
      {gate.status === 'trial' && (
        <TrialBanner daysLeft={gate.trialLeft} onActivate={openModal} />
      )}
      {gate.status === 'grace' && (
        <GraceBanner daysExpired={graceExpiredDays} daysLeft={gate.graceLeft} onActivate={openModal} />
      )}
      {showModal && (
        <ActivationModal onClose={closeModal} onActivated={handleModalActivated} />
      )}
      {children}
    </LicenseGateContext.Provider>
  );
};
