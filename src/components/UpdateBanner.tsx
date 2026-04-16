/**
 * UpdateBanner — Bandeau de mise à jour automatique
 *
 * Cycle de vie :
 *   1. idle         → rien d'affiché
 *   2. available    → bandeau discret "Mise à jour v1.x.x disponible" + bouton Télécharger
 *   3. downloading  → barre de progression
 *   4. ready        → bandeau proéminent "Prête à installer" + bouton Redémarrer
 */
import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, X, ArrowDownToLine } from 'lucide-react';
import { cn } from '@/lib/utils';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available';    version: string }
  | { phase: 'downloading';  percent: number }
  | { phase: 'ready';        version: string };

declare global {
  interface Window {
    legwan?: {
      isElectron?: boolean;
      version?: string;
      platform?: string;
      onUpdateAvailable?:        (cb: (info: { version: string }) => void) => void;
      onUpdateNotAvailable?:     (cb: () => void) => void;
      onUpdateDownloadProgress?: (cb: (p: { percent: number }) => void) => void;
      onUpdateDownloaded?:       (cb: (info: { version: string }) => void) => void;
      startUpdateDownload?:      () => void;
      quitAndInstall?:           () => void;
    };
  }
}

export const UpdateBanner: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.legwan;
    if (!api?.isElectron) return; // Web / dev browser — no-op

    api.onUpdateAvailable?.((info) => {
      setState({ phase: 'available', version: info.version });
      setDismissed(false);
    });

    api.onUpdateDownloadProgress?.((p) => {
      setState({ phase: 'downloading', percent: p.percent });
    });

    api.onUpdateDownloaded?.((info) => {
      setState({ phase: 'ready', version: info.version });
      setDismissed(false);
    });
  }, []);

  // Nothing to show
  if (state.phase === 'idle' || dismissed) return null;

  // ── Ready to install ──────────────────────────────────────────────────────
  if (state.phase === 'ready') {
    return (
      <div className="fixed bottom-4 right-4 z-[9998] w-80 rounded-xl border border-primary/40 bg-card shadow-2xl overflow-hidden">
        <div className="h-1 bg-primary w-full" />
        <div className="p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
            <RefreshCw className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Mise à jour prête — v{state.version}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Redémarrez pour appliquer la mise à jour.
            </p>
            <button
              onClick={() => window.legwan?.quitAndInstall?.()}
              className="mt-3 w-full py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Redémarrer et installer
            </button>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground shrink-0"
            aria-label="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Downloading ───────────────────────────────────────────────────────────
  if (state.phase === 'downloading') {
    return (
      <div className="fixed bottom-4 right-4 z-[9998] w-72 rounded-xl border border-border bg-card shadow-xl p-4 flex items-center gap-3">
        <ArrowDownToLine className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground mb-1.5">
            Téléchargement… {state.percent}%
          </p>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${state.percent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Available ─────────────────────────────────────────────────────────────
  return (
    <div className={cn(
      'fixed bottom-4 right-4 z-[9998] w-80 rounded-xl border border-border bg-card shadow-xl overflow-hidden'
    )}>
      <div className="p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
          <Download className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Mise à jour disponible — v{state.version}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Une nouvelle version de Legwan est disponible.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                window.legwan?.startUpdateDownload?.();
                setState({ phase: 'downloading', percent: 0 });
              }}
              className="flex-1 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Télécharger
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground shrink-0"
          aria-label="Fermer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
