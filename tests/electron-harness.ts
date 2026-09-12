/**
 * Harness for driving the REAL packaged Legwan app from a test.
 *
 * Everything here exists so the app can be exercised without installing or
 * uninstalling anything: each run gets a throwaway `--user-data-dir`, so it has
 * its own onboarding, its own PIN, its own diagnostics log, and it does not
 * disturb (or get disturbed by) a Legwan the developer happens to be running -
 * Electron's single-instance lock is scoped to the user-data dir.
 *
 * The one non-obvious requirement is documented in launchPackagedApp below.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Cache directory electron-updater uses during tests.
 *
 * This is deliberately NOT the production `legwan-manager-updater`, so a test
 * can never hand a real installation a half-downloaded file.
 */
export const E2E_UPDATER_CACHE_NAME = 'legwan-e2e-updater';

export const clientExecutable = path.join(root, 'release', 'win-unpacked', 'Legwan.exe');
export const adminExecutable = path.join(root, 'release', 'win-unpacked', 'Legwan Admin.exe');
export const packagedResources = path.join(root, 'release', 'win-unpacked', 'resources');

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  profileDir: string;
  /** Reads the diagnostics log this run produced, or '' before it exists. */
  readLog(): string;
  close(): Promise<void>;
}

/**
 * Launch the packaged app with an isolated profile.
 *
 * ELECTRON_RUN_AS_NODE must be deleted from the child environment. VS Code sets
 * it to "1" for its own processes, and it is inherited by anything spawned from
 * an integrated terminal. With it set, an Electron binary starts as a bare Node
 * process: no window, no renderer, no diagnostics log, and an immediate exit
 * with `bad option: --user-data-dir`. That inherited variable is what made an
 * earlier investigation conclude, wrongly, that GUI apps simply cannot be
 * launched from this shell - a conclusion that pushed manual install/uninstall
 * cycles onto the user for every single verification.
 */
export async function launchPackagedApp(options: {
  executable?: string;
  /** Extra env for the app process. */
  env?: Record<string, string>;
  /** Replace resources/app-update.yml for this run, restored on close. */
  updateConfig?: string;
} = {}): Promise<LaunchedApp> {
  const executable = options.executable ?? clientExecutable;
  if (!fs.existsSync(executable)) {
    throw new Error(`Packaged app not found: ${executable}\nRun "npm run dist:client" first.`);
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legwan-e2e-'));

  // electron-updater keeps downloaded updates in %LOCALAPPDATA%\<cacheName>,
  // which is derived from the home directory and therefore NOT covered by the
  // isolated --user-data-dir. Left alone it leaks between runs: a second test
  // finds a pending 99.0.0 from the first, tries to resume it against a server
  // listening on a different port, and emits an updater error before falling
  // back to a fresh download. Clearing it is what makes these tests hermetic.
  if (options.updateConfig !== undefined) clearUpdaterCache();

  const updateConfigPath = path.join(packagedResources, 'app-update.yml');
  let previousUpdateConfig: string | null = null;
  if (options.updateConfig !== undefined) {
    previousUpdateConfig = fs.existsSync(updateConfigPath)
      ? fs.readFileSync(updateConfigPath, 'utf8')
      : null;
    fs.writeFileSync(updateConfigPath, options.updateConfig, 'utf8');
  }

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, options.env ?? {});

  const app = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profileDir}`],
    env,
    timeout: 60_000,
  });

  const window = await app.firstWindow({ timeout: 60_000 });
  await window.waitForLoadState('domcontentloaded');

  const readLog = () => {
    const logDir = path.join(profileDir, 'diagnostics');
    if (!fs.existsSync(logDir)) return '';
    return fs.readdirSync(logDir)
      .map(name => fs.readFileSync(path.join(logDir, name), 'utf8'))
      .join('\n');
  };

  return {
    app,
    window,
    profileDir,
    readLog,
    async close() {
      await app.close().catch(() => undefined);
      killStrayPackagedProcesses();
      if (previousUpdateConfig !== null) {
        fs.writeFileSync(updateConfigPath, previousUpdateConfig, 'utf8');
      }
      fs.rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

/** Remove any update electron-updater cached during a previous test run. */
export function clearUpdaterCache(): void {
  const localAppData = process.env.LOCALAPPDATA
    ?? path.join(os.homedir(), 'AppData', 'Local');
  const cacheDir = path.join(localAppData, E2E_UPDATER_CACHE_NAME);
  fs.rmSync(cacheDir, { recursive: true, force: true });
}

/**
 * Kill anything still running out of release/win-unpacked.
 *
 * An Electron app is a process tree - GPU, renderer, utility - and killing only
 * the main process leaves the others holding file handles inside win-unpacked.
 * The next `npm run dist:client` then dies with
 * `EPERM: operation not permitted, rename win-unpacked.tmp -> win-unpacked`,
 * which looks exactly like the antivirus flake this project already sees and
 * wastes a five-minute build to diagnose. Only processes under win-unpacked are
 * touched, never a Legwan the developer installed and is using.
 */
export function killStrayPackagedProcesses(): void {
  if (process.platform !== 'win32') return;
  const unpacked = path.join(root, 'release', 'win-unpacked');
  try {
    execFileSync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-Process | Where-Object { $_.Path -like '${unpacked.replace(/'/g, "''")}\\*' } | Stop-Process -Force -ErrorAction SilentlyContinue`,
    ], { stdio: 'ignore', timeout: 20_000 });
  } catch {
    // Best effort: a failure here only risks the EPERM above, not a bad test result.
  }
}

