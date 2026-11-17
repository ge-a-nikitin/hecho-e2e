import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { ExecutorOrdersPage } from "../../pages/executor-orders.page.js";
import { OrderDetailPage } from "../../pages/order-detail.page.js";
import { qc } from "../../qase/qc.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Customer / Orders: editing a draft and cancelling before work.
 *
 * The two halves exist at this level for the same reason: the edit form is a
 * route-less panel state the web layer's unit tests do not mount, and the cancel
 * control lives inside the order card, which only the browser renders. What the
 * API refuses is asserted next to what the screen offers, so a case cannot pass
 * on a hidden button while the endpoint still accepts the call.
 *
 * The status labels are copy (`docs/sut/quirks.md:53-55`); where a case needs the
 * status itself it reads the order through the API as the account that owns it.
 */
interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

test.describe("Customer draft editing", () => {
  test(
    qc("orders.draft.edit", "Edits a draft order and the change survives a reload"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const original = uniqueTitle("Editable draft");
      const updated = uniqueTitle("Edited draft");
      const order = await factory.createOrder(customer, {
        title: original,
        description: "The description the customer typed first.",
      });
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);

      await signInAs(page, customer);
      await orders.open();

      await expect(page.getByTestId(`draft-actions-${order.id}`)).toBeVisible();
      await orders.startEditingDraft(order.id);

      // The form opens on what is stored, not on an empty draft.
      await expect(page.getByTestId(`edit-title-${order.id}`)).toHaveValue(original);

      await orders.fillDraftEdit(order.id, {
        title: updated,
        description: "The description the customer corrected.",
      });
      await orders.saveDraftEdit(order.id);

      await expect(orders.card(order.id)).toContainText(updated);

      const stored = await factory.getOrder(customer, order.id);

      expect(stored.status).toBe("NEW");
      expect(stored.description).toBe("The description the customer corrected.");

      await orders.reload();
      await expect(orders.card(order.id)).toContainText(updated);

      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);
      await expect(detail.surface()).toContainText(updated);
      await expect(detail.surface()).toContainText("The description the customer corrected.");
    },
  );

  test(
    qc("orders.draft.edit-after-submit", "Refuses to edit an order that already left the draft"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const title = uniqueTitle("Submitted draft");
      const draft = await factory.createOrder(customer, { title });
      const submitted = await factory.submitDraft(customer, draft.id);
      const orders = new CustomerOrdersPage(page);

      expect(submitted.status).toBe("WAITING_DISTRIBUTION");

      await signInAs(page, customer);
      await orders.open();

      // Editability ends with the submission, and the panel says so by removing
      // the whole block of draft actions.
      await expect(page.getByTestId(`draft-actions-${draft.id}`)).toBeHidden();
      await expect(page.getByTestId(`edit-order-${draft.id}`)).toBeHidden();

      const patched = await page.request.patch(`/api/orders/${draft.id}`, {
        data: { title: uniqueTitle("Rejected edit") },
      });
      const body = (await patched.json()) as ErrorBody;

      expect(patched.status()).toBe(409);
      expect(body.code).toBe("CONFLICT");
      expect(body.message).toMatch(/draft/iu);

      const stored = await factory.getOrder(customer, draft.id);

      expect(stored.status).toBe("WAITING_DISTRIBUTION");
      expect(stored.title).toBe(title);

      await orders.reload();
      await expect(orders.card(draft.id)).toContainText(title);
    },
  );
});

test.describe("Customer cancellation", () => {
  test(
    qc("orders.cancel.before-work", "Cancels a submitted order before work starts"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const draft = await factory.createOrder(customer, { title: uniqueTitle("Cancelled in pool") });
      const submitted = await factory.submitDraft(customer, draft.id);
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);
      const pool = new ExecutorOrdersPage(page);

      // The order really was in the pool before the cancellation, otherwise the
      // last step would pass on an order that was never offered.
      await signInAs(page, executor);
      await pool.open();
      await expect(pool.claimAction(submitted.id)).toBeVisible();

      await signInAs(page, customer);
      await orders.open();
      await orders.openOrder(draft.id);
      await detail.expectOpen(draft.id);

      // Before work a reason is optional (`domain.md:53`), so the form is sent empty.
      await detail.cancel();
      await expect(page.getByTestId("cancel-order-form")).toBeHidden();

      const cancelled = await factory.getOrder(customer, draft.id);

      expect(cancelled.status).toBe("CANCELLED");

      await signInAs(page, executor);
      await pool.open();
      await expect(pool.claimAction(draft.id)).toBeHidden();
    },
  );

  test(
    qc(
      "orders.cancel.withdraws-estimate",
      "Cancelling an assigned order withdraws the estimate awaiting an answer"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderAwaitingEstimate(customer, executor, {
        title: uniqueTitle("Cancelled before answer"),
      });
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);
      const pool = new ExecutorOrdersPage(page);

      expect(order.estimates?.[0]?.status).toBe("PENDING");

      await signInAs(page, customer);
      await orders.open();
      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeVisible();

      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);
      await detail.cancel();
      await detail.close();

      // The list stays mounted behind the card and is not refetched when the card
      // closes, so the row is read after a reload — the same user action a person
      // would take, and the reason this step exists at all.
      await orders.reload();
      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeHidden();

      const cancelled = await factory.getOrder(customer, order.id);

      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.estimates?.[0]?.status).toBe("WITHDRAWN");

      // The order keeps its executor after a cancellation — only the assignment is
      // ended — so it stays in that executor's list. What disappears is every
      // action the status used to offer, which is what the executor sees here.
      await signInAs(page, executor);
      await pool.open();
      await expect(page.getByTestId(`estimate-hours-${order.id}`)).toBeHidden();
      await expect(pool.claimAction(order.id)).toBeHidden();
    },
  );

  test(
    qc(
      "orders.cancel.after-work-by-customer",
      "Refuses a customer cancellation once work has started"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderInProgress(customer, executor, {
        title: uniqueTitle("Started work"),
      });
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);

      expect(order.status).toBe("IN_PROGRESS");

      await signInAs(page, customer);
      await orders.open();
      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);

      // Only an administrator may cancel after work started, so the customer's
      // card does not offer the form at all.
      await expect(page.getByTestId("cancel-order-form")).toBeHidden();

      const refused = await page.request.post(`/api/orders/${order.id}/cancel`, { data: {} });
      const body = (await refused.json()) as ErrorBody;

      expect(refused.status()).toBe(403);
      expect(body.code).toBe("FORBIDDEN");

      const stored = await factory.getOrder(customer, order.id);

      expect(stored.status).toBe("IN_PROGRESS");

      await page.reload();
      await expect(orders.card(order.id)).toContainText("In progress");
    },
  );
});
