import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  clearPendingUpdate,
  createDiagnosticLogger,
  createRendererRecoveryController,
  evaluatePendingUpdate,
  pendingUpdatePath,
  pickAutoUpdater,
  readPendingUpdate,
  recordUpdateAttempt,
  sanitizeDiagnosticValue,
  saveAutomaticBackup,
} from '../electron/runtime-support.mjs';

function createFakeTimers() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    setTimer(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clearTimer(id) {
      callbacks.delete(id);
    },
    runNext() {
      const entry = callbacks.entries().next().value;
      assert.ok(entry, 'expected a pending timer');
      const [id, callback] = entry;
      callbacks.delete(id);
      callback();
    },
    size: () => callbacks.size,
  };
}

test('renderer recovery coalesces duplicate crash notifications', () => {
  const timers = createFakeTimers();
  let reloads = 0;
  const recovery = createRendererRecoveryController({
    reload: () => { reloads += 1; },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  assert.equal(recovery.rendererGone({ reason: 'crashed' }).action, 'scheduled');
  assert.equal(recovery.rendererGone({ reason: 'crashed' }).action, 'coalesced');
  assert.equal(recovery.getState().attempts, 1);
  assert.equal(timers.size(), 1);
  timers.runNext();
  assert.equal(reloads, 1);
});

test('renderer recovery resets its failure budget after a stable load', () => {
  const timers = createFakeTimers();
  let reloads = 0;
  const recovery = createRendererRecoveryController({
    reload: () => { reloads += 1; },
    maxAttempts: 2,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  recovery.rendererGone();
  timers.runNext();
  recovery.rendererGone();
  timers.runNext();
  assert.equal(recovery.rendererGone().action, 'exhausted');

  recovery.rendererLoaded();
  timers.runNext();
  assert.equal(recovery.getState().attempts, 0);
  assert.equal(recovery.rendererGone().action, 'scheduled');
  timers.runNext();
  assert.equal(reloads, 3);
});

test('renderer recovery cancels pending work when its window closes', () => {
  const timers = createFakeTimers();
  let reloads = 0;
  const recovery = createRendererRecoveryController({
    reload: () => { reloads += 1; },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  recovery.rendererGone();
  recovery.dispose();
  assert.equal(timers.size(), 0);
  assert.equal(recovery.rendererGone().action, 'ignored');
  assert.equal(reloads, 0);
});

test('diagnostic sanitizer redacts common credentials', () => {
  const raw = 'Bearer abc.def.ghi password=hunter2 apiKey=AIza123456789012345678901234 token=secret';
  const clean = sanitizeDiagnosticValue(raw);
  assert.doesNotMatch(clean, /hunter2|AIza123|abc\.def|token=secret/);
  assert.match(clean, /REDACTED/);
});

test('diagnostic logger rotates and writes sanitized content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-log-'));
  const logger = createDiagnosticLogger(root, { maxBytes: 40, maxFiles: 3 });
  logger.info('password=do-not-store');
  logger.info('a'.repeat(100));
  logger.info('final');
  const combined = fs.readdirSync(root)
    .map(name => fs.readFileSync(path.join(root, name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(combined, /do-not-store/);
  assert.match(combined, /final/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('automatic backups are atomic, daily and retained', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-backup-'));
  const payload = JSON.stringify({
    format: 'legwan-backup',
    version: 1,
    checksum: 'abc123',
    data: { products: [] },
  });
  const first = saveAutomaticBackup({
    backupDir: root,
    payload,
    appVersion: '1.5.0',
    now: new Date('2026-07-13T10:00:00Z'),
  });
  const second = saveAutomaticBackup({
    backupDir: root,
    payload,
    appVersion: '1.5.0',
    now: new Date('2026-07-13T11:00:00Z'),
  });
  assert.equal(first.saved, true);
  assert.equal(second.skipped, true);
  assert.equal(fs.readFileSync(first.path, 'utf8'), payload);
  assert.equal(fs.readdirSync(root).some(name => name.endsWith('.tmp')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('automatic backup accepts the version the app actually emits', () => {
  // Regression: the validator was pinned to version 1 while the renderer
  // emits BACKUP_VERSION = 2, so every automatic backup threw on launch and
  // update installs were blocked (quitAndInstall requires a fresh backup).
  // Keep in sync with SUPPORTED_BACKUP_VERSIONS in src/lib/backup/types.ts.
  for (const version of [1, 2]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `legwan-backup-v${version}-`));
    const payload = JSON.stringify({
      format: 'legwan-backup',
      version,
      checksum: 'abc123',
      data: { products: [] },
    });
    const result = saveAutomaticBackup({
      backupDir: root,
      payload,
      appVersion: '1.7.0',
      now: new Date('2026-07-13T10:00:00Z'),
    });
    assert.equal(result.saved, true, `version ${version} should be accepted`);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('every packaging config unpacks node_modules beside the ESM runtime', () => {
  // Regression: 1.7.0 through 1.7.3 unpacked only electron/**/*. launcher.cjs
  // loads main.mjs from app.asar.unpacked/electron/, so Node resolved its bare
  // imports by walking the real directories above that file and never looked
  // inside the app.asar archive, where electron-updater actually sat. Every
  // launch logged ERR_MODULE_NOT_FOUND and auto-update was dead in all four
  // releases. scripts/verify-release.mjs proves reachability on a real build;
  // this catches the config regression without waiting for one.
  const root = path.join(import.meta.dirname, '..');
  for (const config of ['electron-builder.yml', 'electron-builder.admin.yml']) {
    const source = fs.readFileSync(path.join(root, config), 'utf8');
    const block = source.match(/^asarUnpack:[ \t]*\r?\n((?:[ \t]+.*\r?\n|\r?\n)*)/m)?.[1];
    assert.ok(block, `${config} declares no asarUnpack block`);
    const patterns = [...block.matchAll(/^\s*-\s*(\S+)\s*$/gm)].map(match => match[1]);
    assert.ok(
      patterns.includes('electron/**/*'),
      `${config} must unpack the ESM runtime, got ${patterns.join(', ')}`,
    );
    assert.ok(
      patterns.includes('node_modules/**/*'),
      `${config} unpacks the ESM runtime but not node_modules, so its bare `
        + `imports cannot resolve at runtime; got ${patterns.join(', ')}`,
    );
  }
});

test('pickAutoUpdater reads autoUpdater off the CJS default export', () => {
  // Regression: 1.7.4 finally loaded electron-updater, then destructured
  // `autoUpdater` straight off the namespace and got undefined, dying one line
  // later on "Cannot set properties of undefined (setting 'autoDownload')".
  const updater = { autoDownload: true };
  const namespace = {
    NsisUpdater: class {},
    AppUpdater: class {},
    default: Object.defineProperty({}, 'autoUpdater', {
      get: () => updater,
      enumerable: true,
      configurable: true,
    }),
  };
  assert.equal(pickAutoUpdater(namespace), updater);
});

test('pickAutoUpdater prefers a real named export when one exists', () => {
  const named = { id: 'named' };
  assert.equal(
    pickAutoUpdater({ autoUpdater: named, default: { autoUpdater: { id: 'default' } } }),
    named,
  );
});

test('pickAutoUpdater reports nothing found instead of returning undefined', () => {
  assert.equal(pickAutoUpdater({ NsisUpdater: class {} }), null);
  assert.equal(pickAutoUpdater(undefined), null);
  assert.equal(pickAutoUpdater({ autoUpdater: undefined }), null);
});

test('pickAutoUpdater does not touch getters it is not looking for', () => {
  // Reading autoUpdater constructs a platform updater and needs a live Electron
  // app, so probing an object that lacks the key must not evaluate anything.
  let reads = 0;
  const namespace = {
    default: Object.defineProperty({}, 'somethingElse', {
      get: () => { reads += 1; return null; },
      enumerable: true,
    }),
  };
  assert.equal(pickAutoUpdater(namespace), null);
  assert.equal(reads, 0);
});

test('the installed electron-updater exposes autoUpdater where pickAutoUpdater looks', async () => {
  // The test that would have caught 1.7.4: it probes the real dependency, not a
  // fixture. Use `in` only - reading the property builds an NsisUpdater and
  // requires a running Electron app, which node --test does not have.
  const namespace = await import('electron-updater');
  const sources = [namespace, namespace.default].filter(Boolean);
  assert.ok(
    sources.some(source => 'autoUpdater' in source),
    'electron-updater exposes autoUpdater on neither its ESM namespace nor its default export',
  );
});

test('automatic backup rejects an unrelated JSON document', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-backup-invalid-'));
  assert.throws(() => saveAutomaticBackup({
    backupDir: root,
    payload: '{"hello":"world"}',
    appVersion: '1.5.0',
  }), /Invalid Legwan backup/);
  fs.rmSync(root, { recursive: true, force: true });
});

// ── Noticing an update that installed nothing ───────────────────────────────
//
// The decision is pure, so every branch is reachable here. The persistence is
// tested with real files on purpose: the trial anchor had 77 tests on its pure
// logic and none on what it wrote to disk, and that is exactly where it failed.

test('a successful update is recognised and leaves nothing behind', () => {
  assert.deepEqual(
    evaluatePendingUpdate({
      marker: { targetVersion: '1.14.0', fromVersion: '1.13.0', attempts: 1 },
      currentVersion: '1.14.0',
    }),
    { outcome: 'installed', version: '1.14.0' },
  );
});

test('an update that left the version untouched is reported as stalled', () => {
  // The deadlock signature: the installer ran and changed nothing at all.
  assert.deepEqual(
    evaluatePendingUpdate({
      marker: { targetVersion: '1.14.0', fromVersion: '1.13.0', attempts: 1 },
      currentVersion: '1.13.0',
    }),
    { outcome: 'stalled', targetVersion: '1.14.0', fromVersion: '1.13.0', attempts: 1 },
  );
});

test('a corrupt or absent marker never invents a failure', () => {
  // Alarming a shopkeeper because of a bad disk write would be worse than
  // staying quiet - there is no evidence of anything having gone wrong.
  for (const marker of [null, undefined, 'nonsense', 42, {}, { targetVersion: '' }, { fromVersion: '1.13.0' }]) {
    assert.deepEqual(evaluatePendingUpdate({ marker, currentVersion: '1.13.0' }), { outcome: 'none' });
  }
});

test('a marker overtaken by a manual install is stale, not a failure', () => {
  // The merchant installed something else by hand in between, so the marker no
  // longer describes anything that happened.
  assert.deepEqual(
    evaluatePendingUpdate({
      marker: { targetVersion: '1.14.0', fromVersion: '1.13.0', attempts: 1 },
      currentVersion: '1.15.0',
    }),
    { outcome: 'stale' },
  );
});

test('a repeated stall is counted, because the advice changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-pending-'));
  const file = pendingUpdatePath(root);

  const first = recordUpdateAttempt({ filePath: file, targetVersion: '1.14.0', currentVersion: '1.13.0' });
  assert.equal(first.attempts, 1);
  assert.equal(
    evaluatePendingUpdate({ marker: readPendingUpdate(file), currentVersion: '1.13.0' }).attempts,
    1,
  );

  // Same jump attempted again after a stall: the count has to survive the restart,
  // otherwise a machine whose antivirus blocks every update is told "try again"
  // forever instead of being told to act.
  const second = recordUpdateAttempt({ filePath: file, targetVersion: '1.14.0', currentVersion: '1.13.0' });
  assert.equal(second.attempts, 2);
  assert.equal(
    evaluatePendingUpdate({ marker: readPendingUpdate(file), currentVersion: '1.13.0' }).attempts,
    2,
  );

  // A different target is a different story and starts its own count.
  assert.equal(
    recordUpdateAttempt({ filePath: file, targetVersion: '1.15.0', currentVersion: '1.13.0' }).attempts,
    1,
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('the marker survives a restart and can be retired', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-pending-cycle-'));
  const file = pendingUpdatePath(root);

  recordUpdateAttempt({ filePath: file, targetVersion: '1.14.0', currentVersion: '1.13.0' });
  assert.ok(fs.existsSync(file), 'nothing was written, so the next launch would learn nothing');

  const written = readPendingUpdate(file);
  assert.equal(written.targetVersion, '1.14.0');
  assert.equal(written.fromVersion, '1.13.0');
  assert.ok(!Number.isNaN(Date.parse(written.attemptedAt)), 'attemptedAt is not a readable date');

  clearPendingUpdate(file);
  assert.equal(fs.existsSync(file), false);
  assert.equal(readPendingUpdate(file), null);
  // Clearing something already gone must not throw: it runs on every clean launch.
  clearPendingUpdate(file);

  fs.rmSync(root, { recursive: true, force: true });
});

test('unreadable marker contents are treated as no marker at all', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-pending-corrupt-'));
  const file = pendingUpdatePath(root);
  fs.writeFileSync(file, '{ this is not json', 'utf8');
  assert.equal(readPendingUpdate(file), null);
  assert.deepEqual(
    evaluatePendingUpdate({ marker: readPendingUpdate(file), currentVersion: '1.13.0' }),
    { outcome: 'none' },
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('recording an attempt creates the directory it needs', () => {
  // userData exists in practice, but a first launch writing into a path whose
  // parent is missing must not take the update down with it.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-pending-mkdir-'));
  const file = pendingUpdatePath(path.join(root, 'does', 'not', 'exist'));
  recordUpdateAttempt({ filePath: file, targetVersion: '1.14.0', currentVersion: '1.13.0' });
  assert.ok(fs.existsSync(file));
  fs.rmSync(root, { recursive: true, force: true });
});
