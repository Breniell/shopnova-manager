/**
 * License verification tests.
 *
 * Each test run generates its OWN throwaway Ed25519 key pair — the real private
 * key is never used here and never lives in src/.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { verifyLicenseRaw, parseLicense } from '@/lib/license/verify';
import type { LicensePayload } from '@/lib/license/types';
import { LICENSE_PREFIX } from '@/lib/license/types';

// ─── Throwaway key pair ───────────────────────────────────────────────────────

let pubkeySpkiB64: string;
let testPrivKey: CryptoKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'Ed25519' }, true, ['sign', 'verify'],
  );
  testPrivKey  = pair.privateKey;
  const spkiBuf = await crypto.subtle.exportKey('spki', pair.publicKey);
  pubkeySpkiB64 = btoa(String.fromCharCode(...new Uint8Array(spkiBuf)));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function b64u(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signPayload(payload: LicensePayload): Promise<string> {
  const bytes  = new TextEncoder().encode(JSON.stringify(payload));
  const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' }, testPrivKey, bytes);
  return `${LICENSE_PREFIX}${b64u(new Uint8Array(bytes))}.${b64u(new Uint8Array(sigBuf))}`;
}

const BOUTIQUE = 'test-boutique-abc123';

const basePayload = (): LicensePayload => ({
  v:          1,
  licenseId:  '11111111-0000-0000-0000-000000000001',
  boutiqueId: BOUTIQUE,
  plan:       'standard',
  issuedAt:   Date.now(),
  expiresAt:  Date.now() + 365 * 24 * 60 * 60 * 1000,
  machineId:  null,
});

function verify(
  lic: string,
  overrides: Partial<{ now: number; boutiqueId: string }> = {},
) {
  return verifyLicenseRaw(lic, {
    now:          Date.now(),
    boutiqueId:   BOUTIQUE,
    pubkeySpkiB64,
    ...overrides,
  });
}

// ─── verifyLicenseRaw ─────────────────────────────────────────────────────────

describe('verifyLicenseRaw', () => {
  it('valid signature and metadata → valid: true', async () => {
    const lic = await signPayload(basePayload());
    const res = await verify(lic);
    expect(res.valid).toBe(true);
    expect(res.payload?.licenseId).toBe('11111111-0000-0000-0000-000000000001');
    expect(res.payload?.plan).toBe('standard');
  });

  it('tampered signature → bad_signature', async () => {
    const lic = await signPayload(basePayload());
    // Flip the last character of the signature (guaranteed to break it)
    const last   = lic[lic.length - 1];
    const tampered = lic.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    const res = await verify(tampered);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('bad_signature');
  });

  it('now > expiresAt → expired (and returns payload)', async () => {
    const lic = await signPayload({ ...basePayload(), expiresAt: Date.now() - 1 });
    const res = await verify(lic, { now: Date.now() });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('expired');
    expect(res.payload).toBeDefined();
  });

  it('wrong boutiqueId → wrong_boutique', async () => {
    const lic = await signPayload(basePayload());
    const res = await verify(lic, { boutiqueId: 'completely-different-boutique' });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('wrong_boutique');
  });

  it('no prefix → bad_format', async () => {
    const res = await verify('INVALID-RANDOM-STRING');
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('bad_format');
  });

  it('correct prefix but no dot → bad_format', async () => {
    const res = await verify('LGW1-nodotanywhere');
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('bad_format');
  });

  it('empty string → bad_format', async () => {
    const res = await verify('');
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('bad_format');
  });

  it('trial plan → valid: true', async () => {
    const lic = await signPayload({ ...basePayload(), plan: 'trial' });
    const res = await verify(lic);
    expect(res.valid).toBe(true);
    expect(res.payload?.plan).toBe('trial');
  });

  it('signature check happens BEFORE expiry — expired + bad sig → bad_signature', async () => {
    const expired = await signPayload({ ...basePayload(), expiresAt: Date.now() - 1 });
    // Tamper signature of an already-expired licence
    const tampered = expired.slice(0, -1) + (expired.at(-1) === 'A' ? 'B' : 'A');
    const res = await verify(tampered, { now: Date.now() });
    expect(res.reason).toBe('bad_signature'); // NOT 'expired'
  });

  it('signature check happens BEFORE boutique check — wrong boutique + bad sig → bad_signature', async () => {
    const lic      = await signPayload(basePayload());
    const tampered = lic.slice(0, -1) + (lic.at(-1) === 'A' ? 'B' : 'A');
    const res = await verify(tampered, { boutiqueId: 'other-boutique' });
    expect(res.reason).toBe('bad_signature'); // NOT 'wrong_boutique'
  });

  it('wrong public key → bad_signature', async () => {
    const lic = await signPayload(basePayload());
    // Generate a different key pair to act as wrong public key
    const other  = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const spki   = await crypto.subtle.exportKey('spki', other.publicKey);
    const wrongB64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
    const res = await verifyLicenseRaw(lic, {
      now: Date.now(), boutiqueId: BOUTIQUE, pubkeySpkiB64: wrongB64,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('bad_signature');
  });
});

// ─── parseLicense ─────────────────────────────────────────────────────────────

describe('parseLicense', () => {
  it('returns the payload for a valid licence string (no sig check)', async () => {
    const payload = basePayload();
    const lic     = await signPayload(payload);
    const parsed  = parseLicense(lic);
    expect(parsed).not.toBeNull();
    expect(parsed?.licenseId).toBe(payload.licenseId);
    expect(parsed?.plan).toBe(payload.plan);
    expect(parsed?.boutiqueId).toBe(payload.boutiqueId);
    expect(parsed?.expiresAt).toBe(payload.expiresAt);
  });

  it('returns null for random garbage', () => {
    expect(parseLicense('not-a-licence')).toBeNull();
    expect(parseLicense('')).toBeNull();
  });

  it('returns null when prefix is missing', () => {
    expect(parseLicense('LGW2-something.sig')).toBeNull();
  });

  it('returns null when there is no dot separator', () => {
    expect(parseLicense('LGW1-nodothere')).toBeNull();
  });

  it('returns payload WITHOUT verifying signature (tampered sig still parses)', async () => {
    const lic     = await signPayload(basePayload());
    const dot     = lic.lastIndexOf('.');
    const tampered = lic.slice(0, dot + 1) + 'invalidsignature';
    const parsed  = parseLicense(tampered);
    // Should still return the payload — parseLicense does not check the signature
    expect(parsed?.licenseId).toBe(basePayload().licenseId);
  });

  it('round-trip: holder info preserved', async () => {
    const payload: LicensePayload = {
      ...basePayload(),
      holder: { name: 'Jean Kouassi', contact: '+225 07 00 00 00' },
    };
    const lic    = await signPayload(payload);
    const parsed = parseLicense(lic);
    expect(parsed?.holder?.name).toBe('Jean Kouassi');
    expect(parsed?.holder?.contact).toBe('+225 07 00 00 00');
  });
});
