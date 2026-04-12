/**
 * SHA-256 PIN hashing — salt intentionally kept as 'shopnova-salt-2026'
 * to avoid invalidating all existing user PINs.
 */
const SALT = 'shopnova-salt-2026';

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(SALT + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
