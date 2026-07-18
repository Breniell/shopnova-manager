import type { ShopSettings } from '@/stores/useSettingsStore';
import type { Product } from '@/stores/useProductStore';
import type { Sale } from '@/stores/useSaleStore';
import type { Customer } from '@/stores/useCustomerStore';
import type { Supplier } from '@/stores/useSupplierStore';
import type { Expense } from '@/stores/useExpenseStore';
import type { CashSession, CashOut } from '@/stores/useCashSessionStore';
import type { StockMovement } from '@/stores/useStockStore';
import type { InventorySession } from '@/stores/useInventoryStore';
import type { Payment } from '@/stores/usePaymentStore';
import type { User } from '@/stores/useAuthStore';
import type { ClotureCaisse } from '@/stores/useCaisseStore';

export interface BackupData {
  settings: ShopSettings;
  products: Product[];
  sales: Sale[];
  customers: Customer[];
  suppliers: Supplier[];
  expenses: Expense[];
  cashSessions: CashSession[];
  cashOuts: CashOut[];
  stockMovements: StockMovement[];
  inventorySessions: InventorySession[];
  payments: Payment[];
  users: User[];
  /** Added in v2; optional only when reading historical v1 files. */
  clotures?: ClotureCaisse[];
  /** Added in v2 so restored receipt numbers never move backwards. */
  saleCounter?: number;
}

export type BackupDataKey = keyof BackupData;

export interface BackupManifest {
  /** Cloud exports are paginated until every document has been read. */
  source: 'cloud-full' | 'local-device';
  /** False when the device cannot prove that it holds all cloud history. */
  complete: boolean;
  counts: Record<BackupDataKey, number>;
  totalRecords: number;
  checksumAlgorithm: 'SHA-256';
  contentSha256: string;
  warnings: string[];
}

export interface BackupMeta {
  format: 'legwan-backup';
  version: 1 | 2;
  exportedAt: string;        // ISO date
  boutiqueId: string;
  appVersion: string;
  checksum: string;          // SHA-256 hex of JSON.stringify(data) — verified after decryption
  encrypted: boolean;
  /** Required for v2; absent only on historical v1 files. */
  manifest?: BackupManifest;
}

export interface BackupFilePlain extends BackupMeta {
  encrypted: false;
  data: BackupData;
}

export interface BackupFileEncrypted extends BackupMeta {
  encrypted: true;
  data: string;              // base64(salt16 + iv12 + AES-GCM ciphertext)
}

export type BackupFile = BackupFilePlain | BackupFileEncrypted;

export const BACKUP_FORMAT = 'legwan-backup' as const;
export const BACKUP_VERSION = 2;
export const SUPPORTED_BACKUP_VERSIONS = [1, 2] as const;
export const BACKUP_REMINDER_KEY = 'legwan-backup-last';
export const BACKUP_REMINDER_DAYS = 30;
