// CommonJS launcher to dynamically import the ESM `main.mjs` for Electron
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  try {
    const filePathMjs = path.join(__dirname, 'main.mjs');
    const filePathJs = path.join(__dirname, 'main.js');
    const fs = require('fs');
    const target = fs.existsSync(filePathMjs) ? filePathMjs : filePathJs;
    await import(pathToFileURL(target).href);

  } catch (err) {
    // Print error and exit so logs capture launch failures
    console.error('Failed to load ESM main:', err);
    process.exit(1);
  }
})();
