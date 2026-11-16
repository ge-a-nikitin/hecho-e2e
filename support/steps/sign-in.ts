import { expect, type Page } from "@playwright/test";
import { LoginPage } from "../../pages/login.page.js";
import { ROLE_CREDENTIALS, type Role } from "../env.js";
import type { Actor } from "../factory.js";

/**
 * Who signs in: a baseline role, or an actor the data factory created for this
 * case. A role is the plain string, an actor carries its own credentials.
 */
export type SignInTarget = Role | Actor;

/**
 * The sign-in step every case starts with.
 *
 * The caller names the user type and nothing else: for a role the credentials
 * come from `ROLE_CREDENTIALS` (the `.env.e2e` values the setup project uses
 * too), for an actor from the account the factory just created. The step
 * returns once that role's own panel is on screen, so a case can navigate from a
 * known place instead of guessing how long the redirect takes.
 */
export async function signInAs(page: Page, target: SignInTarget): Promise<void> {
  const credentials = typeof target === "string" ? ROLE_CREDENTIALS[target] : target;
  const panel = typeof target === "string" ? target : target.role.toLowerCase();
  const login = new LoginPage(page);

  await login.open();
  await login.signIn(credentials);
  await expect(page.getByTestId(`${panel}-panel`)).toBeVisible();
}
