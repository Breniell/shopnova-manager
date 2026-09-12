/**
 * Two registers, one shop.
 *
 * Multi-register support was described to prospects from a reading of the code:
 * stock sent as increment() deltas, a per-register prefix in sale numbers, live
 * onSnapshot listeners, a licence bound to the shop rather than the machine.
 * Reading had already been wrong four times on this project, so this is the
 * execution proof - or the evidence that the description needs correcting.
 *
 * Each register is its own browser context, so each has its own localStorage and
 * therefore its own register code and its own offline cache, exactly like two
 * physical PCs.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  goTo,
  createProduct,
  sellForCash,
  readStoredStock,
  readCollection,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Amina', nom: 'Fotso', pin: '1234' };
const FULL_NAME = `${GERANT.prenom} ${GERANT.nom}`;
// The app forces a brand-new install to create a gérant before it ever shows the
// login screen, and the "restore an existing shop" button only lives there. So a
// second register has to invent a throwaway account first. Named so it is
// obvious if it lingers.
const THROWAWAY = { prenom: 'Jetable', nom: 'Poste', pin: '9999' };
const RECOVERY = { email: 'amina.fotso@example.com', password: 'motdepasse-legwan' };
const PRODUCT = { nom: 'Riz parfumé 5kg', achat: '3000', vente: '4000', stock: '10' };

async function localValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate(k => localStorage.getItem(k), key);
}

test.beforeEach(async () => {
  await resetEmulators();
});

test('a second register joins the shop and both keep the stock exact, offline included', async ({ browser }) => {
  test.setTimeout(480_000);

  const contextA: BrowserContext = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Africa/Douala' });
  const contextB: BrowserContext = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Africa/Douala' });
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  const emulatorA = requireEmulatorMode(a);
  const emulatorB = requireEmulatorMode(b);

  try {
    // ── Register A creates the shop ──────────────────────────────────────────
    await completeOnboarding(a, GERANT);
    await loginAs(a, FULL_NAME, GERANT.pin);
    emulatorA();
    const shopId = await localValue(a, 'legwan-boutique-id');
    expect(shopId, 'register A has no shop identity').toBeTruthy();

    await createProduct(a, PRODUCT);
    await expect.poll(() => readStoredStock(shopId!, PRODUCT.nom), { timeout: 30_000 }).toBe(10);

    // Link the shop to an email and password - the prerequisite for any other register.
    await goTo(a, 'Paramètres');
    const recoveryCard = a.locator('[class*="nova-card"]').filter({ hasText: 'Sauvegarde et récupération cloud' }).first();
    await recoveryCard.locator('input[type="email"]').fill(RECOVERY.email);
    const passwords = recoveryCard.locator('input[type="password"]');
    await passwords.nth(0).fill(RECOVERY.password);
    await passwords.nth(1).fill(RECOVERY.password);
    await recoveryCard.getByRole('button', { name: /Activer la récupération/i }).click();
    await expect(recoveryCard.getByText('Récupération active')).toBeVisible({ timeout: 30_000 });

    // ── Register B: a fresh install joins it ─────────────────────────────────
    await completeOnboarding(b, THROWAWAY);
    await b.getByRole('button', { name: /Restaurer une boutique existante/i }).click();
    await b.locator('input[type="email"]').fill(RECOVERY.email);
    await b.locator('input[type="password"]').fill(RECOVERY.password);
    await b.getByRole('button', { name: /Restaurer cette boutique/i }).click();

    // The restore reloads the page; the gérant created on A must now be offered on B.
    await expect(b.locator('button').filter({ hasText: FULL_NAME }).first())
      .toBeVisible({ timeout: 60_000 });
    expect(await localValue(b, 'legwan-boutique-id'), 'register B did not join the same shop').toBe(shopId);

    // Observation, not an assertion: does the throwaway account survive the restore?
    const throwawayStillListed = await b.locator('button')
      .filter({ hasText: `${THROWAWAY.prenom} ${THROWAWAY.nom}` }).count();
    const boutiquesInProject = (await readCollection('boutiques')).length;
    console.log(`[observation] throwaway gérant still on B's login screen: ${throwawayStillListed > 0}`);
    console.log(`[observation] shops in the project after B joined: ${boutiquesInProject}`);

    await loginAs(b, FULL_NAME, GERANT.pin);
    emulatorB();

    // Each register numbers its own sales.
    const codeA = await localValue(a, 'legwan-register-code');
    const codeB = await localValue(b, 'legwan-register-code');
    expect(codeA).toBeTruthy();
    expect(codeB).toBeTruthy();
    expect(codeA, 'both registers share a register code - sale numbers could collide').not.toBe(codeB);

    await goTo(a, 'Point de vente');
    await goTo(b, 'Point de vente');
    await expect(b.getByText(PRODUCT.nom).first(), 'the product created on A never reached B')
      .toBeVisible({ timeout: 30_000 });

    // ── 1. Both online, both selling ─────────────────────────────────────────
    await sellForCash(a, PRODUCT.nom, 2);
    await sellForCash(b, PRODUCT.nom, 3);
    await expect.poll(() => readStoredStock(shopId!, PRODUCT.nom), {
      timeout: 30_000,
      message: 'concurrent online sales did not add up to 10 - 2 - 3',
    }).toBe(5);

    // ── 2. B loses the network and keeps selling; A sells online ─────────────
    // This is the case the delta design exists for. With absolute stock writes,
    // B coming back would overwrite A's sale and the shop would end on 4.
    await contextB.setOffline(true);
    await sellForCash(b, PRODUCT.nom, 1);
    await sellForCash(a, PRODUCT.nom, 1);
    await expect.poll(() => readStoredStock(shopId!, PRODUCT.nom), { timeout: 30_000 })
      .toBe(4);

    await contextB.setOffline(false);
    await expect.poll(() => readStoredStock(shopId!, PRODUCT.nom), {
      timeout: 90_000,
      message: 'after B reconnected the stock is not 3: offline and online sales did not both apply',
    }).toBe(3);

    // ── 3. Live sharing, seen on screen ──────────────────────────────────────
    // A sells the rest. B, without reloading or navigating, must show it sold out.
    await sellForCash(a, PRODUCT.nom, 3);
    await expect.poll(() => readStoredStock(shopId!, PRODUCT.nom), { timeout: 30_000 }).toBe(0);
    await expect(
      b.locator('[class*="nova-card"], button, div').filter({ hasText: PRODUCT.nom }).getByText(/Rupture/i).first(),
      'B never showed the product as sold out after A emptied the stock',
    ).toBeVisible({ timeout: 30_000 });

    // ── 4. Every sale landed, with distinct per-register numbers ────────────
    const sales = await readCollection(`boutiques/${shopId}/sales`);
    const numbers = sales.map(s => String(s.fields?.saleNumber?.stringValue ?? ''));
    expect(sales, 'not every sale reached Firestore').toHaveLength(5);
    expect(new Set(numbers).size, 'two sales share a number').toBe(numbers.length);
    expect(numbers.some(n => n.includes(`-${codeA}-`)), 'no sale carries register A\'s code').toBe(true);
    expect(numbers.some(n => n.includes(`-${codeB}-`)), 'no sale carries register B\'s code').toBe(true);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
