import fs from 'node:fs';
import path from 'node:path';

/**
 * Coordinates renderer recovery without coupling the policy to Electron.
 * Repeated notifications received before the scheduled reload are coalesced,
 * and the failure budget is restored only after the renderer remains stable.
 */
export function createRendererRecoveryController({
  reload,
  isDestroyed = () => false,
  maxAttempts = 3,
  recoveryDelayMs = 250,
  stableAfterMs = 10_000,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
  onRecovery = () => {},
  onExhausted = () => {},
  onReloadError = () => {},
} = {}) {
  if (typeof reload !== 'function') throw new TypeError('reload must be a function');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError('maxAttempts must be a positive integer');

  let attempts = 0;
  let pendingRecovery = null;
  let stableTimer = null;
  let disposed = false;
  let exhaustionReported = false;

  const cancelStableReset = () => {
    if (stableTimer === null) return;
    clearTimer(stableTimer);
    stableTimer = null;
  };

  const rendererGone = (details = {}) => {
    if (disposed || isDestroyed()) return { action: 'ignored', attempts };
    cancelStableReset();

    if (pendingRecovery !== null) return { action: 'coalesced', attempts };
    if (attempts >= maxAttempts) {
      if (!exhaustionReported) {
        exhaustionReported = true;
        onExhausted(details, attempts);
      }
      return { action: 'exhausted', attempts };
    }

    attempts += 1;
    onRecovery(details, attempts);
    pendingRecovery = setTimer(() => {
      pendingRecovery = null;
      if (disposed || isDestroyed()) return;
      try {
        reload();
      } catch (error) {
        onReloadError(error);
      }
    }, Math.max(0, recoveryDelayMs));
    return { action: 'scheduled', attempts };
  };

  const rendererLoaded = () => {
    if (disposed || isDestroyed()) return;
    cancelStableReset();
    stableTimer = setTimer(() => {
      stableTimer = null;
      attempts = 0;
      exhaustionReported = false;
    }, Math.max(0, stableAfterMs));
  };

  const dispose = () => {
    disposed = true;
    cancelStableReset();
    if (pendingRecovery !== null) {
      clearTimer(pendingRecovery);
      pendingRecovery = null;
    }
  };

  return {
    rendererGone,
    rendererLoaded,
    dispose,
    getState: () => ({
      attempts,
      recoveryPending: pendingRecovery !== null,
      stableResetPending: stableTimer !== null,
      disposed,
    }),
  };
}

const SECRET_PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]'],
  [/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_FIREBASE_KEY]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]'],
  [/([?&](?:api[_-]?key|token|secret|password|pin|authorization)=)[^&#\s]+/gi, '$1[REDACTED]'],
  [/((?:api[_-]?key|token|secret|password|passwd|pin|authorization)\s*[=:]\s*)[^\s,;}]+/gi, '$1[REDACTED]'],
  [/("(?:api[_-]?key|token|secret|password|passwd|pin|authorization)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2'],
];

export function sanitizeDiagnosticValue(value) {
  let text;
  if (value instanceof Error) {
    text = value.stack || `${value.name}: ${value.message}`;
  } else if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }

  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text.slice(0, 20_000);
}

function rotateLogs(logFile, maxFiles) {
  for (let index = maxFiles - 1; index >= 1; index -= 1) {
    const source = index === 1 ? logFile : `${logFile}.${index - 1}`;
    const destination = `${logFile}.${index}`;
    if (fs.existsSync(source)) fs.renameSync(source, destination);
  }
}

export function createDiagnosticLogger(logDir, options = {}) {
  const maxBytes = options.maxBytes ?? 1_000_000;
  const maxFiles = options.maxFiles ?? 4;
  fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
  const logFile = path.join(logDir, 'legwan.log');

  const write = (level, values) => {
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size >= maxBytes) {
        rotateLogs(logFile, maxFiles);
      }
      const message = values.map(sanitizeDiagnosticValue).join(' ');
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${level} ${message}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Logging must never stop the application from starting.
    }
  };

  return {
    path: logFile,
    info: (...values) => write('INFO', values),
    warn: (...values) => write('WARN', values),
    error: (...values) => write('ERROR', values),
  };
}

function backupTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function saveAutomaticBackup({ backupDir, payload, appVersion, reason = 'scheduled', now = new Date(), force = false }) {
  if (typeof payload !== 'string' || Buffer.byteLength(payload, 'utf8') > 100 * 1024 * 1024) {
    throw new Error('Invalid automatic backup payload');
  }

  const parsed = JSON.parse(payload);
  if (parsed?.format !== 'legwan-backup' || parsed?.version !== 1 || !parsed?.checksum || !parsed?.data) {
    throw new Error('Invalid Legwan backup document');
  }

  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stateFile = path.join(backupDir, '.automatic-backup-state.json');
  if (!force && fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const ageMs = now.getTime() - new Date(state.createdAt).getTime();
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000) {
        return { saved: false, skipped: true, path: state.path ?? null };
      }
    } catch {
      // A corrupt state file should not prevent a fresh backup.
    }
  }

  const safeVersion = String(appVersion).replace(/[^0-9A-Za-z.-]/g, '_').slice(0, 32);
  const safeReason = String(reason).replace(/[^0-9A-Za-z_-]/g, '_').slice(0, 24);
  const filename = `legwan-auto-${backupTimestamp(now)}-v${safeVersion}-${safeReason}.json`;
  const target = path.join(backupDir, filename);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, target);
  fs.writeFileSync(stateFile, JSON.stringify({ createdAt: now.toISOString(), path: target }), {
    encoding: 'utf8',
    mode: 0o600,
  });

  const backups = fs.readdirSync(backupDir)
    .filter(name => /^legwan-auto-.*\.json$/.test(name))
    .map(name => ({ name, mtimeMs: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const oldBackup of backups.slice(14)) {
    fs.rmSync(path.join(backupDir, oldBackup.name), { force: true });
  }

  return { saved: true, skipped: false, path: target };
}
