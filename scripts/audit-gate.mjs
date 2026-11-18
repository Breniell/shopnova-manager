#!/usr/bin/env node
/**
 * Dependency audit gate (npm run security:prod).
 *
 * Fails on any high or critical advisory, like `npm audit --audit-level=high`,
 * except the advisories listed in ACCEPTED below. An entry is only allowed when
 * no patched release exists upstream, and each one carries the reason it does
 * not reach merchants plus a review date: once that date passes, the gate fails
 * again so the exception is looked at instead of being forgotten.
 *
 * A package is cleared only when EVERY high/critical advisory reaching it is
 * accepted. Packages flagged solely because they depend on an accepted package
 * are cleared through that chain; a package with its own unaccepted advisory
 * still fails.
 */
import { execFileSync } from 'node:child_process';

const ACCEPTED = {
  'GHSA-fc5q-39xc-vjpf': {
    package: 'picomatch',
    reason: 'ReDoS on crafted extglob patterns. No patched release exists (<=4.0.7, the latest). '
      + 'picomatch is only reached through build and test tooling (vite, vitest, tailwindcss, '
      + 'electron-builder, vite-plugin-pwa), which only ever matches glob patterns written in this '
      + 'repository. It is not bundled into dist/ and never sees merchant input.',
    reviewBy: '2027-02-28',
  },
};

const SEVERE = new Set(['high', 'critical']);

function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--json'], {
      encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // npm audit exits 1 whenever it finds anything; the JSON is still on stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

const report = JSON.parse(runAudit());
if (report.error) {
  console.error('npm audit failed:', report.error.summary ?? report.error);
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const expired = Object.entries(ACCEPTED).filter(([, a]) => a.reviewBy < today);
for (const [id, a] of expired) {
  console.error(`Exception ${id} (${a.package}) expired on ${a.reviewBy}: re-check upstream and renew or remove it.`);
}

const vulns = report.vulnerabilities ?? {};
const advisoryId = (via) => (via.url ?? '').split('/').pop();
const memo = new Map();

/** True when every severe problem of `name` comes from accepted advisories. */
function cleared(name, seen = new Set()) {
  if (memo.has(name)) return memo.get(name);
  if (seen.has(name)) return true; // cycle: judged by the other members
  seen.add(name);
  const v = vulns[name];
  let ok = true;
  for (const via of v?.via ?? []) {
    if (typeof via === 'string') {
      if (vulns[via] && SEVERE.has(vulns[via].severity) && !cleared(via, seen)) ok = false;
    } else if (SEVERE.has(via.severity)) {
      const id = advisoryId(via);
      if (!(id in ACCEPTED) || ACCEPTED[id].package !== via.name) ok = false;
    }
  }
  memo.set(name, ok);
  return ok;
}

const blocking = [];
const accepted = [];
for (const [name, v] of Object.entries(vulns)) {
  if (!SEVERE.has(v.severity)) continue;
  (cleared(name) ? accepted : blocking).push(`${v.severity.padEnd(8)} ${name} ${v.range}`);
}

if (accepted.length) {
  console.log(`Accepted through documented exceptions (${Object.keys(ACCEPTED).join(', ')}):`);
  for (const line of accepted.sort()) console.log(`  ${line}`);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(`npm audit: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate.`);

if (blocking.length) {
  console.error('\nBlocking high/critical advisories:');
  for (const line of blocking.sort()) console.error(`  ${line}`);
  console.error('\nRun `npm audit` for details.');
}

if (blocking.length || expired.length) process.exit(1);
console.log('Audit gate passed.');
