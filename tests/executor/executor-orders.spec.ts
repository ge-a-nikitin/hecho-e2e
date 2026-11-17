import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { ExecutorOrdersPage } from "../../pages/executor-orders.page.js";
import { OrderDetailPage } from "../../pages/order-detail.page.js";
import { qc } from "../../qase/qc.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Executor / Orders: taking an order from the pool, pricing it, and the two ways
 * an assignment ends.
 *
 * The executor panel renders its rows as plain articles without a test id
 * (`docs/sut/quirks.md:76-82`), so a case addresses the actions inside a row:
 * `claim-order-<id>` means "this order is in the pool and I may take it",
 * `estimate-hours-<id>` means "this order is mine and still needs a price", and
 * `decline-order-<id>` means "this order is mine and the work has not started".
 * Waiting for one of them is therefore also an assertion about the status.
 *
 * Everything that happens across the role boundary — the customer's side of a
 * proposal, the pool a declined order returns to — is read with a second sign-in
 * or through the API, never assumed.
 */
interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

/**
 * The name a devtools-created account is rendered under.
 *
 * `DevtoolsClient.ensureUser`/`createUser` take an e-mail only, and the API names
 * such an account after the local part (`support/devtools.ts:147-158`), which is
 * what the card and the detail render.
 */
const executorName = (email: string): string => email.slice(0, email.indexOf("@"));

test.describe("Executor pool", () => {
  test(
    qc("executor.pool.claim", "Claims an order from the pool and becomes its executor"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const draft = await factory.createOrder(customer, { title: uniqueTitle("Claimable order") });
      const pooled = await factory.submitDraft(customer, draft.id);
      const pool = new ExecutorOrdersPage(page);
      const detail = new OrderDetailPage(page);

      expect(pooled.status).toBe("WAITING_DISTRIBUTION");

      await signInAs(page, executor);
      await pool.open();

      await expect(pool.claimAction(draft.id)).toBeVisible();
      await expect(pool.openOrderAction(draft.id)).toBeVisible();

      await pool.claim(draft.id);

      // The claim action is gone because the order left the pool, and the estimate
      // form is offered because the order is now this executor's to price.
      await expect(pool.claimAction(draft.id)).toBeHidden();
      await expect(page.getByTestId(`estimate-hours-${draft.id}`)).toBeVisible();

      await pool.openOrder(draft.id);
      await detail.expectOpen(draft.id);
      await expect(detail.surface()).toContainText("Assigned");
      await expect(detail.surface()).toContainText(executorName(executor.email));

      await detail.close();
      await pool.reload();
      await expect(page.getByTestId(`estimate-hours-${draft.id}`)).toBeVisible();
      await expect(pool.claimAction(draft.id)).toBeHidden();

      expect((await factory.getOrder(executor, draft.id)).status).toBe("ASSIGNED");
    },
  );

  test(
    qc(
      "executor.order.preassigned",
      "Shows an order submitted with the executor chosen as assigned already"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const assigned = await factory.orderAssigned(customer, executor, {
        title: uniqueTitle("Chosen executor"),
      });
      const pool = new ExecutorOrdersPage(page);
      const detail = new OrderDetailPage(page);

      expect(assigned.status).toBe("ASSIGNED");

      await signInAs(page, executor);
      await pool.open();

      // Nothing to claim: the customer named this executor, so the order never
      // entered the pool — and the price is still missing.
      await expect(pool.claimAction(assigned.id)).toBeHidden();
      await expect(pool.openOrderAction(assigned.id)).toBeVisible();
      await expect(page.getByTestId(`estimate-hours-${assigned.id}`)).toBeVisible();

      await pool.openOrder(assigned.id);
      await detail.expectOpen(assigned.id);
      await expect(detail.surface()).toContainText("Assigned");
      await expect(detail.surface()).toContainText(executorName(executor.email));
    },
  );

  test(
    qc(
      "executor.pool.claim-locked",
      "Refuses a claim on an order another executor already took"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const first = await factory.createActor("EXECUTOR");
      const second = await factory.createActor("EXECUTOR");
      const draft = await factory.createOrder(customer, { title: uniqueTitle("Taken order") });
      const pooled = await factory.submitDraft(customer, draft.id);

      await factory.claim(first, pooled.id);

      const pool = new ExecutorOrdersPage(page);

      await signInAs(page, second);
      await pool.open();

      // The pool no longer holds the order, so the second executor is never
      // offered a way to take it.
      await expect(pool.claimAction(draft.id)).toBeHidden();

      const refused = await page.request.post(`/api/orders/${draft.id}/claim`);
      const body = (await refused.json()) as ErrorBody;

      expect(refused.status()).toBe(409);
      expect(body.code).toBe("CONFLICT");

      // The second claim changed nothing: the first executor still owns the order
      // and still has to price it.
      await signInAs(page, first);
      await pool.open();
      await expect(page.getByTestId(`estimate-hours-${draft.id}`)).toBeVisible();
      await expect(pool.claimAction(draft.id)).toBeHidden();

      const stored = await factory.getOrder(first, draft.id);

      expect(stored.status).toBe("ASSIGNED");
      expect(stored.executorId).toBe(first.id);
    },
  );

  test(
    qc("executor.pool.detail", "Opens a pooled order and reads the full description"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const description = `The full brief a pooled order carries ${Date.now().toString(36)}.`;
      const draft = await factory.createOrder(customer, {
        title: uniqueTitle("Pooled detail"),
        description,
      });
      const pooled = await factory.submitDraft(customer, draft.id);
      const pool = new ExecutorOrdersPage(page);
      const detail = new OrderDetailPage(page);

      await signInAs(page, executor);
      await pool.open();

      await pool.openOrder(pooled.id);
      await detail.expectOpen(pooled.id);

      // A pooled order is readable in full before it is taken: the description is
      // the part an executor decides on, and the card is the screen that has it.
      await expect(detail.surface()).toContainText(description);
      await expect(detail.surface()).toContainText("Awaiting distribution");

      await detail.close();
      await expect(page).toHaveURL(/\/executor$/u);
      await expect(pool.claimAction(pooled.id)).toBeVisible();
    },
  );
});

