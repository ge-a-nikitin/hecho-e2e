import { expect, type Locator, type Page } from "@playwright/test";

/** The three workspaces the SPA renders, as the route segment spells them. */
export type PanelRole = "customer" | "executor" | "admin";

/**
 * A signed-in workspace: the shell every screen of a role lives inside.
 *
 * It knows the navigation, the profile link and the two sign-out buttons. The
 * sign-out pair is always in the DOM and only one of them is visible — `sign-out`
 * on wide screens, `mobile-sign-out` on a phone (`docs/sut/routes.md:51-62`) — so
 * the action filters by visibility instead of guessing from the project name.
 */
export class PanelPage {
  constructor(private readonly page: Page) {}

  panel(role: PanelRole): Locator {
    return this.page.getByTestId(`${role}-panel`);
  }

  /** Opens the role's order list and waits for its shell. */
  async open(role: PanelRole): Promise<void> {
    await this.page.goto(`/${role}`);
    await expect(this.panel(role)).toBeVisible();
  }

  /** Reloads the current screen; the shell has to survive it. */
  async reload(role: PanelRole): Promise<void> {
    await this.page.reload();
    await expect(this.panel(role)).toBeVisible();
  }

  async openProfile(role: PanelRole): Promise<void> {
    await this.page.getByTestId("panel-profile-link").click();
    await expect(this.page.getByTestId("profile-page")).toBeVisible();
    await expect(this.page).toHaveURL(new RegExp(`/${role}/profile$`, "u"));
  }

  async openCategories(): Promise<void> {
    await this.page.getByTestId("panel-categories-link").click();
    await expect(this.page.getByTestId("admin-categories")).toBeVisible();
  }

  async openUsers(): Promise<void> {
    await this.page.getByTestId("panel-users-link").click();
    await expect(this.page.getByTestId("admin-users")).toBeVisible();
  }

  /** Ends the session and returns to the landing page, which offers sign-in again. */
  async signOut(): Promise<void> {
    await this.page
      .getByTestId(/^(?:mobile-)?sign-out$/u)
      .filter({ visible: true })
      .click();
    await expect(this.page.getByTestId("landing-page")).toBeVisible();
    await expect(this.page).toHaveURL(/\/$/u);
  }
}
