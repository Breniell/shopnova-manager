import { defineConfig } from '@playwright/test';

/**
 * Receipt rendering checks. No server and no emulator: these import
 * buildReceiptHtml directly and render its output with page.setContent, which is
 * the same Chromium layout step the app's print path goes through before the
 * Windows spooler hands the page to a printer driver.
 */
export default defineConfig({
  testDir: './tests/e2e-print',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  outputDir: 'demo-results/print',
  use: {
    // Its own port, not the 8099 the flows suite uses. Sharing one meant that
    // running the suites back to back raced: Playwright tears down the server it
    // started for flows, print sees the port still answering, reuses it through
    // reuseExistingServer, and the server then dies mid-test. Passing alone and
    // failing in sequence is exactly the kind of flake that erodes trust in a
    // suite, so the two are simply kept apart.
    baseURL: 'http://localhost:8098',
    headless: true,
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    screenshot: 'only-on-failure',
  },
  // A Vite dev server is needed only as a module server: buildReceiptHtml pulls
  // in the settings store and therefore firebase.ts, which reads
  // import.meta.env and cannot be imported outside Vite at all.
  //
  // It runs in emulator mode deliberately. The emulators need not be up - the
  // SDK simply stays offline - but the project id is then `demo-legwan`, which
  // Firebase refuses to resolve against production. So this suite cannot touch
  // the live shop database even by accident.
  webServer: {
    // Emulator mode still, so the project id is demo-legwan and this suite can
    // never reach the live database - the emulators themselves need not be up,
    // since no Firebase call happens on the receipt path.
    command: 'npx vite --mode emulator --port 8098 --strictPort',
    url: 'http://localhost:8098',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
