import { describe, expect, it, vi } from 'vitest';
import type { BackupData } from '@/lib/backup/types';
import {
  createLocalToCloudMigrationPlan,
  detectLocalInstallation,
  executeLocalToCloudMigration,
} from '@/lib/migration/localToCloud';

function fixture(productId = 'p1', barcode = '123456'): BackupData {
  return {
    settings: {
      nom: 'Boutique locale', adresse: '', telephone: '', email: '', nui: '',
      enteteRecu: '', piedPageRecu: '', devise: 'XAF', langue: 'fr',
      paperWidth: '80', openDrawerOnSale: false, autoPrintOnSale: false,
    },
    products: [{
      id: productId, nom: 'Produit', stock: 2, prixAchat: 100, prixVente: 150,
      categorie: 'Autre', codeBarre: barcode, seuilAlerte: 0,
    }],
    sales: [], customers: [], suppliers: [], expenses: [], cashSessions: [], cashOuts: [],
    stockMovements: [], inventorySessions: [], payments: [], users: [],
  };
}

describe('local to cloud migration planning', () => {
  it('detects a populated local installation', () => {
    expect(detectLocalInstallation('local-device-a', fixture())).toMatchObject({
      localNamespace: true,
      hasBusinessData: true,
      counts: { settings: 1, products: 1 },
    });
  });

  it('builds a deterministic dry-run with stable operation and plan identifiers', async () => {
    const first = await createLocalToCloudMigrationPlan(fixture(), null, 'local-device-a', 'cloud-a');
    const second = await createLocalToCloudMigrationPlan(fixture(), null, 'local-device-a', 'cloud-a');

    expect(first.planId).toBe(second.planId);
    expect(first.items.map(item => item.operationId)).toEqual(second.items.map(item => item.operationId));
    expect(first.summary).toEqual({ create: 2, skip_duplicate: 0, conflict: 0 });
    expect(first.executable).toBe(true);
  });

  it('skips identical IDs and flags a semantic duplicate instead of overwriting it', async () => {
    const source = fixture('source-product', 'ABC-1');
    const target = fixture('cloud-product', 'ABC-1');
    target.products[0].prixVente = 999;

    const plan = await createLocalToCloudMigrationPlan(source, target, 'local-device-a', 'cloud-a');

    expect(plan.summary.skip_duplicate).toBe(1); // identical settings
    expect(plan.summary.conflict).toBe(1);
    expect(plan.items.find(item => item.collection === 'products')).toMatchObject({
      action: 'conflict', reason: 'semantic_duplicate', targetId: 'cloud-product',
    });
    expect(plan.executable).toBe(false);
  });
});

describe('local to cloud migration execution', () => {
  it('requires exact explicit confirmation, then reports every create', async () => {
    const plan = await createLocalToCloudMigrationPlan(fixture(), null, 'local-device-a', 'cloud-a');
    const createIfAbsent = vi.fn().mockResolvedValue({ status: 'created' });

    await expect(executeLocalToCloudMigration(plan, {
      approved: true,
      planId: 'wrong-plan',
      sourceChecksum: plan.sourceChecksum,
      targetBoutiqueId: plan.targetBoutiqueId,
    }, { createIfAbsent })).rejects.toThrow('migration_confirmation_mismatch');
    expect(createIfAbsent).not.toHaveBeenCalled();

    const report = await executeLocalToCloudMigration(plan, {
      approved: true,
      planId: plan.planId,
      sourceChecksum: plan.sourceChecksum,
      targetBoutiqueId: plan.targetBoutiqueId,
    }, { createIfAbsent });

    expect(report).toMatchObject({ created: 2, conflicts: 0, failures: [], success: true });
    expect(createIfAbsent).toHaveBeenCalledTimes(2);
  });

  it('treats a race-created target document as a conflict and never retries an overwrite', async () => {
    const plan = await createLocalToCloudMigrationPlan(fixture(), null, 'local-device-a', 'cloud-a');
    const report = await executeLocalToCloudMigration(plan, {
      approved: true,
      planId: plan.planId,
      sourceChecksum: plan.sourceChecksum,
      targetBoutiqueId: plan.targetBoutiqueId,
    }, { createIfAbsent: vi.fn().mockResolvedValue({ status: 'already_exists' }) });

    expect(report).toMatchObject({ created: 0, conflicts: 2, success: false });
  });
});
