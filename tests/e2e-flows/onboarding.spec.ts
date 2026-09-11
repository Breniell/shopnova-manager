/**
 * The path every brand-new shop takes: accept the policy, create the gérant,
 * land on the login screen, and sign in.
 *
 * Runs against the Firebase emulator suite, so it exercises the real Firestore
 * writes and the real security rules in firestore.rules without touching
 * legwan-82a09, the live shop database.
 */
import { test, expect } from '@playwright/test';
import { resetEmulators, completeOnboarding, loginAs } from './flows-harness';

const GERANT = { prenom: 'Amina', nom: 'Fotso', pin: '1234' };
const FULL_NAME = `${GERANT.prenom} ${GERANT.nom}`;

test.beforeEach(async () => {
  await resetEmulators();
});

test('a new shop can be set up and the gérant can sign in', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await completeOnboarding(page, GERANT);

  // The account just created is offered as a profile on the login screen.
  await expect(page.locator('button').filter({ hasText: FULL_NAME }).first()).toBeVisible();

  await loginAs(page, FULL_NAME, GERANT.pin);

  // Landing inside the app means Firestore accepted the boutique and the user.
  await expect(page.locator('aside').getByText('Tableau de bord')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('aside').getByText('Point de vente')).toBeVisible();

  expect(consoleErrors, 'onboarding logged console errors').toEqual([]);
});
