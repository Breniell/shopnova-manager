import React, { useState } from 'react';
import { ShieldX, ShieldOff, KeyRound, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { verifyLicense } from '@/lib/license/verify';
import { getLicenseString, setLicenseString, fsSaveLicense } from '@/lib/license/store';
import { getBoutiqueId } from '@/services/boutiqueService';
import type { GateStatus } from '@/lib/license/gate';

const SUPPORT_CONTACT = import.meta.env.VITE_SUPPORT_CONTACT ?? 'contact@legwan.com';

interface Props {
  status:      Exclude<GateStatus, 'checking' | 'valid' | 'trial' | 'grace'>;
  onActivated: () => void;
}

type ActivateError =
  | 'bad_format'
  | 'bad_signature'
  | 'expired'
  | 'wrong_boutique'
  | 'revoked'
  | 'unknown';

export const LicenseBlockedScreen: React.FC<Props> = ({ status, onActivated }) => {
  const { t } = useTranslation();
  const [key,     setKey]     = useState(getLicenseString() ?? '');
  const [error,   setError]   = useState<ActivateError | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const titleKey = status === 'expired'  ? 'license.blockedExpiredTitle'
                 : status === 'missing'  ? 'license.blockedTrialTitle'
                 : status === 'revoked'  ? 'license.blockedRevokedTitle'
                 : /* invalid */           'license.blockedInvalidTitle';

  const Icon = status === 'revoked' ? ShieldOff : ShieldX;

  const errorKey: Record<ActivateError, string> = {
    bad_format:     'license.errBadFormat',
    bad_signature:  'license.errBadSignature',
    expired:        'license.errExpired',
    wrong_boutique: 'license.errWrongBoutique',
    revoked:        'license.errRevoked',
    unknown:        'license.errUnknown',
  };

  async function handleActivate() {
    const trimmed = key.trim();
    if (!trimmed) { setError('bad_format'); return; }

    setLoading(true);
    setError(null);

    try {
      const bid    = getBoutiqueId();
      const result = await verifyLicense(trimmed, { now: Date.now(), boutiqueId: bid });

      if (result.valid && result.payload) {
        setLicenseString(trimmed);
        await fsSaveLicense(bid, trimmed, result.payload);
        setSuccess(true);
        setTimeout(onActivated, 900); // brief success flash before re-check
        return;
      }

      setError((result.reason ?? 'unknown') as ActivateError);
    } catch {
      setError('unknown');
    } finally {
      setLoading(false);
    }
  }

  let boutiqueId = '–';
  try { boutiqueId = getBoutiqueId(); } catch {}

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Icon className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t(titleKey)}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {status === 'revoked' ? t('license.blockedDescRevoked') : t('license.blockedDesc')}
          </p>
        </div>

        {/* Boutique ID */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t('license.boutiqueIdLabel')}</p>
          <p className="font-mono text-sm font-semibold select-all break-all text-foreground">
            {boutiqueId}
          </p>
        </div>

        {/* Contact */}
        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p className="font-medium">{t('license.contactLabel')}</p>
          <p className="font-semibold text-foreground">{SUPPORT_CONTACT}</p>
        </div>

        {/* Activation form */}
        {status !== 'revoked' && (
          <div className="space-y-3">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full rounded-lg border bg-background pl-9 pr-3 py-2.5 text-sm font-mono
                           placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2
                           focus:ring-primary/50 disabled:opacity-50"
                placeholder={t('license.inputPlaceholder')}
                value={key}
                onChange={e => { setKey(e.target.value); setError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleActivate()}
                disabled={loading || success}
                spellCheck={false}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{t(errorKey[error])}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                <span>✓ {t('license.activateSuccess')}</span>
              </div>
            )}

            <button
              onClick={handleActivate}
              disabled={loading || success || !key.trim()}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm
                         font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />{t('license.activating')}</>
                : t('license.activateBtn')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
