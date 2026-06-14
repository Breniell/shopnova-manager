/**
 * set-superadmin-claim.mjs
 *
 * Sets (or clears) the { superadmin: true } custom claim on a Firebase Auth user.
 * Must be run from a machine with access to a service account key.
 *
 * Usage:
 *   node scripts/set-superadmin-claim.mjs set   admin@example.com
 *   node scripts/set-superadmin-claim.mjs revoke admin@example.com
 *
 * Prerequisites:
 *   1. npm install --save-dev firebase-admin
 *   2. Download a service account key from Firebase Console →
 *      Project settings → Service accounts → Generate new private key
 *   3. Save it as service-account.json in the project root (never commit it)
 *   4. Set env var: GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
 *      or place the file at the default path and pass --keyFile
 */

import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [,, action, email] = process.argv;

if (!['set', 'revoke'].includes(action) || !email) {
  console.error('Usage: node scripts/set-superadmin-claim.mjs <set|revoke> <email>');
  process.exit(1);
}

// Initialise firebase-admin (uses GOOGLE_APPLICATION_CREDENTIALS env var
// or a local service-account.json if present)
if (!getApps().length) {
  let credential;
  try {
    const key = JSON.parse(readFileSync('./service-account.json', 'utf8'));
    credential = cert(key);
  } catch {
    // Fall back to Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS)
    credential = undefined;
  }
  initializeApp(credential ? { credential } : undefined);
}

const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  const claims = action === 'set' ? { superadmin: true } : { superadmin: false };
  await auth.setCustomUserClaims(user.uid, claims);

  console.log(`✓ Custom claim { superadmin: ${claims.superadmin} } set on ${email} (uid: ${user.uid})`);
  if (action === 'set') {
    console.log('  The user must sign out and sign back in for the claim to take effect.');
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
