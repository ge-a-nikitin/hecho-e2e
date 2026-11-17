import { AdminOrdersPage } from "../../pages/admin-orders.page.js";
import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { OrderDetailPage } from "../../pages/order-detail.page.js";
import { qc } from "../../qase/qc.js";
import { pdfFile } from "../../support/files.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Money: the invoice, the receipt the customer sends, and the administrator's
 * review of it.
 *
 * Two roles have to work on the same order here, and neither can see the other's
 * screen: the customer reports a payment, the administrator confirms or refuses
 * it, and the completion is a separate act after the payment. The cases therefore
 * assert the stored invoice, the stored report and the status, and then the
 * affordance the other role is offered.
 */
interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

test.describe("Invoicing", () => {
  test(
    qc("money.admin.issue-invoice", "Issues an invoice for an accepted work"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(50);
      const order = await factory.orderOnReview(customer, executor, {
        title: uniqueTitle("Invoice issued"),
      });
      const adminOrders = new AdminOrdersPage(page);

      await factory.acceptWork(customer, order.id);

      await signInAs(page, "admin");
      await adminOrders.expectOpen();

      await expect(page.getByTestId(`issue-invoice-${order.id}`)).toBeVisible();
      await adminOrders.issueInvoice(order.id);

      const invoiced = await factory.getOrder(await factory.admin(), order.id);
      const invoice = invoiced.invoices?.[0];

      expect(invoiced.status).toBe("INVOICE_ISSUED");
      expect(invoice?.status).toBe("ISSUED");
      expect(invoice?.number).toMatch(/^INV-\d{4}-\d{6}$/u);
      expect(Number(invoice?.amount)).toBe(Number(invoiced.approvedAmount));

      // The customer is the one who has to pay, so the invoice reaches that panel.
      await signInAs(page, customer);
      await new CustomerOrdersPage(page).open();
      await expect(page.getByTestId(`invoice-payment-${invoice?.id}`)).toBeVisible();
    },
  );

  test(
    qc(
      "money.customer.report-payment",
      "Reports a payment and hands the receipt to the administrator"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(50);
      const order = await factory.orderInvoiceIssued(customer, executor, {
        title: uniqueTitle("Payment reported"),
      });
      const invoice = order.invoices?.[0];
      const orders = new CustomerOrdersPage(page);
      const adminOrders = new AdminOrdersPage(page);

      expect(invoice?.status).toBe("ISSUED");

      await signInAs(page, customer);
      await orders.open();

      await expect(page.getByTestId(`payment-receipt-${invoice?.id}`)).toBeVisible();
      await orders.reportPayment(invoice?.id as string, pdfFile("transfer-receipt.pdf"));

      // The upload settles asynchronously: the report is polled until the API
      // returns it, instead of reading the order the instant the button was hit.
      await expect
        .poll(
          async () =>
            (await factory.getOrder(customer, order.id)).invoices?.[0]?.paymentReports?.[0]?.status,
        )
        .toBe("PENDING");

      const reported = await factory.getOrder(customer, order.id);
      const report = reported.invoices?.[0]?.paymentReports?.[0];

      expect(reported.invoices?.[0]?.status).toBe("ISSUED");
      expect(report?.filename).toBe("transfer-receipt.pdf");

      // The receipt is the administrator's to review, and the review is a download
      // of the file the customer just sent.
      await signInAs(page, "admin");
      await adminOrders.expectOpen();
      await expect(page.getByTestId(`download-payment-receipt-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`confirm-payment-${order.id}`)).toBeVisible();
      await expect(page.getByTestId(`reject-payment-${order.id}`)).toBeVisible();
    },
  );

  test(
    qc("money.admin.confirm-payment", "Confirms the reported payment and the order is paid"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(50);
      const order = await factory.orderInvoiceIssued(customer, executor, {
        title: uniqueTitle("Payment confirmed"),
      });
      const adminOrders = new AdminOrdersPage(page);
      const orders = new CustomerOrdersPage(page);

      await factory.reportPayment(customer, order.id, pdfFile("paid-receipt.pdf"));

      await signInAs(page, "admin");
      await adminOrders.expectOpen();
      await adminOrders.confirmPayment(order.id);

      const paid = await factory.getOrder(await factory.admin(), order.id);

      expect(paid.status).toBe("INVOICE_PAID");
      expect(paid.invoices?.[0]?.status).toBe("PAID");
      expect(paid.invoices?.[0]?.paymentReports?.[0]?.status).toBe("CONFIRMED");

      // Confirming the payment is not completing the order: that stays a separate
      // act, and the customer still sees a paid invoice rather than a closed order.
      await signInAs(page, customer);
      await orders.open();
      await expect(orders.card(order.id)).toContainText("Invoice paid");
    },
  );

  test(
    qc("money.admin.complete", "Completes a paid order"),
    { tag: "@smoke" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(50);
      const order = await factory.orderInvoicePaid(customer, executor, {
        title: uniqueTitle("Completed order"),
      });
      const adminOrders = new AdminOrdersPage(page);
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);

      expect(order.status).toBe("INVOICE_PAID");

      await signInAs(page, "admin");
      await adminOrders.expectOpen();

      await expect(page.getByTestId(`complete-order-${order.id}`)).toBeVisible();
      await adminOrders.completeOrder(order.id);

      const completed = await factory.getOrder(await factory.admin(), order.id);

      expect(completed.status).toBe("COMPLETED");
      expect(completed.completedAt ?? null).not.toBeNull();

      await signInAs(page, customer);
      await orders.open();
      await expect(orders.card(order.id)).toContainText("Completed");

      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);
      await expect(detail.surface()).toContainText("Completed");
    },
  );

  test(
    qc(
      "money.admin.reject-report",
      "Rejects a payment report and keeps the order invoiced"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(50);
      const order = await factory.orderInvoiceIssued(customer, executor, {
        title: uniqueTitle("Receipt rejected"),
      });
      const invoice = order.invoices?.[0];
      const adminOrders = new AdminOrdersPage(page);
      const orders = new CustomerOrdersPage(page);

      await factory.reportPayment(customer, order.id, pdfFile("illegible-receipt.pdf"));

      await signInAs(page, "admin");
      await adminOrders.expectOpen();
      await adminOrders.rejectPayment(order.id, "The receipt is unreadable");

      const rejected = await factory.getOrder(await factory.admin(), order.id);
      const report = rejected.invoices?.[0]?.paymentReports?.[0];

      // A refused receipt does not end the invoice: the order stays payable and a
      // new receipt can be sent.
      expect(rejected.status).toBe("INVOICE_ISSUED");
      expect(rejected.invoices?.[0]?.status).toBe("ISSUED");
      expect(report?.status).toBe("REJECTED");
      expect(report?.reviewComment).toBe("The receipt is unreadable");

      await signInAs(page, customer);
      await orders.open();
      await expect(page.getByTestId(`payment-receipt-${invoice?.id}`)).toBeVisible();
    },
  );

  test(
    qc("money.admin.void-invoice", "Voids an unpaid invoice and issues a new one"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(50);
      const order = await factory.orderInvoiceIssued(customer, executor, {
        title: uniqueTitle("Invoice voided"),
      });
      const original = order.invoices?.[0];
      const adminOrders = new AdminOrdersPage(page);

      expect(original?.status).toBe("ISSUED");

      await signInAs(page, "admin");
      await adminOrders.expectOpen();

      await adminOrders.voidInvoice(original?.id as string, "Wrong amount on the first invoice");

      await expect
        .poll(
          async () => (await factory.getOrder(await factory.admin(), order.id)).invoices?.[0]?.status,
        )
        .toBe("VOID");

      const voided = await factory.getOrder(await factory.admin(), order.id);
      const first = voided.invoices?.[0];

      // Voiding keeps the order invoiced and leaves the reason on the record, so a
      // replacement invoice is possible (`invoices.service.ts:342-390`).
      expect(voided.status).toBe("INVOICE_ISSUED");
      expect(first?.status).toBe("VOID");

      await expect(page.getByTestId(`issue-invoice-${order.id}`)).toBeVisible();
      await adminOrders.issueInvoice(order.id);

      const reissued = await factory.getOrder(await factory.admin(), order.id);
      const invoices = reissued.invoices ?? [];

      expect(reissued.status).toBe("INVOICE_ISSUED");
      expect(invoices).toHaveLength(2);
      expect(invoices[1]?.status).toBe("ISSUED");
      expect(invoices[1]?.number).not.toBe(first?.number);
    },
  );

  test(
    qc("money.admin.void-paid", "Refuses to void a paid invoice"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate(50);
      const order = await factory.orderInvoicePaid(customer, executor, {
        title: uniqueTitle("Paid invoice"),
      });
      const invoice = order.invoices?.[0];
      const adminOrders = new AdminOrdersPage(page);

      expect(order.status).toBe("INVOICE_PAID");
      expect(invoice?.status).toBe("PAID");

      await signInAs(page, "admin");
      await adminOrders.expectOpen();

      // A paid invoice is immutable: no void form is offered for it.
      await expect(page.getByTestId(`void-invoice-reason-${invoice?.id}`)).toBeHidden();

      const refused = await page.request.post(
        `/api/orders/${order.id}/invoices/${invoice?.id}/void`,
        { data: { reason: "Trying to undo a paid invoice" } },
      );
      const body = (await refused.json()) as ErrorBody;

      expect(refused.status()).toBe(409);
      expect(body.code).toBe("CONFLICT");

      const stored = await factory.getOrder(await factory.admin(), order.id);

      expect(stored.status).toBe("INVOICE_PAID");
      expect(stored.invoices?.[0]?.status).toBe("PAID");
    },
  );
});
