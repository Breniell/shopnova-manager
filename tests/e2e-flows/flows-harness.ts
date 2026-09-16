/**
 * Helpers for driving Legwan's business flows against the Firebase emulator.
 *
 * These exist so a run starts from a genuinely empty shop every time: emulator
 * data is wiped, and Playwright gives each test a fresh browser context, so
 * localStorage (where the policy acceptance and the pending-admin handoff live)
 * starts empty too. Without both, the second test would find the first test's
 * boutique and silently take a different path through onboarding.
 */
import { expect, type Page } from '@playwright/test';
export type { Page };

export const EMULATOR_PROJECT = 'demo-legwan';
export const FIRESTORE_EMULATOR = 'http://127.0.0.1:8181';
export const AUTH_EMULATOR = 'http://127.0.0.1:9099';

/** Wipe every document and auth account the emulators hold. */
export async function resetEmulators(): Promise<void> {
  const responses = await Promise.all([
    fetch(`${FIRESTORE_EMULATOR}/emulator/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents`, { method: 'DELETE' }),
    fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${EMULATOR_PROJECT}/accounts`, { method: 'DELETE' }),
  ]);
  for (const response of responses) {
    if (!response.ok) {
      throw new Error(`Emulator reset failed: ${response.status} ${response.statusText} (${response.url})`);
    }
  }
}

/**
 * Fail loudly if the page under test is not actually wired to the emulator.
 *
 * This is a safety interlock, not a nicety. `.env` carries the credentials for
 * legwan-82a09 - the live shop database - and a flows run that quietly used them
 * would write test boutiques and test sales into real data. It has already gone
 * wrong once: command-line overrides lost to `.env`, the app connected under the
 * production project id, and every assertion reported "nothing was saved" while
 * the writes went somewhere else entirely.
 *
 * Attach before the first navigation; call the returned function afterwards.
 */
export function requireEmulatorMode(page: Page): () => void {
  let announced = false;
  page.on('console', message => {
    if (message.text().includes('Firebase emulators active')) announced = true;
  });
  return () => {
    if (!announced) {
      throw new Error(
        'The app never announced emulator mode, so it was NOT talking to the '
        + 'emulator suite. Refusing to trust this run. Start the dev server with '
        + '"npm run dev:emulator" (which loads .env.emulator).',
      );
    }
  };
}

/**
 * Simulate "no internet" by blocking Firebase, and Firebase only.
 *
 * context.setOffline(true) is too blunt here. In dev the app's routes are
 * React.lazy chunks fetched from the Vite server on navigation, so cutting all
 * traffic also cuts the module server and the app dies with "Failed to fetch
 * dynamically imported module" - an artefact of the harness that does not exist
 * in the packaged app, where every chunk is already on disk.
 *
 * Blocking the emulator endpoints reproduces the condition that actually
 * matters: Firestore and Auth unreachable, which is precisely what the licence
 * clock probe and the licence save hit when a shop has no connection.
 */
export async function cutFirebaseNetwork(page: Page): Promise<void> {
  await page.route('**/*', route => {
    const url = route.request().url();
    const blocked = url.includes('127.0.0.1:8181')
      || url.includes('127.0.0.1:9099')
      || url.includes('localhost:8181')
      || url.includes('localhost:9099')
      || url.includes('googleapis.com')
      || url.includes('firebaseio.com');
    return blocked ? route.abort('internetdisconnected') : route.continue();
  });
}

interface FirestoreDocument {
  name: string;
  fields?: Record<string, Record<string, unknown>>;
}

/**
 * Read a Firestore collection straight from the emulator.
 *
 * Asserting on the UI alone cannot distinguish "saved" from "rendered
 * optimistically and lost", which is exactly the class of bug that matters in an
 * offline-first app with a retry outbox. This looks at what was actually stored.
 */
export async function readCollection(collectionPath: string): Promise<FirestoreDocument[]> {
  const url = `${FIRESTORE_EMULATOR}/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents/${collectionPath}`;
  // "Bearer owner" is the emulator's admin credential; without it these reads
  // come back 403 "Metadata operations require admin authentication". An earlier
  // version swallowed that failure and returned an empty array, which read as
  // "nothing was ever saved" and sent the investigation chasing a persistence
  // bug that did not exist. Never hide a failed read behind an empty result.
  const response = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!response.ok) {
    throw new Error(
      `Firestore emulator read failed for ${collectionPath}: `
      + `${response.status} ${response.statusText} - ${await response.text()}`,
    );
  }
  const body = await response.json() as { documents?: FirestoreDocument[] };
  return body.documents ?? [];
}

/** Id of the single boutique an onboarding run creates. */
export async function firstBoutiqueId(): Promise<string | null> {
  const boutiques = await readCollection('boutiques');
  return boutiques[0]?.name.split('/').pop() ?? null;
}

/**
 * Read and sign the privacy policy, landing on the admin-setup screen.
 *
 * Shared by the two ways a fresh install can go from here: creating the first
 * gérant, or joining a shop that already exists.
 */
export async function acceptPolicy(page: Page, signatureName: string): Promise<void> {
  await page.goto('/');

  // The acceptance controls only mount once the policy has been scrolled to the
  // end, which is the whole point of the gate - so scroll it for real rather
  // than forcing the state. Drive the page's own "scroll down" affordance:
  // page.mouse.wheel targets whatever sits under the cursor, which is not the
  // scrollable policy container, so it moves nothing.
  // The gate watches the container's own scroll position
  // (scrollHeight - scrollTop - clientHeight < 40), so driving scrollTop fires
  // the real handler and satisfies it honestly. The page's own button moves
  // 300px per click with smooth behaviour, which would need dozens of clicks;
  // page.mouse.wheel moves nothing because it targets whatever is under the
  // cursor rather than this container.
  const signature = page.getByPlaceholder('Jean-Paul Nkomo');
  const policyScroller = page.locator('div[class*="overflow-y-auto"]').first();
  await expect(async () => {
    await policyScroller.evaluate(element => {
      element.scrollTo({ top: element.scrollHeight, behavior: 'instant' as ScrollBehavior });
    });
    await expect(signature).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });

  await signature.fill(signatureName);

  // Two checkboxes render here: policy acceptance, then optional geolocation
  // consent. Only the first gates the button; leave geo off so tests never
  // depend on network geolocation.
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: /J'accepte et je continue/i }).click();

  await expect(page.getByText('Créez votre compte administrateur')).toBeVisible({ timeout: 30_000 });
}

/**
 * Walk a brand-new install through PolicyGate: read the policy, sign it, then
 * create the gérant account and its PIN.
 */
export async function completeOnboarding(page: Page, options: {
  prenom: string;
  nom: string;
  pin: string;
}): Promise<void> {
  await acceptPolicy(page, `${options.prenom} ${options.nom}`);

  // getByLabel cannot be used here: the labels carry no htmlFor and the inputs
  // no id, so nothing associates them. Positional it is - this screen renders
  // exactly two text inputs, prénom then nom.
  const nameInputs = page.locator('input.nova-input');
  await expect(nameInputs).toHaveCount(2);
  await nameInputs.nth(0).fill(options.prenom);
  await nameInputs.nth(1).fill(options.nom);

  // The keypad only appears once both names are filled.
  await expect(page.getByText('Choisissez votre code PIN (4 chiffres)')).toBeVisible({ timeout: 10_000 });
  await typePin(page, options.pin);
  await expect(page.getByText('Confirmez votre code PIN')).toBeVisible({ timeout: 10_000 });
  await typePin(page, options.pin);

  // FirebaseProvider now creates the boutique and the admin, then routes to login.
  await expect(page.getByText(/Sélectionnez votre profil/i)).toBeVisible({ timeout: 60_000 });
}

/**
 * Join a shop that already exists, from a brand-new install.
 *
 * The restore option now sits on the admin-setup screen. Before that it existed
 * only on the login screen, which a fresh install could not reach without first
 * inventing a gérant - and that throwaway account created a shop of its own that
 * stayed orphaned in the project.
 */
export async function joinExistingShop(page: Page, credentials: {
  email: string; password: string; signatureName?: string;
}): Promise<void> {
  await acceptPolicy(page, credentials.signatureName ?? 'Nouveau Poste');

  await page.getByRole('button', { name: /Restaurer une boutique existante/i }).click();
  await page.locator('input[type="email"]').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.getByRole('button', { name: /Restaurer cette boutique/i }).click();

  // The page reloads into the restored shop's own login screen.
  await expect(page.getByText(/Sélectionnez votre profil/i)).toBeVisible({ timeout: 60_000 });
}

/** Press digits on the on-screen keypad, which is the only way in. */
export async function typePin(page: Page, pin: string): Promise<void> {
  for (const digit of pin.split('')) {
    await page.locator('button').filter({ hasText: new RegExp(`^${digit}$`) }).first().click();
  }
}

/** Pick a profile on the login screen and unlock it with its PIN. */
export async function loginAs(page: Page, fullName: string, pin: string): Promise<void> {
  await expect(page.getByText(/Sélectionnez votre profil/i)).toBeVisible({ timeout: 60_000 });
  await page.locator('button').filter({ hasText: fullName }).first().click();
  await typePin(page, pin);
  await expect(page.getByText(/Sélectionnez votre profil/i)).toBeHidden({ timeout: 30_000 });
}

/** Click a sidebar entry by its visible label. */
export async function goTo(page: Page, label: string): Promise<void> {
  await page.locator('nav a, aside a').filter({ hasText: label }).first().click();
}

/**
 * Create a product through the Produits page, as a gérant would.
 *
 * Ticking "négociable" inserts the floor and target fields between the prices
 * and the stock, so the number inputs shift: that is why the indices differ
 * between the two branches rather than being written once.
 */
export async function createProduct(page: Page, product: {
  nom: string; achat: string; vente: string; stock: string;
  negociable?: boolean; plancher?: string;
}): Promise<void> {
  await goTo(page, 'Produits');
  await page.getByRole('button', { name: /Ajouter un produit/i }).first().click();
  const modal = page.locator('[class*="nova-card"]').filter({ has: page.locator('input') }).last();
  await modal.locator('input[type="text"]').first().fill(product.nom);
  const numbers = () => modal.locator('input[type="number"]');
  await numbers().nth(0).fill(product.achat);
  await numbers().nth(1).fill(product.vente);

  if (product.negociable) {
    await modal.getByText(/Prix négociable à la caisse/i).click();
    await expect(numbers().nth(4)).toBeVisible();
    if (product.plancher) await numbers().nth(2).fill(product.plancher);
    await numbers().nth(4).fill(product.stock);
  } else {
    await numbers().nth(2).fill(product.stock);
  }

  await modal.locator('button').filter({ hasText: /^(Ajouter|Enregistrer)/ }).last().click();
  await expect(page.getByText(product.nom).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Sell `quantity` units of one product for cash through the till, then close
 * the receipt so the next sale starts from an empty cart.
 */
export async function sellForCash(page: Page, productName: string, quantity: number): Promise<void> {
  await page.getByText(productName).first().click();
  for (let i = 1; i < quantity; i++) {
    await page.getByRole('button', { name: new RegExp(`Augmenter quantité de ${productName}`) }).first().click();
  }
  await page.getByPlaceholder(/Montant reçu/i).fill('1000000');
  const validate = page.locator('button').filter({ hasText: /Valider la vente/i }).first();
  await expect(validate).toBeEnabled();
  await validate.click();
  await expect(page.getByText(/Reçu\s*:|Reçu n/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Fermer$/ }).first().click();
  await expect(page.getByText(/Panier vide/i).first()).toBeVisible({ timeout: 15_000 });
}

/** Create a user from Paramètres › Utilisateurs, as a gérant would. */
export async function createUser(page: Page, user: {
  prenom: string; nom: string; role: 'gérant' | 'caissier'; pin: string;
}): Promise<void> {
  await goTo(page, 'Paramètres');
  // getByRole normalises whitespace: these tab buttons carry an icon before the
  // label, so their textContent is " Utilisateurs" and an anchored hasText regex
  // silently never matches.
  await page.getByRole('button', { name: /Utilisateurs/ }).first().click();
  await page.getByRole('button', { name: /Ajouter un utilisateur/i }).first().click();

  const modal = page.locator('[class*="nova-card"]').filter({ hasText: 'Nouvel utilisateur' }).last();
  const texts = modal.locator('input[type="text"]');
  await texts.nth(0).fill(user.prenom);
  await texts.nth(1).fill(user.nom);
  await modal.locator('select').first().selectOption(user.role);
  const pins = modal.locator('input[type="password"]');
  await pins.nth(0).fill(user.pin);
  await pins.nth(1).fill(user.pin);
  // The modal's submit button reuses the settings.users.add label, so it reads
  // "Ajouter un utilisateur" - the same words as the button that opened it.
  // Scoping to the modal is what keeps them apart.
  await modal.getByRole('button', { name: /Ajouter un utilisateur/i }).last().click();

  await expect(page.getByText(`${user.prenom} ${user.nom}`).first()).toBeVisible({ timeout: 30_000 });
}

/** Sign the current user out, back to the profile picker. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Déconnexion/i }).first().click();
  await expect(page.getByText(/Sélectionnez votre profil/i)).toBeVisible({ timeout: 30_000 });
}

/** Open a cash session with the given float; required before a caissier can sell. */
export async function openCashSession(page: Page, fond = '10000'): Promise<void> {
  const openButton = page.locator('button').filter({ hasText: /Ouvrir une session/i }).first();
  if (await openButton.isVisible().catch(() => false)) await openButton.click();
  await expect(page.getByText(/Ouvrir la session/i).first()).toBeVisible({ timeout: 30_000 });
  await page.locator('input[type="number"]').first().fill(fond);
  await page.locator('button').filter({ hasText: /Démarrer la session/i }).first().click();
  await expect(page.getByText(/Panier/i).first()).toBeVisible({ timeout: 30_000 });
}

/** Stock of a product as stored in Firestore, or null if absent. */
export async function readStoredStock(boutiqueId: string, productName: string): Promise<number | null> {
  const products = await readCollection(`boutiques/${boutiqueId}/products`);
  const match = products.find(p => p.fields?.nom?.stringValue === productName);
  if (!match) return null;
  const raw = match.fields?.stock?.integerValue ?? match.fields?.stock?.doubleValue;
  return raw === undefined ? null : Number(raw);
}
