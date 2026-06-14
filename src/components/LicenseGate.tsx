/**
 * LicenseGate — wraps the app and enforces licence validity.
 *
 * Mount order: FirebaseProvider → HashRouter → LicenseGate → Routes
 * Superadmin path (/superadmin) is always accessible (publisher's console).
 *
 * The gate SKIPS all checks when VITE_LICENSE_PUBKEY is not set, so
 * developers can run the app in local mode without a key.
 */
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation }        from 'react-router-dom';
import { AlertTriangle, X }   from 'lucide-react';
import { LoadingSpinner }     from '@/components/ui/LoadingSpinner';
import { LicenseBlockedScreen } from '@/components/LicenseBlockedScreen';
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

const PUBKEY_CONFIGURED = !!import.meta.env.VITE_LICENSE_PUBKEY;

interface GateState {
  status:        GateStatus;
  clockWarning:  boolean;
  trialLeft:     number;
  graceLeft:     number;
}

const INITIAL: GateState = {
  status: 'checking', clockWarning: false, trialLeft: 0, graceLeft: 0,
};

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

function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const { t } = useTranslation();
  return (
    <div className="w-full bg-blue-500/10 border-b border-blue-500/30 px-4 py-2
                    flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{t('license.trialBanner').replace('{days}', String(daysLeft))}</span>
    </div>
  );
}

function GraceBanner({ daysExpired, daysLeft }: { daysExpired: number; daysLeft: number }) {
  const { t } = useTranslation();
  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/30 px-4 py-2
                    flex items-center gap-2 text-destructive text-sm font-medium">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        {t('license.graceBanner')
          .replace('{days}',      String(daysExpired))
          .replace('{remaining}', String(daysLeft))}
      </span>
    </div>
  );
}

// ─── LicenseGate ─────────────────────────────────────────────────────────────

interface LicenseGateProps { children: ReactNode }

export const LicenseGate: React.FC<LicenseGateProps> = ({ children }) => {
  const location            = useLocation();
  const [gate, setGate]     = useState<GateState>(INITIAL);
  const [cwDismissed, setCwDismissed] = useState(false);
  const checkingRef         = useRef(false);

  // Superadmin path is never gated — it's the publisher's console.
  const isSuperAdmin = location.pathname.startsWith('/superadmin');

  // Dev mode without a key → skip all checks.
  const shouldSkip = !PUBKEY_CONFIGURED || isSuperAdmin;

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
      });

    } catch {
      // On unexpected error, default to 'valid' to avoid blocking honest users.
      setGate({ status: 'valid', clockWarning: false, trialLeft: 0, graceLeft: 0 });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // Initial check.
  useEffect(() => {
    if (shouldSkip) { setGate({ status: 'valid', clockWarning: false, trialLeft: 0, graceLeft: 0 }); return; }
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

  return (
    <>
      {gate.clockWarning && !cwDismissed && (
        <ClockWarningBanner onDismiss={() => setCwDismissed(true)} />
      )}
      {gate.status === 'trial' && <TrialBanner daysLeft={gate.trialLeft} />}
      {gate.status === 'grace' && (
        <GraceBanner daysExpired={graceExpiredDays} daysLeft={gate.graceLeft} />
      )}
      {children}
    </>
  );
};
