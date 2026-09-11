/**
 * Proves a shopkeeper can activate a paid licence with no internet at all.
 *
 * This matters commercially: Legwan sells into places where connectivity is
 * intermittent, and a licence that needed a server call to activate would strand
 * a customer who has already paid. The design says it does not - verifyLicense
 * checks an Ed25519 signature against a public key embedded in the app, and the
 * network is used only to obtain a trustworthy clock, with a 2.5s timeout and an
 * offline fallback. This test is the execution proof of that claim.
 */
import { test, expect } from '@playwright/test';
import {
  resetEmulators,
  cutFirebaseNetwork,
  completeOnboarding,
  loginAs,
  firstBoutiqueId,
  requireEmulatorMode,
} from './flows-harness';
import { mintLicense } from './test-license';

const GERANT = { prenom: 'Amina', nom: 'Fotso', pin: '1234' };
const FULL_NAME = `${GERANT.prenom} ${GERANT.nom}`;

test.beforeEach(async () => {
  await resetEmulators();
});

test('a paid licence activates with the network cut', async ({ page }) => {
  const assertEmulatorMode = requireEmulatorMode(page);
  await completeOnboarding(page, GERANT);
  await loginAs(page, FULL_NAME, GERANT.pin);
  assertEmulatorMode();

  // The key is bound to this shop, exactly as the real generator binds it.
  const boutiqueId = await firstBoutiqueId();
  expect(boutiqueId, 'onboarding created no boutique').not.toBeNull();
  const licenseKey = mintLicense({ boutiqueId: boutiqueId!, plan: 'standard', days: 365 });

  // ── Cut the network ────────────────────────────────────────────────────────
  await cutFirebaseNetwork(page);

  // Do not take "offline" on trust: confirm from inside the page that Firebase
  // really is unreachable, otherwise this run would quietly prove nothing.
  const reachable = await page.evaluate(async () => {
    try {
      await fetch('http://127.0.0.1:8181/', { cache: 'no-store' });
      return true;
    } catch {
      return false;
    }
  });
  expect(reachable, 'Firebase was still reachable - this run proves nothing').toBe(false);

  // ── Activate ───────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /Activer une licence/i }).first().click();

  const keyInput = page.getByPlaceholder(/Collez votre clé/i);
  await expect(keyInput).toBeVisible({ timeout: 15_000 });
  await keyInput.fill(licenseKey);
  await page.getByRole('button', { name: /^Activer$/ }).first().click();

  // The confirmation a shopkeeper actually sees. It is short-lived - the panel
  // closes ~900ms later - so assert it right after the click. The wait allows
  // for the clock probe, which must time out (2.5s) before the offline fallback
  // takes over.
  await expect(page.getByText(/Licence activée/i).first()).toBeVisible({ timeout: 30_000 });

  // Then the durable outcome: the trial is over, this is a paid licence, and the
  // key is on the machine. This is what must survive a restart.
  await expect(page.getByText(/Essai gratuit/i)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Activer une licence/i })).toHaveCount(0);

  const storedLicence = await page.evaluate(() => localStorage.getItem('legwan-license'));
  expect(storedLicence, 'the licence was not persisted locally').toBe(licenseKey);

});

test('an expired licence is refused, offline too', async ({ page }) => {
  await completeOnboarding(page, GERANT);
  await loginAs(page, FULL_NAME, GERANT.pin);

  const boutiqueId = await firstBoutiqueId();
  // Offline must not become a way to slip an expired key past the check by
  // running the PC clock forward; the key itself carries its expiry.
  const expiredKey = mintLicense({ boutiqueId: boutiqueId!, days: -1 });

  await cutFirebaseNetwork(page);
  await page.getByRole('button', { name: /Activer une licence/i }).first().click();
  const keyInput = page.getByPlaceholder(/Collez votre clé/i);
  await expect(keyInput).toBeVisible({ timeout: 15_000 });
  await keyInput.fill(expiredKey);
  await page.getByRole('button', { name: /^Activer$/ }).first().click();

  await expect(page.getByText(/Licence activée/i)).toHaveCount(0);
});

test('a licence minted for another shop is refused', async ({ page }) => {
  await completeOnboarding(page, GERANT);
  await loginAs(page, FULL_NAME, GERANT.pin);

  // Binding to boutiqueId is what stops one paid key unlocking every install.
  const foreignKey = mintLicense({ boutiqueId: 'some-other-boutique-id', days: 365 });

  await cutFirebaseNetwork(page);
  await page.getByRole('button', { name: /Activer une licence/i }).first().click();
  const keyInput = page.getByPlaceholder(/Collez votre clé/i);
  await expect(keyInput).toBeVisible({ timeout: 15_000 });
  await keyInput.fill(foreignKey);
  await page.getByRole('button', { name: /^Activer$/ }).first().click();

  await expect(page.getByText(/Licence activée/i)).toHaveCount(0);
});
