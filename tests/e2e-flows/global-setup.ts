/**
 * Wait until BOTH emulators answer before any test runs.
 *
 * Playwright's webServer block can only watch one URL per entry, and
 * `firebase emulators:start` brings Firestore up before Auth. Watching Firestore
 * alone let the first test start while Auth was still binding, which surfaced as
 * `ECONNREFUSED 127.0.0.1:9099` from the reset helper - a confusing failure that
 * looks like a bug in the test rather than a race in the startup order.
 */
import { AUTH_EMULATOR, FIRESTORE_EMULATOR } from './flows-harness';

async function waitFor(name: string, url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'never attempted';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      // Any HTTP answer proves the port is bound and serving; the emulator root
      // may legitimately reply 404 or 501 depending on the service.
      if (response.status > 0) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(
    `The ${name} emulator never became ready at ${url} (last error: ${lastError}).\n`
    + 'Start it manually with "npm run emulators" to see why.',
  );
}

export default async function globalSetup(): Promise<void> {
  await waitFor('Firestore', FIRESTORE_EMULATOR);
  await waitFor('Auth', AUTH_EMULATOR);
}
