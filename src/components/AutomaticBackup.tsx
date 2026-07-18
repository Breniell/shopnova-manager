import { useCallback, useEffect } from 'react';
import { buildBackupFile, collectCompleteBackupData } from '@/lib/backup/export';
import { getBoutiqueId } from '@/services/boutiqueService';

const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Writes a recoverable backup through the Electron main process. The main
 * process performs atomic writes and retention; regular browsers simply no-op.
 */
export function AutomaticBackup() {
  const save = useCallback(async (reason: 'scheduled' | 'pre-update', force = false) => {
    const api = window.legwan?.automaticBackup;
    if (!api) return { ok: false, error: 'Electron backup API unavailable' };
    try {
      const snapshot = await collectCompleteBackupData();
      const backup = await buildBackupFile(snapshot, null, getBoutiqueId());
      return await api.save(JSON.stringify(backup), reason, force);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.legwanReady = 'true';
    return () => { delete document.documentElement.dataset.legwanReady; };
  }, []);

  useEffect(() => {
    if (!window.legwan?.automaticBackup) return;

    const initial = window.setTimeout(() => void save('scheduled'), 15_000);
    const interval = window.setInterval(() => void save('scheduled'), PERIODIC_CHECK_MS);
    const unsubscribe = window.legwan.automaticBackup.onBeforeUpdate(async ({ token }) => {
      const result = await save('pre-update', true);
      window.legwan?.automaticBackup?.confirmUpdate(token, result.ok);
    });

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [save]);

  return null;
}
