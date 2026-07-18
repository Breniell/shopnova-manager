import { describe, expect, it, vi } from 'vitest';
import type { BackupData } from '@/lib/backup/types';
import { readAllPages } from '@/lib/backup/firestoreSource';
import {
  buildBackupFile,
  CompleteBackupIntegrityError,
  resolveCompleteBackupSnapshot,
} from '@/lib/backup/export';
import { parseBackupFile } from '@/lib/backup/import';
import { compareBackupData } from '@/lib/backup/verify';

const dataFixture = (): BackupData => ({
  settings: {
    nom: 'Historique complet', adresse: '', telephone: '', email: '', nui: '',
    enteteRecu: '', piedPageRecu: '', devise: 'XAF', langue: 'fr',
    paperWidth: '80', openDrawerOnSale: false, autoPrintOnSale: false,
  },
  products: [], sales: [], customers: [], suppliers: [], expenses: [],
  cashSessions: [], cashOuts: [], stockMovements: [], inventorySessions: [], payments: [], users: [],
});

describe('exhaustive backup source', () => {
  it('paginates until exhaustion without silently applying a maximum', async () => {
    const all = Array.from({ length: 1203 }, (_, index) => ({ id: `id-${String(index).padStart(4, '0')}` }));
    const fetchPage = vi.fn(async (cursor: string | null, size: number) => {
      const offset = cursor ? all.findIndex(item => item.id === cursor) + 1 : 0;
      return all.slice(offset, offset + size).map(value => ({ id: value.id, value }));
    });

    const result = await readAllPages(fetchPage, 500);

    expect(result).toEqual(all);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls[2][0]).toBe('id-0999');
  });

  it('rejects a pagination adapter that repeats its cursor', async () => {
    const fetchPage = vi.fn(async () => [
      { id: 'same', value: 1 }, { id: 'same', value: 2 },
    ]);
    await expect(readAllPages(fetchPage, 2)).rejects.toThrow('backup_pagination_cursor_stalled');
  });

  it('falls back to a marked-incomplete local backup on a transient cloud failure', async () => {
    const local = dataFixture();
    const result = await resolveCompleteBackupSnapshot({
      local,
      boutiqueId: 'cloud-shop',
      firebaseConfigured: true,
      online: true,
      loadCloud: vi.fn().mockRejectedValue(new Error('unavailable')),
    });

    expect(result.data).toBe(local);
    expect(result).toMatchObject({ source: 'local-device', complete: false });
    expect(result.warnings[0]).toContain('unavailable');
  });

  it('never hides an integrity failure behind the local fallback', async () => {
    await expect(resolveCompleteBackupSnapshot({
      local: dataFixture(),
      boutiqueId: 'cloud-shop',
      firebaseConfigured: true,
      online: true,
      loadCloud: vi.fn().mockRejectedValue(new CompleteBackupIntegrityError('invalid cloud page')),
    })).rejects.toThrow('invalid cloud page');
  });
});

describe('v2 export, restore validation and comparison', () => {
  it('round-trips data and verifies manifest counts plus content fingerprint', async () => {
    const data = dataFixture();
    const built = await buildBackupFile({
      data,
      source: 'cloud-full',
      complete: true,
      warnings: [],
    }, null, 'cloud-shop', new Date('2026-07-13T00:00:00.000Z'));

    expect(built.version).toBe(2);
    expect(built.manifest).toMatchObject({
      source: 'cloud-full', complete: true, totalRecords: 1,
      counts: { settings: 1, sales: 0, products: 0 },
    });

    const parsed = await parseBackupFile(new File([JSON.stringify(built)], 'backup.json'));
    expect(parsed.ok).toBe(true);
    const comparison = await compareBackupData(data, parsed.data!);
    expect(comparison.equal).toBe(true);
    expect(comparison.countDifferences).toEqual({});
  });

  it('rejects a v2 manifest whose inventory was altered', async () => {
    const data = dataFixture();
    const built = await buildBackupFile({
      data, source: 'local-device', complete: true, warnings: [],
    }, null, 'local-shop');
    built.manifest!.counts.sales = 99;

    const parsed = await parseBackupFile(new File([JSON.stringify(built)], 'backup.json'));
    expect(parsed).toMatchObject({ ok: false, error: 'manifest_mismatch' });
  });

  it('reports post-restore record loss instead of accepting a partial restore', async () => {
    const expected = dataFixture();
    expected.products = [{
      id: 'p1', nom: 'Produit', stock: 1, prixAchat: 10, prixVente: 15,
      categorie: 'Autre', codeBarre: '', seuilAlerte: 0,
    }];
    const actual = { ...expected, products: [] };

    const comparison = await compareBackupData(expected, actual);
    expect(comparison.equal).toBe(false);
    expect(comparison.countDifferences.products).toEqual({ expected: 1, actual: 0 });
  });
});
