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
}

export interface BackupMeta {
  format: 'legwan-backup';
  version: 1;
  exportedAt: string;        // ISO date
  boutiqueId: string;
  appVersion: string;
  checksum: string;          // SHA-256 hex of JSON.stringify(data) — verified after decryption
  encrypted: boolean;
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
export const BACKUP_VERSION = 1;
export const BACKUP_REMINDER_KEY = 'legwan-backup-last';
export const BACKUP_REMINDER_DAYS = 30;
