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
 * Walk a brand-new install through PolicyGate: read the policy, sign it, then
 * create the gérant account and its PIN.
 */
export async function completeOnboarding(page: Page, options: {
  prenom: string;
  nom: string;
  pin: string;
}): Promise<void> {
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

  await signature.fill(`${options.prenom} ${options.nom}`);

  // Two checkboxes render here: policy acceptance, then optional geolocation
  // consent. Only the first gates the button; leave geo off so tests never
  // depend on network geolocation.
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: /J'accepte et je continue/i }).click();

  await expect(page.getByText('Créez votre compte administrateur')).toBeVisible({ timeout: 30_000 });

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
