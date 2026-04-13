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
});
