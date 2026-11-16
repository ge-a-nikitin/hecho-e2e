import { expect, type Locator, type Page } from "@playwright/test";

/** What the create-order form accepts; the category and the executor travel as ids. */
export interface NewOrder {
  readonly title: string;
  readonly description: string;
  readonly categoryId: string;
  /** Calendar day in the `yyyy-mm-dd` shape the date input uses, not a timestamp. */
  readonly dueDate?: string;
  readonly location?: string;
  readonly executorId?: string;
}

/**
 * The customer panel: the order list and the create-order form that opens over it.
 *
 * The screen is one page object because the form is not a route. Methods here
 * stop at "the screen reacted"; which status that reaction produces is asserted
 * in the spec, so the same object can serve both the draft and the submit case.
 */
export class CustomerOrdersPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/customer");
    await expect(this.page.getByTestId("customer-panel")).toBeVisible();
  }

  async reload(): Promise<void> {
    await this.page.reload();
    await expect(this.page.getByTestId("customer-panel")).toBeVisible();
  }

  card(orderId: string): Locator {
    return this.page.getByTestId(`order-card-${orderId}`);
  }

  async openCreateForm(): Promise<void> {
    await this.page.getByTestId("create-order").click();
    await expect(this.page.getByTestId("create-order-form")).toBeVisible();
  }

  async fillNewOrder(input: NewOrder): Promise<void> {
    await this.page.getByTestId("order-title").fill(input.title);
    await this.page.getByTestId("order-description").fill(input.description);
    await this.page.getByTestId("order-category").selectOption(input.categoryId);

    if (input.dueDate !== undefined) {
      await this.page.getByTestId("order-due-date").fill(input.dueDate);
    }
    if (input.location !== undefined) {
      await this.page.getByTestId("order-location").fill(input.location);
    }
    if (input.executorId !== undefined) {
      await this.page.getByTestId("order-executor").selectOption(input.executorId);
    }
  }

  /** Leaves the order in `NEW`; the form closes only once the API accepted it. */
  async saveDraft(): Promise<void> {
    await this.page.getByTestId("save-draft").click();
    await expect(this.page.getByTestId("create-order-form")).toBeHidden();
  }

  /** Creates and submits in one action, so the order never sits in `NEW`. */
  async createAndSend(): Promise<void> {
    await this.page.getByTestId("submit-create-order").click();
    await expect(this.page.getByTestId("create-order-form")).toBeHidden();
  }

  async submitDraft(orderId: string): Promise<void> {
    await this.page.getByTestId(`submit-draft-${orderId}`).click();
  }

  /** Opens the order card, which is its own route: `<panel>/orders/<id>`. */
  async openOrder(orderId: string): Promise<void> {
    await this.page.getByTestId(`open-order-${orderId}`).click();
    await expect(this.page.getByTestId("order-detail")).toBeVisible();
    await expect(this.page).toHaveURL(new RegExp(`/customer/orders/${orderId}$`, "u"));
  }

  async closeOrder(): Promise<void> {
    await this.page.getByTestId("close-order-detail").click();
    await expect(this.page.getByTestId("order-detail")).toBeHidden();
  }
}
