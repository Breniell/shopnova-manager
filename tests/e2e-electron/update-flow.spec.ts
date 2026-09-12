/**
 * End-to-end proof that auto-update works, run against the REAL packaged app.
 *
 * Auto-update was dead in 1.6.0, 1.7.0, 1.7.1, 1.7.2, 1.7.3 and 1.7.4 - six
 * releases, three distinct causes, each one masking the next. Every one of them
 * passed static checks of the built package. None of those checks could observe
 * the one thing that mattered: whether the updater actually runs.
 *
 * These tests observe exactly that. A local HTTP server plays the part of the
 * release host and advertises a version far above the installed one, so the
 * whole chain runs for real - manifest fetch, version comparison, IPC through
 * the preload bridge into the renderer - with nothing published to GitHub and
 * no bogus update pushed at real shopkeepers.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPackagedApp, startUpdateServer, clientExecutable } from '../electron-harness';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAKE_VERSION = '99.0.0';

/** Any genuine installer works; only its bytes, size and hash are used. */
function findInstaller(): string {
  const releaseDir = path.join(root, 'release');
  const candidates = fs.readdirSync(releaseDir)
    .filter(name => /^Legwan-Setup-.*\.exe$/.test(name))
    .map(name => path.join(releaseDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!candidates.length) throw new Error('No Legwan-Setup-*.exe in release/; run "npm run dist:client".');
  return candidates[0];
}

test.beforeAll(() => {
  if (!fs.existsSync(clientExecutable)) {
    throw new Error(`Missing ${clientExecutable}. Run "npm run dist:client" first.`);
  }
});

test('the app detects a newer release and tells the renderer about it', async () => {
  const server = await startUpdateServer({ version: FAKE_VERSION, installerPath: findInstaller() });
  const session = await launchPackagedApp({ updateConfig: server.appUpdateYml });

  try {
    // Subscribe before the updater fires. main.mjs waits 5s after the window is
    // shown, and the preload bridge is available from document start, so there
    // is a comfortable margin - but register immediately regardless.
    await session.window.evaluate(() => {
      (window as unknown as { __updateSeen?: Promise<unknown> }).__updateSeen = new Promise(resolve => {
        const api = (window as unknown as { legwan?: { onUpdateAvailable?: (cb: (i: unknown) => void) => void } }).legwan;
        api?.onUpdateAvailable?.(info => resolve(info));
      });
    });

    const info = await session.window.evaluate(() => {
      const pending = (window as unknown as { __updateSeen: Promise<{ version: string }> }).__updateSeen;
      return Promise.race([
        pending,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 60_000)),
      ]);
    });

    expect(info, 'no update-available event reached the renderer').not.toBeNull();
    expect(info!.version).toBe(FAKE_VERSION);

    // The updater really talked to the server rather than short-circuiting.
    expect(server.requested).toContain('/latest.yml');

    // And it did so without any of the three historical failure modes.
    const log = session.readLog();
    expect(log, 'module resolution regressed').not.toContain('failed to load');
    expect(log, 'autoUpdater came back undefined').not.toContain('Cannot set properties of undefined');
    expect(log, 'the update check itself errored').not.toContain('update check failed');
  } finally {
    await session.close();
    await server.close();
  }
});

test('a banner that mounts after the check still learns about the update', async () => {
  // The bug this guards against: setupAutoUpdater fires 5s after the window is
  // shown, but UpdateBanner lives inside AppLayout and therefore only mounts
  // once the user has picked a profile and typed their PIN - always later than
  // 5s. The event was sent once, with nobody listening, and dropped. A shopkeeper
  // on 1.7.5 closed and reopened the app repeatedly and never saw a banner,
  // because every launch lost the event the same way. The only second chance was
  // the 30-minute re-check, and only if they happened to be logged in for it.
  //
  // So the main process must hold the last updater state and hand it to whoever
  // asks, rather than shouting once into an empty room.
  const server = await startUpdateServer({ version: FAKE_VERSION, installerPath: findInstaller() });
  const session = await launchPackagedApp({ updateConfig: server.appUpdateYml });

  try {
    // Subscribe to nothing and simply wait out the check, standing in for a user
    // still on the login screen.
    await session.window.waitForTimeout(20_000);
    expect(server.requested, 'the update check never ran').toContain('/latest.yml');

    const state = await session.window.evaluate(async () => {
      const api = (window as unknown as {
        legwan?: { getUpdateState?: () => Promise<{ channel: string; payload: { version?: string } } | null> };
      }).legwan;
      return api?.getUpdateState ? await api.getUpdateState() : 'API_MISSING';
    });

    expect(state, 'the renderer has no way to ask for the current update state').not.toBe('API_MISSING');
    expect(state, 'the update the main process already found was not retained').not.toBeNull();
    expect((state as { payload: { version?: string } }).payload.version).toBe(FAKE_VERSION);
  } finally {
    await session.close();
    await server.close();
  }
});

