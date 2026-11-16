import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, IS_CI, QASE_MODE, TEST_ID_ATTRIBUTE } from "./support/env.js";

/**
 * Three projects: the setup project signs the baseline accounts in and stores
 * their cookies, and the two browser projects run the same tests on a desktop
 * viewport and on a Pixel 7. The suite is mobile-sensitive (sign-out and the
 * order card change shape), so a single desktop project would miss real defects.
 *
 * `workers: 1` is deliberate. The stack is one shared database: until the data
 * factory can guarantee that no two tests touch the same rows, running tests in
 * parallel trades a slower run for unexplained flakes.
 */
export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  globalSetup: "./support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["playwright-qase-reporter", { mode: QASE_MODE }],
  ],
  use: {
    baseURL: BASE_URL,
    testIdAttribute: TEST_ID_ATTRIBUTE,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\/.*\.setup\.ts/u,
    },
    {
      name: "chromium",
      testIgnore: /setup\//u,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "pixel-7",
      testIgnore: /setup\//u,
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
  ],
});
