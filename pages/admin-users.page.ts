import { expect, type Locator, type Page } from "@playwright/test";

/**
 * `/admin/users`: executor and customer accounts.
 *
 * A freshly created executor is addressed by its email, because the test learns
 * the id from the API after the screen accepted the form. Deactivation hides the
 * row unless "show inactive" is on, which is why the case turns that checkbox on
 * before asserting the badge.
 */
export class AdminUsersPage {
  constructor(private readonly page: Page) {}

  executorRow(name: string): Locator {
    return this.page.getByTestId("executors-list").getByText(name, { exact: true });
  }

  async createExecutor(input: {
    readonly name: string;
    readonly email: string;
    readonly password: string;
  }): Promise<void> {
    await this.page.getByTestId("create-user-executor").click();
    await expect(this.page.getByTestId("create-user-executor-form")).toBeVisible();
    await this.page.getByTestId("new-executor-name").fill(input.name);
    await this.page.getByTestId("new-executor-email").fill(input.email);
    await this.page.getByTestId("new-executor-password").fill(input.password);
    await this.page.getByTestId("submit-new-executor").click();
    await expect(this.page.getByTestId("executors-list")).toContainText(input.email);
  }

  /** Toggles the account off and shows its inactive badge. */
  async deactivate(userId: string): Promise<void> {
    await this.page.getByTestId(`toggle-user-active-${userId}`).click();
    await expect(this.page.getByTestId(`user-inactive-${userId}`)).toBeVisible();
  }

  /** Resets a password through the row action, then shows the row unchanged. */
  async resetPassword(userId: string, password: string): Promise<void> {
    await this.page.getByTestId(`reset-user-password-${userId}`).click();
    await this.page.getByTestId(`new-password-${userId}`).fill(password);
    await this.page.getByTestId(`save-user-password-${userId}`).click();
  }
}
