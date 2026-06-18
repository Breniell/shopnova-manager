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
import { getBoutiqueId } from '@/services/boutiqueService';

import {
  type BackupData,
  type BackupFile,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_REMINDER_KEY,
} from './types';
import { computeChecksum, encryptBackupData } from './backupCrypto';

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
  };
}

/**
 * Build and download a complete backup file.
 * @param password - If provided, the data block is AES-GCM encrypted.
 *                   Pass null to export unencrypted.
 */
export async function exportBackup(password: string | null): Promise<void> {
  const data      = collectBackupData();
  const checksum  = await computeChecksum(data);
  const boutiqueId = getBoutiqueId();
  const now        = new Date();

  let file: BackupFile;

  if (password) {
    const encryptedData = await encryptBackupData(data, password);
    file = {
      format:     BACKUP_FORMAT,
      version:    BACKUP_VERSION,
      exportedAt: now.toISOString(),
      boutiqueId,
      appVersion: APP_VERSION,
      checksum,
      encrypted:  true,
      data:       encryptedData,
    };
  } else {
    file = {
      format:     BACKUP_FORMAT,
      version:    BACKUP_VERSION,
      exportedAt: now.toISOString(),
      boutiqueId,
      appVersion: APP_VERSION,
      checksum,
      encrypted:  false,
      data,
    };
  }

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
