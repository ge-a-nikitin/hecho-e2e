import { LoginPage } from "../../pages/login.page.js";
import { PanelPage } from "../../pages/panel.page.js";
import { RegisterPage } from "../../pages/register.page.js";
import { qc } from "../../qase/qc.js";
import { ROLE_CREDENTIALS } from "../../support/env.js";
import { expect, sessionOf, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Public pages and the session they create.
 *
 * These cases exist at this level because the browser is the only place where
 * the answers live: Better Auth refuses a request whose `Origin` is wrong and
 * sets the session as a `httpOnly` cookie the page never sees
 * (`docs/sut/api.md:23-28`), and the sign-in client is mocked in the web layer's
 * unit tests. A wrong password, a replaced session and a redirect that only the
 * router performs cannot be asserted anywhere below a real browser.
 *
 * Signing out lands on `/` and not on `/login` (`app.tsx:389`), and the panel
 * route is what sends a signed-out visitor to the form (`docs/sut/quirks.md:34-35`),
 * so the case proves both halves instead of assuming one.
 */
const wrongPassword = "not-the-account-password";

test.describe("Signing in", () => {
  test(
    qc("auth.sign-in.panel", "Signs a customer in from the landing page and opens the customer panel"),
    { tag: "@smoke" },
    async ({ page }) => {
      const panel = new PanelPage(page);

      await page.goto("/");
      await expect(page.getByTestId("landing-page")).toBeVisible();
      await expect(page.getByTestId("nav-login")).toBeVisible();

      await page.getByTestId("nav-login").click();
      await expect(page.getByTestId("login-page")).toBeVisible();
      await expect(page.getByTestId("auth-form")).toBeVisible();

      await signInAs(page, "customer");
      await expect(page).toHaveURL(/\/customer/u);

      await page.goto("/");
      await expect(page.getByTestId("nav-dashboard")).toBeVisible();
      await expect(page.getByTestId("nav-login")).toBeHidden();

      // The link a signed-in visitor gets goes to their own panel, not to a
      // generic one: the session decides it.
      await page.getByTestId("nav-dashboard").click();
      await expect(panel.panel("customer")).toBeVisible();
      await expect(page).toHaveURL(/\/customer/u);
    },
  );
});

test.describe("Registration", () => {
  test(
    qc("auth.register.customer", "Registers a new customer and opens that customer's panel"),
    { tag: "@regression" },
    async ({ page }) => {
      const register = new RegisterPage(page);
      const panel = new PanelPage(page);
      const email = `customer.${Date.now().toString(36)}@example.test`;
      const password = "e2e-registered-password";

      await register.open();
      await expect(page.getByTestId("auth-name")).toBeVisible();
      await expect(page.getByTestId("auth-password")).toBeVisible();

      await register.register({ name: "Registered customer", email, password });

      // A fresh account has no orders, so the panel answers with its empty board
      // rather than a list — the proof that the session belongs to a new customer.
      await expect(panel.panel("customer")).toBeVisible();
      await expect(page.getByTestId("orders-empty-state")).toBeVisible();

      await panel.reload("customer");
      await expect(page.getByTestId("orders-empty-state")).toBeVisible();
    },
  );
});

test.describe("Signing out", () => {
  test(
    qc("auth.sign-out.control", "Signs out from the panel and needs a new sign-in to return"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const panel = new PanelPage(page);

      // The case signs out, which revokes the session on the server. It therefore
      // runs on an account of its own: the stored baseline session is shared with
      // every other case, and revoking it would fail them a minute later.
      await signInAs(page, customer);

      await panel.signOut();
      await expect(page.getByTestId("nav-login")).toBeVisible();

      await page.goto("/customer");
      await expect(page).toHaveURL(/\/login$/u);
      await expect(panel.panel("customer")).toBeHidden();
    },
  );
});

test.describe("Landing page", () => {
  test.use(sessionOf.executor);

  test(
    qc("auth.landing.session-aware", "Shows a signed-in visitor the way to their own panel"),
    { tag: "@regression" },
    async ({ page }) => {
      const panel = new PanelPage(page);

      await page.goto("/");
      await expect(page.getByTestId("landing-page")).toBeVisible();
      await expect(page.getByTestId("nav-dashboard")).toBeVisible();
      await expect(page.getByTestId("nav-login")).toBeHidden();

      await page.getByTestId("nav-dashboard").click();
      await expect(panel.panel("executor")).toBeVisible();
      await expect(page).toHaveURL(/\/executor/u);
    },
  );
});

test.describe("Session replacement", () => {
  test.use(sessionOf.customer);

  test(
    qc("auth.session.replace", "Replaces a live session when another role signs in"),
    { tag: "@regression" },
    async ({ page }) => {
      const panel = new PanelPage(page);

      await panel.open("customer");

      await signInAs(page, "executor");
      await expect(page).toHaveURL(/\/executor/u);

      // The wrong panel is not opened and not shown as an error: the guard sends
      // the visitor to the panel their session owns (`app.tsx:329-332`). Only a
      // browser without a session reaches `/login` (`app.tsx:328`).
      await page.goto("/customer");
      await expect(page).toHaveURL(/\/executor$/u);
      await expect(panel.panel("customer")).toBeHidden();
      await expect(panel.panel("executor")).toBeVisible();
    },
  );
});

test.describe("Rejections", () => {
  test(
    qc("auth.sign-in.wrong-password", "Keeps the visitor on the sign-in form when the password is wrong"),
    { tag: "@regression" },
    async ({ page }) => {
      const login = new LoginPage(page);
      const panel = new PanelPage(page);
      const credentials = ROLE_CREDENTIALS.customer;

      await login.open();
      await login.signIn({ email: credentials.email, password: wrongPassword });

      await expect(page).toHaveURL(/\/login$/u);
      await expect(page.getByTestId("login-page")).toBeVisible();
      await expect(panel.panel("customer")).toBeHidden();

      // The same form still accepts the account's own password, so the refusal
      // came from the credential and not from a broken control.
      await login.signIn(credentials);
      await expect(panel.panel("customer")).toBeVisible();
    },
  );
});
