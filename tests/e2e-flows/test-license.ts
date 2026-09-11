/**
 * Mints Legwan licence keys for tests.
 *
 * The private key below is a throwaway Ed25519 pair generated for this suite and
 * is NOT the production key (which lives only in scripts/license-gen and is
 * gitignored). Keys minted here verify against the public half in .env.emulator,
 * loaded solely by `vite --mode emulator`. A production build takes
 * VITE_LICENSE_PUBKEY from .env, so nothing minted here can unlock a shipped
 * installer.
 *
 * It is inlined rather than kept in a .pem because .gitignore excludes *.pem
 * wholesale - correctly, to keep the real key out of the repo.
 *
 * The encoding mirrors scripts/license-gen/generate.mjs exactly: the signed
 * message is the UTF-8 bytes of the compact payload JSON, and the licence string
 * is 'LGW1-' + base64url(payload) + '.' + base64url(signature).
 */
import { createPrivateKey, sign } from 'node:crypto';

const TEST_PRIVATE_KEY_PKCS8_B64 =
  'MC4CAQAwBQYDK2VwBCIEIOeCijUuhtwUoBYH0CImfFd8k2oiAa30Xm1gK446yg2P';

/** Must match VITE_LICENSE_PUBKEY in .env.emulator. */
export const TEST_PUBLIC_KEY_SPKI_B64 =
  'MCowBQYDK2VwAyEAbWBKZvayC3ATsbFBj/RBjXQmXtpgqDfHHEMIBQsseCg=';

export interface MintOptions {
  boutiqueId: string;
  plan?: 'trial' | 'standard';
  /** Validity in days from now. Negative values mint an already-expired key. */
  days?: number;
}

export function mintLicense({ boutiqueId, plan = 'standard', days = 365 }: MintOptions): string {
  const now = Date.now();
  const payload = {
    v: 1,
    licenseId: `test-${now}-${Math.random().toString(36).slice(2, 10)}`,
    boutiqueId,
    plan,
    issuedAt: now,
    expiresAt: now + days * 24 * 60 * 60 * 1000,
    machineId: null,
  };

  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const privateKey = createPrivateKey({
    key: Buffer.from(TEST_PRIVATE_KEY_PKCS8_B64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  // null algorithm = raw Ed25519, the Node convention the generator also uses.
  const signature = sign(null, payloadBytes, privateKey);

  return `LGW1-${payloadBytes.toString('base64url')}.${signature.toString('base64url')}`;
}
