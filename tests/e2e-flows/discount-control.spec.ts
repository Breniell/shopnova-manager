/**
 * A cashier cannot discount past the limits the gérant set.
 *
 * The cart's "Remise (%)" accepted 0 to 100 with no role check and no comparison
 * against floor prices, while lowering a single line below its floor required a
 * gérant's PIN. So the protection could be bypassed entirely: a cashier could
 * hand a full cart over for free and the sale would record normally. For a shop
 * owner that is a till-theft hole, not a UX detail.
 *
 * A percentage discount is negotiating every line at once, so it now answers to
 * the same rule.
 */
import { test, expect } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  logout,
  createProduct,
  createUser,
  openCashSession,
  firstBoutiqueId,
  readCollection,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Amina', nom: 'Fotso', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;
const CAISSIER = { prenom: 'Paul', nom: 'Ndi', role: 'caissier' as const, pin: '5678' };
const CAISSIER_NAME = `${CAISSIER.prenom} ${CAISSIER.nom}`;
// Fixed price: the gérant has said this one is not open to discussion.
const PRODUCT = { nom: 'Savon de Marseille', achat: '800', vente: '1200', stock: '20' };

/** The cart's discount box, told apart from the cash "Montant reçu" field. */
function discountBox(page: import('@playwright/test').Page) {
  return page.locator('input[type="number"][max="100"]').first();
}

test.beforeEach(async () => {
  await resetEmulators();
});

test('a cashier needs a gérant to discount below the price limits', async ({ page }) => {
  test.setTimeout(240_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  // ── The gérant sets the shop up ────────────────────────────────────────────
  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  await createProduct(page, PRODUCT);
  await createUser(page, CAISSIER);

  // ── The cashier takes the till ─────────────────────────────────────────────
  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, '5000');

  await page.getByText(PRODUCT.nom).first().click();
  const validate = page.locator('button').filter({ hasText: /Valider la vente/i }).first();
  await page.getByPlaceholder(/Montant reçu/i).fill('100000');
  await expect(validate, 'the sale should be ready before any discount').toBeEnabled();

  // ── Half price, without asking anyone ──────────────────────────────────────
  await discountBox(page).fill('50');

  await expect(
    validate,
    'a cashier could still validate a 50% discount on a fixed-price product',
  ).toBeDisabled();
  const authoriseButton = page.locator('button').filter({ hasText: /Demander autorisation/i }).first();
  await expect(authoriseButton, 'no way offered to ask a gérant').toBeVisible();

  // ── The gérant authorises it, in person, with their PIN ────────────────────
  await authoriseButton.click();
  const modal = page.locator('[class*="nova-card"]').filter({ hasText: /Autorisation gérant/i }).last();
  // The gérant picker only appears when the shop has more than one gérant; with
  // a single one it is implicit and only the PIN is asked.
  const managerPicker = modal.locator('select');
  if (await managerPicker.count() > 0) {
    await managerPicker.first().selectOption({ label: GERANT_NAME });
  }
  const pinInput = modal.locator('input[type="password"]').first();
  await pinInput.fill(GERANT.pin);
  await expect(pinInput, 'the PIN field did not keep what was typed').toHaveValue(GERANT.pin);
  await modal.getByRole('button', { name: /^Autoriser$/ }).first().click();

  // What the cashier can read on that modal must not give the shop's cost away:
  // an unset floor IS the purchase price.
  await expect(modal.getByText(/Plancher/i), 'the floor price is shown to the cashier').toHaveCount(0);

  await expect(validate, 'still blocked after a gérant authorised it').toBeEnabled({ timeout: 30_000 });
  await validate.click();
  await expect(page.getByText(/Reçu\s*:|Reçu n/i).first()).toBeVisible({ timeout: 30_000 });

  // ── The authorisation is on the sale, for the gérant to audit later ────────
  await expect.poll(async () => {
    const sales = await readCollection(`boutiques/${boutiqueId}/sales`);
    return sales[0]?.fields?.discountAuthorizedByName?.stringValue ?? null;
  }, { timeout: 30_000, message: 'the sale does not record who authorised the discount' })
    .toBe(GERANT_NAME);
});

test('a discount within the limits still needs nobody', async ({ page }) => {
  test.setTimeout(240_000);
  // The control must not turn every small gesture into a manager summons.
  const negotiable = { nom: 'Riz parfume 5kg', achat: '3000', vente: '5000', stock: '20' };

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);

  // Negotiable with a 3500 floor, so 10% off 5000 lands at 4500, well above it.
  await createProduct(page, { ...negotiable, negociable: true, plancher: '3500' });

  await createUser(page, CAISSIER);
  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, '5000');

  await page.getByText(negotiable.nom).first().click();
  await page.getByPlaceholder(/Montant reçu/i).fill('100000');
  await discountBox(page).fill('10');

  const validate = page.locator('button').filter({ hasText: /Valider la vente/i }).first();
  await expect(validate, '10% off a product with room to spare should not need a gérant').toBeEnabled();
  await expect(page.locator('button').filter({ hasText: /Demander autorisation/i })).toHaveCount(0);
});
