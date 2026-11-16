import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { saveSignedInState } from "../../support/auth.js";
import { DevtoolsClient, type UserRole } from "../../support/devtools.js";
import { ROLE_CREDENTIALS, ROLES, type Role } from "../../support/env.js";

/**
 * Prepares the sessions every browser project reuses.
 *
 * The administrator exists because the global setup reset recreated it from
 * ADMIN_EMAIL/ADMIN_PASSWORD; the customer and the executor are created here so a
 * test can rely on both roles without inventing an account. `ensureUser` repairs
 * an account left behind by a previous run with E2E_RESET=never.
 */
const API_ROLES = {
  admin: "ADMIN",
  customer: "CUSTOMER",
  executor: "EXECUTOR",
} as const satisfies Record<Role, UserRole>;

for (const role of ROLES) {
  test(`signs the baseline ${role} in and stores the session`, async () => {
    const credentials = ROLE_CREDENTIALS[role];

    await new DevtoolsClient().ensureUser(API_ROLES[role], credentials.email, credentials.password);
    const file = await saveSignedInState(role, credentials);
    const state = JSON.parse(readFileSync(file, "utf8")) as { cookies?: { name: string }[] };

    expect(state.cookies ?? []).not.toHaveLength(0);
  });
}
