import { app, BrowserWindow, shell, Menu, ipcMain, crashReporter, session } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createDiagnosticLogger,
  createRendererRecoveryController,
  saveAutomaticBackup,
} from './runtime-support.mjs';

// Never let an environment variable turn a packaged binary into a localhost-
// trusting development shell with DevTools enabled.
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const applicationRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar')
  : path.resolve(__dirname, '..');
const distRoot = path.join(applicationRoot, 'dist');
const releaseVersion = app.isPackaged
  ? app.getVersion()
  : JSON.parse(fs.readFileSync(path.join(applicationRoot, 'package.json'), 'utf8')).version;
const isSmokeTest = process.env.LEGWAN_SMOKE_TEST === '1';
const diagnostics = createDiagnosticLogger(path.join(app.getPath('userData'), 'diagnostics'));
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = (...values) => { diagnostics.info(...values); originalConsole.log(...values); };
console.warn = (...values) => { diagnostics.warn(...values); originalConsole.warn(...values); };
console.error = (...values) => { diagnostics.error(...values); originalConsole.error(...values); };

// NSIS installer (electron-builder) does not send Squirrel events — no handling needed.

// Start the crash reporter to collect renderer minidumps locally for diagnosis
try {
  crashReporter.start({
    companyName: 'Legwan',
    submitURL: '',
    uploadToServer: false,
    compress: true,
  });
} catch (e) {
  // ignore crashReporter failures
}

