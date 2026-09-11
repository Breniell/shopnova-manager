import { defineConfig } from '@playwright/test';

/**
 * Business-flow tests (gérant, caissier) against the Firebase emulator suite.
 *
 * Separate from the other two configs because this one needs a whole stack up
 * before a test can run: the emulators, then a Vite dev server pointed at them.
 * Playwright starts both and tears them down.
 *
 * The project id is `demo-legwan` on purpose. Firebase treats a `demo-` prefix
 * as guaranteed-offline: the SDKs refuse to contact production for such a
 * project even if a real API key were somehow present. So a misconfiguration
 * here fails loudly rather than quietly writing into legwan-82a09, which is the
 * live shop database.
 *
 * Firestore listens on 8181 because the dev server already owns 8080.
 */
export default defineConfig({
  testDir: './tests/e2e-flows',
  globalSetup: './tests/e2e-flows/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'demo-results/flows',
  use: {
    // Not 8080: that is the project's usual dev port, but it is commonly taken
    // by other software (an Apache/EDB Postgres install holds it on the current
    // machine). Playwright's reuseExistingServer then sees a healthy HTTP reply
    // there and runs the whole suite against a stranger's web server, which
    // fails in baffling ways. dev:emulator passes --strictPort so a clash is a
    // loud startup error instead of a silent port change.
    baseURL: 'http://localhost:8099',
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run emulators',
      // The Firestore emulator answers on its own port once ready; this does not
      // depend on the optional emulator UI being enabled.
      url: 'http://127.0.0.1:8181',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:emulator',
      url: 'http://localhost:8099',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
