import { defineConfig } from '@playwright/test';

/**
 * Separate from playwright.config.ts on purpose.
 *
 * That config drives the marketing demo against a Vite dev server on
 * localhost:8080 and records video of every step. These tests drive the real
 * packaged Electron binary instead: there is no baseURL to attach to, and video
 * capture does not apply to an Electron main process. Keeping them apart means
 * "npm run demo" and "npm run e2e:electron" cannot disturb each other.
 *
 * Runs serially: each test launches the packaged app and temporarily rewrites
 * resources/app-update.yml, which is shared state inside release/win-unpacked.
 */
export default defineConfig({
  testDir: './tests/e2e-electron',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'demo-results/electron',
});
