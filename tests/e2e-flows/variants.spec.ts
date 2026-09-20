/**
 * Un produit décliné en tailles, couleurs et modèles.
 *
 * Avant cela, un vendeur de perruques devait créer une fiche par combinaison :
 * 5 longueurs × 4 couleurs × 3 modèles = 60 fiches quasi identiques, et une
 * grille de caisse inutilisable.
 *
 * Deux choses comptent et sont vérifiées ici :
 *   • la caisse reste lisible - un parent, une tuile, pas une par combinaison ;
 *   • chaque déclinaison a son propre stock, et vendre l'une ne touche pas les
 *     autres. C'est ce qui justifie qu'une déclinaison soit un produit à part
 *     entière plutôt qu'une ligne dans un tableau imbriqué.
 */
import { test, expect } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  logout,
  createUser,
  createProductWithVariants,
  openCashSession,
  goTo,
  firstBoutiqueId,
  readCollection,
  readStoredStock,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Estelle', nom: 'Manga', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;
const CAISSIER = { prenom: 'Junior', nom: 'Essomba', role: 'caissier' as const, pin: '5678' };
const CAISSIER_NAME = `${CAISSIER.prenom} ${CAISSIER.nom}`;

const WIG = {
  nom: 'Perruque Bob',
  axes: ['Longueur', 'Couleur'],
  variants: [
    { values: ['12 pouces', 'Noir'], achat: '8000',  vente: '15000', stock: '4' },
    { values: ['12 pouces', 'Brun'], achat: '8000',  vente: '15000', stock: '2' },
    // Volontairement à zéro : une déclinaison en rupture doit se voir et se
    // refuser, pas disparaître.
    { values: ['16 pouces', 'Noir'], achat: '11000', vente: '20000', stock: '0' },
  ],
};

const NOIR_12 = 'Perruque Bob — 12 pouces / Noir';

test.beforeEach(async () => {
  await resetEmulators();
});

test('chaque déclinaison a son prix et son stock, et la caisse reste lisible', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  await createProductWithVariants(page, WIG);
  await createUser(page, CAISSIER);

  // ── Ce qui a réellement été enregistré ────────────────────────────────────
  await expect.poll(async () => {
    const stored = await readCollection(`boutiques/${boutiqueId}/products`);
    return stored.length;
  }, { timeout: 30_000, message: 'le parent et ses déclinaisons ne sont pas arrivés en base' })
    .toBe(4); // un parent + trois déclinaisons

  const stored = await readCollection(`boutiques/${boutiqueId}/products`);
  const parent = stored.find(p => p.fields?.nom?.stringValue === WIG.nom)!;
  expect(
    parent.fields?.variantAxes,
    'le parent ne porte pas ses axes, il serait traité comme un produit ordinaire',
  ).toBeTruthy();
  expect(
    parent.fields?.codeBarre?.stringValue,
    'un parent avec un code-barres pourrait tomber au panier par un scan',
  ).toBe('');

  const noir12 = stored.find(p => p.fields?.nom?.stringValue === NOIR_12);
  expect(noir12, 'le nom composé attendu sur le reçu est absent').toBeTruthy();

  // ── Côté caisse ───────────────────────────────────────────────────────────
  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, '5000');

  // Une tuile, pas trois : c'est tout l'intérêt des déclinaisons.
  await expect(
    page.getByRole('button', { name: new RegExp(WIG.nom) }),
    'la grille montre une tuile par déclinaison au lieu d\'une par produit',
  ).toHaveCount(1);
  // La tuile annonce la fourchette de prix, pas un prix à zéro.
  await expect(page.getByText(/15\s*000\s*FCFA\s*–\s*20\s*000\s*FCFA/)).toBeVisible();

  // ── Le sélecteur ──────────────────────────────────────────────────────────
  await page.getByRole('button', { name: new RegExp(WIG.nom) }).click();
  const picker = page.locator('[class*="nova-card"]').filter({ hasText: 'Choisissez une déclinaison' }).last();
  await expect(picker).toBeVisible();

  await picker.getByRole('button', { name: '12 pouces', exact: true }).click();
  await picker.getByRole('button', { name: 'Noir', exact: true }).click();
  await expect(picker.getByText(/15\s*000\s*FCFA/)).toBeVisible();
  await expect(picker.getByText(/4 en stock/)).toBeVisible();
  await picker.getByRole('button', { name: /Ajouter au panier/i }).click();

  // Le panier porte le nom composé, celui qui partira sur le reçu.
  await expect(page.getByText(NOIR_12).first()).toBeVisible();

  await page.getByPlaceholder(/Montant reçu/i).fill('20000');
  await page.locator('button').filter({ hasText: /Valider la vente/i }).first().click();
  await expect(page.getByText(/Reçu\s*:|Reçu n/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(NOIR_12).first(),
    'le reçu ne dit pas au client quelle déclinaison il a achetée',
  ).toBeVisible();
  await page.getByRole('button', { name: /^Fermer$/ }).first().click();

  // ── Seule la déclinaison vendue est décomptée ─────────────────────────────
  await expect.poll(
    async () => readStoredStock(boutiqueId!, NOIR_12),
    { timeout: 30_000, message: 'le stock de la déclinaison vendue n\'a pas bougé' },
  ).toBe(3);
  expect(
    await readStoredStock(boutiqueId!, 'Perruque Bob — 12 pouces / Brun'),
    'vendre une couleur a touché le stock d\'une autre',
  ).toBe(2);
  expect(await readStoredStock(boutiqueId!, WIG.nom), 'le parent porte du stock').toBe(0);
});

