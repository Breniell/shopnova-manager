/**
 * What a closing says must be what is really in the drawer.
 *
 * This is the moment the shop owner counts the money and decides whether to
 * trust the cashier, so every number on that screen has to mean exactly one
 * thing. Three of them are easy to get wrong and expensive when they are:
 *
 *   • Mobile Money is revenue but it is NOT in the drawer.
 *   • A credit sale is neither: nothing was collected at all.
 *   • The float to compare against is the one declared when the session opened,
 *     not the shop-wide default - they differ the moment a cashier opens with
 *     a different amount.
 *
 * Nothing exercised the closing end to end before this. The manager override
 * had been dead for five versions under exactly those conditions.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  logout,
  createProduct,
  createUser,
  createCustomer,
  declareCashOut,
  setMomoMerchantCode,
  openCashSession,
  sellForCash,
  sellWithMobileMoney,
  sellOnCredit,
  goTo,
  firstBoutiqueId,
  readCollection,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Claire', nom: 'Mbarga', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;
const CAISSIER = { prenom: 'Hervé', nom: 'Talla', role: 'caissier' as const, pin: '5678' };
const CAISSIER_NAME = `${CAISSIER.prenom} ${CAISSIER.nom}`;
const CLIENT = { prenom: 'Bernard', nom: 'Eto', telephone: '+237 677 11 22 33' };
const CLIENT_NAME = `${CLIENT.prenom} ${CLIENT.nom}`;
const PRODUCT = { nom: 'Sucre en poudre 1kg', achat: '600', vente: '1000', stock: '40' };

/** The float this cashier declares - deliberately NOT the shop default of 10 000. */
const FOND_SESSION = 7500;

/** Denomination rows in the counting card, in the order the page renders them. */
const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5];

/**
 * An amount as the page prints it, tolerant about the space between thousands.
 *
 * Intl uses U+202F or U+00A0 for fr-FR depending on the ICU build, so a literal
 * string comparison is a coin toss. The lookbehind stops "5 000 FCFA" from
 * matching inside "15 000 FCFA", which would make a wrong total look right.
 */
function fcfa(amount: number): RegExp {
  const pattern = new Intl.NumberFormat('fr-FR')
    .format(amount)
    .replace(/[^\d,-]/g, '\\s*');
  return new RegExp(`(?<![\\d-])${pattern}\\s*FCFA`);
}

/** The KPI tile carrying this label. */
function kpi(page: Page, label: string): Locator {
  return page.locator('[class*="nova-card"]').filter({ hasText: label }).last();
}

/**
 * The amount printed opposite a label on a result line.
 *
 * Anchored on the exact label, not on the row that contains it: the warning
 * "Écart important détecté" also contains the word "Écart" and sits lower in
 * the card, so matching containers would silently read the warning instead of
 * the figure - and the assertion would pass or fail for the wrong reason.
 */
function amountFor(scope: Locator, label: string): Locator {
  return scope.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
}

/** Type a quantity into one denomination row of the physical count. */
async function count(page: Page, denomination: number, quantity: number): Promise<void> {
  const card = page.locator('[class*="nova-card"]').filter({ hasText: 'Comptage physique' }).last();
  const inputs = card.locator('input[type="number"]');
  await expect(inputs, 'the counting card no longer has one input per denomination')
    .toHaveCount(DENOMINATIONS.length);
  await inputs.nth(DENOMINATIONS.indexOf(denomination)).fill(String(quantity));
}

/** A numeric Firestore field, whichever way the emulator typed it. */
function num(
  doc: { fields?: Record<string, Record<string, unknown>> } | undefined,
  field: string,
): number | null {
  const raw = doc?.fields?.[field];
  if (!raw) return null;
  const value = raw.integerValue ?? raw.doubleValue;
  return value === undefined ? null : Number(value);
}

test.beforeEach(async () => {
  await resetEmulators();
});

