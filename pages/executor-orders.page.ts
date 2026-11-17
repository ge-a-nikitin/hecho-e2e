import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The executor panel: the pool of unassigned orders and the work the executor
 * already owns.
 *
 * A pool row has no test id of its own — `order-card-<id>` exists only on the
 * customer panel — so a case addresses the actions inside it,
 * `open-order-<id>` and `claim-order-<id>` (`docs/sut/quirks.md:76-82`). The list
 * mounts before its rows arrive, which is why `open()` waits for the panel and
 * not for the pool.
 *
 * Which actions exist is decided by the status: `claim-order-<id>` in the pool,
 * the estimate form on `ASSIGNED`, the time form and `submit-review-<id>` on
 * `IN_PROGRESS`, `resume-revisions-<id>` on `NEEDS_REVISION`. A case that waits
 * for one of them is also asserting that the product offers it now.
 */
export class ExecutorOrdersPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/executor");
    await expect(this.page.getByTestId("executor-panel")).toBeVisible();
  }

  async reload(): Promise<void> {
    await this.page.getByTestId("executor-refresh").click();
    await expect(this.page.getByTestId("executor-panel")).toBeVisible();
  }

  /** The affordance that says "this order is in the pool and I may take it". */
  claimAction(orderId: string): Locator {
    return this.page.getByTestId(`claim-order-${orderId}`);
  }

  openOrderAction(orderId: string): Locator {
    return this.page.getByTestId(`open-order-${orderId}`);
  }

  async claim(orderId: string): Promise<void> {
    await this.claimAction(orderId).click();
    await expect(this.page.getByTestId(`estimate-hours-${orderId}`)).toBeVisible();
  }

  async decline(orderId: string): Promise<void> {
    await this.page.getByTestId(`decline-order-${orderId}`).click();
    await expect(this.page.getByTestId(`claim-order-${orderId}`)).toBeVisible();
  }

  /** Proposes hours; the amount is the rate times them, which the card then shows. */
  async proposeEstimate(orderId: string, hours: number): Promise<void> {
    await this.page.getByTestId(`estimate-hours-${orderId}`).fill(String(hours));
    await this.page.getByTestId(`submit-estimate-${orderId}`).click();
    await expect(this.page.getByTestId(`estimate-hours-${orderId}`)).toBeHidden();
  }

  async logTime(orderId: string, minutes: number, comment?: string): Promise<void> {
    await this.page.getByTestId(`work-time-${orderId}`).fill(String(minutes));
    if (comment !== undefined) {
      await this.page.getByTestId(`work-time-comment-${orderId}`).fill(comment);
    }
    await this.page.getByTestId(`save-work-time-${orderId}`).click();
  }

  async submitForReview(orderId: string): Promise<void> {
    await this.page.getByTestId(`submit-review-${orderId}`).click();
    await expect(this.page.getByTestId(`submit-review-${orderId}`)).toBeHidden();
  }

  async resumeRevisions(orderId: string): Promise<void> {
    await this.page.getByTestId(`resume-revisions-${orderId}`).click();
    await expect(this.page.getByTestId(`save-work-time-${orderId}`)).toBeVisible();
  }

  async openOrder(orderId: string): Promise<void> {
    await this.openOrderAction(orderId).click();
    await expect(this.page.getByTestId("order-detail")).toBeVisible();
    await expect(this.page).toHaveURL(new RegExp(`/executor/orders/${orderId}$`, "u"));
  }
}

