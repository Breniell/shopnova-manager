/**
 * Preload script — runs in the renderer context with access to Node APIs.
 * Uses contextBridge to safely expose only what the renderer needs.
 * Never expose full Node.js capabilities to the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback, select = (value) => value) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, value) => callback(select(value));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// The automated smoke profile must pass the first-install policy gate before it
// can exercise the offline data bootstrap. This flag is only supplied by the
// main process when LEGWAN_SMOKE_TEST=1; normal users always see the policy.
const smokePolicy = process.argv.find(arg => arg.startsWith('--legwan-smoke-policy='));
if (smokePolicy) {
  try {
    const version = smokePolicy.slice('--legwan-smoke-policy='.length);
    localStorage.setItem('legwan-policy-accepted', JSON.stringify({
      version,
      accepted: true,
      name: 'Automated smoke test',
      date: new Date().toISOString(),
    }));
  } catch {
    // The smoke probe will fail explicitly if storage cannot be prepared.
  }
}

const appVersionArgument = process.argv.find(arg => arg.startsWith('--legwan-app-version='));
const appVersion = appVersionArgument
  ? appVersionArgument.slice('--legwan-app-version='.length)
  : '1.0.0';

contextBridge.exposeInMainWorld('legwan', {
  /** True when running inside Electron (not a regular browser) */
  isElectron: true,

  /** App version from package.json */
  version: appVersion,

  /** Platform: 'win32' | 'darwin' | 'linux' */
  platform: process.platform,

  // ── Auto-update API ────────────────────────────────────────────────────────

  /** Called when a new version is available on the server */
  onUpdateAvailable: (cb) => subscribe('update-available', cb),

  /** Called when no update is available */
  onUpdateNotAvailable: (cb) => subscribe('update-not-available', cb, () => undefined),

  /** Called periodically during download with { percent: number } */
  onUpdateDownloadProgress: (cb) => subscribe('update-download-progress', cb),

  /** Called when the update has been fully downloaded and is ready to install */
  onUpdateDownloaded: (cb) => subscribe('update-downloaded', cb),

  /** Tell main to start downloading the available update */
  startUpdateDownload: () => ipcRenderer.send('update-start-download'),

  /** Quit the app and install the downloaded update */
  quitAndInstall: () => ipcRenderer.send('update-quit-and-install'),

  /** Called if a safety backup prevents update installation. */
  onUpdateInstallBlocked: (cb) => subscribe('update-install-blocked', cb, () => undefined),

  automaticBackup: {
    save: (payload, reason, force = false) => ipcRenderer.invoke('backup:saveAutomatic', payload, reason, force),
    onBeforeUpdate: (cb) => {
      const listener = (_event, request) => cb(request);
      ipcRenderer.on('backup-before-update', listener);
      return () => ipcRenderer.removeListener('backup-before-update', listener);
    },
    confirmUpdate: (token, ok) => ipcRenderer.send('backup-before-update-result', token, ok),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
  },

  // ── Thermal printer API ────────────────────────────────────────────────────

  printer: {
    /** List available system printer names */
    list: () => ipcRenderer.invoke('printer:list'),
    /** Print a test page to the given printer */
    test: (config) => ipcRenderer.invoke('printer:test', config),
    /** Print a receipt HTML document to the thermal printer */
    printReceipt: (job) => ipcRenderer.invoke('printer:print', job),
    /** Send a cash-drawer open pulse */
    openDrawer: () => ipcRenderer.invoke('printer:openDrawer'),
  },
});
