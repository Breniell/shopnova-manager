/**
 * A customer who takes time to pay must not block the queue.
 *
 * The cashier sets the cart aside, serves the next customer, then resumes the
 * held sale and collects it normally. The money-path claims checked here:
 *
 *   • A held sale is not a sale: no stock leaves, nothing reaches Firestore.
 *   • Resuming while another cart is open sets that cart aside too, never
 *     overwrites it.
 *   • Held sales survive a reload, and the closing screen reminds the cashier
 *     that some are still uncollected.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  logout,
  createProduct,
  createUser,
  openCashSession,
  addToCart,
  payCash,
  goTo,
  firstBoutiqueId,
  readCollection,
  readStoredStock,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Claire', nom: 'Mbarga', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;
const CAISSIER = { prenom: 'Hervé', nom: 'Talla', role: 'caissier' as const, pin: '5678' };
const CAISSIER_NAME = `${CAISSIER.prenom} ${CAISSIER.nom}`;
const RIZ = { nom: 'Riz parfumé 5kg', achat: '3000', vente: '4500', stock: '20' };
const HUILE = { nom: 'Huile Diamaor 1L', achat: '1000', vente: '1500', stock: '30' };

async function holdCart(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Mettre en attente', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Étiquette/).fill(label);
  await dialog.getByRole('button', { name: 'Mettre en attente', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Panier vide/i).first()).toBeVisible();
}

async function openHeldList(page: Page, count: number) {
  await page.getByRole('button', { name: `Ventes en attente (${count})` }).click();
  return page.getByRole('dialog');
}

test.beforeEach(async () => {
  await resetEmulators();
});

test('a sale can be put on hold, the next customer served, then the held sale collected', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = (await firstBoutiqueId())!;

  await createProduct(page, RIZ);
  await createProduct(page, HUILE);
  await createUser(page, CAISSIER);

  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, '5000');

  // ── Customer 1 picks two bags of rice, then goes to fetch money ────────────
  await addToCart(page, RIZ.nom, 2);
  await holdCart(page, 'Maman Rose, va chercher la monnaie');
  await expect(page.getByTestId('held-count')).toHaveText('1');

  // Nothing was sold: no sale stored, stock untouched.
  const salesAfterHold = await readCollection(`boutiques/${boutiqueId}/sales`);
  expect(salesAfterHold, 'holding a cart must not record a sale').toHaveLength(0);
  expect(await readStoredStock(boutiqueId, RIZ.nom)).toBe(Number(RIZ.stock));

  // ── Customer 2 is served meanwhile ────────────────────────────────────────
  await addToCart(page, HUILE.nom, 1);

  // Customer 1 is back before customer 2 has paid: resuming must not wipe
  // customer 2's cart, it sets it aside too.
  let list = await openHeldList(page, 1);
  await expect(list.getByText('Maman Rose, va chercher la monnaie')).toBeVisible();
  await list.getByRole('button', { name: /Reprendre/ }).click();
  const replace = page.getByRole('dialog').filter({ hasText: /panier actuel n'est pas vide/i });
  await replace.getByRole('button', { name: /Mettre en attente et reprendre/ }).click();

  await expect(page.getByText('2 articles')).toBeVisible();
  await expect(page.getByTestId('held-count')).toHaveText('1');
  await payCash(page);

  // The resumed sale went through like any other: one sale, rice stock down by 2.
  await expect(async () => {
    const sales = await readCollection(`boutiques/${boutiqueId}/sales`);
    expect(sales).toHaveLength(1);
    expect(await readStoredStock(boutiqueId, RIZ.nom)).toBe(Number(RIZ.stock) - 2);
  }).toPass({ timeout: 30_000 });
  expect(await readStoredStock(boutiqueId, HUILE.nom)).toBe(Number(HUILE.stock));

  // ── Customer 2's cart is still on hold after a restart ─────────────────────
  await page.reload();
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await goTo(page, 'Clôture caisse');
  await expect(page.getByTestId('cloture-held-warning')).toContainText('1');

  await goTo(page, 'Point de vente');
  list = await openHeldList(page, 1);
  await expect(list.getByText('Sans étiquette')).toBeVisible();
  await list.getByRole('button', { name: /Reprendre/ }).click();
  await expect(page.getByText('1 article')).toBeVisible();
  await payCash(page);

  await expect(page.getByTestId('held-count')).toHaveCount(0);
  await expect(async () => {
    const sales = await readCollection(`boutiques/${boutiqueId}/sales`);
    expect(sales).toHaveLength(2);
    expect(await readStoredStock(boutiqueId, HUILE.nom)).toBe(Number(HUILE.stock) - 1);
  }).toPass({ timeout: 30_000 });
});
