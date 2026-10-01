/**
 * Covers the last link of the auto-update chain.
 *
 * tests/e2e-electron/update-flow.spec.ts proves the real packaged app reaches
 * the renderer with an `update-available` event carrying the new version. What
 * it cannot assert is that React then draws something the shopkeeper can see,
 * because the banner only mounts inside AppLayout, behind onboarding and a
 * login that would write to the production Firestore project.
 *
 * So the split is deliberate: the e2e test owns "the event arrives", this test
 * owns "the event becomes a banner".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { UpdateBanner } from '@/components/UpdateBanner';

type Handler<T> = (payload: T) => void;

type UpdateState =
  | { channel: 'update-available' | 'update-downloaded'; payload: { version: string } }
  | null;

type StalledOutcome =
  | { outcome: 'stalled'; targetVersion: string; fromVersion: string; attempts: number }
  | null;

interface FakeBridge {
  fireAvailable: Handler<{ version: string }>;
  fireProgress: Handler<{ percent: number }>;
  fireDownloaded: Handler<{ version: string }>;
  startUpdateDownload: ReturnType<typeof vi.fn>;
  quitAndInstall: ReturnType<typeof vi.fn>;
  requestUpdateCheck: ReturnType<typeof vi.fn>;
  acknowledgeUpdateStall: ReturnType<typeof vi.fn>;
}

/** Stands in for the preload bridge that electron/preload.js exposes. */
function installFakeBridge({
  isElectron = true,
  pendingState = null as UpdateState,
  pendingOutcome = null as StalledOutcome,
} = {}): FakeBridge {
  const handlers: Record<string, Handler<never>> = {};
  const subscribe = (name: string) => (callback: Handler<never>) => {
    handlers[name] = callback;
    return () => { delete handlers[name]; };
  };

  const bridge = {
    isElectron,
    getUpdateState: () => Promise.resolve(pendingState),
    getUpdatePendingOutcome: () => Promise.resolve(pendingOutcome),
    acknowledgeUpdateStall: vi.fn(() => Promise.resolve(true)),
    requestUpdateCheck: vi.fn(() => Promise.resolve(true)),
    onUpdateAvailable: subscribe('available'),
    onUpdateDownloadProgress: subscribe('progress'),
    onUpdateDownloaded: subscribe('downloaded'),
    onUpdateInstallBlocked: subscribe('blocked'),
    startUpdateDownload: vi.fn(),
    quitAndInstall: vi.fn(),
  };
  (window as unknown as { legwan: unknown }).legwan = bridge;

  return {
    fireAvailable: payload => act(() => { (handlers.available as Handler<typeof payload>)?.(payload); }),
    fireProgress: payload => act(() => { (handlers.progress as Handler<typeof payload>)?.(payload); }),
    fireDownloaded: payload => act(() => { (handlers.downloaded as Handler<typeof payload>)?.(payload); }),
    startUpdateDownload: bridge.startUpdateDownload,
    quitAndInstall: bridge.quitAndInstall,
    requestUpdateCheck: bridge.requestUpdateCheck,
    acknowledgeUpdateStall: bridge.acknowledgeUpdateStall,
  };
}