test('a closing expects the cash only, against the float the session declared', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  // ── The gérant sets the shop up ────────────────────────────────────────────
  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  await createProduct(page, PRODUCT);
  await createCustomer(page, CLIENT);
  await setMomoMerchantCode(page, '123456');
  await createUser(page, CAISSIER);

  // ── A shift: cash, Mobile Money, and one sale on the slate ─────────────────
  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, String(FOND_SESSION));

  await sellForCash(page, PRODUCT.nom, 5);                  // 5 000 in the drawer
  await sellWithMobileMoney(page, PRODUCT.nom, 3);          // 3 000, but on a phone
  await sellOnCredit(page, PRODUCT.nom, 2, CLIENT_NAME);    // 2 000, nothing collected

  // ── Closing time ──────────────────────────────────────────────────────────
  await goTo(page, 'Clôture caisse');

  await expect(kpi(page, 'Encaissé en espèces')).toContainText(fcfa(5000));
  await expect(kpi(page, 'Encaissé Mobile Money')).toContainText(fcfa(3000));
  await expect(
    kpi(page, "Chiffre d'affaires encaissé"),
    'revenue collected should be cash plus Mobile Money, and nothing else',
  ).toContainText(fcfa(8000));

  // The float on screen must be the one this session declared, not the
  // shop-wide default of 10 000 - otherwise the arithmetic cannot be checked
  // by the person counting.
  await expect(
    kpi(page, "Fond déclaré à l'ouverture"),
    'the float tile shows a different figure from the one the closing uses',
  ).toContainText(fcfa(FOND_SESSION));

  // The slate is shown, but kept out of every total.
  await expect(
    page.getByText(/1 vente\(s\) à crédit aujourd'hui/),
    'the cashier is not told a credit sale happened during the shift',
  ).toBeVisible();

  // The one number the whole screen exists for. 5 000 cash + 7 500 float.
  // Not 12 500 + 3 000 (Mobile Money is not in the drawer), not 15 000
  // (that would be the shop-wide default float instead of this session's).
  const result = page.locator('[class*="nova-card"]').filter({ hasText: 'Résultat' }).last();
  await expect(
    amountFor(result, 'Espèces + fond attendus'),
    'the expected drawer total is not cash + the float declared at opening',
  ).toHaveText(fcfa(12500));

  // ── A short drawer must say so, loudly ────────────────────────────────────
  await count(page, 10000, 1);
  await expect(amountFor(result, 'Montant compté')).toHaveText(fcfa(10000));
  await expect(amountFor(result, 'Écart')).toHaveText(fcfa(-2500));
  await expect(page.getByText(/Manque en caisse/)).toBeVisible();
  await expect(
    page.getByText(/Écart important détecté/),
    'a 2 500 FCFA shortfall passed without a warning',
  ).toBeVisible();

  // ── Counted in full, the drawer balances ──────────────────────────────────
  await count(page, 2000, 1);
  await count(page, 500, 1);
  await expect(amountFor(result, 'Montant compté')).toHaveText(fcfa(12500));
  await expect(amountFor(result, 'Écart')).toHaveText(fcfa(0));
  await expect(page.getByText(/Caisse exacte/)).toBeVisible();

  await page.getByRole('button', { name: /Valider la clôture/i }).click();
  await expect(page.getByText(/Session clôturée/i).first()).toBeVisible({ timeout: 30_000 });

  // ── What was written down, which is what the gérant will audit ────────────
  await expect.poll(async () => {
    const clotures = await readCollection(`boutiques/${boutiqueId}/clotures`);
    return clotures.length;
  }, { timeout: 30_000, message: 'the closing was never recorded' }).toBe(1);

  const [cloture] = await readCollection(`boutiques/${boutiqueId}/clotures`);
  expect(num(cloture, 'totalVentesEspeces')).toBe(5000);
  expect(num(cloture, 'totalVentesMobile')).toBe(3000);
  expect(num(cloture, 'totalAttendu')).toBe(12500);
  expect(num(cloture, 'totalCompte')).toBe(12500);
  expect(num(cloture, 'ecart')).toBe(0);
  expect(cloture.fields?.userName?.stringValue).toBe(CAISSIER_NAME);

  // The session is closed, and closed with the same figures.
  const sessions = await readCollection(`boutiques/${boutiqueId}/cash_sessions`);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].fields?.status?.stringValue).toBe('closed');
  expect(num(sessions[0], 'fondInitial')).toBe(FOND_SESSION);
  expect(num(sessions[0], 'totalCompte')).toBe(12500);
  expect(num(sessions[0], 'ecart')).toBe(0);
  expect(sessions[0].fields?.closedAt?.stringValue, 'no closing timestamp').toBeTruthy();

  // ── And the till is shut until someone opens a new session ────────────────
  await goTo(page, 'Point de vente');
  await expect(
    page.getByText(/Aucune session de caisse ouverte/),
    'the till stayed open after the drawer was counted and handed over',
  ).toBeVisible({ timeout: 30_000 });
});

