import { test as base, expect } from "@playwright/test";
import { qase } from "playwright-qase-reporter";
import { statePath, type Role } from "./env.js";
import { DevtoolsClient } from "./devtools.js";
import { DataFactory } from "./factory.js";

interface SupportFixtures {
  readonly devtools: DevtoolsClient;
  readonly factory: DataFactory;
  /** Sentinel: labels every reported result, never read by a test. */
  readonly qaseViewport: void;
}

/**
 * The single test object every spec imports.
 *
 * `devtools` and `factory` prepare data over HTTP, so a case starts from the state
 * it needs without walking the UI first. Sessions stay out of the fixtures on
 * purpose: `test.use(sessionOf.customer)` in a describe block keeps the project's
 * device emulation, while a second browser context created by hand would quietly
 * fall back to the desktop viewport and hide responsive defects.
 */
export const test = base.extend<SupportFixtures>({
  // Both browser projects run the same cases, so one case has two results in one
  // TestOps run. Without a distinguishing parameter TestOps stores them as one
  // row and keeps a single status for the pair — a failure on the Pixel 7 then
  // reads as if the case had failed everywhere, and the desktop result is gone.
  // The parameter splits the row in two (`docs/qase.md`, measured on run 63).
  qaseViewport: [
    async ({}, use, testInfo) => {
      qase.parameters({ Viewport: testInfo.project.name });
      await use(undefined);
    },
    { auto: true },
  ],

  devtools: async ({}, use) => {
    await use(new DevtoolsClient());
  },

  factory: async ({ devtools }, use) => {
    await use(new DataFactory(devtools));
  },
});

/** Saved session of a baseline account, ready for `test.use`. */
export const sessionOf = {
  admin: { storageState: statePath("admin") },
  customer: { storageState: statePath("customer") },
  executor: { storageState: statePath("executor") },
} as const satisfies Record<Role, { storageState: string }>;

export { expect };