let autoUpdater = null;
let updaterConfigured = false;
let updateInstallInProgress = false;
let printInProgress = false;
if (!isDev) {
  try {
    const { autoUpdater: updater } = await import('electron-updater');
    autoUpdater = updater;
    autoUpdater.autoDownload = false;
    // Installation is explicit and gated by a fresh automatic backup.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;
  } catch (e) {
    // electron-updater unavailable — silently skip
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      // Preload script provides safe renderer APIs; restore for normal runtime
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
      additionalArguments: [
        `--legwan-app-version=${releaseVersion}`,
        ...(isSmokeTest ? [`--legwan-smoke-policy=${releaseVersion}`] : []),
      ],
    },
    icon: app.isPackaged ? undefined : path.join(applicationRoot, 'build', 'icon.ico'),
    title: 'Legwan',
    show: false,
    backgroundColor: '#f8f8f6',
    titleBarStyle: 'default',
  });

  let shown = false;
  let showingLoadError = false;
  let updaterTimer = null;

  const showWindow = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
    win.focus();
    if (autoUpdater && !isSmokeTest) {
      updaterTimer = setTimeout(() => {
        updaterTimer = null;
        if (!win.isDestroyed()) setupAutoUpdater();
      }, 5000);
    }
  };

  const recovery = createRendererRecoveryController({
    reload: () => win.reload(),
    isDestroyed: () => win.isDestroyed(),
    onRecovery: (details, attempt) => {
      console.warn(`[Legwan] recovering renderer: attempt ${attempt}`, details);
    },
    onExhausted: (details, attempts) => {
      console.error(`[Legwan] renderer recovery exhausted after ${attempts} attempts`, details);
    },
    onReloadError: (error) => console.error('[Legwan] renderer reload failed:', error),
  });

  win.once('ready-to-show', showWindow);
  const revealTimer = setTimeout(showWindow, 4000);
  win.once('closed', () => {
    clearTimeout(revealTimer);
    if (updaterTimer !== null) clearTimeout(updaterTimer);
    recovery.dispose();
  });

  win.webContents.on('console-message', (details) => {
    const { level, message, lineNumber, sourceId } = details;
    console.log(`[Legwan renderer] console[${level}] ${message} (${sourceId}:${lineNumber})`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Legwan] renderer process gone:', details);
    recovery.rendererGone(details);
  });

  win.webContents.on('did-finish-load', async () => {
    recovery.rendererLoaded();
    try {
      const result = await win.webContents.executeJavaScript(`(
        {
          readyState: document.readyState,
          hasRoot: !!document.getElementById('root'),
          hash: location.hash,
          title: document.title,
          bodyLength: document.body?.textContent?.trim().length ?? 0,
        }
      )`);
      console.log('[Legwan] did-finish-load:', result);
    } catch (err) {
      console.error('[Legwan] did-finish-load executeJavaScript error:', err);
    }
    if (isSmokeTest) void runSmokeProbe(win);
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;

    console.error(`[Legwan] did-fail-load: ${errorCode} ${errorDescription} - ${validatedURL}`);

    const trustedEntryUrl = isDev
      ? 'http://localhost:8080'
      : pathToFileURL(path.join(distRoot, 'index.html')).href;
    const trustedEntryHref = trustedEntryUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const errorText = `${errorCode} · ${errorDescription}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const errorHtml = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Legwan — Erreur</title>
<style>
  body{margin:0;background:#f8f8f6;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{text-align:center;max-width:400px;padding:32px}
  svg{margin-bottom:16px}
  h2{margin:0 0 8px;font-size:1.25rem;color:#1c1c1a}
  p{margin:0 0 24px;font-size:0.875rem;color:#888;word-break:break-all}
  a{display:inline-block;background:#A93200;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:0.9rem;cursor:pointer}
</style></head>
<body><div class="box">
  <svg width="56" height="56" viewBox="0 0 80 80" fill="none">
    <rect width="80" height="80" rx="18" fill="#A93200"/>
    <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="20" y1="13" x2="20" y2="60" stroke="white" stroke-width="5" stroke-linecap="round"/>
    <line x1="20" y1="60" x2="34" y2="60" stroke="white" stroke-width="5" stroke-linecap="round"/>
  </svg>
  <h2>Impossible de charger Legwan</h2>
  <p>${errorText}</p>
  <a href="${trustedEntryHref}">Réessayer</a>
</div></body></html>`;
    showingLoadError = true;
    void win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`)
      .catch(error => console.error('[Legwan] cannot show load error page:', error));
    showWindow();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // The label/report helpers create a same-origin blank document, write
    // already-rendered printable HTML into it, then call window.print().
    if (url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: false,
          },
        },
      };
    }
    openExternalUrl(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  win.webContents.on('did-navigate', (_event, url) => {
    if (showingLoadError && url.startsWith('data:text/html')) return;
    if (isTrustedAppUrl(url)) showingLoadError = false;
    if (!isTrustedAppUrl(url)) {
      void win.loadFile(path.join(distRoot, 'index.html'))
        .catch(error => console.error('[Legwan] cannot restore trusted navigation:', error));
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    // Block F5 / Ctrl+R in production
    if (!isDev && (input.key === 'F5' || (input.key === 'r' && input.control))) {
      event.preventDefault();
      return;
    }
    // Secret shortcut: Ctrl+Shift+Alt+A → Console super-admin
    // Use input.code (physical key, layout-independent) instead of input.key
    // (which changes with Alt on AZERTY and other non-QWERTY keyboards).
    if (input.type === 'keyDown' && input.code === 'KeyA' && input.control && input.shift && input.alt) {
      event.preventDefault();
      win.webContents.executeJavaScript("window.location.hash = '/superadmin'").catch(() => {});
    }
    // Secret shortcut: Ctrl+Shift+Alt+H → Retour accueil (depuis super-admin)
    if (input.type === 'keyDown' && input.code === 'KeyH' && input.control && input.shift && input.alt) {
      event.preventDefault();
      win.webContents.executeJavaScript("window.location.hash = '/login'").catch(() => {});
    }
  });

  const initialLoad = isDev
    ? win.loadURL('http://localhost:8080')
    : win.loadFile(path.join(distRoot, 'index.html'));
  void initialLoad.catch(error => console.error('[Legwan] initial page load failed:', error));
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  return win;
}

function sendUpdaterEvent(channel, payload) {
  const win = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
  if (!win || win.webContents.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function setupAutoUpdater() {
  if (!autoUpdater) return;
  if (!updaterConfigured) {
    updaterConfigured = true;
    autoUpdater.on('update-available', (info) => {
      sendUpdaterEvent('update-available', { version: info.version, releaseNotes: info.releaseNotes ?? null });
    });

    autoUpdater.on('update-not-available', () => {
      sendUpdaterEvent('update-not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
      sendUpdaterEvent('update-download-progress', {
        percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      sendUpdaterEvent('update-downloaded', { version: info.version });
    });

    autoUpdater.on('error', (error) => {
      console.warn('[Legwan updater] update failed:', error);
    });
  }

  void autoUpdater.checkForUpdates()
    .catch(error => console.warn('[Legwan updater] update check failed:', error));
}

ipcMain.on('update-start-download', (event) => {
  if (!isTrustedIpcSender(event) || !autoUpdater) return;
  void autoUpdater.downloadUpdate()
    .catch(error => console.warn('[Legwan updater] download failed:', error));
});

ipcMain.on('update-quit-and-install', async (event) => {
  if (!isTrustedIpcSender(event) || !autoUpdater || updateInstallInProgress) return;
  updateInstallInProgress = true;
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const backupReady = win ? await requestBackupBeforeUpdate(win) : false;
    if (!backupReady) {
      console.error('[Legwan updater] installation blocked: pre-update backup failed');
      if (!event.sender.isDestroyed()) event.sender.send('update-install-blocked');
      updateInstallInProgress = false;
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    updateInstallInProgress = false;
    console.error('[Legwan updater] installation failed:', error);
    if (!event.sender.isDestroyed()) event.sender.send('update-install-blocked');
  }
});

const pendingUpdateBackups = new Map();

function requestBackupBeforeUpdate(win) {
  const token = crypto.randomUUID();
  return new Promise((resolve) => {
    let settled = false;
    let timeout = null;
    const onClosed = () => complete(false);
    const complete = (ok) => {
      if (settled) return;
      settled = true;
      if (timeout !== null) clearTimeout(timeout);
      win.removeListener('closed', onClosed);
      pendingUpdateBackups.delete(token);
      resolve(ok === true);
    };
    timeout = setTimeout(() => complete(false), 60_000);
    pendingUpdateBackups.set(token, { senderId: win.webContents.id, complete });
    win.once('closed', onClosed);
    try {
      win.webContents.send('backup-before-update', { token });
    } catch {
      complete(false);
    }
  });
}

ipcMain.on('backup-before-update-result', (event, token, ok) => {
  if (!isTrustedIpcSender(event) || typeof token !== 'string') return;
  const pending = pendingUpdateBackups.get(token);
  if (!pending || pending.senderId !== event.sender.id) return;
  pending.complete(ok === true);
});

ipcMain.handle('backup:saveAutomatic', async (event, payload, reason, force) => {
  if (!isTrustedIpcSender(event)) return { ok: false, error: 'Untrusted IPC sender' };
  try {
    const backupDir = path.join(app.getPath('userData'), 'automatic-backups');
    const result = saveAutomaticBackup({
      backupDir,
      payload,
      appVersion: releaseVersion,
      reason: reason === 'pre-update' ? 'pre-update' : 'scheduled',
      force: force === true,
    });
    console.log('[Legwan backup]', result.saved ? 'automatic backup saved' : 'automatic backup skipped');
    return { ok: true, saved: result.saved, skipped: result.skipped };
  } catch (error) {
    console.error('[Legwan backup] automatic backup failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('backup:openFolder', async (event) => {
  if (!isTrustedIpcSender(event)) return { ok: false };
  const backupDir = path.join(app.getPath('userData'), 'automatic-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  await shell.openPath(backupDir);
  return { ok: true };
});

// Thermal-printer IPC handlers. launcher.cjs loads this ESM entry point in
// packaged builds, so the handlers must live here (not only in main.js).
ipcMain.handle('printer:list', async (event) => {
  if (!isTrustedIpcSender(event)) return [];
  try {
    const printers = await event.sender.getPrintersAsync();
    return printers.map(printer => printer.name);
  } catch {
    return [];
  }
});

ipcMain.handle('printer:test', async (_event, config = {}) => {
  try {
    if (!isTrustedIpcSender(_event)) throw new Error('Untrusted IPC sender');
    const paperWidth = config.paperWidth === '58' ? '58' : '80';
    const printerName = typeof config.printerName === 'string' ? config.printerName.slice(0, 256) : '';
    await printHtml(buildTestPrintHtml(paperWidth), printerName, paperWidth);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('printer:print', async (_event, job = {}) => {
  try {
    if (!isTrustedIpcSender(_event)) throw new Error('Untrusted IPC sender');
    if (typeof job.html !== 'string' || job.html.length === 0 || job.html.length > 1_000_000) {
      throw new Error('Invalid print job');
    }
    const paperWidth = job.paperWidth === '58' ? '58' : '80';
    const printerName = typeof job.printerName === 'string' ? job.printerName.slice(0, 256) : '';
    await printHtml(job.html, printerName, paperWidth);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle('printer:openDrawer', async (event) => {
  if (!isTrustedIpcSender(event)) return { ok: false, error: 'Untrusted IPC sender' };
  // Electron's generic printing API cannot reliably emit a raw ESC/POS pulse.
  // Keep the existing capability response until a serial/TCP driver is added.
  return { ok: true };
});

function buildTestPrintHtml(paperWidth) {
  const width = paperWidth === '58' ? '58mm' : '80mm';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: ${width} auto; margin: 0; }
    body { font-family: monospace; font-size: 9pt; width: ${width}; margin: 0; padding: 4mm 2mm; }
    h3 { text-align: center; margin: 0 0 4mm; }
    p  { margin: 1mm 0; text-align: center; font-size: 8pt; }
  </style></head><body>
    <h3>Page de test</h3>
    <p>Legwan POS</p>
    <p>Imprimante : OK</p>
    <p>Largeur : ${width}</p>
    <p>--- fin du test ---</p>
  </body></html>`;
}

function printHtml(html, printerName, paperWidth) {
  if (printInProgress) return Promise.reject(new Error('Another print job is already running'));
  printInProgress = true;

  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false },
    });
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Print job timed out')), 30_000);

    const closePrintWindow = () => {
      printInProgress = false;
      if (!printWindow.isDestroyed()) printWindow.close();
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      closePrintWindow();
      if (error) reject(error);
      else resolve();
    };

    printWindow.webContents.once('did-finish-load', () => {
      const width = paperWidth === '58' ? 58 : 80;
      printWindow.webContents.print(
        {
          silent: true,
          deviceName: typeof printerName === 'string' ? printerName : '',
          pageSize: { width: width * 1000, height: 297 * 1000 },
          margins: { marginType: 'none' },
          printBackground: false,
        },
        (success, errorType) => {
          finish(success ? null : new Error(errorType || 'print failed'));
        },
      );
    });

    printWindow.webContents.once('did-fail-load', (_event, code, description) => {
      finish(new Error(`${code}: ${description}`));
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .catch(error => finish(error));
  });
}

function openExternalUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(protocol)) return;
    void shell.openExternal(url);
  } catch {
    // Ignore malformed or unsafe external URLs.
  }
}

function isTrustedAppUrl(url) {
  try {
    const parsed = new URL(url);
    if (isDev) return parsed.origin === 'http://localhost:8080';
    if (parsed.protocol !== 'file:') return false;
    const appRoot = path.resolve(distRoot) + path.sep;
    const requestedPath = path.resolve(fileURLToPath(parsed));
    return requestedPath.startsWith(appRoot);
  } catch {
    return false;
  }
}

function isTrustedIpcSender(event) {
  if (!event?.sender || event.sender.isDestroyed()) return false;
  if (event.senderFrame && event.senderFrame !== event.sender.mainFrame) return false;
  return isTrustedAppUrl(event.senderFrame?.url ?? event.sender.getURL());
}

async function runSmokeProbe(win) {
  const resultPath = process.env.LEGWAN_SMOKE_RESULT;
  if (!resultPath || win.isDestroyed()) return;
  const deadline = Date.now() + 25_000;
  let probe = null;

  while (Date.now() < deadline && !win.isDestroyed()) {
    try {
      probe = await win.webContents.executeJavaScript(`({
        ready: document.documentElement.dataset.legwanReady === 'true',
        readyState: document.readyState,
        rootChildren: document.getElementById('root')?.childElementCount ?? 0,
        hash: location.hash,
        bodyLength: document.body?.textContent?.trim().length ?? 0,
      })`);
      if (probe.ready && probe.rootChildren > 0) break;
    } catch (error) {
      probe = { ready: false, error: error instanceof Error ? error.message : String(error) };
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const passed = probe?.ready === true && probe?.rootChildren > 0;
  const result = {
    passed,
    offline: process.env.LEGWAN_OFFLINE_SMOKE === '1',
    version: releaseVersion,
    probe,
    timestamp: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
  } catch (error) {
    console.error('[Legwan smoke] cannot write result:', error);
  }
  console.log(`[Legwan smoke] ${passed ? 'passed' : 'failed'}`, result);
  app.exit(passed ? 0 : 2);
}

function buildMenu() {
  const template = [
    {
      label: 'Legwan',
      submenu: [
        { label: 'À propos de Legwan', role: 'about' },
        {
          label: 'Sauvegardes automatiques',
          click: () => {
            const backupDir = path.join(app.getPath('userData'), 'automatic-backups');
            fs.mkdirSync(backupDir, { recursive: true });
            void shell.openPath(backupDir);
          },
        },
        {
          label: 'Diagnostics locaux',
          click: () => void shell.showItemInFolder(diagnostics.path),
        },
        { type: 'separator' },
        { label: 'Quitter', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    ...(isDev ? [{
      label: 'Développeur',
      submenu: [
        { label: 'Outils de développement', role: 'toggleDevTools' },
        { label: 'Recharger', role: 'reload' },
        { type: 'separator' },
        {
          label: 'Console Super-Admin',
          accelerator: 'Ctrl+Shift+Alt+A',
          click: () => {
            const wins = BrowserWindow.getAllWindows();
            if (wins[0]) wins[0].webContents.executeJavaScript("window.location.hash = '/superadmin'").catch(() => {});
          },
        },
      ],
    }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  if (isSmokeTest && process.env.LEGWAN_OFFLINE_SMOKE === '1') {
    await session.defaultSession.enableNetworkEmulation({ offline: true });
    console.log('[Legwan smoke] network emulation enabled: offline');
  }
  // Allow geolocation in the renderer (GPS via OS location services)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'geolocation' && isTrustedAppUrl(webContents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'geolocation' && isTrustedAppUrl(webContents.getURL());
  });

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    const win = windows[0];
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
