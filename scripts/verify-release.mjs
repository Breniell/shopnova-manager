#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listPackage } from '@electron/asar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const requireSignature = process.argv.includes('--require-signature');
const artifact = path.resolve(argument('artifact') || path.join(root, 'release', `Legwan-Setup-${packageJson.version}.exe`));
const builtAfter = argument('built-after') ? new Date(argument('built-after')).getTime() : null;
const releaseDir = path.dirname(artifact);
const latestPath = path.join(releaseDir, 'latest.yml');
const blockmapPath = `${artifact}.blockmap`;
const asarPath = path.join(releaseDir, 'win-unpacked', 'resources', 'app.asar');
const unpackedRoot = `${asarPath}.unpacked`;
const errors = [];

for (const filePath of [artifact, blockmapPath, latestPath, asarPath]) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) errors.push(`missing or empty: ${filePath}`);
}

if (builtAfter && fs.existsSync(artifact) && fs.statSync(artifact).mtimeMs + 1_000 < builtAfter) {
  errors.push('installer predates the current build');
}

if (fs.existsSync(latestPath) && fs.existsSync(artifact)) {
  const latest = fs.readFileSync(latestPath, 'utf8');
  const declaredPath = latest.match(/^path:\s*(.+)$/m)?.[1]?.trim();
  const hashes = [...latest.matchAll(/^\s*sha512:\s*(\S+)$/gm)].map(match => match[1]);
  const actualHash = crypto.createHash('sha512').update(fs.readFileSync(artifact)).digest('base64');
  if (declaredPath !== path.basename(artifact)) errors.push(`latest.yml path mismatch: ${declaredPath}`);
  if (!hashes.includes(actualHash)) errors.push('latest.yml SHA-512 does not match the installer');
}

if (fs.existsSync(asarPath)) {
  const entries = listPackage(asarPath).map(name => name.replace(/\\/g, '/'));
  for (const requiredEntry of ['/dist/index.html', '/electron/launcher.cjs', '/electron/main.mjs']) {
    if (!entries.includes(requiredEntry)) errors.push(`app.asar is missing ${requiredEntry}`);
  }
  const forbidden = entries.filter(name =>
    /(^|\/)(?:\.env(?:\..+)?|service-account[^/]*\.json)$/i.test(name)
    || /\.(?:pem|pfx|p12|key)$/i.test(name),
  );
  if (forbidden.length) errors.push(`secrets found in app.asar: ${forbidden.join(', ')}`);
  if (!fs.existsSync(path.join(unpackedRoot, 'electron', 'main.mjs'))) {
    errors.push('Electron ESM runtime was not unpacked from app.asar');
  }
}

if (requireSignature && fs.existsSync(artifact)) {
  if (process.platform !== 'win32') {
    errors.push('Authenticode verification requires a Windows runner');
  } else {
    try {
      const escaped = artifact.replace(/'/g, "''");
      const output = execFileSync('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$s=Get-AuthenticodeSignature -LiteralPath '${escaped}'; [pscustomobject]@{Status=$s.Status.ToString();Subject=$s.SignerCertificate.Subject} | ConvertTo-Json -Compress`,
      ], { encoding: 'utf8' });
      const signature = JSON.parse(output.trim());
      if (signature.Status !== 'Valid') errors.push(`invalid Authenticode signature: ${signature.Status}`);
      const expectedSubject = process.env.WIN_CSC_PUBLISHER || process.env.WIN_CSC_SUBJECT;
      if (expectedSubject && !String(signature.Subject).includes(expectedSubject)) {
        errors.push('signing certificate subject does not match WIN_CSC_SUBJECT');
      }
    } catch (error) {
      errors.push(`cannot verify Authenticode signature: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (errors.length) {
  console.error('Release verification failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const checksum = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
const checksumPath = path.join(releaseDir, 'SHA256SUMS.txt');
fs.writeFileSync(checksumPath, `${checksum}  ${path.basename(artifact)}\n`, 'utf8');
console.log(`Release verified: ${path.basename(artifact)}`);
console.log(`SHA-256: ${checksum}`);
