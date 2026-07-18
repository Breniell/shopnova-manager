import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import type { BackupData, BackupDataKey } from '@/lib/backup/types';
import { BACKUP_DATA_KEYS, countBackupRecords } from '@/lib/backup/manifest';
import { computeChecksum } from '@/lib/backup/backupCrypto';
import { validateBackupDataV1 } from '@/lib/backup/import';

export type MigrationAction = 'create' | 'skip_duplicate' | 'conflict';

export interface MigrationPlanItem {
  collection: BackupDataKey;
  sourceId: string;
  targetId: string;
  operationId: string;
  action: MigrationAction;
  reason?: 'same_id_different_content' | 'semantic_duplicate' | 'already_identical';
  payload: unknown;
}

export interface LocalToCloudMigrationPlan {
  version: 1;
  planId: string;
  sourceBoutiqueId: string;
  targetBoutiqueId: string;
  sourceChecksum: string;
  targetChecksum: string | null;
  createdAt: string;
  items: MigrationPlanItem[];
  summary: Record<MigrationAction, number>;
  executable: boolean;
}

export interface MigrationConfirmation {
  approved: true;
  planId: string;
  sourceChecksum: string;
  targetBoutiqueId: string;
}

export interface MigrationWriteResult {
  status: 'created' | 'already_identical' | 'already_exists';
}

export interface MigrationWriter {
  createIfAbsent(item: MigrationPlanItem): Promise<MigrationWriteResult>;
}

export interface MigrationReport {
  planId: string;
  startedAt: string;
  completedAt: string;
  created: number;
  skippedDuplicates: number;
  conflicts: number;
  failures: Array<{ operationId: string; collection: BackupDataKey; targetId: string; reason: string }>;
  success: boolean;
}

function normalizeScalar(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeScalar);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, normalizeScalar(item)]));
  }
  return value;
}

function canonical(value: unknown): string {
  return JSON.stringify(normalizeScalar(value));
}

function sanitizeForFirestore(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, sanitizeForFirestore(item)]));
  }
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function recordsFor(data: BackupData, key: BackupDataKey): Array<Record<string, unknown>> {
  if (key === 'settings') return [{ ...(data.settings as unknown as Record<string, unknown>), id: 'main' }];
  if (key === 'saleCounter') {
    return typeof data.saleCounter === 'number' ? [{ id: 'saleCounter', value: data.saleCounter }] : [];
  }
  return (data[key] as unknown as Array<Record<string, unknown>> | undefined) ?? [];
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLocaleLowerCase('fr').replace(/\s+/g, ' ');
  return normalized || null;
}

/** Conservative functional keys: only fields already intended to be unique. */
function semanticKey(collection: BackupDataKey, record: Record<string, unknown>): string | null {
  if (collection === 'products') {
    const barcode = safeText(record.codeBarre);
    return barcode ? `barcode:${barcode}` : null;
  }
  if (collection === 'customers' || collection === 'suppliers') {
    const phone = safeText(record.telephone)?.replace(/[^+\d]/g, '');
    if (phone) return `phone:${phone}`;
    const email = safeText(record.email);
    return email ? `email:${email}` : null;
  }
  if (collection === 'sales') {
    const number = safeText(record.saleNumber);
    return number ? `sale:${number}` : null;
  }
  return null;
}

function migrationId(record: Record<string, unknown>, key: BackupDataKey): string {
  if (key === 'settings') return 'main';
  if (typeof record.id !== 'string' || !record.id.trim()) throw new Error(`invalid_migration_id:${key}`);
  return record.id;
}

export function detectLocalInstallation(boutiqueId: string, data: BackupData): {
  localNamespace: boolean;
  hasBusinessData: boolean;
  counts: ReturnType<typeof countBackupRecords>;
} {
  const counts = countBackupRecords(data);
  const hasBusinessData = Object.entries(counts).some(([key, count]) => key !== 'settings' && count > 0);
  return { localNamespace: boutiqueId.startsWith('local-'), hasBusinessData, counts };
}

