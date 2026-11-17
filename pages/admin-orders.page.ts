import { expect, type Locator, type Page } from "@playwright/test";

/**
 * `/admin`: every order in the system, with the actions only an administrator has.
 *
 * The list is addressed per order through `admin-order-<id>`, and each block of
 * actions is conditional on the status (`role-order-panels.tsx:487-700`), so a
 * case that waits for an affordance is also asserting that the product offers it
 * in that state. The customer's card id does not exist here: this is the panel's
 * own id.
 */
export class AdminOrdersPage {
  constructor(private readonly page: Page) {}

  async expectOpen(): Promise<void> {
    await expect(this.page.getByTestId("admin-orders")).toBeVisible();
  }

  card(orderId: string): Locator {
    return this.page.getByTestId(`admin-order-${orderId}`);
  }

  async assign(orderId: string, executorId: string): Promise<void> {
    await this.page.getByTestId(`assign-executor-${orderId}`).selectOption(executorId);
    await this.page.getByTestId(`submit-assignment-${orderId}`).click();
  }

  async issueInvoice(orderId: string): Promise<void> {
    await this.page.getByTestId(`issue-invoice-${orderId}`).click();
    await expect(this.card(orderId).getByTestId(`payment-review-${orderId}`)).toBeVisible();
  }

  /** Confirms the receipt the customer uploaded. */
  async confirmPayment(orderId: string): Promise<void> {
    await this.page.getByTestId(`confirm-payment-${orderId}`).click();
    await expect(this.page.getByTestId(`complete-order-${orderId}`)).toBeVisible();
  }

  async rejectPayment(orderId: string, reason: string): Promise<void> {
    await this.page.getByTestId(`reject-payment-reason-${orderId}`).fill(reason);
    await this.page.getByTestId(`reject-payment-${orderId}`).click();
    await expect(this.page.getByTestId(`download-rejected-payment-receipt-${orderId}`)).toBeVisible();
  }

  async voidInvoice(invoiceId: string, reason: string): Promise<void> {
    await this.page.getByTestId(`void-invoice-reason-${invoiceId}`).fill(reason);
    await this.page.getByTestId(`void-invoice-${invoiceId}`).click();
  }

  async completeOrder(orderId: string): Promise<void> {
    await this.page.getByTestId(`complete-order-${orderId}`).click();
    await expect(this.page.getByTestId(`complete-order-section-${orderId}`)).toBeHidden();
  }
}
