/**
 * Importer un catalogue depuis un tableur.
 *
 * Saisir 60 perruques a la main est le genre de travail qui fait abandonner un
 * logiciel avant meme de l'avoir essaye. Ce parcours verifie qu'un fichier
 * produit par Excel - avec ses conventions a lui - devient un vrai catalogue.
 *
 * Les deux pieges couverts ici sont propres au marche vise :
 *   • Excel en configuration francaise ecrit des points-virgules, pas des
 *     virgules ;
 *   • et enregistre en ANSI, pas en UTF-8, ce qui rend « Hygiene » illisible
 *     si on ne le detecte pas.
 */
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  goTo,
  firstBoutiqueId,
  readCollection,
  readStoredStock,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Sandrine', nom: 'Etoa', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;

const NOIR_12 = 'Perruque Bob — 12 pouces / Noir';

/** Ecrit un CSV dans l'encodage demande et renvoie son chemin. */
function writeCsv(name: string, lines: string[], encoding: 'utf8' | 'latin1'): string {
  const dir = join(tmpdir(), 'legwan-import-tests');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, lines.join('\r\n'), encoding);
  return path;
}

test.beforeEach(async () => {
  await resetEmulators();
});

test('un fichier Excel francais devient un catalogue, declinaisons comprises', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  // Tel qu'Excel l'ecrit chez un commercant camerounais : separateur
  // point-virgule, encodage ANSI, milliers espaces, virgule decimale.
  const csv = writeCsv('catalogue.csv', [
    'Nom;Categorie;Prix achat;Prix vente;Stock;Seuil;Longueur;Couleur',
    'Savon de Marseille;Hygiène;800;1 200,00;40;10;;',
    'Perruque Bob;Beauté;8000;15000;4;2;12 pouces;Noir',
    'Perruque Bob;Beauté;8000;15000;2;2;12 pouces;Brun',
    'Perruque Bob;Beauté;11000;20000;3;2;16 pouces;Noir',
  ], 'latin1');

  await goTo(page, 'Produits');
  await page.getByRole('button', { name: /^Importer$/ }).click();
  await page.locator('input[type="file"]').setInputFiles(csv);

  // ── L'apercu, avant toute ecriture ────────────────────────────────────────
  await expect(page.getByText(/produits nouveaux/)).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/Critères de déclinaison détectés : Longueur, Couleur/),
    'les colonnes inconnues ne sont pas reconnues comme des critères',
  ).toBeVisible();
  await expect(
    page.getByText(/Catégories à créer/),
    'les catégories du fichier ne sont pas proposées à la création',
  ).toBeVisible();

  await page.getByRole('button', { name: /Importer 2 produits/ }).click();
  await expect(page.getByText(/2 produits importés/)).toBeVisible({ timeout: 30_000 });

  // ── Ce qui a reellement ete enregistre ────────────────────────────────────
  await expect.poll(
    async () => (await readCollection(`boutiques/${boutiqueId}/products`)).length,
    { timeout: 30_000, message: 'le catalogue importé n\'est pas arrivé en base' },
  ).toBe(5); // savon + parent perruque + 3 déclinaisons

  const stored = await readCollection(`boutiques/${boutiqueId}/products`);
  const names = stored.map(p => p.fields?.nom?.stringValue);

  // L'encodage ANSI a bien ete rattrape : sans cela le nom serait illisible.
  const soap = stored.find(p => p.fields?.nom?.stringValue === 'Savon de Marseille')!;
  expect(
    soap.fields?.categorie?.stringValue,
    'la catégorie accentuée est ressortie illisible : ANSI non détecté',
  ).toBe('Hygiène');

  // « 1 200,00 » vaut 1200, pas 1 ni 120000.
  expect(Number(soap.fields?.prixVente?.integerValue ?? soap.fields?.prixVente?.doubleValue)).toBe(1200);

  // Les lignes de meme nom ont forme un parent et ses declinaisons.
  expect(names, 'le nom composé attendu sur le reçu est absent').toContain(NOIR_12);
  const parent = stored.find(p => p.fields?.nom?.stringValue === 'Perruque Bob')!;
  expect(parent.fields?.variantAxes, 'le parent ne porte pas ses axes').toBeTruthy();
  expect(
    parent.fields?.codeBarre?.stringValue,
    'un parent avec un code-barres pourrait tomber au panier par un scan',
  ).toBe('');

  expect(await readStoredStock(boutiqueId!, NOIR_12)).toBe(4);
  expect(await readStoredStock(boutiqueId!, 'Perruque Bob — 16 pouces / Noir')).toBe(3);

  // ── Et la caisse reste lisible ────────────────────────────────────────────
  await goTo(page, 'Point de vente');
  await expect(
    page.getByRole('button', { name: /Perruque Bob/ }),
    'la grille montre une tuile par déclinaison au lieu d\'une par produit',
  ).toHaveCount(1);
});

test('un fichier deja importe ne cree pas de doublons', async ({ page }) => {
  test.setTimeout(300_000);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  const boutiqueId = await firstBoutiqueId();

  // Excel anglophone cette fois : virgules et UTF-8. Le lecteur doit s'adapter.
  const csv = writeCsv('anglais.csv', [
    'Name,Category,Purchase price,Sale price,Stock',
    'Rice 5kg,Alimentation,3500,4500,20',
  ], 'utf8');

  await goTo(page, 'Produits');
  await page.getByRole('button', { name: /^Importer$/ }).click();
  await page.locator('input[type="file"]').setInputFiles(csv);
  await page.getByRole('button', { name: /Importer 1 produits/ }).click();
  // .first() : le message de succès du premier import est encore affiché
  // quand celui du second apparaît, et deux éléments correspondent alors.
  await expect(page.getByText(/1 produits importés/).first()).toBeVisible({ timeout: 30_000 });

  await expect.poll(
    async () => (await readCollection(`boutiques/${boutiqueId}/products`)).length,
    { timeout: 30_000 },
  ).toBe(1);

  // Deuxieme passage sur le meme fichier : le produit est reconnu.
  await page.getByRole('button', { name: /^Importer$/ }).click();
  await page.locator('input[type="file"]').setInputFiles(csv);
  await expect(
    page.getByText(/déjà présents en boutique/),
    'un produit déjà présent n\'est pas reconnu, il serait recréé en double',
  ).toBeVisible({ timeout: 30_000 });

  // Par defaut on les ignore : rien a importer, donc rien a valider.
  await expect(
    page.getByRole('button', { name: /Importer 0 produits/ }),
    'le bouton propose de réimporter un produit déjà présent',
  ).toBeDisabled();

  // En choisissant la mise a jour, les prix suivent sans toucher au stock.
  await page.getByText('Mettre à jour prix, seuil et catégorie').click();
  await page.getByRole('button', { name: /Importer 1 produits/ }).click();
  await expect(page.getByText(/1 produits importés/).first()).toBeVisible({ timeout: 30_000 });

  expect(
    (await readCollection(`boutiques/${boutiqueId}/products`)).length,
    'la mise à jour a créé un doublon au lieu de modifier le produit',
  ).toBe(1);
  expect(
    await readStoredStock(boutiqueId!, 'Rice 5kg'),
    'un import a modifié le stock, ce qu\'il ne doit jamais faire',
  ).toBe(20);
});
