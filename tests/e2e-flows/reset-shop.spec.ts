/**
 * Remettre la boutique à zéro : effacer l'exploitation, garder les livres.
 *
 * Tout commerçant saisit des produits et des ventes pour essayer pendant ses
 * 30 jours d'essai. Le jour de l'ouverture réelle, il veut partir propre - et
 * jusqu'ici Legwan n'avait rien à lui proposer.
 *
 * Ce qui est vérifié ici tient en trois points, et le troisième est le plus
 * important :
 *   1. ce qui est coché disparaît vraiment, y compris en base ;
 *   2. ce qui n'est pas coché survit ;
 *   3. **les livres survivent toujours** - mouvements de stock, règlements,
 *      clôtures. `firestore.rules` refuse leur suppression, ce sont des pièces
 *      comptables. Une fonction destructive qui déborderait de son périmètre
 *      serait bien pire que pas de fonction du tout.
 */
import { test, expect } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  createProduct,
  createCustomer,
  sellForCash,
  goTo,
  firstBoutiqueId,
  readCollection,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Pauline', nom: 'Nkodo', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;
/** Nom donné par défaut à une boutique neuve ; sert de phrase de confirmation. */
const SHOP_NAME = 'Ma Boutique';
const PRODUCT = { nom: 'Savon Azur', achat: '300', vente: '500', stock: '20' };
const CLIENT = { prenom: 'Serge', nom: 'Abena', telephone: '+237 699 00 11 22' };

test.beforeEach(async () => {
  await resetEmulators();
});

test('effacer les ventes d\'essai sans toucher au catalogue ni aux livres', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  // ── Une boutique qui a servi : un produit, un client, une vente ───────────
  await createProduct(page, PRODUCT);
  await createCustomer(page, CLIENT);
  await goTo(page, 'Point de vente');
  await sellForCash(page, PRODUCT.nom, 2);

  await expect.poll(
    async () => (await readCollection(`boutiques/${boutiqueId}/sales`)).length,
    { timeout: 30_000, message: 'la vente d\'essai n\'est jamais arrivée en base' },
  ).toBe(1);
  const movementsBefore = (await readCollection(`boutiques/${boutiqueId}/stock_movements`)).length;
  expect(movementsBefore, 'la vente n\'a produit aucun mouvement de stock').toBeGreaterThan(0);

  // ── La zone de danger ─────────────────────────────────────────────────────
  await goTo(page, 'Paramètres');
  await page.getByRole('button', { name: /Remettre à zéro/i }).click();

  // Portée limitée à la carte : « Clients » et « Produits » désignent aussi des
  // entrées du menu latéral.
  const danger = page.locator('[class*="nova-card"]')
    .filter({ hasText: 'Remettre la boutique à zéro' }).last();
  const erase = page.getByRole('button', { name: /Effacer définitivement/i });
  await expect(
    erase,
    'le bouton est actif alors que rien n\'est coché et que rien n\'est confirmé',
  ).toBeDisabled();

  await danger.getByText('Ventes et encaissements', { exact: true }).click();
  await expect(
    erase,
    'cocher une case suffit à armer un effacement définitif',
  ).toBeDisabled();

  // Le nom de la boutique doit être saisi exactement.
  await page.getByPlaceholder(SHOP_NAME).fill('n importe quoi');
  await expect(erase, 'une confirmation approximative suffit').toBeDisabled();

  await page.getByPlaceholder(SHOP_NAME).fill(SHOP_NAME);
  await expect(erase).toBeEnabled();
  await erase.click();
  await expect(page.getByText(/éléments effacés/).first()).toBeVisible({ timeout: 30_000 });

  // ── Ce qui devait partir est parti ────────────────────────────────────────
  await expect.poll(
    async () => (await readCollection(`boutiques/${boutiqueId}/sales`)).length,
    { timeout: 30_000, message: 'les ventes sont toujours en base après l\'effacement' },
  ).toBe(0);

  // ── Ce qui n'était pas coché est intact ───────────────────────────────────
  const products = await readCollection(`boutiques/${boutiqueId}/products`);
  expect(
    products.map(p => p.fields?.nom?.stringValue),
    'le catalogue a été emporté alors qu\'il n\'était pas coché',
  ).toContain(PRODUCT.nom);
  expect(
    (await readCollection(`boutiques/${boutiqueId}/customers`)).length,
    'les clients ont été emportés alors qu\'ils n\'étaient pas cochés',
  ).toBe(1);

  // ── Et les livres sont toujours là ────────────────────────────────────────
  expect(
    (await readCollection(`boutiques/${boutiqueId}/stock_movements`)).length,
    'les mouvements de stock ont disparu : ce sont des pièces comptables',
  ).toBe(movementsBefore);

  // L'historique reste lisible seul : chaque mouvement garde le nom du produit.
  const movements = await readCollection(`boutiques/${boutiqueId}/stock_movements`);
  expect(movements.map(m => m.fields?.productName?.stringValue)).toContain(PRODUCT.nom);

  // ── Et l'écran repart de zéro ─────────────────────────────────────────────
  await goTo(page, 'Ventes');
  await expect(page.getByText(PRODUCT.nom)).toHaveCount(0);
});

test('tout cocher vide l\'exploitation, et seulement elle', async ({ page }) => {
  test.setTimeout(300_000);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  const boutiqueId = await firstBoutiqueId();

  await createProduct(page, PRODUCT);
  await createCustomer(page, CLIENT);
  await goTo(page, 'Point de vente');
  await sellForCash(page, PRODUCT.nom, 1);

  await goTo(page, 'Paramètres');
  await page.getByRole('button', { name: /Remettre à zéro/i }).click();
  const danger = page.locator('[class*="nova-card"]')
    .filter({ hasText: 'Remettre la boutique à zéro' }).last();
  for (const label of ['Ventes et encaissements', 'Sorties de caisse', 'Produits et stock',
                       'Clients', 'Fournisseurs', 'Dépenses']) {
    await danger.getByText(label, { exact: true }).click();
  }
  await page.getByPlaceholder(SHOP_NAME).fill(SHOP_NAME);
  await page.getByRole('button', { name: /Effacer définitivement/i }).click();
  await expect(page.getByText(/éléments effacés/).first()).toBeVisible({ timeout: 30_000 });

  for (const collection of ['sales', 'products', 'customers']) {
    await expect.poll(
      async () => (await readCollection(`boutiques/${boutiqueId}/${collection}`)).length,
      { timeout: 30_000, message: `${collection} n'a pas été vidé` },
    ).toBe(0);
  }

  // Les utilisateurs ne font pas partie de l'exploitation : les emporter
  // enfermerait le gérant dehors de sa propre boutique.
  expect(
    (await readCollection(`boutiques/${boutiqueId}/users`)).length,
    'le compte du gérant a été supprimé : la boutique devient inaccessible',
  ).toBeGreaterThan(0);

  // Et les livres, toujours.
  expect(
    (await readCollection(`boutiques/${boutiqueId}/stock_movements`)).length,
    'les mouvements de stock ont été emportés',
  ).toBeGreaterThan(0);
});
