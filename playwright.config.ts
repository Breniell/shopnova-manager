import { defineConfig } from "@playwright/test";

const headless = process.env.PLAYWRIGHT_HEADLESS
  ? process.env.PLAYWRIGHT_HEADLESS !== "false"
  : false;

export default defineConfig({
  testDir: "./tests",
  timeout: 300000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    headless,
    viewport: { width: 1280, height: 800 },
    video: "on",
    screenshot: "on",
    locale: "fr-FR",
    timezoneId: "Africa/Douala",
  },
  reporter: [["list"], ["html", { outputFolder: "demo-report", open: "never" }]],
  outputDir: "demo-results",
});
