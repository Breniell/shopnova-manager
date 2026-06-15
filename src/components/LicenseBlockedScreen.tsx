import React from 'react';
import { ShieldX, ShieldOff } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { getLicenseString } from '@/lib/license/store';
import { getBoutiqueId } from '@/services/boutiqueService';
import { LicenseActivationForm } from '@/components/LicenseActivationForm';
import type { GateStatus } from '@/lib/license/gate';

const SUPPORT_CONTACT = import.meta.env.VITE_SUPPORT_CONTACT ?? 'contact@legwan.com';

interface Props {
  status:      Exclude<GateStatus, 'checking' | 'valid' | 'trial' | 'grace'>;
  onActivated: () => void;
}

export const LicenseBlockedScreen: React.FC<Props> = ({ status, onActivated }) => {
  const { t } = useTranslation();

  const titleKey = status === 'expired'  ? 'license.blockedExpiredTitle'
                 : status === 'missing'  ? 'license.blockedTrialTitle'
                 : status === 'revoked'  ? 'license.blockedRevokedTitle'
                 : /* invalid */           'license.blockedInvalidTitle';

  const Icon = status === 'revoked' ? ShieldOff : ShieldX;

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
          <LicenseActivationForm
            onActivated={onActivated}
            initialKey={getLicenseString() ?? ''}
          />
        )}
      </div>
    </div>
  );
};
