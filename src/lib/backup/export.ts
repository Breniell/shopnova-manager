import { useProductStore } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { useSupplierStore } from '@/stores/useSupplierStore';
import { useExpenseStore } from '@/stores/useExpenseStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { useStockStore } from '@/stores/useStockStore';
import { useInventoryStore } from '@/stores/useInventoryStore';
import { usePaymentStore } from '@/stores/usePaymentStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useCaisseStore } from '@/stores/useCaisseStore';
import { getBoutiqueId } from '@/services/boutiqueService';
import { isFirebaseConfigured } from '@/lib/firebase';

import {
  type BackupData,
  type BackupFile,
  type BackupManifest,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_REMINDER_KEY,
} from './types';
import { computeChecksum, encryptBackupData } from './backupCrypto';
import { buildBackupManifest } from './manifest';
import { loadAuthoritativeCloudBackupData } from './firestoreSource';

const APP_VERSION = __APP_VERSION__;

/** Collect the current state of all stores into a BackupData snapshot. */
export function collectBackupData(): BackupData {
  return {
    settings:           useSettingsStore.getState().shop,
    products:           useProductStore.getState().products,
    sales:              useSaleStore.getState().sales,
    customers:          useCustomerStore.getState().customers,
    suppliers:          useSupplierStore.getState().suppliers,
    expenses:           useExpenseStore.getState().expenses,
    cashSessions:       useCashSessionStore.getState().sessions,
    cashOuts:           useCashSessionStore.getState().cashOuts,
    stockMovements:     useStockStore.getState().movements,
    inventorySessions:  useInventoryStore.getState().sessions,
    payments:           usePaymentStore.getState().payments,
    users:              useAuthStore.getState().users,
    clotures:           useCaisseStore.getState().clotures,
    saleCounter:        useSaleStore.getState().saleCounter,
  };
}

function mergeById<T extends { id: string }>(cloud: T[] = [], local: T[] = []): T[] {
  const merged = new Map(cloud.map(item => [item.id, item]));
  local.forEach(item => merged.set(item.id, item));
  return [...merged.values()];
}

/** Merge unsynchronised device state over the complete cloud history. */
export function mergeCloudAndLocalBackupData(cloud: BackupData, local: BackupData): BackupData {
  return {
    settings: local.settings,
    products: mergeById(cloud.products, local.products),
    sales: mergeById(cloud.sales, local.sales),
    customers: mergeById(cloud.customers, local.customers),
    suppliers: mergeById(cloud.suppliers, local.suppliers),
    expenses: mergeById(cloud.expenses, local.expenses),
    cashSessions: mergeById(cloud.cashSessions, local.cashSessions),
    cashOuts: mergeById(cloud.cashOuts, local.cashOuts),
    stockMovements: mergeById(cloud.stockMovements, local.stockMovements),
    inventorySessions: mergeById(cloud.inventorySessions, local.inventorySessions),
    payments: mergeById(cloud.payments, local.payments),
    users: mergeById(cloud.users, local.users),
    clotures: mergeById(cloud.clotures, local.clotures),
    saleCounter: Math.max(cloud.saleCounter ?? 0, local.saleCounter ?? 0),
  };
}

export interface CompleteBackupSnapshot {
  data: BackupData;
  source: BackupManifest['source'];
  complete: boolean;
  warnings: string[];
}

/** Integrity failures must never be hidden behind a less complete fallback. */
export class CompleteBackupIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompleteBackupIntegrityError';
  }
}

export interface CompleteBackupResolutionInput {
  local: BackupData;
  boutiqueId: string;
  firebaseConfigured: boolean;
  online: boolean;
  loadCloud: (boutiqueId: string) => Promise<BackupData>;
}

export async function resolveCompleteBackupSnapshot({
  local,
  boutiqueId,
  firebaseConfigured,
  online,
  loadCloud,
}: CompleteBackupResolutionInput): Promise<CompleteBackupSnapshot> {
  if (firebaseConfigured && online && !boutiqueId.startsWith('local-')) {
    try {
      const cloud = await loadCloud(boutiqueId);
      return {
        data: mergeCloudAndLocalBackupData(cloud, local),
        source: 'cloud-full',
        complete: true,
        warnings: [],
      };
    } catch (error) {
      if (error instanceof CompleteBackupIntegrityError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      return {
        data: local,
        source: 'local-device',
        complete: false,
        warnings: [`Lecture cloud indisponible (${reason}) : sauvegarde locale de secours.`],
      };
    }
  }

  const isAuthoritativeLocal = !firebaseConfigured || boutiqueId.startsWith('local-');
  return {
    data: local,
    source: 'local-device',
    complete: isAuthoritativeLocal,
    warnings: isAuthoritativeLocal
      ? []
      : ['Export hors connexion : l\u2019historique cloud non present sur cet appareil peut etre absent.'],
  };
}

/**
 * Use Firestore as the authority when it is reachable. In pure-local mode the
 * local stores are authoritative. A disconnected cloud installation can still
 * export its durable device copy, but the manifest states that cloud history
 * completeness could not be proven.
 */
export async function collectCompleteBackupData(): Promise<CompleteBackupSnapshot> {
  const boutiqueId = getBoutiqueId();
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  return resolveCompleteBackupSnapshot({
    local: collectBackupData(),
    boutiqueId,
    firebaseConfigured: isFirebaseConfigured,
    online,
    loadCloud: loadAuthoritativeCloudBackupData,
  });
}

export async function buildBackupFile(
  snapshot: CompleteBackupSnapshot,
  password: string | null,
  boutiqueId: string,
  exportedAt = new Date(),
): Promise<BackupFile> {
  const checksum = await computeChecksum(snapshot.data);
  const manifest = buildBackupManifest(
    snapshot.data,
    checksum,
    snapshot.source,
    snapshot.complete,
    snapshot.warnings,
  );

  if (password) {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: exportedAt.toISOString(),
      boutiqueId,
      appVersion: APP_VERSION,
      checksum,
      encrypted: true,
      manifest,
      data: await encryptBackupData(snapshot.data, password),
    };
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    boutiqueId,
    appVersion: APP_VERSION,
    checksum,
    encrypted: false,
    manifest,
    data: snapshot.data,
  };
}

/**
 * Build and download a complete backup file.
 * @param password - If provided, the data block is AES-GCM encrypted.
 *                   Pass null to export unencrypted.
 */
export async function exportBackup(password: string | null): Promise<void> {
  const snapshot = await collectCompleteBackupData();
  const data = snapshot.data;
  const boutiqueId = getBoutiqueId();
  const now        = new Date();
  const file = await buildBackupFile(snapshot, password, boutiqueId, now);

  const shopName  = data.settings.nom.replace(/[^a-zA-Z0-9À-ɏ]/g, '-').slice(0, 30);
  const dateStr   = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename  = `legwan-sauvegarde-${shopName}-${dateStr}.json`;

  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  // Record timestamp for the backup-reminder feature
  try { localStorage.setItem(BACKUP_REMINDER_KEY, now.toISOString()); } catch { /* ignore */ }
}

/** Returns the number of days since the last backup, or null if never backed up. */
export function daysSinceLastBackup(): number | null {
  try {
    const raw = localStorage.getItem(BACKUP_REMINDER_KEY);
    if (!raw) return null;
    const ms = Date.now() - new Date(raw).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}
