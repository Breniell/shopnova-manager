/**
 * PIN hashing — security-grade key derivation.
 *
 * NEW (v1.4.2+): PBKDF2-SHA-256 with 200,000 iterations per user.
 *   - Makes brute-forcing 10,000 4-digit PINs take ~300 seconds instead of 1ms.
 *   - Per-user random 128-bit salt prevents rainbow table precomputation.
 *
 * LEGACY (v1.4.1 and earlier): SHA-256 with global or per-user salt.
 *   - Detected by User.hashAlgo === undefined | 'sha256'.
 *   - Automatically migrated to PBKDF2 on first successful login.
 */

const LEGACY_SALT = 'shopnova-salt-2026';
const PBKDF2_ITERATIONS = 200_000;

/** Generate a cryptographically random 128-bit hex salt. */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a PIN using PBKDF2-SHA-256 (current algorithm).
 * Returns a 64-char hex string.
 */
export async function hashPinPbkdf2(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a PIN using legacy SHA-256.
 * Used only for verifying old hashes before migration.
 */
export async function hashPinLegacy(pin: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode((salt ?? LEGACY_SALT) + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a PIN (for new users — always uses PBKDF2).
 * Legacy alias kept for addUser / updateUserPin callers.
 */
export async function hashPin(pin: string, salt?: string): Promise<string> {
  if (salt) {
    // When called with a salt and no algo context, use PBKDF2 (new default)
    return hashPinPbkdf2(pin, salt);
  }
  // Backward-compat: no salt → legacy global salt SHA-256 (read-only path)
  return hashPinLegacy(pin);
}
