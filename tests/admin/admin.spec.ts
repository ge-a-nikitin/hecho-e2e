import { AdminCategoriesPage } from "../../pages/admin-categories.page.js";
import { AdminOrdersPage } from "../../pages/admin-orders.page.js";
import { AdminUsersPage } from "../../pages/admin-users.page.js";
import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { ExecutorOrdersPage } from "../../pages/executor-orders.page.js";
import { LoginPage } from "../../pages/login.page.js";
import { PanelPage } from "../../pages/panel.page.js";
import { qc } from "../../qase/qc.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Administration: assignment, accounts and categories.
 *
 * These cases are the only place where the administrator's screens are walked,
 * and each of them ends on the persona the change was made for: an assigned order
 * reaches the executor, a new account can sign in, a deactivated one cannot use
 * the API, and a category appears in or disappears from the customer's form. The
 * assertions therefore sit on the other side of the change rather than on the
 * toast the administrator sees.
 */
interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;
const uniqueName = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

/** The name a devtools-created account is rendered under: the e-mail local part. */
const localName = (email: string): string => email.slice(0, email.indexOf("@"));

test.describe("Administrator assignment", () => {
  test(
    qc(
      "admin.orders.assign",
      "Assigns a pool order to an executor and takes it out of the pool"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const draft = await factory.createOrder(customer, { title: uniqueTitle("Assignable order") });
      const pooled = await factory.submitDraft(customer, draft.id);
      const adminOrders = new AdminOrdersPage(page);
      const pool = new ExecutorOrdersPage(page);

      expect(pooled.status).toBe("WAITING_DISTRIBUTION");

      await signInAs(page, "admin");
      await adminOrders.expectOpen();

      await adminOrders.assign(draft.id, executor.id);

      // The assignment is a request the panel fires and forgets, so the stored
      // status is polled before it is asserted.
      await expect
        .poll(async () => (await factory.getOrder(await factory.admin(), draft.id)).status)
        .toBe("ASSIGNED");

      const assigned = await factory.getOrder(await factory.admin(), draft.id);

      expect(assigned.executorId).toBe(executor.id);

      // The order is no longer in the pool and the executor it was given to can
      // price it, which is what the assignment was for.
      await signInAs(page, executor);
      await pool.open();
      await expect(pool.claimAction(draft.id)).toBeHidden();
      await expect(page.getByTestId(`estimate-hours-${draft.id}`)).toBeVisible();
    },
  );

  test(
    qc(
      "admin.orders.reassign",
      "Reassigns an order to another executor and withdraws the pending estimate"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const first = await factory.executorWithRate(50);
      const second = await factory.executorWithRate(80);
      const order = await factory.orderAwaitingEstimate(customer, first, {
        title: uniqueTitle("Reassigned work"),
      });
      const adminOrders = new AdminOrdersPage(page);
      const pool = new ExecutorOrdersPage(page);

      expect(order.status).toBe("ASSIGNED");
      expect(order.estimates?.[0]?.status).toBe("PENDING");

      await signInAs(page, "admin");
      await adminOrders.expectOpen();
      await adminOrders.assign(order.id, second.id);

      await expect
        .poll(async () => (await factory.getOrder(await factory.admin(), order.id)).executorId)
        .toBe(second.id);

      const reassigned = await factory.getOrder(await factory.admin(), order.id);

      // The proposal belonged to the previous executor, so it cannot follow the
      // order to somebody with a rate of their own (`domain.md:44-49`).
      expect(reassigned.status).toBe("ASSIGNED");
      expect(reassigned.estimates?.[0]?.status).toBe("WITHDRAWN");
      await signInAs(page, second);
      await pool.open();
      await expect(page.getByTestId(`estimate-hours-${order.id}`)).toBeVisible();

      await signInAs(page, first);
      await pool.open();
      await expect(page.getByTestId(`estimate-hours-${order.id}`)).toBeHidden();
    },
  );

  test(
    qc(
      "admin.orders.assign-claimed",
      "Refuses to assign an order to the executor who already owns it"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const order = await factory.orderAssigned(customer, executor, {
        title: uniqueTitle("Same executor"),
      });
      const adminOrders = new AdminOrdersPage(page);

      await signInAs(page, "admin");
      await adminOrders.expectOpen();

      // The select does not offer the executor who already owns the order.
      await expect(
        page.getByTestId(`assign-executor-${order.id}`).getByRole("option", {
          name: new RegExp(localName(executor.email), "u"),
        }),
      ).toBeDisabled();

      const refused = await page.request.post(`/api/orders/${order.id}/assign`, {
        data: { executorId: executor.id },
      });
      const body = (await refused.json()) as ErrorBody;

      expect(refused.status()).toBe(409);
      expect(body.code).toBe("CONFLICT");

      const stored = await factory.getOrder(await factory.admin(), order.id);

      expect(stored.status).toBe("ASSIGNED");
      expect(stored.executorId).toBe(executor.id);
    },
  );
});

