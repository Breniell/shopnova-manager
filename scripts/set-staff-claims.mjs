#!/usr/bin/env node
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length).trim() ?? '';
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const uid = argument('uid');
const boutiqueId = argument('boutique');
const employeeId = argument('employee');
const rawRole = argument('role').toLocaleLowerCase('fr');
const revoke = process.argv.includes('--revoke');

if (!uid) fail('Missing --uid=<firebase-auth-uid>.');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  fail('GOOGLE_APPLICATION_CREDENTIALS must point to an administrator service-account JSON file.');
}

const role = rawRole === 'gérant' || rawRole === 'gerant' || rawRole === 'manager'
  ? 'manager'
  : rawRole === 'caissier' || rawRole === 'cashier'
    ? 'cashier'
    : '';

if (!revoke) {
  if (!boutiqueId || boutiqueId.startsWith('local-')) fail('Missing or invalid --boutique=<cloud-boutique-id>.');
  if (!employeeId) fail('Missing --employee=<local-employee-id>.');
  if (!role) fail('Role must be manager/gérant or cashier/caissier.');
}

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
const adminAuth = getAuth(app);
const user = await adminAuth.getUser(uid);
const previous = user.customClaims ?? {};

if (revoke) {
  const remaining = { ...previous };
  delete remaining.boutiqueId;
  delete remaining.employeeId;
  delete remaining.role;
  await adminAuth.setCustomUserClaims(uid, remaining);
  await adminAuth.revokeRefreshTokens(uid);
  console.log(`Staff access revoked for Firebase user ${uid}. Existing sessions were invalidated.`);
  process.exit(0);
}

if (previous.superadmin === true) {
  fail('A super-admin identity cannot also be provisioned as boutique staff.');
}

await adminAuth.setCustomUserClaims(uid, {
  ...previous,
  boutiqueId,
  employeeId,
  role,
});
await adminAuth.revokeRefreshTokens(uid);

console.log(`Staff claims set for ${uid}: boutique=${boutiqueId}, employee=${employeeId}, role=${role}.`);
console.log('The employee must sign in again before the new claims are present in their ID token.');