export interface UpdateServer {
  url: string;
  /** electron-updater config pointing the app at this server. */
  appUpdateYml: string;
  /** Bytes the app has actually requested, by path. */
  requested: string[];
  close(): Promise<void>;
}

/**
 * Serve a fake "newer release" over localhost so the full update flow - detect,
 * download, verify checksum - can run end to end without publishing anything to
 * the real GitHub repo, and therefore without pushing a bogus update at real
 * shopkeepers.
 *
 * The payload is synthetic on purpose. Serving the real installer's bytes over
 * localhost taught Avast that this exact content arrives from an unknown HTTP
 * source; it then autosandboxed and TERMINATED the genuine
 * release\Legwan-Setup-1.7.7.exe when it was launched, logging
 * "[Source: http://127.0.0.1:51973/Legwan-Setup-99.0.0.exe]". The test made the
 * shipped artifact unrunnable on the build machine. electron-updater only
 * verifies size and sha512 before emitting update-downloaded - both computed
 * here from whatever is served - so random bytes prove the same chain without
 * staking the real installer's reputation on it. They are also ~100MB lighter.
 */
export async function startUpdateServer(options: {
  version: string;
  /** Unused for the payload; kept so callers stay explicit about what they emulate. */
  installerPath?: string;
  /** Size of the synthetic payload. Small by default: nothing here needs bulk. */
  payloadBytes?: number;
}): Promise<UpdateServer> {
  const installer = crypto.randomBytes(options.payloadBytes ?? 512 * 1024);
  const sha512 = crypto.createHash('sha512').update(installer).digest('base64');
  const artifactName = `Legwan-Setup-${options.version}.exe`;
  const latestYml = [
    `version: ${options.version}`,
    'files:',
    `  - url: ${artifactName}`,
    `    sha512: ${sha512}`,
    `    size: ${installer.length}`,
    `path: ${artifactName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n');

  const requested: string[] = [];
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
    requested.push(requestPath);
    if (requestPath === '/latest.yml') {
      response.writeHead(200, { 'content-type': 'text/yaml' });
      response.end(latestYml);
      return;
    }
    if (requestPath === `/${artifactName}`) {
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(installer.length),
      });
      response.end(installer);
      return;
    }
    response.writeHead(404).end('not found');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  const url = `http://127.0.0.1:${address.port}/`;

  return {
    url,
    requested,
    appUpdateYml: [
      'provider: generic',
      `url: ${url}`,
      `updaterCacheDirName: ${E2E_UPDATER_CACHE_NAME}`,
      '',
    ].join('\n'),
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
