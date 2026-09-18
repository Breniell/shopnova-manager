/**
 * The super-admin console, and the two gates that guard it.
 *
 * Reaching it takes two unrelated things, and having one without the other is
 * exactly what made the console look broken for weeks:
 *
 *   • the signed-in email must equal VITE_SUPERADMIN_EMAIL - that opens the
 *     screens, and it is a build-time constant;
 *   • the Firebase account must carry the custom claim `superadmin: true`,
 *     which is what firestore.rules checks before letting anyone read the
 *     platform registry. Deploying rules does not grant it; only the Admin SDK
 *     does (`npm run staff:claims`).
 *
 * With the email but no claim, the console signs you in and then refuses every
 * piece of data - which reads like a broken console rather than a missing
 * right. This test pins that difference down, along with the message shown.
 *
 * The console is bundled here because `.env.emulator` sets
 * VITE_ENABLE_SUPERADMIN=true; the client build passes false and drops it.
 */
import { test, expect } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  renameShop,
  createSuperAdminAccount,
  createEmulatorAccount,
  grantSuperAdminClaim,
  openSuperAdminConsole,
  superAdminLogin,
  readCollection,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Aïcha', nom: 'Bello', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;
const SHOP_NAME = 'Alimentation du Carrefour';

test.beforeEach(async () => {
  await resetEmulators();
});

test('the console needs the claim, not just the right email', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  // The account exists and carries the right address, but no rights yet.
  const superAdminUid = await createSuperAdminAccount({ withClaim: false });

  // ── A real shop puts itself on the platform registry ──────────────────────
  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  await renameShop(page, SHOP_NAME);

  await expect.poll(async () => {
    const registry = await readCollection('registry');
    return registry[0]?.fields?.nom?.stringValue ?? null;
  }, { timeout: 30_000, message: 'the shop never registered itself on the platform' })
    .toBe(SHOP_NAME);

  // ── Signed in, and refused everything ─────────────────────────────────────
  await openSuperAdminConsole(page);
  await superAdminLogin(page);

  await expect(
    page.getByText(/Accès refusé/),
    'an account without the claim was allowed to read the platform registry',
  ).toBeVisible({ timeout: 30_000 });
  // And the message must name the right culprit: the claim, not the rules.
  await expect(page.getByText(/staff:claims/)).toBeVisible();
  await expect(page.getByText(SHOP_NAME)).toHaveCount(0);

  // ── The right is granted, the way staff:claims does it ────────────────────
  await grantSuperAdminClaim(superAdminUid);

  // A claim only reaches the client on a fresh token, so signing in again is
  // what makes it take effect - not the rules, and not a reload.
  await page.getByRole('button', { name: /Déconnexion/i }).click();
  await expect(page.getByText(/Console Super-Admin/)).toBeVisible({ timeout: 30_000 });
  await superAdminLogin(page);

  await expect(
    page.getByText(SHOP_NAME),
    'the shop is still not listed once the claim is in place',
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Accès refusé/)).toHaveCount(0);
  await expect(page.getByText(/1 installations enregistrées/)).toBeVisible();

  // ── Every tab of the console opens without falling over ───────────────────
  // The QA audit of 2026-08-19 found the Carte tab crashing to the error
  // screen on a CJS/ESM interop problem that only appeared at runtime.
  for (const tab of ['Boutiques', 'Carte', 'Analyses', 'Licences']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(
      page.getByText(/Oups ! Une erreur est survenue|Une erreur est survenue/),
      `the ${tab} tab crashed the console`,
    ).toHaveCount(0);
  }

  // The licences page is the one the missing claim used to break outright.
  await expect(page.getByText(/Accès refusé|permission-denied/)).toHaveCount(0);
});

test('an address that is not the super-admin is turned away', async ({ page }) => {
  test.setTimeout(240_000);
  await createSuperAdminAccount({ withClaim: true });
  // A perfectly valid Firebase account that simply is not the super-admin.
  // This is the case the email gate exists for - not a typo, a real login.
  const INTRUDER = { email: 'employe@legwan.test', password: 'mot-de-passe-valide' };
  await createEmulatorAccount(INTRUDER.email, INTRUDER.password);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  await openSuperAdminConsole(page);

  await page.locator('input[type="email"]').fill(INTRUDER.email);
  await page.locator('input[type="password"]').fill(INTRUDER.password);
  await page.getByRole('button', { name: /Accéder à la console/i }).click();

  await expect(
    page.getByText(/Accès non autorisé/),
    'a valid account that is not the super-admin reached the console',
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Déconnexion/i })).toHaveCount(0);

  // An address nobody owns must not leak that it does not exist, nor show a
  // raw Firebase code to whoever is standing at the screen.
  await page.locator('input[type="email"]').fill('inconnu@legwan.test');
  await page.locator('input[type="password"]').fill('peu importe');
  await page.getByRole('button', { name: /Accéder à la console/i }).click();

  await expect(page.getByText(/Email ou mot de passe incorrect/)).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/Firebase: Error|auth\//),
    'a raw Firebase error code is shown on the login screen',
  ).toHaveCount(0);
});
