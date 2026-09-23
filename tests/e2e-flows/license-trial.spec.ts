/**
 * L'essai gratuit ne doit pas pouvoir repartir a zero.
 *
 * Defaut rapporte par le proprietaire : reinstaller renvoyait a 30 jours. La
 * cause n'etait pas la reinstallation - le stockage local y survit - mais
 * l'ancre d'essai elle-meme, qui vivait uniquement sur le poste, chiffree avec
 * une cle derivee d'un boutiqueId instable. Toute lecture qui echouait etait
 * traitee comme une premiere installation.
 *
 * Ce parcours verifie la seule chose qui ferme vraiment la faille : l'ancre est
 * posee sur la boutique, cote serveur, une fois pour toutes.
 */
import { test, expect } from '@playwright/test';
import {
  resetEmulators,
  completeOnboarding,
  loginAs,
  firstBoutiqueId,
  readCollection,
  requireEmulatorMode,
} from './flows-harness';

const GERANT = { prenom: 'Thomas', nom: 'Ekani', pin: '1234' };
const GERANT_NAME = `${GERANT.prenom} ${GERANT.nom}`;

/** Valeur brute de startedAt sur le document d'ancre, ou null. */
async function readTrialStart(boutiqueId: string): Promise<string | null> {
  const docs = await readCollection(`boutiques/${boutiqueId}/_license`);
  const trial = docs.find(d => d.name.endsWith('/trial'));
  return (trial?.fields?.startedAt?.timestampValue as string) ?? null;
}

test.beforeEach(async () => {
  await resetEmulators();
});

test('l\'ancre d\'essai est posee sur la boutique et survit a la perte du poste', async ({ page }) => {
  test.setTimeout(300_000);
  const assertEmulatorMode = requireEmulatorMode(page);

  await completeOnboarding(page, GERANT);
  await loginAs(page, GERANT_NAME, GERANT.pin);
  assertEmulatorMode();
  const boutiqueId = await firstBoutiqueId();

  // ── L'ancre part cote serveur des le premier lancement ────────────────────
  await expect.poll(
    async () => readTrialStart(boutiqueId!),
    { timeout: 30_000, message: 'l\'essai n\'est ancre que sur le poste : une reinstallation le relance' },
  ).not.toBeNull();

  const first = await readTrialStart(boutiqueId!);

  // ── Le poste perd son ancre : exactement le cas rapporte ──────────────────
  // On ne vide pas tout le stockage : cela effacerait aussi l'identite de la
  // boutique, donc l'application creerait une AUTRE boutique et un nouvel
  // essai serait legitime. Ici la boutique est la meme, seule l'ancre manque.
  await page.evaluate(() => localStorage.removeItem('legwan-install-date'));
  await page.reload();
  await expect(page.getByText(/Sélectionnez votre profil|Tableau de bord/).first())
    .toBeVisible({ timeout: 60_000 });

  // ── L'ancre du serveur n'a pas bouge ──────────────────────────────────────
  await expect.poll(
    async () => readTrialStart(boutiqueId!),
    { timeout: 30_000, message: 'l\'ancre d\'essai a ete reecrite : l\'essai serait reparti a zero' },
  ).toBe(first);

  // ── Et le poste l'a reprise, au lieu d'en inventer une neuve ──────────────
  const restored = await page.evaluate(() => localStorage.getItem('legwan-install-date'));
  expect(
    restored,
    'le poste n\'a pas recupere l\'ancre du serveur',
  ).toBeTruthy();

  const stillOne = (await readCollection(`boutiques/${boutiqueId}/_license`))
    .filter(d => d.name.endsWith('/trial'));
  expect(stillOne, 'plusieurs ancres d\'essai coexistent').toHaveLength(1);
});
