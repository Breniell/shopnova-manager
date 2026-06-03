/**
 * SHA-256 PIN hashing.
 *
 * New users get a per-user random salt stored alongside their hash.
 * Legacy users (no salt field) are verified with the old global salt and
 * transparently migrated to a per-user salt on their next successful login.
 */
const LEGACY_SALT = 'shopnova-salt-2026';

/** Generate a cryptographically random 128-bit hex salt. */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a PIN with an optional per-user salt.
 * Falls back to the legacy global salt when no salt is provided (backward compat).
 */
export async function hashPin(pin: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode((salt ?? LEGACY_SALT) + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
