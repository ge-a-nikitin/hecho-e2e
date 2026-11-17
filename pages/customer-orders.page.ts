import { expect, type Locator, type Page } from "@playwright/test";
import type { UploadableFile } from "../support/files.js";

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

/** What the draft edit form changes; a field left out is not touched. */
export interface DraftEdit {
  readonly title?: string;
  readonly description?: string;
  readonly categoryId?: string;
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

  /** The list container: mounted only when the account has orders. */
  list(): Locator {
    return this.page.getByTestId("orders-list");
  }

  /** Every row the current page renders, addressed by the row's own id. */
  rows(): Locator {
    return this.page.getByTestId(/^order-card-/u);
  }

  /** The two empty states are different screens, so each has its own locator. */
  emptyBoard(): Locator {
    return this.page.getByTestId("orders-empty-state");
  }

  noResults(): Locator {
    return this.page.getByTestId("orders-no-results");
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

  // --- Editing a draft -------------------------------------------------------

  async startEditingDraft(orderId: string): Promise<void> {
    await this.page.getByTestId(`edit-order-${orderId}`).click();
    await expect(this.page.getByTestId(`edit-order-form-${orderId}`)).toBeVisible();
  }

  async fillDraftEdit(orderId: string, input: DraftEdit): Promise<void> {
    if (input.title !== undefined) {
      await this.page.getByTestId(`edit-title-${orderId}`).fill(input.title);
    }
    if (input.description !== undefined) {
      await this.page.getByTestId(`edit-description-${orderId}`).fill(input.description);
    }
    if (input.categoryId !== undefined) {
      await this.page.getByTestId(`edit-category-${orderId}`).selectOption(input.categoryId);
    }
    if (input.dueDate !== undefined) {
      await this.page.getByTestId(`edit-due-date-${orderId}`).fill(input.dueDate);
    }
    if (input.location !== undefined) {
      await this.page.getByTestId(`edit-location-${orderId}`).fill(input.location);
    }
    if (input.executorId !== undefined) {
      await this.page.getByTestId(`edit-executor-${orderId}`).selectOption(input.executorId);
    }
  }

  async saveDraftEdit(orderId: string): Promise<void> {
    await this.page.getByTestId(`save-draft-${orderId}`).click();
    await expect(this.page.getByTestId(`edit-order-form-${orderId}`)).toBeHidden();
  }

  // --- Filters and paging ----------------------------------------------------

  async search(text: string): Promise<void> {
    await this.page.getByTestId("order-search").fill(text);
  }

  async filterStatus(status: string): Promise<void> {
    await this.page.getByTestId("order-status-filter").selectOption(status);
  }

  async filterCategory(categoryId: string): Promise<void> {
    await this.page.getByTestId("order-category-filter").selectOption(categoryId);
  }

  /** The reset inside the filter bar, which clears every control at once. */
  async resetFilters(): Promise<void> {
    await this.page.getByTestId("order-filters-reset").click();
  }

  async nextPage(): Promise<void> {
    await this.page.getByTestId("orders-next-page").click();
  }

  async previousPage(): Promise<void> {
    await this.page.getByTestId("orders-prev-page").click();
  }

  pageSummary(): Locator {
    return this.page.getByTestId("orders-page-summary");
  }

  // --- Answering an estimate and reviewing work ------------------------------

  async acceptEstimate(orderId: string): Promise<void> {
    await this.page.getByTestId(`accept-estimate-${orderId}`).click();
  }

  async rejectEstimate(orderId: string, comment: string): Promise<void> {
    await this.page.getByTestId(`estimate-reject-comment-${orderId}`).fill(comment);
    await this.page.getByTestId(`reject-estimate-${orderId}`).click();
  }

  async acceptWork(orderId: string): Promise<void> {
    await this.page.getByTestId(`accept-work-${orderId}`).click();
  }

  async requestRevision(orderId: string, comment: string): Promise<void> {
    await this.page.getByTestId(`revision-comment-${orderId}`).fill(comment);
    await this.page.getByTestId(`request-revision-${orderId}`).click();
  }

  /** Uploads the receipt the administrator reviews afterwards. */
  async reportPayment(invoiceId: string, file: UploadableFile): Promise<void> {
    await this.page.getByTestId(`payment-receipt-${invoiceId}`).setInputFiles({
      name: file.filename,
      mimeType: file.contentType,
      buffer: file.bytes,
    });
    await this.page.getByTestId(`report-payment-${invoiceId}`).click();
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
