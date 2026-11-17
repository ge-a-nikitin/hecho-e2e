import { PanelPage } from "../../pages/panel.page.js";
import { qc } from "../../qase/qc.js";
import { expect, sessionOf, test } from "../../support/fixtures.js";

/**
 * The screen guard every panel applies to its own route.
 *
 * A customer who types `/admin` is not shown a stripped panel and not shown an
 * error: the router sends them to `/login` once the session loads
 * (`docs/sut/quirks.md:34-35`), so the assertion is the URL. The last step walks
 * the customer's own panel, which proves the redirect came from the role and not
 * from a broken session.
 *
 * The rest of the access-control slice is asserted at the API level, where the
 * same rules are enforced for every client (`docs/strategy.md:41`), and the web
 * layer pins the role checks it can see.
 */
test.describe("Access control", () => {
  test.use(sessionOf.customer);

  test(
    qc("guards.ui.foreign-panel", "Redirects a role away from another role's panel"),
    { tag: "@regression" },
    async ({ page }) => {
      const panel = new PanelPage(page);

      // A signed-in visitor with the wrong role is sent to their own panel, not to
      // the sign-in form (`app.tsx:329-332`); `/login` is what a browser without a
      // session gets (`app.tsx:328`), which is the sign-out case's assertion.
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/customer$/u);
      await expect(panel.panel("admin")).toBeHidden();

      await page.goto("/executor");
      await expect(page).toHaveURL(/\/customer$/u);
      await expect(panel.panel("executor")).toBeHidden();

      await panel.open("customer");
      await expect(panel.panel("customer")).toBeVisible();
    },
  );
});
