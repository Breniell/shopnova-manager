import { computeChecksum } from './backupCrypto';
import { BACKUP_DATA_KEYS, countBackupRecords } from './manifest';
import type { BackupData, BackupDataKey } from './types';

export interface BackupComparison {
  equal: boolean;
  expectedChecksum: string;
  actualChecksum: string;
  countDifferences: Partial<Record<BackupDataKey, { expected: number; actual: number }>>;
}

/** Compare an export with a post-restore readback, including every collection. */
export async function compareBackupData(expected: BackupData, actual: BackupData): Promise<BackupComparison> {
  const [expectedChecksum, actualChecksum] = await Promise.all([
    computeChecksum(expected),
    computeChecksum(actual),
  ]);
  const expectedCounts = countBackupRecords(expected);
  const actualCounts = countBackupRecords(actual);
  const countDifferences: BackupComparison['countDifferences'] = {};

  for (const key of BACKUP_DATA_KEYS) {
    if (expectedCounts[key] !== actualCounts[key]) {
      countDifferences[key] = { expected: expectedCounts[key], actual: actualCounts[key] };
    }
  }

  return {
    equal: expectedChecksum === actualChecksum && Object.keys(countDifferences).length === 0,
    expectedChecksum,
    actualChecksum,
    countDifferences,
  };
}
