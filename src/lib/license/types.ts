export type LicensePlan = 'trial' | 'standard';

export interface LicenseHolder {
  name?:    string;
  contact?: string;
}

export interface LicensePayload {
  v:           1;
  licenseId:   string;       // UUID
  boutiqueId:  string;       // boutique this licence is bound to
  plan:        LicensePlan;
  issuedAt:    number;       // ms timestamp
  expiresAt:   number;       // ms timestamp
  features?:   string[];     // reserved for future module gating
  machineId?:  string | null;// reserved — machine binding (future)
  holder?:     LicenseHolder;
}

export type LicenseReason =
  | 'bad_format'
  | 'bad_signature'
  | 'expired'
  | 'wrong_boutique'
  | 'revoked';

export interface LicenseVerifyResult {
  valid:    boolean;
  reason?:  LicenseReason;
  payload?: LicensePayload;
}

/** Wire-format prefix — allows instant visual identification. */
export const LICENSE_PREFIX = 'LGW1-' as const;
