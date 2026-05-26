import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 300000,
  use: {
    baseURL: "http://localhost:8080",
    headless: false,
    viewport: { width: 1280, height: 800 },
    video: "on",
    screenshot: "on",
    locale: "fr-FR",
    timezoneId: "Africa/Douala",
  },
  reporter: [["list"], ["html", { outputFolder: "demo-report", open: "never" }]],
  outputDir: "demo-results",
});