test.describe("Administrator accounts", () => {
  test(
    qc(
      "admin.users.create-executor",
      "Creates an executor account that can sign in"
    ),
    { tag: "@regression" },
    async ({ page }) => {
      const users = new AdminUsersPage(page);
      const panel = new PanelPage(page);
      const email = `created.${Date.now().toString(36)}@example.test`;
      const password = "e2e-created-executor";
      const name = uniqueName("Created executor");

      await signInAs(page, "admin");
      await panel.openUsers();
      await users.createExecutor({ name, email, password });

      // Only a sign-in proves that the password the form took is the one that
      // works, and the profile proves the role the account was created with.
      await signInAs(page, { id: "", email, password, role: "EXECUTOR", cookie: "" });
      await expect(page.getByTestId("executor-panel")).toBeVisible();

      await panel.openProfile("executor");
      await expect(page.getByTestId("profile-role")).toContainText("Executor");
      await expect(page.getByTestId("executor-rate-card")).toBeVisible();
    },
  );

  test(
    qc(
      "admin.users.reset-password",
      "Resets an executor password and the old one stops working"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const admin = await factory.admin();
      const created = await factory.createExecutorAccount(admin);
      const users = new AdminUsersPage(page);
      const panel = new PanelPage(page);
      const login = new LoginPage(page);
      const replacement = "e2e-replacement-password";

      await signInAs(page, "admin");
      await panel.openUsers();
      await users.resetPassword(created.id, replacement);

      // The old password is refused and the new one signs in, which is the only
      // way to prove a reset reached the credential and not just the screen.
      await login.open();
      await login.signIn({ email: created.email, password: created.password });
      await expect(page).toHaveURL(/\/login$/u);
      await expect(page.getByTestId("executor-panel")).toBeHidden();

      await signInAs(page, { id: created.id, email: created.email, password: replacement, role: "EXECUTOR", cookie: "" });
      await expect(page.getByTestId("executor-panel")).toBeVisible();
    },
  );

  test(
    qc("admin.users.deactivate", "Deactivates an executor and blocks the sign-in"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const executor = await factory.createActor("EXECUTOR");
      const users = new AdminUsersPage(page);
      const panel = new PanelPage(page);

      await signInAs(page, "admin");
      await panel.openUsers();
      await users.deactivate(executor.id);

      // The account can still authenticate — the session is not deleted while the
      // browser holds it — but every domain call is refused, so the panel shows a
      // load error instead of a list.
      await signInAs(page, executor);
      await expect(page.getByTestId("executor-orders-load-error")).toBeVisible();

      const refused = await page.request.get("/api/users/me");

      expect(refused.status()).toBe(401);
    },
  );
});

test.describe("Administrator categories", () => {
  test(
    qc(
      "admin.categories.create",
      "Creates a category that the customer's form then offers"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const admin = await factory.admin();
      const customer = await factory.createActor("CUSTOMER");
      const categories = new AdminCategoriesPage(page);
      const panel = new PanelPage(page);
      const name = uniqueName("Created category");

      await signInAs(page, "admin");
      await panel.openCategories();
      await categories.create(name);

      const created = (await factory.listCategories(admin)).find((entry) => entry.name === name);

      // The name is unique per case, so the row that appeared is the one the API
      // now holds — and the customer's form offers it under that id.
      await signInAs(page, customer);
      await new CustomerOrdersPage(page).openCreateForm();
      await page.getByTestId("order-category").selectOption(created?.id as string);
      await expect(page.getByTestId("order-category")).toHaveValue(created?.id as string);
    },
  );

  test(
    qc(
      "admin.categories.deactivate",
      "Deactivates a category and the customer's form stops offering it"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const admin = await factory.admin();
      const customer = await factory.createActor("CUSTOMER");
      const removed = await factory.createCategory(admin, uniqueName("Retired category"));
      const kept = await factory.createCategory(admin, uniqueName("Kept category"));
      const categories = new AdminCategoriesPage(page);
      const panel = new PanelPage(page);
      const orders = new CustomerOrdersPage(page);

      await signInAs(page, "admin");
      await panel.openCategories();
      await categories.deactivate(removed.id);

      // The customer's select is built from the active categories the API returns,
      // so a deactivated one is simply absent from the form.
      await signInAs(page, customer);
      await orders.open();
      await orders.openCreateForm();

      await expect(page.getByTestId("order-category")).toContainText(kept.name);
      await expect(page.getByTestId("order-category")).not.toContainText(removed.name);
    },
  );
});

