#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');
const online = process.argv.includes('--online');
const executable = packaged
  ? path.join(root, 'release', 'win-unpacked', 'Legwan.exe')
  : path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const args = packaged ? [] : [path.join(root, 'electron', 'launcher.cjs')];

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/index.html is missing; run npm run electron:build:client first.');
  process.exit(1);
}
if (!fs.existsSync(executable)) {
  console.error(`Electron executable is missing: ${executable}`);
  process.exit(1);
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-smoke-'));
const resultPath = path.join(temporary, 'result.json');
args.push(`--user-data-dir=${path.join(temporary, 'profile')}`);

const child = spawn(executable, args, {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: '',
    LEGWAN_SMOKE_TEST: '1',
    LEGWAN_OFFLINE_SMOKE: online ? '0' : '1',
    LEGWAN_SMOKE_RESULT: resultPath,
  },
  stdio: 'inherit',
  windowsHide: true,
});

const timeout = setTimeout(() => child.kill(), 40_000);
const exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timeout);

let result = null;
try { result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); } catch { /* reported below */ }
if (exitCode !== 0 || result?.passed !== true || result?.offline === online) {
  console.error('Electron smoke test failed.', { exitCode, result, temporary });
  process.exit(1);
}
console.log(`Electron ${packaged ? 'packaged' : 'source'} ${online ? 'online' : 'offline'} smoke test passed.`);
fs.rmSync(temporary, { recursive: true, force: true });
