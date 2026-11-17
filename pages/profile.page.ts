import { expect, type Page } from "@playwright/test";

/**
 * `<panel>/profile` for any role: name, email, password and — for an executor —
 * the hourly rate (`docs/sut/routes.md:25`).
 *
 * The profile form refuses to submit without the current password
 * (`users.service.ts:132-144`), so every method that changes an identity field
 * takes it. Methods stop at "the form was submitted"; the spec asserts what the
 * account looks like afterwards.
 */
export class ProfilePage {
  constructor(private readonly page: Page) {}

  async expectOpen(): Promise<void> {
    await expect(this.page.getByTestId("profile-page")).toBeVisible();
  }

  /** Renames the account; returns once the request settled, which clears the password field. */
  async rename(name: string, currentPassword: string): Promise<void> {
    await this.page.getByTestId("profile-name").fill(name);
    await this.page.getByTestId("profile-current-password").fill(currentPassword);
    await expect(this.page.getByTestId("save-profile")).toBeEnabled();
    await this.page.getByTestId("save-profile").click();
  }

  async reemail(email: string, currentPassword: string): Promise<void> {
    await this.page.getByTestId("profile-email").fill(email);
    await this.page.getByTestId("profile-current-password").fill(currentPassword);
    await this.page.getByTestId("save-profile").click();
  }

  /** Only an executor has the rate card, which is what `profile.executor.rate-read` proves. */
  async saveHourlyRate(rate: number): Promise<void> {
    await this.page.getByTestId("profile-hourly-rate").fill(String(rate));
    await this.page.getByTestId("save-hourly-rate").click();
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.page.getByTestId("password-current").fill(current);
    await this.page.getByTestId("password-new").fill(next);
    await this.page.getByTestId("password-confirm").fill(next);
    await this.page.getByTestId("change-password").click();
  }
}
