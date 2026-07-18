/**
 * Regression tests — registry heartbeat scheduling in bootstrapFirebase().
 *
 * ROOT CAUSE (fixed in this commit):
 *   bootstrapFirebase() had an early `return` in the first-launch path (after
 *   fsInitializeBoutique) that bypassed sendRegistryHeartbeat entirely.
 *   Result: a newly created boutique never appeared in the super-admin registry
 *   until its SECOND startup.
 *
 * FIX:
 *   scheduleHeartbeat() is now a shared helper called from BOTH bootstrap paths
 *   (first launch and subsequent launches), with exactly one call per startup.
 *
 * HOW TO CONFIRM THE REGRESSION TEST CATCHES THE BUG:
 *   Remove `scheduleHeartbeat()` from the first-launch path of bootstrapFirebase()
 *   and run:  npx vitest run src/test/lib/registryHeartbeat.test.ts
 *   The "FIRST launch" test will fail.  Re-add the call → it passes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── All mocks must be declared BEFORE the imports that use them ───────────────

vi.mock('@/lib/firebase', () => ({
  isFirebaseConfigured: true,
  db:  {},
  auth: null,
  getSuperAdminFirebase: vi.fn().mockReturnValue(null),
}));

vi.mock('@/services/boutiqueService', () => ({
  initBoutique:               vi.fn().mockResolvedValue('boutique-test-id'),
  getBoutiqueId:              vi.fn().mockReturnValue('boutique-test-id'),
  getLocalSnapshotTenantId:   vi.fn().mockReturnValue('boutique-test-id'),
  getBoutiqueRecoveryStatus:  vi.fn().mockResolvedValue({ isRecoveryEnabled: false }),
  getBoutiqueRecoveryErrorMessage: vi.fn().mockReturnValue(''),
  getSavedRecoveryEmail:      vi.fn().mockReturnValue(''),
  signInBoutiqueRecoveryAccount:       vi.fn().mockResolvedValue(undefined),
  sendBoutiqueRecoveryPasswordReset:   vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/firestoreService', () => ({
  fsIsBoutiqueInitialized:    vi.fn(),                               // configured per test
  fsInitializeBoutique:       vi.fn().mockResolvedValue(undefined),
  fsLoadSettings:             vi.fn().mockResolvedValue(null),
  fsLoadUsers:                vi.fn().mockResolvedValue([]),
  fsLoadProducts:             vi.fn().mockResolvedValue([]),
  fsLoadSales:                vi.fn().mockResolvedValue([]),
  fsLoadMovements:            vi.fn().mockResolvedValue([]),
  fsLoadSuppliers:            vi.fn().mockResolvedValue([]),
  fsLoadCustomers:            vi.fn().mockResolvedValue([]),
  fsLoadPayments:             vi.fn().mockResolvedValue([]),
  fsLoadExpenses:             vi.fn().mockResolvedValue([]),
  fsLoadCashSessions:         vi.fn().mockResolvedValue([]),
  fsLoadCashOuts:             vi.fn().mockResolvedValue([]),
  fsLoadInventorySessions:    vi.fn().mockResolvedValue([]),
  fsLoadClotures:             vi.fn().mockResolvedValue([]),
  fsLoadSaleCounter:          vi.fn().mockResolvedValue(0),
  // used by stores that are imported transitively
  fsSaveUser:                 vi.fn().mockResolvedValue(undefined),
  fsDeleteUser:               vi.fn().mockResolvedValue(undefined),
  fsGetLoginAttempts:         vi.fn().mockResolvedValue(null),
  fsSetLoginAttempts:         vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/registryService', () => ({
  sendRegistryHeartbeat: vi.fn().mockResolvedValue(undefined),
}));

// Geo service is never called in the bootstrap path (only inside sendRegistryHeartbeat)
vi.mock('@/services/geoService', () => ({
  getGPSLocationRobust: vi.fn().mockResolvedValue(null),
  getIPLocation:        vi.fn().mockResolvedValue(null),
  getAddressFromCoords: vi.fn().mockResolvedValue(null),
  reverseGeocode:       vi.fn().mockResolvedValue(null),
}));

// ── Imports (after vi.mock hoisting) ─────────────────────────────────────────
import { fsIsBoutiqueInitialized } from '@/services/firestoreService';
import { sendRegistryHeartbeat }   from '@/services/registryService';
import { bootstrapFirebase }        from '@/components/FirebaseProvider';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flushes all pending microtasks and one macro-tick so fire-and-forget chains settle. */
async function flushAsync(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bootstrapFirebase — registry heartbeat scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  /**
   * REGRESSION TEST — fails before the fix, passes after.
   *
   * Before fix: early `return` after _setUsers/_setSettings skipped scheduleHeartbeat.
   * After fix:  scheduleHeartbeat() is called before the return.
   */
  it('REGRESSION: sends heartbeat on FIRST launch (boutique not yet initialised)', async () => {
    vi.mocked(fsIsBoutiqueInitialized).mockResolvedValue(false);

    await bootstrapFirebase();
    await flushAsync(); // let the fire-and-forget promise chain settle

    expect(sendRegistryHeartbeat).toHaveBeenCalledTimes(1);
    expect(sendRegistryHeartbeat).toHaveBeenCalledWith(false); // isRecoveryEnabled = false
  });

  it('sends heartbeat on subsequent launches (boutique already initialised)', async () => {
    vi.mocked(fsIsBoutiqueInitialized).mockResolvedValue(true);

    await bootstrapFirebase();
    await flushAsync();

    expect(sendRegistryHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('never sends the heartbeat twice in a single bootstrap (no double-send)', async () => {
    // Both paths are mutually exclusive — first launch should call heartbeat exactly once.
    vi.mocked(fsIsBoutiqueInitialized).mockResolvedValue(false);

    await bootstrapFirebase();
    await flushAsync();

    expect(sendRegistryHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('first-launch heartbeat carries isRecoveryEnabled=false when no recovery account', async () => {
    // getBoutiqueRecoveryStatus is already mocked at module level with isRecoveryEnabled:false
    vi.mocked(fsIsBoutiqueInitialized).mockResolvedValue(false);

    await bootstrapFirebase();
    await flushAsync();

    expect(sendRegistryHeartbeat).toHaveBeenCalledWith(false);
  });
});
