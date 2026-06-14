/**
 * Tests for the pure state machine in src/lib/license/gate.ts
 *
 * No React, no I/O — just deterministic input/output.
 */
import { describe, it, expect } from 'vitest';
import {
  computeGateStatus,
  trialDaysLeft,
  graceDaysLeft,
  isBlocked,
  TRIAL_DAYS,
  GRACE_DAYS,
  type GateStatus,
} from '@/lib/license/gate';
import type { LicenseVerifyResult } from '@/lib/license/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW    = new Date('2026-06-14T12:00:00Z').getTime();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validResult(overrides: Partial<LicenseVerifyResult> = {}): LicenseVerifyResult {
  return { valid: true, payload: { expiresAt: NOW + 365 * DAY_MS } as never, ...overrides };
}

function expiredResult(daysAgo: number): LicenseVerifyResult {
  const expiresAt = NOW - daysAgo * DAY_MS;
  return { valid: false, reason: 'expired', payload: { expiresAt } as never };
}

function gate(
  licenseResult: LicenseVerifyResult | null,
  installDaysAgo = 5,
  revoked        = false,
) {
  return computeGateStatus({
    licenseResult,
    now:         NOW,
    installDate: NOW - installDaysAgo * DAY_MS,
    revoked,
  });
}

// ─── No licence — trial window ────────────────────────────────────────────────

describe('computeGateStatus — no licence', () => {
  it('returns trial when install is recent (within 30 days)', () => {
    expect(gate(null, 5)).toBe('trial');
    expect(gate(null, 29)).toBe('trial');
  });

  it('returns trial on the last day of the trial', () => {
    const justBeforeEnd = NOW - (TRIAL_DAYS - 0.5) * DAY_MS; // 0.5 days before trial ends
    expect(computeGateStatus({ licenseResult: null, now: NOW, installDate: justBeforeEnd })).toBe('trial');
  });

  it('returns missing when trial has expired (> 30 days)', () => {
    expect(gate(null, 31)).toBe('missing');
    expect(gate(null, 365)).toBe('missing');
  });

  it('missing is blocked', () => {
    expect(isBlocked('missing')).toBe(true);
  });
});

// ─── Valid licence ────────────────────────────────────────────────────────────

describe('computeGateStatus — valid licence', () => {
  it('returns valid when licence is active', () => {
    expect(gate(validResult())).toBe('valid');
  });

  it('valid is not blocked', () => {
    expect(isBlocked('valid')).toBe(false);
  });
});

// ─── Expired licence — grace period ──────────────────────────────────────────

describe('computeGateStatus — expired licence', () => {
  it('returns grace when expired < 7 days ago', () => {
    expect(gate(expiredResult(1))).toBe('grace');
    expect(gate(expiredResult(6))).toBe('grace');
  });

  it('returns expired when expired >= 7 days ago', () => {
    expect(gate(expiredResult(7))).toBe('expired');
    expect(gate(expiredResult(30))).toBe('expired');
  });

  it('grace is not blocked (app still usable)', () => {
    expect(isBlocked('grace')).toBe(false);
  });

  it('expired is blocked', () => {
    expect(isBlocked('expired')).toBe(true);
  });
});

// ─── Invalid licence ──────────────────────────────────────────────────────────

describe('computeGateStatus — invalid licence', () => {
  it('returns invalid for bad_signature', () => {
    expect(gate({ valid: false, reason: 'bad_signature' })).toBe('invalid');
  });

  it('returns invalid for bad_format', () => {
    expect(gate({ valid: false, reason: 'bad_format' })).toBe('invalid');
  });

  it('returns invalid for wrong_boutique', () => {
    expect(gate({ valid: false, reason: 'wrong_boutique' })).toBe('invalid');
  });

  it('invalid is blocked', () => {
    expect(isBlocked('invalid')).toBe(true);
  });
});

// ─── Revocation ───────────────────────────────────────────────────────────────

describe('computeGateStatus — revocation', () => {
  it('returns revoked when Firestore revocation flag is set', () => {
    expect(gate(validResult(), 5, true)).toBe('revoked');
  });

  it('revocation overrides a valid licence', () => {
    expect(gate(validResult(), 5, true)).toBe('revoked');
  });

  it('revocation overrides trial status', () => {
    expect(gate(null, 5, true)).toBe('revoked');
  });

  it('revoked is blocked', () => {
    expect(isBlocked('revoked')).toBe(true);
  });
});

// ─── isBlocked ────────────────────────────────────────────────────────────────

describe('isBlocked', () => {
  const blocked: GateStatus[]    = ['expired', 'missing', 'invalid', 'revoked'];
  const notBlocked: GateStatus[] = ['checking', 'valid', 'trial', 'grace'];

  blocked.forEach(s    => it(`${s} is blocked`,     () => expect(isBlocked(s)).toBe(true)));
  notBlocked.forEach(s => it(`${s} is not blocked`, () => expect(isBlocked(s)).toBe(false)));
});

// ─── trialDaysLeft ────────────────────────────────────────────────────────────

describe('trialDaysLeft', () => {
  it('returns 30 on install day', () => {
    expect(trialDaysLeft(NOW, NOW)).toBe(TRIAL_DAYS);
  });

  it('returns 1 on the last day of the trial', () => {
    const installDate = NOW - (TRIAL_DAYS - 1) * DAY_MS;
    expect(trialDaysLeft(NOW, installDate)).toBe(1);
  });

  it('returns 0 when trial is over', () => {
    const installDate = NOW - (TRIAL_DAYS + 1) * DAY_MS;
    expect(trialDaysLeft(NOW, installDate)).toBe(0);
  });

  it('never returns negative', () => {
    const old = NOW - 500 * DAY_MS;
    expect(trialDaysLeft(NOW, old)).toBeGreaterThanOrEqual(0);
  });
});

// ─── graceDaysLeft ────────────────────────────────────────────────────────────

describe('graceDaysLeft', () => {
  it('returns GRACE_DAYS when just expired', () => {
    const expiresAt = NOW; // expired RIGHT now
    expect(graceDaysLeft(NOW, expiresAt)).toBe(GRACE_DAYS);
  });

  it('returns 1 on the last day of grace', () => {
    const expiresAt = NOW - (GRACE_DAYS - 1) * DAY_MS;
    expect(graceDaysLeft(NOW, expiresAt)).toBe(1);
  });

  it('returns 0 when grace period is over', () => {
    const expiresAt = NOW - (GRACE_DAYS + 1) * DAY_MS;
    expect(graceDaysLeft(NOW, expiresAt)).toBe(0);
  });

  it('never returns negative', () => {
    const veryOld = NOW - 500 * DAY_MS;
    expect(graceDaysLeft(NOW, veryOld)).toBeGreaterThanOrEqual(0);
  });
});
