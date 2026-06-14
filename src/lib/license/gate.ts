/**
 * Pure state machine for the licence gate — no React, no I/O, fully testable.
 *
 * States visible in the UI:
 *   'checking'  — async check in progress (brief spinner)
 *   'valid'     — active licence, within validity window
 *   'trial'     — no licence, within the 30-day free trial
 *   'grace'     — licence expired < GRACE_DAYS ago (app still usable)
 *   'expired'   — licence expired >= GRACE_DAYS ago → blocked
 *   'missing'   — no licence AND trial has expired → blocked
 *   'invalid'   — bad signature / wrong boutique → blocked
 *   'revoked'   — explicitly revoked in Firestore → blocked
 */
import type { LicenseVerifyResult } from './types';

export type GateStatus =
  | 'checking'
  | 'valid'
  | 'trial'
  | 'grace'
  | 'expired'
  | 'missing'
  | 'invalid'
  | 'revoked';

export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GateInput {
  licenseResult: LicenseVerifyResult | null; // null = no licence string in storage
  now:           number;                     // trusted current time (ms)
  installDate:   number;                     // first-launch timestamp (ms)
  revoked?:      boolean;                    // from Firestore revocation flag
}

/** Compute the GateStatus from the inputs. Does not perform any I/O. */
export function computeGateStatus(opts: GateInput): GateStatus {
  const { licenseResult, now, installDate, revoked } = opts;

  // Revocation overrides everything (set by super-admin in Firestore).
  if (revoked) return 'revoked';

  if (!licenseResult) {
    // No licence string at all — check trial window.
    const trialEnd = installDate + TRIAL_DAYS * DAY_MS;
    return now < trialEnd ? 'trial' : 'missing';
  }

  if (licenseResult.valid) return 'valid';

  // Licence present but invalid — classify the reason.
  switch (licenseResult.reason) {
    case 'expired': {
      const expiresAt  = licenseResult.payload?.expiresAt ?? 0;
      const daysSince  = (now - expiresAt) / DAY_MS;
      return daysSince < GRACE_DAYS ? 'grace' : 'expired';
    }
    case 'revoked':
      return 'revoked';
    default:
      // bad_format | bad_signature | wrong_boutique
      return 'invalid';
  }
}

/** Days remaining in the trial (0 if expired). */
export function trialDaysLeft(now: number, installDate: number): number {
  const remaining = Math.ceil((installDate + TRIAL_DAYS * DAY_MS - now) / DAY_MS);
  return Math.max(0, remaining);
}

/** Days remaining before forced block in grace period (0 if over). */
export function graceDaysLeft(now: number, expiresAt: number): number {
  const remaining = Math.ceil((expiresAt + GRACE_DAYS * DAY_MS - now) / DAY_MS);
  return Math.max(0, remaining);
}

/** True for any status that should block the UI. */
export function isBlocked(status: GateStatus): boolean {
  return status === 'expired' || status === 'missing' || status === 'invalid' || status === 'revoked';
}
