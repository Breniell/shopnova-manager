import React from 'react';
import { KeyRound, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useLicenseActivation, type ActivateError } from '@/lib/license/useLicenseActivation';

interface Props {
  onActivated: () => void;
  initialKey?: string;
}

const ERROR_KEYS: Record<ActivateError, string> = {
  bad_format:     'license.errBadFormat',
  bad_signature:  'license.errBadSignature',
  expired:        'license.errExpired',
  wrong_boutique: 'license.errWrongBoutique',
  revoked:        'license.errRevoked',
  unknown:        'license.errUnknown',
};

export const LicenseActivationForm: React.FC<Props> = ({ onActivated, initialKey = '' }) => {
  const { t } = useTranslation();
  const { key, setKey, error, loading, success, successExpiry, handleActivate, clearError } =
    useLicenseActivation(onActivated);

  React.useEffect(() => {
    if (initialKey) setKey(initialKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="relative">
        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          className="w-full rounded-lg border bg-background pl-9 pr-3 py-2.5 text-sm font-mono
                     placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2
                     focus:ring-primary/50 disabled:opacity-50"
          placeholder={t('license.inputPlaceholder')}
          value={key}
          onChange={e => { setKey(e.target.value); clearError(); }}
          onKeyDown={e => e.key === 'Enter' && void handleActivate()}
          disabled={loading || success}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{t(ERROR_KEYS[error])}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            {successExpiry
              ? t('license.activateSuccessDate').replace('{date}', new Date(successExpiry).toLocaleDateString())
              : t('license.activateSuccess')}
          </span>
        </div>
      )}

      <button
        onClick={() => void handleActivate()}
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
  );
};
