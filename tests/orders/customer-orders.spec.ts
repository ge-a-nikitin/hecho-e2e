import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { ExecutorOrdersPage } from "../../pages/executor-orders.page.js";
import { qc } from "../../qase/qc.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Customer / Orders: creating a draft and submitting it.
 *
 * The last case follows the submission across the role boundary: after the
 * customer's part is done the same browser signs in as an executor, because an
 * order that nobody can claim was not really submitted. `/login` stays reachable
 * while a session exists and replaces it, so the switch needs neither a sign-out
 * nor a second context (`docs/conventions.md`).
 *
 * The panel renders a status as localised copy, not as the enum: `NEW` is
 * "Draft", `WAITING_DISTRIBUTION` is "Awaiting distribution", `ASSIGNED` is
 * "Assigned" (`docs/sut/quirks.md`). The SUT exposes no test id for that label,
 * so a case reads it as text inside the row the id addresses.
 *
 * Each case creates its own customer through the factory and signs that account
 * in with the shared step, so no case inherits an order, an empty list or a
 * status from another one.
 */
const statusLabel = {
  draft: "Draft",
  awaitingDistribution: "Awaiting distribution",
  assigned: "Assigned",
} as const;

/** A title no other case can produce, so `factory.findOrder()` matches one row. */
const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

/** The error body `docs/sut/api.md:64-65` promises, narrowed to what a case reads. */
interface ConflictBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

