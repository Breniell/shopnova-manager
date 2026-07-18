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
    onUpdateAvailable?: (cb: (info: { version: string }) => void) => () => void;
    onUpdateNotAvailable?: (cb: () => void) => () => void;
    onUpdateDownloadProgress?: (cb: (p: { percent: number }) => void) => () => void;
    onUpdateDownloaded?: (cb: (info: { version: string }) => void) => () => void;
    startUpdateDownload?: () => void;
    quitAndInstall?: () => void;
    onUpdateInstallBlocked?: (cb: () => void) => () => void;
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