describe('UpdateBanner', () => {
  beforeEach(() => {
    delete (window as unknown as { legwan?: unknown }).legwan;
  });

  it('shows nothing until an update is announced', () => {
    installFakeBridge();
    const { container } = render(<UpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the new version when update-available arrives', () => {
    const bridge = installFakeBridge();
    render(<UpdateBanner />);

    bridge.fireAvailable({ version: '99.0.0' });

    // The exact string a shopkeeper reads, version substituted in.
    expect(screen.getByText('Mise à jour disponible - v99.0.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger' })).toBeInTheDocument();
  });

  it('asks the main process to download when the button is clicked', () => {
    const bridge = installFakeBridge();
    render(<UpdateBanner />);
    bridge.fireAvailable({ version: '99.0.0' });

    act(() => { screen.getByRole('button', { name: 'Télécharger' }).click(); });

    // autoDownload is off in main.mjs, so this call is what starts the transfer.
    expect(bridge.startUpdateDownload).toHaveBeenCalledTimes(1);
  });

  it('reports progress, then offers the restart once downloaded', () => {
    const bridge = installFakeBridge();
    render(<UpdateBanner />);

    bridge.fireAvailable({ version: '99.0.0' });
    bridge.fireProgress({ percent: 42 });
    expect(screen.getByText('Téléchargement… 42%')).toBeInTheDocument();

    bridge.fireDownloaded({ version: '99.0.0' });
    expect(screen.getByText('Mise à jour prête - v99.0.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redémarrer et installer' })).toBeInTheDocument();
  });

  it('can be dismissed with "Plus tard"', () => {
    const bridge = installFakeBridge();
    const { container } = render(<UpdateBanner />);
    bridge.fireAvailable({ version: '99.0.0' });

    act(() => { screen.getByRole('button', { name: 'Plus tard' }).click(); });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows an update the check already found before this banner mounted', async () => {
    // The banner sits behind the login screen, so by the time it mounts the
    // five-second update check has long finished and its event is gone. Asking
    // the main process on mount is the only way it can ever know.
    installFakeBridge({
      pendingState: { channel: 'update-available', payload: { version: '99.0.0' } },
    });
    render(<UpdateBanner />);

    expect(await screen.findByText('Mise à jour disponible - v99.0.0')).toBeInTheDocument();
  });

  it('offers the restart when the update was already downloaded before mount', async () => {
    installFakeBridge({
      pendingState: { channel: 'update-downloaded', payload: { version: '99.0.0' } },
    });
    render(<UpdateBanner />);

    expect(await screen.findByText('Mise à jour prête - v99.0.0')).toBeInTheDocument();
  });

  it('lets a live event win over the state it replayed', async () => {
    const bridge = installFakeBridge({
      pendingState: { channel: 'update-available', payload: { version: '99.0.0' } },
    });
    render(<UpdateBanner />);
    await screen.findByText('Mise à jour disponible - v99.0.0');

    // A download finishing must not be undone by the older replayed state.
    bridge.fireDownloaded({ version: '99.0.0' });
    expect(screen.getByText('Mise à jour prête - v99.0.0')).toBeInTheDocument();
  });

  it('asks for a fresh check when nothing is pending', async () => {
    // The register logs out after 15 minutes idle and the automatic re-check is
    // every 30, so an unattended machine is almost never logged in when one
    // lands. Each login has to be its own opportunity to find out.
    const bridge = installFakeBridge({ pendingState: null });
    render(<UpdateBanner />);

    await vi.waitFor(() => expect(bridge.requestUpdateCheck).toHaveBeenCalledTimes(1));
  });

  it('does not re-check when an update is already waiting', async () => {
    const bridge = installFakeBridge({
      pendingState: { channel: 'update-available', payload: { version: '99.0.0' } },
    });
    render(<UpdateBanner />);
    await screen.findByText('Mise à jour disponible - v99.0.0');

    expect(bridge.requestUpdateCheck).not.toHaveBeenCalled();
  });

  // ── An update that installed nothing ──────────────────────────────────────
  //
  // Installing silently removed the one signal a shopkeeper used to have: a
  // frozen progress bar. An NSIS update can deadlock waiting on the temporary
  // uninstaller it runs to remove the old version, and antivirus sandboxing
  // causes exactly that. Without these, the till closes for an update and never
  // comes back with nothing on screen to say why.

  it('explains a previous update that never installed', async () => {
    installFakeBridge({
      pendingOutcome: { outcome: 'stalled', targetVersion: '1.14.0', fromVersion: '1.13.0', attempts: 1 },
    });
    render(<UpdateBanner />);

    expect(await screen.findByText("La mise à jour v1.14.0 ne s'est pas installée")).toBeInTheDocument();
    // Reassuring them about their data is the whole point of speaking up.
    expect(screen.getByText(/Vos données sont intactes/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('names the antivirus once the same update has failed twice', async () => {
    // A first stall is worth retrying. A second means waiting will not fix it,
    // so the advice has to change from "try again" to "act".
    installFakeBridge({
      pendingOutcome: { outcome: 'stalled', targetVersion: '1.14.0', fromVersion: '1.13.0', attempts: 2 },
    });
    render(<UpdateBanner />);

    expect(await screen.findByText(/Deuxième échec/)).toBeInTheDocument();
    expect(screen.getByText(/antivirus bloque l'installation/)).toBeInTheDocument();
  });

  it('retires the warning only when the merchant acknowledges it', async () => {
    const bridge = installFakeBridge({
      pendingOutcome: { outcome: 'stalled', targetVersion: '1.14.0', fromVersion: '1.13.0', attempts: 1 },
    });
    const { container } = render(<UpdateBanner />);
    await screen.findByText("La mise à jour v1.14.0 ne s'est pas installée");

    // Clearing the marker at startup instead would mean a merchant who looked
    // away never learns of it, and a machine that stalls every time stays silent
    // after the first attempt.
    expect(bridge.acknowledgeUpdateStall).not.toHaveBeenCalled();

    act(() => { screen.getByRole('button', { name: "J'ai compris" }).click(); });

    expect(bridge.acknowledgeUpdateStall).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the failure on screen instead of offering the same update again', async () => {
    // Otherwise the shopkeeper is sent round the identical loop - download,
    // restart, nothing happens - without the cause ever being named.
    const bridge = installFakeBridge({
      pendingOutcome: { outcome: 'stalled', targetVersion: '1.14.0', fromVersion: '1.13.0', attempts: 1 },
    });
    render(<UpdateBanner />);
    await screen.findByText("La mise à jour v1.14.0 ne s'est pas installée");

    bridge.fireAvailable({ version: '1.14.0' });
    bridge.fireDownloaded({ version: '1.14.0' });

    expect(screen.getByText("La mise à jour v1.14.0 ne s'est pas installée")).toBeInTheDocument();
    expect(screen.queryByText('Mise à jour prête - v1.14.0')).not.toBeInTheDocument();
  });

  it('says nothing when the previous update did install', async () => {
    // Success needs no announcement; only main.mjs records it, in the log.
    const bridge = installFakeBridge({ pendingOutcome: null });
    const { container } = render(<UpdateBanner />);

    await vi.waitFor(() => expect(bridge.requestUpdateCheck).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent outside Electron so the web build is unaffected', () => {
    const bridge = installFakeBridge({ isElectron: false });
    const { container } = render(<UpdateBanner />);

    bridge.fireAvailable({ version: '99.0.0' });

    expect(container).toBeEmptyDOMElement();
  });
});