test.describe("Customer orders", () => {
  test(
    qc("orders.draft.create", "Saves a new order as a draft and leaves it editable"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const actor = await factory.createActor("CUSTOMER");
      const category = await factory.category();
      const orders = new CustomerOrdersPage(page);
      const title = uniqueTitle("Draft order");

      await signInAs(page, actor);
      await orders.open();
      await expect(page.getByTestId("orders-empty-state")).toBeVisible();

      await orders.openCreateForm();
      await orders.fillNewOrder({
        title,
        description: "A draft the customer saves before deciding to publish it.",
        categoryId: category.id,
      });
      await orders.saveDraft();

      const order = await factory.findOrder(actor, title);

      await expect(orders.card(order.id)).toContainText(title);
      await expect(orders.card(order.id)).toContainText(statusLabel.draft);
      await expect(page.getByTestId(`edit-order-${order.id}`)).toBeVisible();

      await orders.reload();

      await expect(orders.card(order.id)).toContainText(statusLabel.draft);
      await expect(page.getByTestId(`edit-order-${order.id}`)).toBeVisible();
    },
  );

  test(
    qc("orders.draft.create-submit", "Creates and submits an order in one form submission"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const actor = await factory.createActor("CUSTOMER");
      const category = await factory.category();
      const orders = new CustomerOrdersPage(page);
      const title = uniqueTitle("Sent order");

      await signInAs(page, actor);
      await orders.open();
      await orders.openCreateForm();
      await orders.fillNewOrder({
        title,
        description: "An order the customer publishes straight from the form.",
        categoryId: category.id,
      });
      await orders.createAndSend();

      const order = await factory.findOrder(actor, title);

      await expect(orders.card(order.id)).toContainText(statusLabel.awaitingDistribution);
      await expect(page.getByTestId(`submit-draft-${order.id}`)).toBeHidden();

      await orders.reload();

      await expect(orders.card(order.id)).toContainText(statusLabel.awaitingDistribution);
    },
  );

  test(
    qc("orders.draft.create-optional", "Keeps the optional due date and location on a saved draft"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const actor = await factory.createActor("CUSTOMER");
      const category = await factory.category();
      const orders = new CustomerOrdersPage(page);
      const title = uniqueTitle("Scheduled order");
      const dueDate = "2026-12-01";
      const location = "Warsaw, Marszałkowska 1";
      // The panel formats a calendar day for en-US; deriving the expected copy
      // from the same locale keeps the assertion stable if the format changes.
      const dueLabel = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${dueDate}T00:00:00.000Z`));

      await signInAs(page, actor);
      await orders.open();
      await orders.openCreateForm();
      await orders.fillNewOrder({
        title,
        description: "A draft that carries the optional due date and location.",
        categoryId: category.id,
        dueDate,
        location,
      });
      await orders.saveDraft();

      const order = await factory.findOrder(actor, title);
      await expect(orders.card(order.id)).toContainText(statusLabel.draft);

      await orders.openOrder(order.id);
      const detail = page.getByTestId("order-detail");
      await expect(detail).toContainText(dueLabel);
      await expect(detail).toContainText(location);

      await orders.closeOrder();
      await orders.reload();
      await orders.openOrder(order.id);

      await expect(detail).toContainText(dueLabel);
      await expect(detail).toContainText(location);
    },
  );

  test(
    qc("orders.draft.submit-pool", "Submits a draft without an executor and puts it in the pool"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const actor = await factory.createActor("CUSTOMER");
      const draft = await factory.createOrder(actor, { title: uniqueTitle("Pool draft") });
      const orders = new CustomerOrdersPage(page);

      await signInAs(page, actor);
      await orders.open();

      await expect(orders.card(draft.id)).toContainText(statusLabel.draft);
      await expect(page.getByTestId(`submit-draft-${draft.id}`)).toBeVisible();

      await orders.submitDraft(draft.id);

      await expect(orders.card(draft.id)).toContainText(statusLabel.awaitingDistribution);
      await expect(page.getByTestId(`submit-draft-${draft.id}`)).toBeHidden();

      await orders.reload();

      await expect(orders.card(draft.id)).toContainText(statusLabel.awaitingDistribution);
    },
  );

  test(
    qc("orders.draft.submit-executor", "Submits a draft with a chosen executor and assigns it"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const actor = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const executorName = executor.email.slice(0, executor.email.indexOf("@"));
      const draft = await factory.createOrder(actor, {
        title: uniqueTitle("Assigned draft"),
        executorId: executor.id,
      });
      const orders = new CustomerOrdersPage(page);

      await signInAs(page, actor);
      await orders.open();

      await expect(orders.card(draft.id)).toContainText(statusLabel.draft);
      await expect(orders.card(draft.id)).toContainText(`Executor: ${executorName}`);

      await orders.submitDraft(draft.id);

      await expect(orders.card(draft.id)).toContainText(statusLabel.assigned);
      await expect(orders.card(draft.id)).not.toContainText(statusLabel.awaitingDistribution);

      await orders.reload();

      await expect(orders.card(draft.id)).toContainText(statusLabel.assigned);
    },
  );

  test(
    qc("orders.draft.submit-again", "Rejects submitting the same order twice"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const actor = await factory.createActor("CUSTOMER");
      const title = uniqueTitle("Submitted twice");
      const order = await factory.createOrder(actor, { title });
      await factory.submitDraft(actor, order.id);

      const orders = new CustomerOrdersPage(page);

      await signInAs(page, actor);
      await orders.open();

      await expect(orders.card(order.id)).toContainText(statusLabel.awaitingDistribution);
      await expect(page.getByTestId(`submit-draft-${order.id}`)).toBeHidden();

      // The page's own session replays the call the UI would make.
      const repeated = await page.request.post(`/api/orders/${order.id}/submit`);
      const conflict = (await repeated.json()) as ConflictBody;

      expect(repeated.status()).toBe(409);
      expect(conflict.statusCode).toBe(409);
      expect(conflict.code).toBe("CONFLICT");
      expect(conflict.message).toMatch(/draft/iu);

      await orders.reload();

      await expect(orders.card(order.id)).toContainText(statusLabel.awaitingDistribution);

      const withSameTitle = (await factory.listOrders(actor)).filter((entry) => entry.title === title);

      expect(withSameTitle).toHaveLength(1);
      expect(withSameTitle[0]?.status).toBe("WAITING_DISTRIBUTION");
    },
  );

  test(
    qc("orders.submit.pool-visibility", "Offers a submitted order to executors in the pool"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const draft = await factory.createOrder(customer, { title: uniqueTitle("Pool offer") });
      const orders = new CustomerOrdersPage(page);
      const pool = new ExecutorOrdersPage(page);

      // A draft belongs to the customer alone, so the pool must not hold it yet.
      // This is the control: without it the case would pass on an order that was
      // visible to every executor from the start.
      expect((await factory.listOrders(executor)).map((order) => order.id)).not.toContain(draft.id);

      await signInAs(page, customer);
      await orders.open();
      await orders.submitDraft(draft.id);

      await expect(orders.card(draft.id)).toContainText(statusLabel.awaitingDistribution);

      // The customer's part is over; what makes the submission real happens on
      // the other side of the role boundary.
      await signInAs(page, executor);
      await pool.open();

      await expect(pool.claimAction(draft.id)).toBeVisible();
      await expect(pool.openOrderAction(draft.id)).toBeVisible();
    },
  );
});

