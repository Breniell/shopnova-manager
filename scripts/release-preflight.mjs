#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const errors = [];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(match => [match[1], match[2].trim()]));
}

const fileEnv = parseEnvFile(path.join(root, '.env'));
const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_LICENSE_PUBKEY',
];

for (const name of required) {
  const value = process.env[name] || fileEnv[name];
  if (!value || /^(change-me|todo|example|xxx)$/i.test(value)) errors.push(`${name} is missing or a placeholder`);
}

const licensePubkey = process.env.VITE_LICENSE_PUBKEY || fileEnv.VITE_LICENSE_PUBKEY;
if (licensePubkey) {
  try {
    const key = createPublicKey({
      key: Buffer.from(licensePubkey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (key.asymmetricKeyType !== 'ed25519') errors.push('VITE_LICENSE_PUBKEY is not an Ed25519 public key');
  } catch {
    errors.push('VITE_LICENSE_PUBKEY is not a valid base64 SPKI public key');
  }
}

if (release && (process.env.VITE_ENABLE_SUPERADMIN || fileEnv.VITE_ENABLE_SUPERADMIN) === 'true') {
  errors.push('VITE_ENABLE_SUPERADMIN must be disabled in client releases');
}

if (release && !(process.env.CSC_LINK || process.env.WIN_CSC_LINK)) {
  errors.push('CSC_LINK/WIN_CSC_LINK is required for a signed release');
}
if (release && !process.env.WIN_CSC_PUBLISHER) {
  errors.push('WIN_CSC_PUBLISHER is required for update signature verification');
}

for (const requiredFile of ['build/icon.ico', 'build/LICENSE.rtf', 'build/installer.nsh', 'electron-builder.release.yml']) {
  if (!fs.existsSync(path.join(root, requiredFile))) errors.push(`${requiredFile} is missing`);
}

try {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/);
  const forbidden = tracked.filter(name =>
    /(^|\/)(?:\.env|\.env\.(?:local|production(?:\.local)?|development(?:\.local)?)|service-account[^/]*\.json|license-private\.pem)$/i.test(name)
    || /\.(?:pfx|p12|key)$/i.test(name),
  );
  if (forbidden.length) errors.push(`sensitive files are tracked: ${forbidden.join(', ')}`);
} catch (error) {
  errors.push(`cannot inspect tracked files: ${error instanceof Error ? error.message : String(error)}`);
}

if (errors.length) {
  console.error('Release preflight failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Release preflight passed (${release ? 'signed release' : 'local validation'}).`);
