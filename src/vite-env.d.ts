/// <reference types="vite/client" />

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
    onUpdateAvailable?: (cb: (info: { version: string }) => void) => void;
    onUpdateNotAvailable?: (cb: () => void) => void;
    onUpdateDownloadProgress?: (cb: (p: { percent: number }) => void) => void;
    onUpdateDownloaded?: (cb: (info: { version: string }) => void) => void;
    startUpdateDownload?: () => void;
    quitAndInstall?: () => void;
    printer?: {
      list: () => Promise<string[]>;
      test: (config: LegwanPrinterConfig) => Promise<{ ok: boolean; error?: string }>;
      printReceipt: (job: LegwanPrintJob) => Promise<{ ok: boolean; error?: string }>;
      openDrawer: () => Promise<void>;
    };
  };
}
