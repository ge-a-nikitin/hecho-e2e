import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { ExecutorOrdersPage } from "../../pages/executor-orders.page.js";
import { OrderDetailPage } from "../../pages/order-detail.page.js";
import { qc } from "../../qase/qc.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Customer / Estimates: answering the executor's proposal.
 *
 * An estimate is the gate in front of the work, so these cases assert the status
 * on both sides of the decision: acceptance starts the work, and a rejection
 * sends the order back to the pool with the executor released. The web layer
 * pins the presentation of the answer block; only a browser plus a real API can
 * show that answering it moves the order and what the executor then sees.
 */
interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

test.describe("Customer estimates", () => {
  test(
    qc("estimates.customer.accept", "Accepts the estimate and the order starts"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(60);
      const order = await factory.orderAwaitingEstimate(customer, executor, {
        title: uniqueTitle("Accepted estimate"),
      });
      const orders = new CustomerOrdersPage(page);
      const pool = new ExecutorOrdersPage(page);
      const detail = new OrderDetailPage(page);

      await signInAs(page, customer);
      await orders.open();

      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`accept-estimate-${order.id}`)).toBeVisible();

      await orders.acceptEstimate(order.id);

      // The question is answered, so the block that asked it is gone.
      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeHidden();
      await expect(orders.card(order.id)).toContainText("In progress");

      const stored = await factory.getOrder(customer, order.id);

      expect(stored.status).toBe("IN_PROGRESS");
      expect(stored.estimates?.[0]?.status).toBe("ACCEPTED");

      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);
      await expect(detail.surface()).toContainText("In progress");

      // Work time is the affordance the executor only gets once work has started.
      await signInAs(page, executor);
      await pool.open();
      await expect(page.getByTestId(`save-work-time-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`estimate-hours-${order.id}`)).toBeHidden();
    },
  );

  test(
    qc(
      "estimates.customer.reject",
      "Rejects the estimate with a comment and the order returns to the pool"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(60);
      const order = await factory.orderAwaitingEstimate(customer, executor, {
        title: uniqueTitle("Rejected estimate"),
      });
      const orders = new CustomerOrdersPage(page);
      const pool = new ExecutorOrdersPage(page);

      await signInAs(page, customer);
      await orders.open();
      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeVisible();

      await orders.rejectEstimate(order.id, "The hours are too many for this brief");

      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeHidden();
      await expect(orders.card(order.id)).toContainText("Awaiting distribution");

      const stored = await factory.getOrder(customer, order.id);
      const estimate = stored.estimates?.[0];

      // A rejection does not keep the executor: the assignment is released and the
      // order is offered to the pool again (`orders.service.ts:432-492`).
      expect(stored.status).toBe("WAITING_DISTRIBUTION");
      expect(stored.executorId ?? null).toBeNull();
      expect(estimate?.status).toBe("REJECTED");
      expect(estimate?.responseComment).toBe("The hours are too many for this brief");

      await signInAs(page, executor);
      await pool.open();
      await expect(pool.claimAction(order.id)).toBeVisible();
      await expect(page.getByTestId(`estimate-hours-${order.id}`)).toBeHidden();
    },
  );

  test(
    qc(
      "estimates.customer.await-proposal",
      "Offers no estimate controls to the customer before the executor proposes"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(60);
      const order = await factory.orderAssigned(customer, executor, {
        title: uniqueTitle("No proposal yet"),
      });
      const orders = new CustomerOrdersPage(page);
      const pool = new ExecutorOrdersPage(page);

      await signInAs(page, customer);
      await orders.open();

      // An assigned order without a proposal asks the customer nothing.
      await expect(orders.card(order.id)).toContainText("Assigned");
      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeHidden();

      await signInAs(page, executor);
      await pool.open();
      await pool.proposeEstimate(order.id, 2);

      await signInAs(page, customer);
      await orders.open();

      // The same order now carries a question, because the executor proposed.
      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`accept-estimate-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`reject-estimate-${order.id}`)).toBeVisible();
    },
  );

  test(
    qc(
      "estimates.customer.answer-twice",
      "Refuses a second answer to an estimate that is already accepted"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(60);
      const order = await factory.orderInProgress(customer, executor, {
        title: uniqueTitle("Answered estimate"),
      });
      const orders = new CustomerOrdersPage(page);
      const estimate = order.estimates?.[0];

      expect(estimate?.status).toBe("ACCEPTED");

      await signInAs(page, customer);
      await orders.open();

      // The question is answered, so the panel offers no way to answer it again.
      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeHidden();

      const refused = await page.request.post(
        `/api/orders/${order.id}/estimates/${estimate?.id}/respond`,
        { data: { accepted: true } },
      );
      const body = (await refused.json()) as ErrorBody;

      expect(refused.status()).toBe(409);
      expect(body.code).toBe("CONFLICT");

      const stored = await factory.getOrder(customer, order.id);

      expect(stored.status).toBe("IN_PROGRESS");
      expect(stored.estimates?.[0]?.status).toBe("ACCEPTED");
    },
  );
});

