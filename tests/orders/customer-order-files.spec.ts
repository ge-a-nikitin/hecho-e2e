import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { ExecutorOrdersPage } from "../../pages/executor-orders.page.js";
import { OrderDetailPage } from "../../pages/order-detail.page.js";
import { qc } from "../../qase/qc.js";
import { pngFile } from "../../support/files.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Customer / Orders: the comment thread and the files on an order card.
 *
 * Both are the part of an order that is not a status change, and both only make
 * sense across the role boundary: a comment nobody else reads is not a comment,
 * and an attachment the other participant cannot open is not an attachment. Each
 * case therefore acts on one side and asserts on the other.
 *
 * The card loads its own entity and the file list is part of it
 * (`order-detail.tsx:459-489`), so a case waits for the file name inside the card
 * rather than for the card alone.
 */
const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

test.describe("Customer order record", () => {
  test(
    qc(
      "orders.comment.visibility",
      "Leaves a comment the other participant can read"
    ),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.orderAssigned(customer, executor, {
        title: uniqueTitle("Commented order"),
      });
      const comment = `Please start with the report ${Date.now().toString(36)}`;
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);
      const pool = new ExecutorOrdersPage(page);

      await signInAs(page, customer);
      await orders.open();
      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);

      await detail.comment(comment);

      const withComment = await factory.getOrder(customer, order.id);

      expect(withComment.comments?.[0]?.content).toBe(comment);

      // The executor of the order is the participant who has to read it.
      await signInAs(page, executor);
      await pool.open();
      await pool.openOrder(order.id);
      await detail.expectOpen(order.id);
      await expect(detail.surface()).toContainText(comment);
    },
  );

  test(
    qc("orders.attachment.upload", "Uploads an attachment the other participant can see"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const executor = await factory.executorWithRate();
      const order = await factory.createOrder(customer, { title: uniqueTitle("Attached brief") });
      const file = pngFile("floor-plan.png");
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);
      const pool = new ExecutorOrdersPage(page);

      await signInAs(page, customer);
      await orders.open();
      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);

      await detail.attach(file);
      await expect(detail.surface()).toContainText(file.filename);

      const stored = await factory.getOrder(customer, order.id);

      expect(stored.attachments?.[0]?.filename).toBe(file.filename);
      expect(stored.attachments?.[0]?.contentType).toBe("image/png");

      // A file that the executor cannot see would not be an attachment, so the
      // order is submitted to the executor the brief is for.
      await factory.submitDraft(customer, order.id);
      await signInAs(page, executor);
      await pool.open();
      await pool.openOrder(order.id);
      await detail.expectOpen(order.id);
      await expect(detail.surface()).toContainText(file.filename);
    },
  );

  test(
    qc("orders.attachment.download", "Downloads an attachment with its filename"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const order = await factory.createOrder(customer, { title: uniqueTitle("Downloadable file") });
      const file = pngFile("measurements.png");
      const stored = await factory.uploadAttachment(customer, order.id, file);
      const attachment = stored.attachments?.[0];
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);

      expect(attachment?.filename).toBe(file.filename);

      await signInAs(page, customer);
      await orders.open();
      await orders.openOrder(order.id);
      await detail.expectOpen(order.id);

      // The download is a browser event: the file keeps the name it was uploaded
      // under, which is what makes it recognisable in the downloads folder.
      const download = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId(`download-order-attachment-${attachment?.id}`).click(),
      ]).then(([event]) => event);

      expect(download.suggestedFilename()).toBe(file.filename);
    },
  );
});
