import { app, BrowserWindow, shell, Menu, ipcMain, crashReporter, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const isDev = process.env.NODE_ENV === 'development';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prevent Electron renderer crashes related to GPU/network service on Windows.
app.commandLine.appendSwitch('remote-allow-origins', '*');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-features', 'NetworkService,NetworkServiceInProcess');

// Disable hardware acceleration early to reduce GPU-related renderer crashes.
// Some launch paths may import this file after `app` is already ready
// (for example when using a small CommonJS launcher). Guard the call
// so it doesn't throw if it's too late.
try {
  if (!app.isReady()) app.disableHardwareAcceleration();
} catch (e) {
  console.warn('Skipping disableHardwareAcceleration:', e && e.message);
}

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
if (!isDev) {
  try {
    const { autoUpdater: updater } = await import('electron-updater');
    autoUpdater = updater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
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
      sandbox: false,
    },
    icon: path.join(__dirname, '../build/icon.ico'),
    title: 'Legwan',
    show: false,
    backgroundColor: '#0f0e0d',
    titleBarStyle: 'default',
  });

  if (isDev) {
    win.loadURL('http://localhost:8080');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  let shown = false;
  let crashRecoveryAttempts = 0;
  const MAX_CRASH_RECOVERS = 3;

  const showWindow = () => {
    if (shown) return;
    shown = true;
    win.show();
    win.focus();
    if (autoUpdater) {
      setTimeout(() => setupAutoUpdater(win), 5000);
    }
  };

  const recoverRenderer = () => {
    if (crashRecoveryAttempts >= MAX_CRASH_RECOVERS) return;
    crashRecoveryAttempts += 1;
    console.warn(`[Legwan] recovering renderer: attempt ${crashRecoveryAttempts}`);
    if (!win.isDestroyed()) win.reload();
  };

  win.once('ready-to-show', showWindow);
  setTimeout(showWindow, 4000);

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Legwan renderer] console[${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Legwan] renderer process gone:', details);
    recoverRenderer();
  });

  win.webContents.on('crashed', () => {
    console.error('[Legwan] renderer process crashed');
    recoverRenderer();
  });

  win.webContents.on('did-finish-load', async () => {
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
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;

    console.error(`[Legwan] did-fail-load: ${errorCode} ${errorDescription} - ${validatedURL}`);

    const errorHtml = `...`;
    win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    showWindow();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const fileUrl = 'file://';
    const devUrl = 'http://localhost:8080';
    if (!url.startsWith(fileUrl) && !url.startsWith(devUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on('did-navigate', (_event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    // Block F5 / Ctrl+R in production
    if (!isDev && (input.key === 'F5' || (input.key === 'r' && input.control))) {
      event.preventDefault();
      return;
    }
    // Secret shortcut: Ctrl+Shift+Alt+A → Console super-admin
    if (input.type === 'keyDown' && input.key === 'A' && input.control && input.shift && input.alt) {
      event.preventDefault();
      win.webContents.executeJavaScript("window.location.hash = '/superadmin'").catch(() => {});
    }
    // Secret shortcut: Ctrl+Shift+Alt+H → Retour accueil (depuis super-admin)
    if (input.type === 'keyDown' && input.key === 'H' && input.control && input.shift && input.alt) {
      event.preventDefault();
      win.webContents.executeJavaScript("window.location.hash = '/login'").catch(() => {});
    }
  });

  return win;
}

function setupAutoUpdater(win) {
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-available', { version: info.version, releaseNotes: info.releaseNotes ?? null });
  });

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update-download-progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', () => {});

  try { autoUpdater.checkForUpdates(); } catch (_) {}
}

ipcMain.on('update-start-download', () => {
  try { autoUpdater?.downloadUpdate(); } catch (_) {}
});

ipcMain.on('update-quit-and-install', () => {
  autoUpdater?.quitAndInstall(false, true);
});

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

app.whenReady().then(() => {
  // Allow geolocation in the renderer (GPS via OS location services)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'geolocation');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'geolocation';
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
