/**
 * License verification — BROWSER SIDE ONLY.
 *
 * Security model
 * ──────────────
 * • Only the PUBLIC key lives here (Ed25519 SPKI, base64).
 * • The private key lives on the publisher's machine, used by the CLI only.
 * • verifyLicense() reads the key from VITE_LICENSE_PUBKEY (set in .env).
 *   Tests use verifyLicenseRaw() with a runtime-generated key instead.
 *
 * Wire format
 * ───────────
 * 'LGW1-' + base64url(UTF-8(JSON(payload))) + '.' + base64url(Ed25519 sig)
 *
 * The message signed by the CLI is exactly the UTF-8 bytes of JSON.stringify(payload).
 * Verification re-uses those same bytes from the license string (no re-serialisation).
 *
 * Public key format
 * ─────────────────
 * SPKI DER (44 bytes for Ed25519), encoded as standard base64 (with '=' padding).
 * Generated and printed by: node scripts/license-gen/generate.mjs --init
 */

import { LICENSE_PREFIX } from './types';
import type { LicensePayload, LicenseVerifyResult } from './types';

// ─── base64url helpers ────────────────────────────────────────────────────────

function fromBase64url(s: string): Uint8Array {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin    = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// ─── parseLicense ─────────────────────────────────────────────────────────────

/**
 * Decode a licence string and return the payload WITHOUT verifying the signature.
 * Safe for displaying metadata in a UI (e.g. super-admin list view).
 * Returns null for any format error.
 */
export function parseLicense(licenseString: string): LicensePayload | null {
  if (!licenseString.startsWith(LICENSE_PREFIX)) return null;
  const body = licenseString.slice(LICENSE_PREFIX.length);
  const dot  = body.lastIndexOf('.');
  if (dot < 1) return null;
  try {
    const bytes = fromBase64url(body.slice(0, dot));
    const json  = new TextDecoder().decode(bytes);
    return JSON.parse(json) as LicensePayload;
  } catch {
    return null;
  }
}

// ─── verifyLicenseRaw ─────────────────────────────────────────────────────────

/**
 * Full cryptographic verification with an explicit SPKI public key (base64).
 * Used directly in tests (which generate a throwaway key pair at runtime).
 */
export async function verifyLicenseRaw(
  licenseString: string,
  opts: { now: number; boutiqueId: string; pubkeySpkiB64: string },
): Promise<LicenseVerifyResult> {

  // ── 1. Format guard ─────────────────────────────────────────────────────────
  if (!licenseString.startsWith(LICENSE_PREFIX)) {
    return { valid: false, reason: 'bad_format' };
  }
  const body = licenseString.slice(LICENSE_PREFIX.length);
  const dot  = body.lastIndexOf('.');
  if (dot < 1 || dot === body.length - 1) {
    return { valid: false, reason: 'bad_format' };
  }

  const payloadPart = body.slice(0, dot);
  const sigPart     = body.slice(dot + 1);

  let payload: LicensePayload;
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;

  try {
    payloadBytes = fromBase64url(payloadPart);
    sigBytes     = fromBase64url(sigPart);
    payload      = JSON.parse(new TextDecoder().decode(payloadBytes)) as LicensePayload;
  } catch {
    return { valid: false, reason: 'bad_format' };
  }

  if (payload.v !== 1) return { valid: false, reason: 'bad_format' };

  // ── 2. Signature (always verified before time/boutique checks) ───────────────
  let pubKey: CryptoKey;
  try {
    const spki = Uint8Array.from(atob(opts.pubkeySpkiB64), c => c.charCodeAt(0));
    pubKey = await crypto.subtle.importKey(
      'spki', spki, { name: 'Ed25519' }, false, ['verify'],
    );
  } catch {
    return { valid: false, reason: 'bad_signature' };
  }

  let sigOk: boolean;
  try {
    sigOk = await crypto.subtle.verify({ name: 'Ed25519' }, pubKey, sigBytes, payloadBytes);
  } catch {
    sigOk = false;
  }

  if (!sigOk) return { valid: false, reason: 'bad_signature' };

  // ── 3. Expiry ────────────────────────────────────────────────────────────────
  if (opts.now > payload.expiresAt) {
    return { valid: false, reason: 'expired', payload };
  }

  // ── 4. Boutique binding ──────────────────────────────────────────────────────
  if (payload.boutiqueId !== opts.boutiqueId) {
    return { valid: false, reason: 'wrong_boutique', payload };
  }

  return { valid: true, payload };
}

// ─── verifyLicense ────────────────────────────────────────────────────────────

/**
 * Production entry point — reads the public key from VITE_LICENSE_PUBKEY.
 * opts.now is supplied by the caller so Ticket-B can inject a network clock.
 */
const EMBEDDED_PUBKEY: string = import.meta.env.VITE_LICENSE_PUBKEY ?? '';

export async function verifyLicense(
  licenseString: string,
  opts: { now: number; boutiqueId: string },
): Promise<LicenseVerifyResult> {
  return verifyLicenseRaw(licenseString, { ...opts, pubkeySpkiB64: EMBEDDED_PUBKEY });
}
