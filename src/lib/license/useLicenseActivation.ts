import { useState } from 'react';
import { verifyLicense } from './verify';
import { setLicenseString, fsSaveLicense } from './store';
import { getBoutiqueId } from '@/services/boutiqueService';

export type ActivateError =
  | 'bad_format'
  | 'bad_signature'
  | 'expired'
  | 'wrong_boutique'
  | 'revoked'
  | 'unknown';

export interface UseLicenseActivationResult {
  key:            string;
  setKey:         (k: string) => void;
  error:          ActivateError | null;
  loading:        boolean;
  success:        boolean;
  successExpiry:  number | null;
  handleActivate: () => Promise<void>;
  clearError:     () => void;
}

export function useLicenseActivation(onActivated: () => void): UseLicenseActivationResult {
  const [key,           setKey]           = useState('');
  const [error,         setError]         = useState<ActivateError | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [success,       setSuccess]       = useState(false);
  const [successExpiry, setSuccessExpiry] = useState<number | null>(null);

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
        setSuccessExpiry(result.payload.expiresAt);
        setSuccess(true);
        setTimeout(onActivated, 900);
        return;
      }

      setError((result.reason ?? 'unknown') as ActivateError);
    } catch {
      setError('unknown');
    } finally {
      setLoading(false);
    }
  }

  return {
    key,
    setKey,
    error,
    loading,
    success,
    successExpiry,
    handleActivate,
    clearError: () => setError(null),
  };
}
