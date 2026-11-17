import { AdminOrdersPage } from "../../pages/admin-orders.page.js";
import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { ExecutorOrdersPage } from "../../pages/executor-orders.page.js";
import { qc } from "../../qase/qc.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Review: the executor submits the result, the customer answers.
 *
 * The two halves are one loop: submitting puts the order in front of the customer,
 * accepting records a fact without moving the status, asking for changes hands the
 * order back, and resuming starts the work again. Only a browser plus the real API
 * can show the loop, because the answer block lives on the customer's row and the
 * work affordances on the executor's.
 */
interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

test.describe("Review", () => {
  test(
    qc("review.executor.submit", "Submits the finished work and the order reaches review"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderInProgress(customer, executor, {
        title: uniqueTitle("Submitted work"),
      });
      const pool = new ExecutorOrdersPage(page);
      const orders = new CustomerOrdersPage(page);

      await signInAs(page, executor);
      await pool.open();

      await expect(page.getByTestId(`save-work-time-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`submit-review-${order.id}`)).toBeVisible();

      await pool.submitForReview(order.id);

      // The executor has nothing left to do: the answer belongs to the customer.
      await expect(page.getByTestId(`save-work-time-${order.id}`)).toBeHidden();
      await expect(page.getByTestId(`submit-review-${order.id}`)).toBeHidden();

      await signInAs(page, customer);
      await orders.open();

      await expect(orders.card(order.id)).toContainText("Under review");
      await expect(page.getByTestId(`accept-work-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`request-revision-${order.id}`)).toBeVisible();

      expect((await factory.getOrder(customer, order.id)).status).toBe("ON_REVIEW");
    },
  );

  test(
    qc("review.customer.accept-work", "Accepts the work and the order keeps its status"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderOnReview(customer, executor, {
        title: uniqueTitle("Accepted work"),
      });
      const orders = new CustomerOrdersPage(page);
      const adminOrders = new AdminOrdersPage(page);

      await signInAs(page, customer);
      await orders.open();

      await expect(page.getByTestId(`review-response-${order.id}`)).toBeVisible();
      await orders.acceptWork(order.id);

      // The answer is recorded, not used up: the block disappears while the order
      // stays in review, because invoicing is a separate act (`statuses.md:39-41`).
      await expect(page.getByTestId(`review-response-${order.id}`)).toBeHidden();
      await expect(orders.card(order.id)).toContainText("Under review");

      const accepted = await factory.getOrder(customer, order.id);

      expect(accepted.status).toBe("ON_REVIEW");
      expect(accepted.acceptedAt ?? null).not.toBeNull();

      await signInAs(page, "admin");
      await adminOrders.expectOpen();
      await expect(page.getByTestId(`issue-invoice-${order.id}`)).toBeVisible();
    },
  );

  test(
    qc(
      "review.customer.request-revision",
      "Requests changes with a comment and the order moves to revision"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderOnReview(customer, executor, {
        title: uniqueTitle("Revision requested"),
      });
      const orders = new CustomerOrdersPage(page);
      const pool = new ExecutorOrdersPage(page);

      await signInAs(page, customer);
      await orders.open();
      await expect(page.getByTestId(`review-response-${order.id}`)).toBeVisible();

      await orders.requestRevision(order.id, "The report is missing the summary table");

      await expect(page.getByTestId(`review-response-${order.id}`)).toBeHidden();
      await expect(orders.card(order.id)).toContainText("Needs revision");

      await signInAs(page, executor);
      await pool.open();

      // Being handed the order back is what tells the executor work is needed.
      await expect(page.getByTestId(`resume-revisions-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`submit-review-${order.id}`)).toBeHidden();

      expect((await factory.getOrder(customer, order.id)).status).toBe("NEEDS_REVISION");
    },
  );

  test(
    qc(
      "review.executor.resume",
      "Resumes after a revision request and submits the result again"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderNeedsRevision(customer, executor, {
        title: uniqueTitle("Revision cycle"),
      });
      const pool = new ExecutorOrdersPage(page);
      const orders = new CustomerOrdersPage(page);

      await signInAs(page, executor);
      await pool.open();

      await expect(page.getByTestId(`resume-revisions-${order.id}`)).toBeVisible();
      await pool.resumeRevisions(order.id);

      // The work affordances come back with the order, and a second submission is
      // what closes the loop.
      await expect(page.getByTestId(`save-work-time-${order.id}`)).toBeVisible();
      await pool.submitForReview(order.id);
      await expect(page.getByTestId(`submit-review-${order.id}`)).toBeHidden();

      await signInAs(page, customer);
      await orders.open();

      await expect(page.getByTestId(`accept-work-${order.id}`)).toBeVisible();
      expect((await factory.getOrder(customer, order.id)).status).toBe("ON_REVIEW");
    },
  );

  test(
    qc(
      "review.customer.accept-before-review",
      "Refuses to accept work that was never submitted for review"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderInProgress(customer, executor, {
        title: uniqueTitle("Not submitted"),
      });
      const orders = new CustomerOrdersPage(page);

      await signInAs(page, customer);
      await orders.open();

      // Nothing was submitted, so there is nothing to accept.
      await expect(orders.card(order.id)).toContainText("In progress");
      await expect(page.getByTestId(`review-response-${order.id}`)).toBeHidden();

      const refused = await page.request.post(`/api/orders/${order.id}/accept`, { data: {} });
      const body = (await refused.json()) as ErrorBody;

      expect(refused.status()).toBe(409);
      expect(body.code).toBe("CONFLICT");

      const stored = await factory.getOrder(customer, order.id);

      expect(stored.status).toBe("IN_PROGRESS");
      expect(stored.acceptedAt ?? null).toBeNull();
    },
  );
});
