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
    baseURL: 'http://localhost:8099',
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
    command: 'npm run dev:emulator',
    url: 'http://localhost:8099',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