test('le gérant peut créer sa propre catégorie', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  await goTo(page, 'Produits');
  await page.getByRole('button', { name: /Ajouter un produit/i }).first().click();
  const modal = page.locator('[class*="nova-card"]').filter({ has: page.locator('input') }).last();
  await modal.locator('input[type="text"]').first().fill('Mèches brésiliennes');

  // Aucune des sept catégories d'origine ne convenait à la coiffure.
  await modal.locator('select').first().selectOption('__new__');

  // La saisie doit apparaître DANS la fenêtre. La première version appelait
  // window.prompt(), qui ne s'affiche pas dans Electron et renvoyait null : le
  // choix restait sans effet dans l'application installée.
  const input = modal.getByPlaceholder(/Nom de la nouvelle catégorie/i);
  await expect(input, 'choisir « Nouvelle catégorie » n\'ouvre aucune saisie').toBeVisible();
  await input.fill('Beauté & coiffure');
  await modal.getByRole('button', { name: /^Ajouter$/ }).first().click();

  // Elle est sélectionnée, et la saisie se referme.
  await expect(modal.locator('select').first()).toHaveValue('Beauté & coiffure');
  await expect(input).toHaveCount(0);

  // Et elle est partagée avec les autres caisses, donc enregistrée côté boutique.
  await expect.poll(async () => {
    const settings = await readCollection(`boutiques/${boutiqueId}/settings`);
    return JSON.stringify(settings[0]?.fields?.categories ?? {});
  }, { timeout: 30_000, message: 'la catégorie créée n\'est pas partagée entre les caisses' })
    .toContain('Beauté & coiffure');
});

test('une déclinaison en rupture se voit et se refuse', async ({ page }) => {
  test.setTimeout(300_000);
  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  await createProductWithVariants(page, WIG);
  await createUser(page, CAISSIER);

  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, '5000');

  await page.getByRole('button', { name: new RegExp(WIG.nom) }).click();
  const picker = page.locator('[class*="nova-card"]').filter({ hasText: 'Choisissez une déclinaison' }).last();

  // 16 pouces n'existe qu'en Noir, à zéro : le chemin doit être barré d'emblée
  // plutôt que de laisser le caissier s'engager devant le client.
  await expect(
    picker.getByRole('button', { name: '16 pouces', exact: true }),
    'une longueur dont aucune déclinaison n\'est en stock reste proposée',
  ).toBeDisabled();

  // Le chemin en stock, lui, reste ouvert.
  await expect(picker.getByRole('button', { name: '12 pouces', exact: true })).toBeEnabled();
});

test('le stock ignore les parents, qui n\'en portent pas', async ({ page }) => {
  test.setTimeout(300_000);
  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  await createProductWithVariants(page, WIG);

  // Un parent laissé dans les listes de stock s'afficherait en rupture
  // permanente et polluerait les alertes, pour un article qui n'existe pas
  // physiquement.
  await goTo(page, 'Stock');
  // Attendre que le tableau soit peuplé avant de conclure à une absence :
  // sinon « le parent n'est pas là » serait vrai simplement parce que rien
  // n'est encore affiché - une assertion qui ne peut pas échouer.
  await expect(page.getByText(NOIR_12).first()).toBeVisible({ timeout: 30_000 });

  await expect(
    page.getByText(WIG.nom, { exact: true }),
    'le produit parent apparaît dans le stock alors qu\'il n\'en porte aucun',
  ).toHaveCount(0);

  // Et il ne doit pas non plus polluer les alertes de rupture.
  await page.getByRole('button', { name: /Alertes/ }).click();
  await expect(
    page.getByText(WIG.nom, { exact: true }),
    'le parent est signalé en rupture alors qu\'il n\'a pas de stock à avoir',
  ).toHaveCount(0);
});
