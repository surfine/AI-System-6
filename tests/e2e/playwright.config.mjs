import { defineConfig, devices } from "@playwright/test";

/**
 * A dedicated port (default 4199) keeps the e2e server away from the app's
 * 4173, which other local tooling may occupy. PORT is passed on the command
 * line rather than through a custom env so the app server always sees it.
 * Override with E2E_PORT for CI or when a fixed port is required.
 */
const e2ePort = Number(process.env.E2E_PORT || 4199);

/**
 * Real-browser end-to-end tests for AI System 6.
 *
 * The suite boots the real app through `npm start` and drives the DOM, the
 * IndexedDB persistence layer, and the local HTTP server — not source
 * strings. Browser matrix — all three use Playwright's own managed browser
 * builds (never a system Chrome channel), so local runs and CI runs are the
 * same binaries:
 *
 *   - chromium-desktop: Playwright Chromium, desktop viewport
 *   - webkit-desktop:   Playwright WebKit, desktop viewport
 *   - iphone-webkit:    Playwright WebKit with an iPhone viewport (mobile
 *                       spec only)
 *
 * Run locally with:
 *   npx playwright install chromium webkit
 *   npx playwright test --config tests/e2e/playwright.config.mjs
 *
 * CI runs each project as its own job with workers: 1 (kept here too) so a
 * heavy browser never competes with another for memory.
 */

export default defineConfig({
  testDir: ".",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chromium"] },
      testIgnore: /mobile\.spec\.mjs$/,
    },
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"] },
      testIgnore: /mobile\.spec\.mjs$/,
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 13"] },
      testMatch: /mobile\.spec\.mjs$/,
    },
  ],
  webServer: {
    command: `PORT=${e2ePort} npm start`,
    url: `http://127.0.0.1:${e2ePort}`,
    cwd: "../..",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
