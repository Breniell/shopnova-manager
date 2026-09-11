import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createDiagnosticLogger,
  createRendererRecoveryController,
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

test('automatic backup rejects an unrelated JSON document', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-backup-invalid-'));
  assert.throws(() => saveAutomaticBackup({
    backupDir: root,
    payload: '{"hello":"world"}',
    appVersion: '1.5.0',
  }), /Invalid Legwan backup/);
  fs.rmSync(root, { recursive: true, force: true });
});
