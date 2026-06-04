const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function findRceditExecutable(root) {
  if (!root || !exists(root)) return null;

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === 'rcedit-x64.exe') {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const nested = findRceditExecutable(entryPath);
      if (nested) return nested;
    }
  }

  return null;
}

function windowsVersion(version) {
  const parts = String(version)
    .split('.')
    .map((part) => {
      const match = part.match(/\d+/);
      return match ? match[0] : '0';
    })
    .slice(0, 4);

  while (parts.length < 4) {
    parts.push('0');
  }

  return parts.join('.');
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectDir = context.packager.info.projectDir;
  const packageJsonPath = path.join(projectDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const productFilename = context.packager.appInfo.productFilename || 'Legwan';
  const appExe = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(projectDir, 'build', 'icon.ico');
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || '',
    'electron-builder',
    'Cache',
    'winCodeSign',
  );
  const rcedit = findRceditExecutable(cacheRoot);

  if (!exists(appExe)) {
    throw new Error(`Windows executable not found: ${appExe}`);
  }
  if (!exists(iconPath)) {
    throw new Error(`App icon not found: ${iconPath}`);
  }
  if (!rcedit) {
    throw new Error(`rcedit-x64.exe not found in ${cacheRoot}`);
  }

  const version = windowsVersion(packageJson.version);
  const result = spawnSync(
    rcedit,
    [
      appExe,
      '--set-icon',
      iconPath,
      '--set-version-string',
      'FileDescription',
      'Legwan',
      '--set-version-string',
      'ProductName',
      'Legwan',
      '--set-version-string',
      'CompanyName',
      'Legwan',
      '--set-file-version',
      version,
      '--set-product-version',
      version,
    ],
    {
      cwd: projectDir,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    throw new Error(`rcedit failed with exit code ${result.status}`);
  }

  console.log(`Injected Windows icon/resources into ${appExe}`);
};
