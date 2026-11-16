import { config } from "dotenv";
import path from "node:path";

/**
 * One place that reads the environment, so the Playwright config, the global
 * setup, the fixtures and the tests never disagree about an origin or a mode.
 *
 * `.env.e2e` is optional: every value below has the default the compose file
 * uses, which keeps `pnpm e2e` working in a fresh clone.
 */
config({ path: path.resolve(process.cwd(), ".env.e2e"), quiet: true });

/** Browser-facing origin of the stack; the only origin Better Auth trusts. */
export const BASE_URL = text("BASE_URL", "http://127.0.0.1:7200").replace(/\/+$/u, "");

/** API origin as the browser sees it: the web container proxies /api. */
export const API_URL = text("API_URL", `${BASE_URL}/api`).replace(/\/+$/u, "");

/** Locator attribute the SUT guarantees; docs/conventions.md forbids every other selector. */
export const TEST_ID_ATTRIBUTE = "data-testid";

export const IS_CI = process.env.CI === "true" || process.env.CI === "1";

/** `off` keeps local and pull-request runs offline; `testops` publishes a run. */
export const QASE_MODE = text("QASE_MODE", "off");

/** auto starts the stack on demand, attach requires it, off skips every check. */
export const STACK_MODE = pick("E2E_STACK", "auto", ["auto", "attach", "off"]);

/** run resets the database once per run; never keeps whatever is there. */
export const RESET_MODE = pick("E2E_RESET", "run", ["run", "never"]);

/** The devtools reset destroys data, so a non-loopback target is opt-in only. */
export const ALLOW_REMOTE = flag("E2E_ALLOW_REMOTE", false);

export const DEVTOOLS_API_KEY = text(
  "E2E_DEVTOOLS_API_KEY",
  "e2e-devtools-key-at-least-32-characters",
);

export const ADMIN_EMAIL = text("E2E_ADMIN_EMAIL", "admin@example.test");
export const ADMIN_PASSWORD = text("E2E_ADMIN_PASSWORD", "e2e-admin-password");

/** Baseline accounts the setup project creates; tests share them read-only. */
export const ROLE_CREDENTIALS = {
  admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  customer: {
    email: text("E2E_CUSTOMER_EMAIL", "e2e.customer@example.test"),
    password: text("E2E_PASSWORD", "e2e-account-password"),
  },
  executor: {
    email: text("E2E_EXECUTOR_EMAIL", "e2e.executor@example.test"),
    password: text("E2E_PASSWORD", "e2e-account-password"),
  },
} as const satisfies Record<string, { email: string; password: string }>;

export type Role = keyof typeof ROLE_CREDENTIALS;

export const ROLES = ["admin", "customer", "executor"] as const satisfies readonly Role[];

/** Where the setup project stores the signed-in cookies of each role. */
export const STATE_DIR = path.resolve(process.cwd(), ".auth");

export function statePath(role: Role): string {
  return path.join(STATE_DIR, `${role}.json`);
}

/** Host of a URL, used by the safety check that guards the destructive reset. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error(`"${url}" is not an absolute URL: BASE_URL must include the scheme and host.`);
  }
}

export function isLoopback(url: string): boolean {
  const host = hostOf(url);
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

function text(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? fallback : value;
}

function pick<T extends string>(name: string, fallback: T, allowed: readonly T[]): T {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") return fallback;
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")}, got "${value}".`);
  }
  return value as T;
}

function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  return value === "1" || value === "true" || value === "yes";
}
