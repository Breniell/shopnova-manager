/**
 * Selling on the slate, and getting the money back.
 *
 * Credit is how most neighbourhood shops in the region actually trade, and it
 * is where a POS either protects the owner or quietly ruins them. Two rules
 * carry that weight:
 *
 *   • The ceiling the gérant set on a customer must actually stop the sale -
 *     not warn, not colour something red, stop it.
 *   • A settlement collected on an old debt is cash that entered the drawer
 *     today, so the closing has to expect it.
 *
 * Neither had any end-to-end coverage.
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
  openCashSession,
  addToCart,
  selectCustomer,
  payTab,
  sellOnCredit,
  goTo,
  firstBoutiqueId,
  readCollection,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Sylvie', nom: 'Ngo', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;
const CAISSIER = { prenom: 'Didier', nom: 'Awono', role: 'caissier' as const, pin: '5678' };
const CAISSIER_NAME = `${CAISSIER.prenom} ${CAISSIER.nom}`;
const CLIENT = {
  prenom: 'Bernard', nom: 'Eto', telephone: '+237 677 11 22 33', plafondCredit: '20000',
};
const CLIENT_NAME = `${CLIENT.prenom} ${CLIENT.nom}`;
const PRODUCT = { nom: 'Huile raffinée 5L', achat: '3500', vente: '5000', stock: '40' };

const FOND_SESSION = 5000;

/** An amount as printed, tolerant about which space Intl picked. See cloture.spec.ts. */
function fcfa(amount: number): RegExp {
  const pattern = new Intl.NumberFormat('fr-FR')
    .format(amount)
    .replace(/[^\d,-]/g, '\\s*');
  return new RegExp(`(?<![\\d-])${pattern}\\s*FCFA`);
}

function kpi(page: Page, label: string): Locator {
  return page.locator('[class*="nova-card"]').filter({ hasText: label }).last();
}

/** The amount printed opposite an exact label. See cloture.spec.ts for why. */
function amountFor(scope: Locator, label: string): Locator {
  return scope.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
}

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

test('the credit ceiling stops the sale, and a settlement makes room again', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  // ── The gérant decides how far this customer may go ────────────────────────
  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  await createProduct(page, PRODUCT);
  await createCustomer(page, CLIENT);
  await createUser(page, CAISSIER);

  await logout(page);
  await loginAs(page, CAISSIER_NAME, CAISSIER.pin);
  await openCashSession(page, String(FOND_SESSION));

  // ── 15 000 on the slate, within the 20 000 ceiling ─────────────────────────
  await sellOnCredit(page, PRODUCT.nom, 3, CLIENT_NAME);

  // ── 10 000 more would reach 25 000. It must not go through ────────────────
  await addToCart(page, PRODUCT.nom, 2);
  await selectCustomer(page, CLIENT_NAME);
  await payTab(page, 'Crédit');

  await expect(
    page.getByText(/Plafond dépassé/),
    'nothing told the cashier the ceiling was breached',
  ).toBeVisible();
  await expect(page.getByText(/Plafond dépassé/)).toContainText(fcfa(25000));
  await expect(
    page.locator('button').filter({ hasText: /Valider la vente/i }).first(),
    'a cashier could push a customer past the ceiling the gérant set',
  ).toBeDisabled();

  await page.getByRole('button', { name: /Vider le panier/i }).click();
  await expect(page.getByText(/Panier vide/i).first()).toBeVisible();

  // ── The customer comes back and pays 5 000 ────────────────────────────────
  await goTo(page, 'Crédit & créances');
  await expect(kpi(page, 'Encours total')).toContainText(fcfa(15000));
  await page.getByRole('button', { name: /Par vente/ }).click();
  await expect(page.getByText(/En attente/).first()).toBeVisible();

  await page.getByRole('button', { name: /^Encaisser$/ }).first().click();
  const modal = page.locator('[class*="nova-card"]').filter({ hasText: 'Encaisser un règlement' }).last();
  await expect(amountFor(modal, 'Restant dû')).toHaveText(fcfa(15000));
  await modal.locator('input[type="number"]').first().fill('5000');
  await modal.getByRole('button', { name: /Espèces/ }).click();
  await modal.getByRole('button', { name: /Valider l'encaissement/i }).click();

  await expect(page.getByText(/Règlement de/).first()).toBeVisible({ timeout: 30_000 });
  await expect(kpi(page, 'Encours total')).toContainText(fcfa(10000));
  await expect(
    page.getByText(/Partiel/).first(),
    'the sale is still marked as untouched after a part payment',
  ).toBeVisible();

  // ── With 10 000 of room back, the same sale now passes ────────────────────
  await goTo(page, 'Point de vente');
  await sellOnCredit(page, PRODUCT.nom, 2, CLIENT_NAME);

  await expect.poll(async () => {
    const sales = await readCollection(`boutiques/${boutiqueId}/sales`);
    return sales.filter(s => s.fields?.paymentMode?.stringValue === 'credit').length;
  }, { timeout: 30_000, message: 'the second credit sale never reached the database' }).toBe(2);

  // ── The settlement is on the books, attached to this shift ────────────────
  const payments = await readCollection(`boutiques/${boutiqueId}/payments`);
  expect(payments).toHaveLength(1);
  expect(num(payments[0], 'amount')).toBe(5000);
  expect(payments[0].fields?.channel?.stringValue).toBe('especes');
  expect(payments[0].fields?.userName?.stringValue).toBe(CAISSIER_NAME);
  expect(
    payments[0].fields?.cashSessionId?.stringValue,
    'the settlement is not tied to the session, so the closing cannot expect it',
  ).toBeTruthy();

  // ── Which is exactly what the closing must expect in the drawer ───────────
  // Not one franc came in from the sales themselves: they are all on credit.
  // The 5 000 collected on the old debt is the only cash of the shift.
  await goTo(page, 'Clôture caisse');
  await expect(
    kpi(page, 'Encaissé en espèces'),
    'money collected on an old debt was left out of the cash total',
  ).toContainText(fcfa(5000));
  const result = page.locator('[class*="nova-card"]').filter({ hasText: 'Résultat' }).last();
  await expect(amountFor(result, 'Espèces + fond attendus')).toHaveText(fcfa(10000));
  await expect(page.getByText(/2 vente\(s\) à crédit aujourd'hui/)).toBeVisible();
});
