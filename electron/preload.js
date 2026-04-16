/**
 * Preload script — runs in the renderer context with access to Node APIs.
 * Uses contextBridge to safely expose only what the renderer needs.
 * Never expose full Node.js capabilities to the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('legwan', {
  /** True when running inside Electron (not a regular browser) */
  isElectron: true,

  /** App version from package.json */
  version: process.env.npm_package_version ?? '1.0.0',

  /** Platform: 'win32' | 'darwin' | 'linux' */
  platform: process.platform,

  // ── Auto-update API ────────────────────────────────────────────────────────

  /** Called when a new version is available on the server */
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),

  /** Called when no update is available */
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', () => cb()),

  /** Called periodically during download with { percent: number } */
  onUpdateDownloadProgress: (cb) => ipcRenderer.on('update-download-progress', (_e, p) => cb(p)),

  /** Called when the update has been fully downloaded and is ready to install */
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),

  /** Tell main to start downloading the available update */
  startUpdateDownload: () => ipcRenderer.send('update-start-download'),

  /** Quit the app and install the downloaded update */
  quitAndInstall: () => ipcRenderer.send('update-quit-and-install'),
});
