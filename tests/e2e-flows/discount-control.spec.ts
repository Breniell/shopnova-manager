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

test('un produit a prix fixe se negocie avec l\'accord du gerant', async ({ page }) => {
  test.setTimeout(240_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  // Signale par le proprietaire : en boutique, un gerant present accepte une
  // remise sur un article a prix fixe, et la caisse refusait malgre son accord.
  // Le prix n'etait meme pas cliquable, et checkPrice renvoyait
  // 'not_negotiable', une impasse sans recours.
  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  await createProduct(page, PRODUCT);   // prix fixe, non negociable
  await createUser(page, CAISSIER);

  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, '5000');

  await page.getByText(PRODUCT.nom).first().click();

  // Le prix de la ligne doit s'ouvrir, meme sur un produit a prix fixe.
  await page.getByRole('button', { name: /1\s*200\s*FCFA \/ u\./ }).click();
  const editor = page.locator('[class*="nova-card"]').filter({ hasText: 'Négocier le prix' }).last();
  await expect(editor, 'le prix d\'un produit a prix fixe reste inaccessible').toBeVisible();

  await editor.locator('input[type="number"]').first().fill('900');

  // Un caissier voit qu'une autorisation est requise, sans le montant du
  // plancher : PriceEditor lui affiche `authNote` et non `statusBelowFloor`,
  // pour ne pas laisser deviner la marge de la boutique.
  // .first() : pour un caissier, PriceEditor affiche cette phrase deux fois -
  // comme statut de la ligne, et comme note explicative sous le champ.
  await expect(
    editor.getByText(/demander le PIN d'un gérant/i).first(),
    'la caisse refuse la baisse au lieu de proposer une autorisation',
  ).toBeVisible();

  // Et le prix d'achat n'arrive jamais sur son ecran.
  await expect(
    editor.getByText(new RegExp(PRODUCT.achat)),
    'le prix d\'achat est visible par le caissier',
  ).toHaveCount(0);

  await editor.getByRole('button', { name: /Demander autorisation/i }).click();

  const override = page.locator('[class*="nova-card"]').filter({ hasText: /Autorisation gérant/i }).last();
  const picker = override.locator('select');
  if (await picker.count() > 0) await picker.first().selectOption({ label: GERANT_NAME });
  await override.locator('input[type="password"]').first().fill(GERANT.pin);
  await override.getByRole('button', { name: /^Autoriser$/ }).first().click();

  // ── La vente passe au prix negocie ────────────────────────────────────────
  await page.getByPlaceholder(/Montant reçu/i).fill('1000');
  const validate = page.locator('button').filter({ hasText: /Valider la vente/i }).first();
  await expect(validate, 'la vente reste bloquee apres l\'accord du gerant').toBeEnabled({ timeout: 30_000 });
  await validate.click();
  await expect(page.getByText(/Reçu\s*:|Reçu n/i).first()).toBeVisible({ timeout: 30_000 });

  // ── Et le prix negocie est bien celui enregistre ──────────────────────────
  await expect.poll(async () => {
    const sales = await readCollection(`boutiques/${boutiqueId}/sales`);
    return sales[0] ? Number(sales[0].fields?.total?.integerValue ?? sales[0].fields?.total?.doubleValue) : null;
  }, { timeout: 30_000, message: 'la vente au prix negocie n\'a pas ete enregistree' }).toBe(900);
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