test.describe("Executor estimating", () => {
  test(
    qc("executor.estimate.propose", "Proposes an estimate and leaves the order assigned"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(40);
      const order = await factory.orderAssigned(customer, executor, {
        title: uniqueTitle("Estimate proposal"),
      });
      const pool = new ExecutorOrdersPage(page);
      const detail = new OrderDetailPage(page);

      await signInAs(page, executor);
      await pool.open();

      await expect(page.getByTestId(`estimate-hours-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`submit-estimate-${order.id}`)).toBeVisible();

      await pool.proposeEstimate(order.id, 3);

      await pool.openOrder(order.id);
      await detail.expectOpen(order.id);

      // The proposal does not start the work: only the customer's acceptance does.
      await expect(detail.surface()).toContainText("Assigned");

      const stored = await factory.getOrder(executor, order.id);
      const estimate = stored.estimates?.[0];

      expect(stored.status).toBe("ASSIGNED");
      expect(estimate?.status).toBe("PENDING");
      expect(Number(estimate?.hours)).toBe(3);
      expect(Number(estimate?.amount)).toBe(120);
    },
  );

  test(
    qc(
      "executor.estimate.handoff",
      "Offers the proposed estimate to the customer for a decision"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(50);
      const order = await factory.orderAwaitingEstimate(customer, executor, {
        title: uniqueTitle("Awaiting answer"),
      });
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);

      await signInAs(page, customer);
      await orders.open();

      await expect(orders.card(order.id)).toContainText("Assigned");
      await expect(page.getByTestId(`estimate-response-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`accept-estimate-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`reject-estimate-${order.id}`)).toBeVisible();

      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);
      await expect(detail.surface()).toContainText("Assigned");

      // Nothing was answered yet: the answer itself is the estimates slice.
      expect((await factory.getOrder(customer, order.id)).estimates?.[0]?.status).toBe("PENDING");
    },
  );
});

test.describe("Executor assignment", () => {
  test(
    qc("executor.order.decline", "Declines an assigned order and it returns to the pool"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const first = await factory.createActor("EXECUTOR");
      const second = await factory.createActor("EXECUTOR");
      const order = await factory.orderAssigned(customer, first, {
        title: uniqueTitle("Declined assignment"),
      });
      const pool = new ExecutorOrdersPage(page);

      await signInAs(page, first);
      await pool.open();

      await expect(page.getByTestId(`decline-order-${order.id}`)).toBeVisible();
      await expect(pool.claimAction(order.id)).toBeHidden();

      await pool.decline(order.id);

      // The order is not gone: it is back in the pool, which is why the claim
      // action returns for the executor who just refused it.
      await expect(page.getByTestId(`decline-order-${order.id}`)).toBeHidden();
      await expect(page.getByTestId(`estimate-hours-${order.id}`)).toBeHidden();
      await expect(pool.claimAction(order.id)).toBeVisible();

      await signInAs(page, second);
      await pool.open();
      await expect(pool.claimAction(order.id)).toBeVisible();

      const stored = await factory.getOrder(customer, order.id);

      expect(stored.status).toBe("WAITING_DISTRIBUTION");
      expect(stored.executorId ?? null).toBeNull();
    },
  );

  test(
    qc(
      "executor.order.decline-pool",
      "Refuses to decline an order that is not an assignment"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.createActor("EXECUTOR");
      const draft = await factory.createOrder(customer, { title: uniqueTitle("Pooled decline") });
      const pooled = await factory.submitDraft(customer, draft.id);
      const pool = new ExecutorOrdersPage(page);

      await signInAs(page, executor);
      await pool.open();

      // Declining answers an assignment; an order in the pool has none to give back.
      await expect(pool.claimAction(pooled.id)).toBeVisible();
      await expect(page.getByTestId(`decline-order-${pooled.id}`)).toBeHidden();

      const refused = await page.request.post(`/api/orders/${pooled.id}/decline`, { data: {} });
      const body = (await refused.json()) as ErrorBody;

      expect(refused.status()).toBe(409);
      expect(body.code).toBe("CONFLICT");

      const stored = await factory.getOrder(customer, pooled.id);

      expect(stored.status).toBe("WAITING_DISTRIBUTION");
      expect(stored.executorId ?? null).toBeNull();

      await pool.reload();
      await expect(pool.claimAction(pooled.id)).toBeVisible();
    },
  );
});

test.describe("Executor work log", () => {
  test(
    qc("executor.order.time", "Records work time on an order in progress"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderInProgress(customer, executor, {
        title: uniqueTitle("Logged time"),
      });
      const pool = new ExecutorOrdersPage(page);
      const detail = new OrderDetailPage(page);

      expect(order.timeEntry ?? null).toBeNull();

      await signInAs(page, executor);
      await pool.open();

      await expect(page.getByTestId(`work-time-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`work-time-comment-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`save-work-time-${order.id}`)).toBeVisible();

      await pool.logTime(order.id, 90, "Implementation and review");

      // Stored, not merely echoed: the panel re-reads the order after the save, so
      // the entry settles asynchronously and is polled rather than assumed.
      await expect
        .poll(async () => (await factory.getOrder(executor, order.id)).timeEntry?.minutes)
        .toBe(90);

      const stored = await factory.getOrder(executor, order.id);

      expect(stored.timeEntry?.comment).toBe("Implementation and review");

      await pool.reload();
      await expect(page.getByTestId(`work-time-${order.id}`)).toHaveValue("90");

      await pool.openOrder(order.id);
      await detail.expectOpen(order.id);
      await expect(detail.surface()).toContainText("1 h 30 min");
    },
  );

  test(
    qc(
      "executor.order.time-again",
      "Replaces the recorded time instead of adding a second entry"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderInProgress(customer, executor, {
        title: uniqueTitle("Corrected time"),
      });
      const pool = new ExecutorOrdersPage(page);

      const logged = await factory.logTime(executor, order.id, {
        minutes: 30,
        comment: "First estimate of the effort",
      });

      expect(logged.timeEntry?.minutes).toBe(30);

      await signInAs(page, executor);
      await pool.open();

      // The form opens on what was stored, so the second save corrects it.
      await expect(page.getByTestId(`work-time-${order.id}`)).toHaveValue("30");

      await pool.logTime(order.id, 45, "Corrected after the review");

      await expect
        .poll(async () => (await factory.getOrder(executor, order.id)).timeEntry?.minutes)
        .toBe(45);

      const stored = await factory.getOrder(executor, order.id);

      // One order holds one time entry (`packages` schema: `WorkTimeEntry` is
      // unique per order), so the second save replaces the first instead of
      // adding a line: the minutes and the note are both the new ones.
      expect(stored.timeEntry?.minutes).toBe(45);
      expect(stored.timeEntry?.comment).toBe("Corrected after the review");

      await pool.reload();
      await expect(page.getByTestId(`work-time-${order.id}`)).toHaveValue("45");
    },
  );
});