test('the renderer can ask for a fresh check, and is throttled if it insists', async () => {
  // Retaining the last result is not enough by itself: if the startup check runs
  // before the shop is online there is nothing to replay, and the automatic
  // re-check is 30 minutes away while the register logs itself out after 15
  // minutes idle. So the banner asks for a check as it mounts, making every
  // login an opportunity - throttled so repeated logins do not hammer GitHub.
  const server = await startUpdateServer({ version: FAKE_VERSION, installerPath: findInstaller() });
  const session = await launchPackagedApp({ updateConfig: server.appUpdateYml });

  try {
    await expect.poll(() => server.requested.filter(p => p === '/latest.yml').length, {
      timeout: 40_000,
    }).toBeGreaterThan(0);
    const afterStartup = server.requested.filter(p => p === '/latest.yml').length;

    const accepted = await session.window.evaluate(async () => {
      const api = (window as unknown as { legwan?: { requestUpdateCheck?: () => Promise<boolean> } }).legwan;
      return api?.requestUpdateCheck ? await api.requestUpdateCheck() : 'API_MISSING';
    });
    expect(accepted, 'the renderer cannot ask for a check').not.toBe('API_MISSING');
    expect(accepted, 'the requested check was refused').toBe(true);

    await expect.poll(() => server.requested.filter(p => p === '/latest.yml').length, {
      timeout: 30_000,
    }).toBeGreaterThan(afterStartup);

    // Asking again straight away must be refused rather than fetched again.
    const secondAttempt = await session.window.evaluate(async () => {
      const api = (window as unknown as { legwan?: { requestUpdateCheck?: () => Promise<boolean> } }).legwan;
      return api!.requestUpdateCheck!();
    });
    expect(secondAttempt, 'the throttle let a second immediate check through').toBe(false);
  } finally {
    await session.close();
    await server.close();
  }
});

test('the renderer can start the download and the update verifies', async () => {
  test.setTimeout(240_000);
  const server = await startUpdateServer({ version: FAKE_VERSION, installerPath: findInstaller() });
  const session = await launchPackagedApp({ updateConfig: server.appUpdateYml });

  try {
    await session.window.evaluate(() => {
      const api = (window as unknown as {
        legwan?: {
          onUpdateAvailable?: (cb: (i: unknown) => void) => void;
          onUpdateDownloaded?: (cb: (i: unknown) => void) => void;
          startUpdateDownload?: () => void;
        };
      }).legwan;
      (window as unknown as { __downloaded?: Promise<unknown> }).__downloaded = new Promise(resolve => {
        api?.onUpdateDownloaded?.(info => resolve(info));
      });
      // autoDownload is off by design: the download only starts when the user
      // asks for it, so drive it exactly as the banner's button does.
      api?.onUpdateAvailable?.(() => api?.startUpdateDownload?.());
    });

    const downloaded = await session.window.evaluate(() => {
      const pending = (window as unknown as { __downloaded: Promise<{ version: string }> }).__downloaded;
      return Promise.race([
        pending,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 180_000)),
      ]);
    });

    expect(downloaded, 'update-downloaded never reached the renderer').not.toBeNull();
    expect(downloaded!.version).toBe(FAKE_VERSION);

    // Downloading it means the sha512 in the manifest matched the bytes served;
    // electron-updater rejects the file otherwise.
    expect(server.requested.some(p => p.endsWith('.exe'))).toBe(true);

    const log = session.readLog();
    expect(log).not.toContain('update failed');
  } finally {
    await session.close();
    await server.close();
  }
});
