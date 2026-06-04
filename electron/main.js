/**
 * Legwan — Electron Main Process
 *
 * Responsibilities:
 *   - Create and manage the BrowserWindow
 *   - Load the built React app (or the Vite dev server in dev mode)
 *   - Handle system-level integrations (external links, window state, auto-update)
 */

import { app, BrowserWindow, shell, Menu, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const isDev = process.env.NODE_ENV === 'development';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Auto-updater (production only) ──────────────────────────────────────────
let autoUpdater = null;
if (!isDev) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = false;       // user decides when to download
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;              // silence default logger
  } catch (e) {
    // electron-updater unavailable — silently skip
  }
}

// ─── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ─── Window creation ──────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../build/icon.ico'),
    title: 'Legwan',
    show: false, // Show only when ready to avoid white flash
    backgroundColor: '#0f0e0d',
    titleBarStyle: 'default',
  });

  // ── Load the app ────────────────────────────────────────────────────────────
  if (isDev) {
    win.loadURL('http://localhost:8080');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // ── Show window once fully loaded ───────────────────────────────────────────
  let shown = false;
  const showWindow = () => {
    if (shown) return;
    shown = true;
    win.show();
    win.focus();
    // Check for updates 5 s after display so startup isn't slowed
    if (autoUpdater) {
      setTimeout(() => setupAutoUpdater(win), 5000);
    }
  };

  win.once('ready-to-show', showWindow);

  // Fallback: avoid a permanent black/invisible window if the renderer never
  // reaches ready-to-show because dist/index.html failed to load.
  setTimeout(showWindow, 4000);

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Legwan renderer] console[${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Legwan] renderer process gone:', details);
  });

  win.webContents.on('crashed', () => {
    console.error('[Legwan] renderer process crashed');
  });

  win.webContents.on('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`
        ({
          readyState: document.readyState,
          hasRoot: !!document.getElementById('root'),
          hash: location.hash,
          title: document.title,
          bodyLength: document.body?.textContent?.trim().length ?? 0,
        })
      `);
      console.log('[Legwan] did-finish-load:', result);
    } catch (err) {
      console.error('[Legwan] did-finish-load executeJavaScript error:', err);
    }
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;

    console.error(`[Legwan] did-fail-load: ${errorCode} ${errorDescription} - ${validatedURL}`);

    const errorHtml = `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              padding: 24px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 16px;
              font-family: Arial, sans-serif;
              color: #e0ddd8;
              background: #0f0e0d;
            }
            h2 { margin: 0; color: #ff6b47; }
            p {
              max-width: 520px;
              margin: 0;
              color: #b9b3aa;
              line-height: 1.6;
              text-align: center;
            }
            code {
              padding: 4px 8px;
              border-radius: 6px;
              background: #2a2825;
              color: #fff4ee;
              font-size: 13px;
            }
            button {
              margin-top: 8px;
              border: 0;
              border-radius: 8px;
              padding: 10px 24px;
              background: #A93200;
              color: white;
              font-size: 14px;
              cursor: pointer;
            }
            button:hover { background: #c23a00; }
          </style>
        </head>
        <body>
          <h2>Erreur de chargement</h2>
          <p><strong>Code ${errorCode}</strong> : ${errorDescription}</p>
          <p>
            Cause probable : le dossier <code>dist/</code> est absent ou incomplet.
            Lancez <code>npm run electron:dist:safe</code> pour reconstruire l'application.
          </p>
          <p style="font-size:12px">Chemin attendu : <code>${validatedURL}</code></p>
          <button onclick="window.location.reload()">Reessayer</button>
        </body>
      </html>
    `;

    win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    showWindow();
  });

  // ── Open external links (mailto:, https://) in the default browser ──────────
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const fileUrl = 'file://';
    const devUrl  = 'http://localhost:8080';
    // Allow internal file:// navigation and dev server; open everything else externally
    if (!url.startsWith(fileUrl) && !url.startsWith(devUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Block any renderer-initiated navigation that would leave the app shell.
  // With HashRouter this should never fire, but kept as safety net.
  win.webContents.on('did-navigate', (_event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  });

  // ── Disable F5 hard-refresh in production (would break file:// routing) ──────
  if (!isDev) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F5' || (input.key === 'r' && input.control)) {
        event.preventDefault();
      }
    });
  }

  return win;
}

// ─── Auto-update orchestration ────────────────────────────────────────────────
function setupAutoUpdater(win) {
  // update-available → renderer shows "télécharger ?" banner
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes ?? null,
    });
  });

  // no update → nothing to do
  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update-not-available');
  });

  // download progress → renderer shows progress bar
  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update-download-progress', {
      percent: Math.round(progress.percent),
    });
  });

  // download complete → renderer shows "redémarrer" button
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', () => {
    // Non-fatal — network may be unavailable, ignore silently
  });

  try { autoUpdater.checkForUpdates(); } catch (_) { /* no publish config yet */ }
}

// ─── IPC handlers (renderer → main) ──────────────────────────────────────────

// User clicked "Télécharger la mise à jour"
ipcMain.on('update-start-download', () => {
  try { autoUpdater?.downloadUpdate(); } catch (_) {}
});

// User clicked "Redémarrer et installer"
ipcMain.on('update-quit-and-install', () => {
  autoUpdater?.quitAndInstall(false, true);
});

// ─── Minimal application menu ─────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Legwan',
      submenu: [
        { label: 'À propos de Legwan', role: 'about' },
        { type: 'separator' },
        { label: 'Quitter', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    ...(isDev ? [{
      label: 'Développeur',
      submenu: [
        { label: 'Outils de développement', role: 'toggleDevTools' },
        { label: 'Recharger', role: 'reload' },
      ],
    }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
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
