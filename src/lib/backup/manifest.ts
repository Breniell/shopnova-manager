import type { BackupData, BackupDataKey, BackupManifest } from './types';

export const BACKUP_DATA_KEYS: BackupDataKey[] = [
  'settings',
  'products',
  'sales',
  'customers',
  'suppliers',
  'expenses',
  'cashSessions',
  'cashOuts',
  'stockMovements',
  'inventorySessions',
  'payments',
  'users',
  'clotures',
  'saleCounter',
];

export function countBackupRecords(data: BackupData): Record<BackupDataKey, number> {
  return Object.fromEntries(BACKUP_DATA_KEYS.map(key => [
    key,
    key === 'settings'
      ? 1
      : key === 'saleCounter'
        ? (typeof data.saleCounter === 'number' ? 1 : 0)
        : (data[key]?.length ?? 0),
  ])) as Record<BackupDataKey, number>;
}

export function buildBackupManifest(
  data: BackupData,
  checksum: string,
  source: BackupManifest['source'],
  complete: boolean,
  warnings: string[] = [],
): BackupManifest {
  const counts = countBackupRecords(data);
  return {
    source,
    complete,
    counts,
    totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0),
    checksumAlgorithm: 'SHA-256',
    contentSha256: checksum,
    warnings: [...warnings],
  };
}

export function verifyBackupManifest(data: BackupData, manifest: BackupManifest, checksum: string): boolean {
  try {
    if (manifest.checksumAlgorithm !== 'SHA-256' || manifest.contentSha256 !== checksum) return false;
    const actual = countBackupRecords(data);
    for (const key of BACKUP_DATA_KEYS) {
      if (!Number.isSafeInteger(manifest.counts?.[key]) || manifest.counts[key] !== actual[key]) return false;
    }
    return manifest.totalRecords === Object.values(actual).reduce((sum, count) => sum + count, 0);
  } catch {
    return false;
  }
}
