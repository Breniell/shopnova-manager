/**
 * The money path: stock a product, open the till, sell it, and see the sale
 * recorded. This is what a shopkeeper does all day, so it is the flow that must
 * never silently break.
 *
 * Runs against the Firebase emulator, so the Firestore writes and the rules in
 * firestore.rules are exercised for real without touching the live database.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  goTo,
  readCollection,
  firstBoutiqueId,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Amina', nom: 'Fotso', pin: '1234' };
const FULL_NAME = `${GERANT.prenom} ${GERANT.nom}`;
const PRODUCT = { nom: 'Coca-Cola 50cl', achat: '350', vente: '500', stock: '48' };

async function signIn(page: Page) {
  await completeOnboarding(page, GERANT);
  await loginAs(page, FULL_NAME, GERANT.pin);
}

test.beforeEach(async () => {
  await resetEmulators();
});

test('a product can be stocked and then sold through the till', async ({ page }) => {
  const assertEmulatorMode = requireEmulatorMode(page);
  await signIn(page);
  assertEmulatorMode();

  // ── Stock a product ────────────────────────────────────────────────────────
  await goTo(page, 'Produits');
  await page.locator('button').filter({ hasText: /Ajouter un produit/i }).first().click();

  const modal = page.locator('[class*="nova-card"]').filter({ has: page.locator('input') }).last();
  await modal.locator('input[type="text"]').first().fill(PRODUCT.nom);
  const numbers = modal.locator('input[type="number"]');
  await numbers.nth(0).fill(PRODUCT.achat);
  await numbers.nth(1).fill(PRODUCT.vente);
  await numbers.nth(2).fill(PRODUCT.stock);
  await modal.locator('button').filter({ hasText: /^(Ajouter|Enregistrer)/ }).last().click();

  await expect(page.getByText(PRODUCT.nom).first()).toBeVisible({ timeout: 30_000 });

  // Look at the database, not the screen: in an offline-first app with a retry
  // outbox, "it appeared in the list" and "it was saved" are different claims.
  const boutiqueId = await firstBoutiqueId();
  expect(boutiqueId, 'onboarding created no boutique document').not.toBeNull();
  await expect(async () => {
    const stored = await readCollection(`boutiques/${boutiqueId}/products`);
    const names = stored.map(document => document.fields?.nom?.stringValue);
    expect(names, 'the product never reached Firestore').toContain(PRODUCT.nom);
  }).toPass({ timeout: 30_000 });

  // Prove it was persisted rather than merely rendered optimistically. Reloading
  // returns to the login screen by design - the session is deliberately not kept
  // across reloads - so sign back in and look again.
  await page.reload();
  await loginAs(page, FULL_NAME, GERANT.pin);
  await goTo(page, 'Produits');
  await expect(page.getByText(PRODUCT.nom).first()).toBeVisible({ timeout: 30_000 });

  // ── Open the till ──────────────────────────────────────────────────────────
  await goTo(page, 'Point de vente');
  const openSession = page.locator('button').filter({ hasText: /Ouvrir une session/i }).first();
  if (await openSession.isVisible().catch(() => false)) {
    await openSession.click();
    // The opening screen asks for the cash float before it will start a session.
    const float = page.locator('input[type="number"]').first();
    await float.fill('10000');
    await page.locator('button').filter({ hasText: /Ouvrir|Confirmer|Démarrer/i }).last().click();
  }

  // ── Sell it ────────────────────────────────────────────────────────────────
  await expect(page.getByText(PRODUCT.nom).first()).toBeVisible({ timeout: 30_000 });
  await page.getByText(PRODUCT.nom).first().click();

  // A cash sale will not validate until the amount handed over is entered, so
  // the change owed can be worked out. That is the guard being exercised here.
  await expect(page.getByText('1 article')).toBeVisible();
  const validate = page.locator('button').filter({ hasText: /Valider la vente/i }).first();
  await expect(validate, 'cash sale should stay blocked until the tendered amount is filled').toBeDisabled();

  await page.getByPlaceholder(/Montant reçu/i).fill('1000');
  await expect(validate).toBeEnabled();
  await validate.click();

  // The receipt is the shopkeeper's confirmation that the sale went through.
  await expect(page.getByText(/Reçu\s*:|Reçu n/i).first()).toBeVisible({ timeout: 30_000 });

  // And the sale must be in the database, at the right amount. A receipt on
  // screen with nothing stored is the worst possible outcome for a shop.
  // The collection is `sales`, not `ventes`: the UI is French, the schema is not.
  await expect(async () => {
    const sales = await readCollection(`boutiques/${boutiqueId}/sales`);
    expect(sales, 'the sale never reached Firestore').not.toHaveLength(0);
    const totals = sales.map(sale => Number(
      sale.fields?.total?.integerValue ?? sale.fields?.total?.doubleValue ?? NaN,
    ));
    expect(totals, 'no stored sale matches the price sold').toContain(Number(PRODUCT.vente));
  }).toPass({ timeout: 30_000 });
});
