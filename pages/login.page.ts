import { expect, type Page } from "@playwright/test";

/**
 * The sign-in screen at `/login`.
 *
 * The page object only knows how to reach the screen and fill it; whether the
 * sign-in succeeded is the caller's business. That keeps the shared step in
 * `support/steps/sign-in.ts` the one place that decides what "signed in" means.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/login");
    await expect(this.page.getByTestId("login-page")).toBeVisible();
  }

  async signIn(credentials: { readonly email: string; readonly password: string }): Promise<void> {
    await this.page.getByTestId("auth-email").fill(credentials.email);
    await this.page.getByTestId("auth-password").fill(credentials.password);
    await this.page.getByTestId("auth-submit").click();
  }
}