test('money taken out of the drawer is declared, not blamed on the cashier', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  await createProduct(page, PRODUCT);
  await createUser(page, CAISSIER);

  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, String(FOND_SESSION));
  await sellForCash(page, PRODUCT.nom, 5);                  // 5 000 in the drawer

  await goTo(page, 'Clôture caisse');
  const result = page.locator('[class*="nova-card"]').filter({ hasText: 'Résultat' }).last();
  await expect(amountFor(result, 'Espèces + fond attendus')).toHaveText(fcfa(12500));

  // ── The owner takes 2 000 from the till, mid-shift ────────────────────────
  await expect(
    page.getByText(/Aucune sortie déclarée/),
    'the closing offers no way to declare a withdrawal',
  ).toBeVisible();

  await declareCashOut(page, {
    type: 'Prêt',
    amount: '2000',
    beneficiaire: 'Claire Mbarga',
    motif: 'Avance prise par la gérante pour un achat urgent',
  });

  // ── Which the closing must now expect to be missing ───────────────────────
  await expect(
    amountFor(result, 'Espèces + fond attendus'),
    'the declared withdrawal was not deducted from what the drawer should hold',
  ).toHaveText(fcfa(10500));
  await expect(
    amountFor(result, 'dont sorties déduites'),
    'nothing on the result explains why the expected total dropped',
  ).toHaveText(fcfa(-2000));
  await expect(page.getByText(/Avance prise par la gérante/)).toBeVisible();

  // 10 500 counted: a drawer 2 000 short of the takings, and yet exact.
  await count(page, 10000, 1);
  await count(page, 500, 1);
  await expect(
    page.getByText(/Caisse exacte/),
    'the cashier is still shown a shortfall for money the owner took',
  ).toBeVisible();

  // ── A mistyped withdrawal can be taken back ───────────────────────────────
  await declareCashOut(page, { type: 'Autre', amount: '500', motif: 'Saisie erronée' });
  await expect(amountFor(result, 'Espèces + fond attendus')).toHaveText(fcfa(10000));
  // Both rows carry the same delete label and the list is newest-first, so
  // pick the row by its own wording rather than by position.
  await page.locator('div').filter({ hasText: 'Saisie erronée' }).last()
    .getByRole('button', { name: /Supprimer cette sortie/i }).click();
  await expect(
    amountFor(result, 'Espèces + fond attendus'),
    'deleting a withdrawal did not put the money back in what is expected',
  ).toHaveText(fcfa(10500));

  await page.getByRole('button', { name: /Valider la clôture/i }).click();
  await expect(page.getByText(/Session clôturée/i).first()).toBeVisible({ timeout: 30_000 });

  // ── On the books: one withdrawal, attached to this session ────────────────
  await expect.poll(async () => {
    const cashOuts = await readCollection(`boutiques/${boutiqueId}/cash_outs`);
    return cashOuts.length;
  }, { timeout: 30_000, message: 'the withdrawal never reached the database' }).toBe(1);

  const [cashOut] = await readCollection(`boutiques/${boutiqueId}/cash_outs`);
  expect(num(cashOut, 'amount')).toBe(2000);
  expect(cashOut.fields?.type?.stringValue).toBe('pret');
  expect(cashOut.fields?.userName?.stringValue).toBe(CAISSIER_NAME);
  expect(cashOut.fields?.beneficiaire?.stringValue).toBe(GERANT_NAME);

  // The withdrawal was written when it was declared, so polling that collection
  // says nothing about the closing, which is written only now.
  await expect.poll(async () => {
    const clotures = await readCollection(`boutiques/${boutiqueId}/clotures`);
    return clotures.length;
  }, { timeout: 30_000, message: 'the closing was never recorded' }).toBe(1);

  const [cloture] = await readCollection(`boutiques/${boutiqueId}/clotures`);
  expect(num(cloture, 'totalAttendu')).toBe(10500);
  expect(num(cloture, 'ecart')).toBe(0);
});
