import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The executor panel: the pool of orders that were submitted and are not
 * assigned yet.
 *
 * A pool row has no test id of its own — `order-card-<id>` exists only on the
 * customer panel — so a case addresses the actions inside it,
 * `open-order-<id>` and `claim-order-<id>` (`docs/sut/quirks.md`). The list
 * mounts before its rows arrive, which is why `open()` waits for the panel and
 * not for the pool.
 */
export class ExecutorOrdersPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/executor");
    await expect(this.page.getByTestId("executor-panel")).toBeVisible();
  }

  /** The affordance that says "this order is in the pool and I may take it". */
  claimAction(orderId: string): Locator {
    return this.page.getByTestId(`claim-order-${orderId}`);
  }

  openOrderAction(orderId: string): Locator {
    return this.page.getByTestId(`open-order-${orderId}`);
  }
}
