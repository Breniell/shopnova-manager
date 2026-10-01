/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface LegwanPrinterConfig {
  printerName: string;
  paperWidth: '58' | '80';
}

interface LegwanPrintJob {
  html: string;
  printerName: string;
  paperWidth: '58' | '80';
}

interface Window {
  legwan?: {
    isElectron?: boolean;
    version?: string;
    platform?: string;
    /** Whatever the updater already found, for a banner that mounts after the check. */
    getUpdateState?: () => Promise<
      { channel: 'update-available' | 'update-downloaded'; payload: { version: string } } | null
    >;
    /** Ask the main process to check again now; throttled there. */
    requestUpdateCheck?: () => Promise<boolean>;
    onUpdateAvailable?: (cb: (info: { version: string }) => void) => () => void;
    onUpdateNotAvailable?: (cb: () => void) => () => void;
    onUpdateDownloadProgress?: (cb: (p: { percent: number }) => void) => () => void;
    onUpdateDownloaded?: (cb: (info: { version: string }) => void) => () => void;
    startUpdateDownload?: () => void;
    quitAndInstall?: () => void;
    onUpdateInstallBlocked?: (cb: () => void) => () => void;
    /**
     * Whether the previous installation attempt never took effect.
     *
     * A silent install reports nothing by construction, and an NSIS update can
     * deadlock on the uninstaller it runs to remove the old version. The next
     * launch compares intent with reality, so a dead update can be explained
     * rather than left as a till that closed and never reopened.
     */
    getUpdatePendingOutcome?: () => Promise<{
      outcome: 'stalled';
      targetVersion: string;
      fromVersion: string;
      attempts: number;
    } | null>;
    acknowledgeUpdateStall?: () => Promise<boolean>;
    automaticBackup?: {
      save: (
        payload: string,
        reason: 'scheduled' | 'pre-update',
        force?: boolean,
      ) => Promise<{ ok: boolean; saved?: boolean; skipped?: boolean; error?: string }>;
      onBeforeUpdate: (cb: (request: { token: string }) => void) => () => void;
      confirmUpdate: (token: string, ok: boolean) => void;
      openFolder: () => Promise<{ ok: boolean }>;
    };
    printer?: {
      list: () => Promise<string[]>;
      test: (config: LegwanPrinterConfig) => Promise<{ ok: boolean; error?: string }>;
      printReceipt: (job: LegwanPrintJob) => Promise<{ ok: boolean; error?: string }>;
      openDrawer: () => Promise<void>;
    };
  };
}
