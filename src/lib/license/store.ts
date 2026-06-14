/**
 * License store — persists the active licence and tamper-resistant timestamps.
 *
 * localStorage keys:
 *   'legwan-license'          raw LGW1-… string (not encrypted — it's just a signed token)
 *   'legwan-install-date'     AES-GCM encrypted ms timestamp of first launch
 *   'legwan-last-seen-time'   AES-GCM encrypted ms timestamp of last confirmed-good time
 *
 * Firestore path: boutiques/{bid}/_license/current
 *   Used to survive a reinstall and to detect revocation set by the super-admin.
 */
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import type { LicensePayload } from './types';

// ─── localStorage keys ────────────────────────────────────────────────────────

export const LICENSE_LS_KEY   = 'legwan-license';
export const INSTALL_DATE_KEY = 'legwan-install-date';
export const LAST_SEEN_KEY    = 'legwan-last-seen-time';

// ─── Key derivation ───────────────────────────────────────────────────────────

// Not a secret — source code is readable. Goal: add meaningful friction against
// trivial localStorage editing (clock cheating / trial extension).
const TS_PASSWORD = 'legwan-ts-guard-v1';
const TS_SALT     = 'lgw-ts-v1';

const keyCache = new Map<string, CryptoKey>();

async function deriveKey(boutiqueId: string): Promise<CryptoKey> {
  const cached = keyCache.get(boutiqueId);
  if (cached) return cached;
  const raw = new TextEncoder().encode(TS_PASSWORD + boutiqueId);
  const km  = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(TS_SALT), hash: 'SHA-256', iterations: 10_000 },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache.set(boutiqueId, key);
  return key;
}

async function encryptMs(ms: number, key: CryptoKey): Promise<string> {
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const plain  = new TextEncoder().encode(String(ms));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const packed = new Uint8Array(12 + cipher.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(cipher), 12);
  return btoa(String.fromCharCode(...packed));
}

async function decryptMs(b64: string, key: CryptoKey): Promise<number | null> {
  try {
    const packed     = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv         = packed.slice(0, 12);
    const ciphertext = packed.slice(12);
    const plain      = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const n          = parseInt(new TextDecoder().decode(plain), 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

// ─── Licence string (no encryption needed) ────────────────────────────────────

export function getLicenseString(): string | null {
  try { return localStorage.getItem(LICENSE_LS_KEY); } catch { return null; }
}

export function setLicenseString(str: string): void {
  try { localStorage.setItem(LICENSE_LS_KEY, str); } catch {}
}

export function clearLicense(): void {
  try { localStorage.removeItem(LICENSE_LS_KEY); } catch {}
}

// ─── Install date ─────────────────────────────────────────────────────────────

/**
 * Returns the install date (ms). Creates and persists it on first call.
 * The install date is the base of the 30-day trial.
 */
export async function getOrCreateInstallDate(boutiqueId: string): Promise<number> {
  const key    = await deriveKey(boutiqueId);
  const stored = localStorage.getItem(INSTALL_DATE_KEY);
  if (stored) {
    const val = await decryptMs(stored, key);
    if (val && val > 0) return val;
  }
  const now       = Date.now();
  const encrypted = await encryptMs(now, key);
  try { localStorage.setItem(INSTALL_DATE_KEY, encrypted); } catch {}
  return now;
}

// ─── Last-seen trusted time ───────────────────────────────────────────────────

/** Returns the last stored trusted timestamp, or null if never set. */
export async function getLastSeenTime(boutiqueId: string): Promise<number | null> {
  const stored = localStorage.getItem(LAST_SEEN_KEY);
  if (!stored) return null;
  const key = await deriveKey(boutiqueId);
  return decryptMs(stored, key);
}

/** Store the latest known-good timestamp. Called after each successful clock check. */
export async function setLastSeenTime(ms: number, boutiqueId: string): Promise<void> {
  const key       = await deriveKey(boutiqueId);
  const encrypted = await encryptMs(ms, key);
  try { localStorage.setItem(LAST_SEEN_KEY, encrypted); } catch {}
}

// ─── Firestore persistence ────────────────────────────────────────────────────

const licPath = (bid: string) => `boutiques/${bid}/_license/current`;

export interface LicenseFirestoreDoc {
  licenseStr: string;
  licenseId:  string;
  plan:       string;
  issuedAt:   number;
  expiresAt:  number;
  revoked?:   boolean;
}

/** Upsert the licence in Firestore. Idempotent by licenseId. */
export async function fsSaveLicense(
  bid: string,
  licenseStr: string,
  payload: LicensePayload,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(
      doc(db, licPath(bid)),
      {
        licenseStr,
        licenseId: payload.licenseId,
        plan:      payload.plan,
        issuedAt:  payload.issuedAt,
        expiresAt: payload.expiresAt,
        revoked:   false,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch { /* offline — local is enough */ }
}

/** Load the licence from Firestore. Returns null if not found or offline. */
export async function fsGetLicense(bid: string): Promise<LicenseFirestoreDoc | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const snap = await getDoc(doc(db, licPath(bid)));
    if (!snap.exists()) return null;
    return snap.data() as LicenseFirestoreDoc;
  } catch {
    return null; // offline — caller falls back to localStorage
  }
}
