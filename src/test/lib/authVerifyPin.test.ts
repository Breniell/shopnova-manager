/**
 * Regression tests for the verifyPin + buildDefaultUsers bug.
 *
 * ROOT CAUSE (fixed in this commit):
 *   PolicyGate hashes the PIN with PBKDF2, but buildDefaultUsers() was building
 *   the User object WITHOUT the `hashAlgo` field. verifyPin() checked
 *   `user.hashAlgo === 'pbkdf2'` → false (undefined) → fell back to legacy SHA-256
 *   → SHA-256 hash ≠ PBKDF2 hash → every login attempt returned "PIN incorrect".
 *
 * HOW TO CONFIRM THE REGRESSION TEST CATCHES THE BUG:
 *   Revert the `hashAlgo: 'pbkdf2' as const` line in buildDefaultUsers() and run:
 *     npx vitest run src/test/lib/authVerifyPin.test.ts
 *   The "REGRESSION" test will fail. Re-apply the fix → it passes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyPin } from '@/stores/useAuthStore';
import { buildDefaultUsers } from '@/components/FirebaseProvider';
import { hashPinPbkdf2, hashPinLegacy, generateSalt } from '@/lib/crypto';
import type { User } from '@/stores/useAuthStore';

// ─── verifyPin unit tests ─────────────────────────────────────────────────────

describe('verifyPin — PBKDF2 path', () => {
  it('returns true for correct PIN when hashAlgo is pbkdf2', async () => {
    const pin  = '4321';
    const salt = generateSalt();
    const hash = await hashPinPbkdf2(pin, salt);
    const user: User = {
      id: 'u1', prenom: 'A', nom: 'B', role: 'gérant',
      pin: hash, salt, hashAlgo: 'pbkdf2', color: '#000',
    };
    expect(await verifyPin(pin, user)).toBe(true);
  });

  it('returns false for wrong PIN (pbkdf2 user)', async () => {
    const salt = generateSalt();
    const hash = await hashPinPbkdf2('1234', salt);
    const user: User = {
      id: 'u1', prenom: 'A', nom: 'B', role: 'gérant',
      pin: hash, salt, hashAlgo: 'pbkdf2', color: '#000',
    };
    expect(await verifyPin('9999', user)).toBe(false);
  });
});

describe('verifyPin — legacy SHA-256 path (backward compat)', () => {
  it('returns true for legacy user (no hashAlgo, no salt) with correct PIN', async () => {
    const pin  = '5678';
    const hash = await hashPinLegacy(pin); // uses global LEGACY_SALT
    const legacyUser: User = {
      id: 'u2', prenom: 'X', nom: 'Y', role: 'caissier',
      pin: hash, color: '#000',
      // hashAlgo intentionally absent — simulates pre-v1.4.2 Firestore document
    };
    expect(await verifyPin(pin, legacyUser)).toBe(true);
  });

  it('returns false for wrong PIN (legacy user)', async () => {
    const hash = await hashPinLegacy('5678');
    const legacyUser: User = { id: 'u2', prenom: 'X', nom: 'Y', role: 'caissier', pin: hash, color: '#000' };
    expect(await verifyPin('0000', legacyUser)).toBe(false);
  });
});

describe('verifyPin — BUG DOCUMENTATION: PBKDF2 hash without hashAlgo always fails', () => {
  /**
   * This test documents the exact failure mode that was silently introduced.
   * A user whose `pin` is a PBKDF2 hash but whose `hashAlgo` is absent will
   * NEVER be able to authenticate — verifyPin uses SHA-256 on a PBKDF2 hash.
   */
  it('PBKDF2 hash + no hashAlgo → verifyPin returns false even for correct PIN', async () => {
    const pin  = '1234';
    const salt = generateSalt();
    const hash = await hashPinPbkdf2(pin, salt); // PBKDF2 hash
    const buggyUser: User = {
      id: 'u3', prenom: 'Bug', nom: 'User', role: 'gérant',
      pin: hash, salt, color: '#000',
      // hashAlgo absent → verifyPin falls back to SHA-256 → mismatch
    };
    expect(await verifyPin(pin, buggyUser)).toBe(false); // confirms the broken behavior
  });
});

// ─── REGRESSION: full pending-admin → verifyPin flow ─────────────────────────

describe('REGRESSION: buildDefaultUsers + verifyPin (pending-admin path)', () => {
  const PENDING_KEY = 'legwan-pending-admin';

  beforeEach(() => localStorage.clear());
  afterEach(()  => localStorage.clear());

  /**
   * This test FAILS if hashAlgo is missing from buildDefaultUsers (the bug).
   * It PASSES after the fix.
   *
   * To verify manually:
   *   1. Remove `hashAlgo: 'pbkdf2' as const` from buildDefaultUsers()
   *   2. Run this test → FAILS (verifyPin returns false)
   *   3. Re-add the line → PASSES
   */
  it('user created from legwan-pending-admin can authenticate with their PIN', async () => {
    const pin  = '7362';
    const salt = generateSalt();
    const hashedPin = await hashPinPbkdf2(pin, salt); // mirrors PolicyGate.handleCreateAdmin()

    // Populate localStorage exactly as PolicyGate does before calling setAccepted(true)
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      prenom: 'Alice', nom: 'Dupont', hashedPin, salt,
    }));

    const users = await buildDefaultUsers();

    // Structural assertions — catches the bug even before verifyPin
    expect(users).toHaveLength(1);
    expect(users[0].hashAlgo).toBe('pbkdf2');   // FAILS before fix (was undefined)
    expect(users[0].salt).toBe(salt);

    // Functional assertion — the full login path must succeed
    expect(await verifyPin(pin, users[0])).toBe(true);   // FAILS before fix
    expect(await verifyPin('0000', users[0])).toBe(false);
  });

  it('cleans up legwan-pending-admin from localStorage after consuming it', async () => {
    const salt = generateSalt();
    const hashedPin = await hashPinPbkdf2('1111', salt);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ prenom: 'A', nom: 'B', hashedPin, salt }));

    await buildDefaultUsers();

    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});
