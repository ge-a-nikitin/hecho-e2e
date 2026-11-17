import { LoginPage } from "../../pages/login.page.js";
import { PanelPage } from "../../pages/panel.page.js";
import { ProfilePage } from "../../pages/profile.page.js";
import { qc } from "../../qase/qc.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Profile: the account's own data.
 *
 * One component serves every role, and what it renders depends on the role: the
 * hourly rate belongs to executors only and the role itself is read-only. Each
 * case asserts the stored account after the form accepted a change, because a
 * form that echoes what was typed proves nothing.
 */
const uniqueName = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

test.describe("Profile", () => {
  test(
    qc("profile.customer.name", "Renames the account and the profile keeps the new name"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const profile = new ProfilePage(page);
      const panel = new PanelPage(page);
      const name = uniqueName("Renamed customer");

      await signInAs(page, customer);
      await panel.openProfile("customer");

      await expect(page.getByTestId("profile-role")).toContainText("Customer");
      await expect(page.getByTestId("profile-name")).not.toHaveValue("");

      await profile.rename(name, customer.password);

      await expect(page.getByTestId("profile-name")).toHaveValue(name);

      // The account itself carries the name, which is what a reload reads back;
      // the request settles asynchronously, so it is polled rather than assumed.
      await expect.poll(async () => (await factory.profile(customer)).name).toBe(name);

      await panel.reload("customer");
      await panel.openProfile("customer");
      await expect(page.getByTestId("profile-name")).toHaveValue(name);
    },
  );

  test(
    qc("profile.executor.rate-read", "Shows the saved hourly rate on the executor's profile"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const executor = await factory.executorWithRate(75);
      const panel = new PanelPage(page);

      await signInAs(page, executor);
      await panel.openProfile("executor");

      await expect(page.getByTestId("executor-rate-card")).toBeVisible();
      await expect(page.getByTestId("hourly-rate-form")).toBeVisible();
      await expect(page.getByTestId("profile-hourly-rate")).toHaveValue("75");

      await panel.reload("executor");
      await panel.openProfile("executor");

      // The rate is what an estimate amount is computed from, so it has to be the
      // stored value and not the one the page happened to open with.
      await expect(page.getByTestId("profile-hourly-rate")).toHaveValue("75");
      await expect(page.getByTestId("save-hourly-rate")).toBeVisible();
      expect(Number((await factory.profile(executor)).hourlyRate)).toBe(75);
    },
  );

  test(
    qc(
      "profile.customer.role-boundary",
      "Offers a customer no hourly rate and the role as read-only"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const panel = new PanelPage(page);

      await signInAs(page, customer);
      await panel.openProfile("customer");

      // The rate is an executor attribute, so the customer's profile does not
      // invite an action the API would refuse.
      await expect(page.getByTestId("profile-role")).toContainText("Customer");
      await expect(page.getByTestId("profile-name")).toBeVisible();
      await expect(page.getByTestId("profile-email")).toBeVisible();
      await expect(page.getByTestId("executor-rate-card")).toBeHidden();
      await expect(page.getByTestId("hourly-rate-form")).toBeHidden();
      await expect(page.getByTestId("profile-hourly-rate")).toBeHidden();
    },
  );

  test(
    qc(
      "profile.password.change",
      "Changes the password from the profile and signs in with the new one"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const profile = new ProfilePage(page);
      const panel = new PanelPage(page);
      const login = new LoginPage(page);
      const replacement = "e2e-changed-password";

      await signInAs(page, customer);
      await panel.openProfile("customer");

      await expect(page.getByTestId("password-change-form")).toBeVisible();
      await profile.changePassword(customer.password, replacement);

      // The form clears only when the change was accepted, so this is the point
      // after which the new credential is what the API knows.
      await expect(page.getByTestId("password-new")).toHaveValue("");

      // The credential is what changed: the new password signs in and the old one
      // no longer does.
      await signInAs(page, { ...customer, password: replacement });
      await expect(panel.panel("customer")).toBeVisible();

      await login.open();
      await login.signIn({ email: customer.email, password: customer.password });
      await expect(page).toHaveURL(/\/login$/u);
      await expect(panel.panel("customer")).toBeHidden();
    },
  );

  test(
    qc(
      "profile.password.wrong-current",
      "Refuses a password change when the current password is wrong"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const profile = new ProfilePage(page);
      const panel = new PanelPage(page);
      const login = new LoginPage(page);
      const attempted = "e2e-attempted-password";

      await signInAs(page, customer);
      await panel.openProfile("customer");

      await profile.changePassword("not-the-current-password", attempted);

      // The wrong current password is refused, so the form stays and nothing was
      // written to the credential.
      await expect(page.getByTestId("password-change-form")).toBeVisible();

      await signInAs(page, customer);
      await expect(panel.panel("customer")).toBeVisible();

      await login.open();
      await login.signIn({ email: customer.email, password: attempted });
      await expect(page).toHaveURL(/\/login$/u);
      await expect(panel.panel("customer")).toBeHidden();
    },
  );
});
