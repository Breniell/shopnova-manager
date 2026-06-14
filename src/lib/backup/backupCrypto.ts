/**
 * Cryptographic primitives for backup files.
 *
 * - Checksum : SHA-256 of the plaintext JSON (integrity check after decryption)
 * - Encryption: AES-GCM-256 with PBKDF2-SHA-256 key derivation (200k iterations)
 *
 * Wire format for encrypted payload:
 *   base64( salt[16] || iv[12] || ciphertext[N] )
 */

import type { BackupData } from './types';

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES        = 16;
const IV_BYTES          = 12;

// ─── Checksum ─────────────────────────────────────────────────────────────────

export async function computeChecksum(data: BackupData): Promise<string> {
  const json = JSON.stringify(data);
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyChecksum(data: BackupData, expected: string): Promise<boolean> {
  return (await computeChecksum(data)) === expected;
}

// ─── Key derivation ───────────────────────────────────────────────────────────

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Encryption ───────────────────────────────────────────────────────────────

export async function encryptBackupData(data: BackupData, password: string): Promise<string> {
  const salt      = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv        = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key       = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipher    = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  // Pack: salt || iv || ciphertext
  const packed = new Uint8Array(SALT_BYTES + IV_BYTES + cipher.byteLength);
  packed.set(salt, 0);
  packed.set(iv, SALT_BYTES);
  packed.set(new Uint8Array(cipher), SALT_BYTES + IV_BYTES);

  // btoa via TextDecoder trick for large arrays
  return btoa(packed.reduce((s, b) => s + String.fromCharCode(b), ''));
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/** Throws if password is wrong (AES-GCM authentication fails). */
export async function decryptBackupData(encryptedBase64: string, password: string): Promise<BackupData> {
  let packed: Uint8Array;
  try {
    packed = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  } catch {
    throw new Error('invalid_base64');
  }

  if (packed.length < SALT_BYTES + IV_BYTES + 1) throw new Error('invalid_payload');

  const salt       = packed.slice(0, SALT_BYTES);
  const iv         = packed.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ciphertext = packed.slice(SALT_BYTES + IV_BYTES);

  const key = await deriveKey(password, salt);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    // AES-GCM authentication failure = wrong password or corrupted data
    throw new Error('wrong_password');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as BackupData;
  } catch {
    throw new Error('parse_error');
  }
}
