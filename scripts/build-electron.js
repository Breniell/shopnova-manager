#!/usr/bin/env node
/**
 * Safe Electron build for Legwan.
 *
 * Checks the production prerequisites before creating the Windows installer.
 *
 * Usage:
 *   node scripts/build-electron.js              → installeur CLIENT (sans super-admin)
 *   node scripts/build-electron.js --variant=admin → installeur ÉDITEUR (avec super-admin)
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// ── Variant detection ────────────────────────────────────────────────────────
const isAdmin = process.argv.includes('--variant=admin');
const VARIANT_LABEL   = isAdmin ? 'ÉDITEUR (super-admin inclus)' : 'CLIENT (sans super-admin)';
const VITE_SCRIPT     = isAdmin ? 'electron:build:admin' : 'electron:build:client';
const EB_CONFIG       = isAdmin ? 'electron-builder.admin.yml' : 'electron-builder.yml';
const ARTIFACT_PREFIX = isAdmin ? 'Legwan-Admin' : 'Legwan';

console.log(`\n▶  Variante : ${VARIANT_LABEL}\n`);

function fail(message, details = []) {
  console.error(`\nERROR: ${message}`);
  for (const detail of details) {
    console.error(`  - ${detail}`);
  }
  process.exit(1);
}

function run(command, env = {}) {
  execSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function findWinCodeSignCache(cacheRoot) {
  if (!pathExists(cacheRoot)) return null;

  for (const entry of fs.readdirSync(cacheRoot)) {
    if (entry.endsWith('.7z') || entry.endsWith('.tmp')) continue;
    const entryPath = path.join(cacheRoot, entry);
    if (pathExists(path.join(entryPath, 'rcedit-x64.exe'))) {
      return entryPath;
    }
  }

  return null;
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    request.on('error', reject);
  });
}

async function ensureWinCodeSignCache(cacheRoot) {
  const existing = findWinCodeSignCache(cacheRoot);
  if (existing) return existing;

  fs.mkdirSync(cacheRoot, { recursive: true });
  const archive = path.join(cacheRoot, 'manual-winCodeSign-2.6.0.7z');
  const destination = path.join(cacheRoot, 'manual-winCodeSign-2.6.0');

  if (!pathExists(archive)) {
    console.log('Downloading winCodeSign cache...');
    await downloadFile(
      'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z',
      archive,
    );
  }

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  const sevenZip = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  const result = spawnSync(sevenZip, ['x', '-bd', '-y', archive, `-o${destination}`], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (!pathExists(path.join(destination, 'rcedit-x64.exe'))) {
    throw new Error(`winCodeSign extraction failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }

  return destination;
}

function patchElectronBuilderWinCodeSignLookup() {
  const filePath = path.join(ROOT, 'node_modules', 'app-builder-lib', 'out', 'binDownload.js');
  if (!pathExists(filePath)) return;

  let source = fs.readFileSync(filePath, 'utf8');
  const strictCheck = 'if (name === "winCodeSign" && process.platform === "win32")';
  if (source.includes(strictCheck)) {
    source = source.replace(strictCheck, 'if (name.startsWith("winCodeSign") && process.platform === "win32")');
    fs.writeFileSync(filePath, source);
    return;
  }

  if (source.includes('winCodeSign: using pre-extracted cache')) return;

  const marker = '    const args = ["download-artifact", "--name", name];';
  const workaround = `    if (name.startsWith("winCodeSign") && process.platform === "win32") {
        const cacheDir = path.join(getCacheDirectory(), "winCodeSign");
        try {
            const entries = require("fs").readdirSync(cacheDir);
            for (const entry of entries) {
                if (entry.endsWith(".7z") || entry.endsWith(".tmp"))
                    continue;
                const entryPath = path.join(cacheDir, entry);
                if (require("fs").existsSync(path.join(entryPath, "rcedit-x64.exe"))) {
                    builder_util_1.log.debug({ path: entryPath }, "winCodeSign: using pre-extracted cache");
                    return Promise.resolve(entryPath);
                }
            }
        }
        catch (_) {
        }
    }
`;

  if (source.includes(marker)) {
    source = source.replace(marker, workaround + marker);
    fs.writeFileSync(filePath, source);
  }
}

async function prepareWindowsPackagingWorkaround() {
  if (process.platform !== 'win32') return;

  console.log('Preparing winCodeSign cache workaround...');
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return;

  const cacheRoot = path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign');
  const cachePath = await ensureWinCodeSignCache(cacheRoot);
  patchElectronBuilderWinCodeSignLookup();
  console.log(`OK: winCodeSign cache at ${cachePath}`);
}

console.log('Checking .env...');
const envPath = path.join(ROOT, '.env');
if (!fs.existsSync(envPath)) {
  fail('Missing .env file', [
    'Copy .env.example to .env.',
    'Fill the Firebase values before building Electron.',
  ]);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
];
const missing = requiredVars.filter((name) => {
  const match = envContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return !match || match[1].trim() === '';
});

if (missing.length > 0) {
  fail('Firebase variables are missing or empty in .env', missing);
}
console.log('OK: .env');

console.log('Checking app icon...');
const iconPath = path.join(ROOT, 'build', 'icon.ico');
if (!fs.existsSync(iconPath)) {
  fail('Missing build/icon.ico', [
    'Create a 256x256 or 512x512 .ico file.',
    'Place it at build/icon.ico before building.',
  ]);
}
console.log('OK: build/icon.ico');

console.log(`\nStep 1/2: Vite build for Electron (${VARIANT_LABEL})...`);
run(`npm run ${VITE_SCRIPT}`);

const distIndex = path.join(ROOT, ‘dist’, ‘index.html’);
if (!fs.existsSync(distIndex)) {
  fail(‘dist/index.html was not generated by the Vite build’);
}

console.log(‘\nStep 2/2: Windows installer build...’);
await prepareWindowsPackagingWorkaround();
run(`npx electron-builder --win nsis --x64 --config ${EB_CONFIG} --publish never`, {
  CSC_IDENTITY_AUTO_DISCOVERY: ‘false’,
  WIN_CSC_LINK: ‘’,
  // Workaround: évite l’échec de packaging si certains DLL natives
  // (SwiftShader/angle) ne sont pas trouvées sur la machine de build.
  ELECTRON_BUILDER_EXTRA_ARGS: ‘--ignoreMissingFiles’,
});


console.log(`\nDone. Installeur ${ARTIFACT_PREFIX}-Setup-*.exe disponible dans release/.`);
