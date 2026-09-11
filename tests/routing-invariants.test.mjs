import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The app mounts a <HashRouter>, so real URLs look like "#/caisse". Assigning
 * window.location.href = '/some-route' points at a path that does not exist,
 * and in the packaged Electron build (loaded over file://) the main process
 * rejects the navigation outright - so the control silently does nothing.
 *
 * That is exactly how the "Ouvrir une session" button on the cashier's
 * empty-till screen ended up dead: it was the only window.location navigation
 * left in the codebase. Route changes must go through react-router.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('no app route is navigated to through window.location', () => {
  const offenders = [];
  for (const file of sourceFiles(path.join(root, 'src'))) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/window\.location\s*(\.href\s*=|\.assign\s*\(|\.replace\s*\()\s*['"`]\//.test(line)) {
        offenders.push(`${path.relative(root, file)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Navigate with react-router (useNavigate) instead:\n${offenders.join('\n')}`
  );
});
