/**
 * Legwan — Electron Main Process
 *
 * Responsibilities:
 *   - Create and manage the BrowserWindow
 *   - Load the built React app (or the Vite dev server in dev mode)
 *   - Handle system-level integrations (external links, window state, auto-update)
 */

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

// ─── Auto-updater (production only) ──────────────────────────────────────────
// Uncomment and configure when releases are published to GitHub
// const { autoUpdater } = require('electron-updater');

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
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
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
