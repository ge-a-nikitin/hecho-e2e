import { expect, type Page } from "@playwright/test";

/**
 * `/register`: the one screen that creates a customer account.
 *
 * Registration is open to a visitor, and the account it creates is always a
 * customer (`docs/sut/domain.md:15`). The step returns once the app has left the
 * form, so a case can assert what that role's panel shows next.
 */
export class RegisterPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/register");
    await expect(this.page.getByTestId("register-page")).toBeVisible();
  }

  async register(input: {
    readonly name: string;
    readonly email: string;
    readonly password: string;
  }): Promise<void> {
    await this.page.getByTestId("auth-name").fill(input.name);
    await this.page.getByTestId("auth-email").fill(input.email);
    await this.page.getByTestId("auth-password").fill(input.password);
    await this.page.getByTestId("auth-submit").click();
  }
}
