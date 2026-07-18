// CommonJS launcher to dynamically import the ESM `main.mjs` for Electron
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  try {
    // Node's ESM loader in Electron 26 cannot import module contents through
    // app.asar. electron-builder unpacks electron/**/* for this reason.
    const filePathMjs = __dirname.includes('app.asar')
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'main.mjs')
      : path.join(__dirname, 'main.mjs');
    await import(pathToFileURL(filePathMjs).href);

  } catch (err) {
    // Print error and exit so logs capture launch failures
    console.error('Failed to load ESM main:', err);
    process.exit(1);
  }
})();