/** Dry-run only: nothing is written while the plan and conflicts are computed. */
export async function createLocalToCloudMigrationPlan(
  sourceInput: BackupData,
  targetInput: BackupData | null,
  sourceBoutiqueId: string,
  targetBoutiqueId: string,
): Promise<LocalToCloudMigrationPlan> {
  if (!sourceBoutiqueId.startsWith('local-')) throw new Error('migration_source_is_not_local');
  if (!targetBoutiqueId || targetBoutiqueId.startsWith('local-')) throw new Error('migration_target_must_be_cloud');
  const source = validateBackupDataV1(sourceInput);
  const target = targetInput ? validateBackupDataV1(targetInput) : null;
  const [sourceChecksum, targetChecksum] = await Promise.all([
    computeChecksum(source),
    target ? computeChecksum(target) : Promise.resolve(null),
  ]);
  const items: MigrationPlanItem[] = [];

  for (const collection of BACKUP_DATA_KEYS) {
    const targetRecords = target ? recordsFor(target, collection) : [];
    const targetById = new Map(targetRecords.map(record => [migrationId(record, collection), record]));
    const targetBySemantic = new Map<string, Record<string, unknown>>();
    for (const record of targetRecords) {
      const key = semanticKey(collection, record);
      if (key) targetBySemantic.set(key, record);
    }

    for (const record of recordsFor(source, collection)) {
      const sourceId = migrationId(record, collection);
      const sameId = targetById.get(sourceId);
      const key = semanticKey(collection, record);
      const semanticMatch = key ? targetBySemantic.get(key) : undefined;
      let action: MigrationAction = 'create';
      let reason: MigrationPlanItem['reason'];
      let targetId = sourceId;

      if (sameId) {
        if (canonical(sameId) === canonical(record)) {
          action = 'skip_duplicate';
          reason = 'already_identical';
        } else {
          action = 'conflict';
          reason = 'same_id_different_content';
        }
      } else if (semanticMatch) {
        action = canonical(semanticMatch) === canonical(record) ? 'skip_duplicate' : 'conflict';
        reason = action === 'skip_duplicate' ? 'already_identical' : 'semantic_duplicate';
        targetId = migrationId(semanticMatch, collection);
      }

      const operationId = await sha256(`${sourceBoutiqueId}\u0000${targetBoutiqueId}\u0000${collection}\u0000${sourceId}`);
      items.push({ collection, sourceId, targetId, operationId, action, reason, payload: record });
    }
  }

  const summary = items.reduce<Record<MigrationAction, number>>((counts, item) => {
    counts[item.action] += 1;
    return counts;
  }, { create: 0, skip_duplicate: 0, conflict: 0 });
  const planId = await sha256(canonical({ sourceBoutiqueId, targetBoutiqueId, sourceChecksum, targetChecksum, items }));
  return {
    version: 1,
    planId,
    sourceBoutiqueId,
    targetBoutiqueId,
    sourceChecksum,
    targetChecksum,
    createdAt: new Date().toISOString(),
    items,
    summary,
    executable: summary.conflict === 0,
  };
}

/** Execute a previously reviewed plan; no overwrite is ever requested. */
export async function executeLocalToCloudMigration(
  plan: LocalToCloudMigrationPlan,
  confirmation: MigrationConfirmation,
  writer: MigrationWriter,
): Promise<MigrationReport> {
  if (!confirmation.approved || confirmation.planId !== plan.planId ||
      confirmation.sourceChecksum !== plan.sourceChecksum ||
      confirmation.targetBoutiqueId !== plan.targetBoutiqueId) {
    throw new Error('migration_confirmation_mismatch');
  }
  if (!plan.executable || plan.summary.conflict > 0) throw new Error('migration_has_unresolved_conflicts');

  const startedAt = new Date().toISOString();
  let created = 0;
  let conflicts = 0;
  let skippedDuplicates = plan.summary.skip_duplicate;
  const failures: MigrationReport['failures'] = [];
  for (const item of plan.items) {
    if (item.action !== 'create') continue;
    try {
      const result = await writer.createIfAbsent(item);
      if (result.status === 'created') created += 1;
      else if (result.status === 'already_identical') skippedDuplicates += 1;
      else conflicts += 1; // target changed between dry-run and execution
    } catch (error) {
      failures.push({
        operationId: item.operationId,
        collection: item.collection,
        targetId: item.targetId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    planId: plan.planId,
    startedAt,
    completedAt: new Date().toISOString(),
    created,
    skippedDuplicates,
    conflicts,
    failures,
    success: failures.length === 0 && conflicts === 0,
  };
}

const COLLECTION_PATHS: Record<BackupDataKey, string> = {
  settings: 'settings',
  products: 'products',
  sales: 'sales',
  customers: 'customers',
  suppliers: 'suppliers',
  expenses: 'expenses',
  cashSessions: 'cash_sessions',
  cashOuts: 'cash_outs',
  stockMovements: 'stock_movements',
  inventorySessions: 'inventory_sessions',
  payments: 'payments',
  users: 'users',
  clotures: 'clotures',
  saleCounter: 'meta',
};

/** Firestore writer with transaction-backed create-if-absent semantics. */
export function createFirestoreMigrationWriter(targetBoutiqueId: string, database: Firestore = db): MigrationWriter {
  if (!database || (!isFirebaseConfigured && database === db)) throw new Error('firebase_not_configured');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('migration_requires_online');

  return {
    async createIfAbsent(item) {
      const reference = doc(database, `boutiques/${targetBoutiqueId}/${COLLECTION_PATHS[item.collection]}/${item.targetId}`);
      return runTransaction(database, async transaction => {
        const existing = await transaction.get(reference);
        const payload = { ...(item.payload as Record<string, unknown>) };
        delete payload.id;
        if (item.collection === 'payments') {
          payload.operationId ??= item.targetId;
          payload.kind ??= 'payment';
        }
        if (existing.exists()) {
          return canonical(existing.data()) === canonical(payload)
            ? { status: 'already_identical' as const }
            : { status: 'already_exists' as const };
        }
        transaction.set(reference, sanitizeForFirestore(payload) as Record<string, unknown>);
        return { status: 'created' as const };
      });
    },
  };
}
