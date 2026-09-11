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

interface FakeBridge {
  fireAvailable: Handler<{ version: string }>;
  fireProgress: Handler<{ percent: number }>;
  fireDownloaded: Handler<{ version: string }>;
  startUpdateDownload: ReturnType<typeof vi.fn>;
  quitAndInstall: ReturnType<typeof vi.fn>;
}

/** Stands in for the preload bridge that electron/preload.js exposes. */
function installFakeBridge({ isElectron = true } = {}): FakeBridge {
  const handlers: Record<string, Handler<never>> = {};
  const subscribe = (name: string) => (callback: Handler<never>) => {
    handlers[name] = callback;
    return () => { delete handlers[name]; };
  };

  const bridge = {
    isElectron,
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

  it('stays silent outside Electron so the web build is unaffected', () => {
    const bridge = installFakeBridge({ isElectron: false });
    const { container } = render(<UpdateBanner />);

    bridge.fireAvailable({ version: '99.0.0' });

    expect(container).toBeEmptyDOMElement();
  });
});
