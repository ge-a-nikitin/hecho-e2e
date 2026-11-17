import { expect, type Locator, type Page } from "@playwright/test";
import type { UploadableFile } from "../support/files.js";

/**
 * The order card that opens over the list: a route, not a dialog
 * (`docs/sut/routes.md:24`; `docs/sut/quirks.md:37-38`).
 *
 * The card loads its own entity, so `expectOpen` waits for an id that only the
 * loaded body renders — the container appears while it still says "Loading
 * order…" (`quirks.md:84-85`). Actions here are the ones every role shares:
 * comment, attachment, cancel and close. What the status is stays the caller's
 * assertion; this object only reaches the controls.
 */
export class OrderDetailPage {
  constructor(private readonly page: Page) {}

  surface(): Locator {
    return this.page.getByTestId("order-detail");
  }

  /** Waits until the card of this order is on screen and finished loading. */
  async expectOpen(orderId: string): Promise<void> {
    await expect(this.surface()).toBeVisible();
    await expect(this.page).toHaveURL(new RegExp(`/orders/${orderId}$`, "u"));
    await expect(this.page.getByTestId("close-order-detail")).toBeVisible();
    await expect(this.surface().getByTestId("order-comment-form")).toBeVisible();
  }

  async close(): Promise<void> {
    await this.page.getByTestId("close-order-detail").click();
    await expect(this.surface()).toBeHidden();
  }

  /** Writes a comment and waits for it to be listed as the author wrote it. */
  async comment(text: string): Promise<void> {
    await this.page.getByTestId("order-comment-input").fill(text);
    await this.page.getByTestId("submit-order-comment").click();
    await expect(this.surface()).toContainText(text);
  }

  /** Attaches a fixture file; the input is a real file picker, so it takes bytes. */
  async attach(file: UploadableFile): Promise<void> {
    await this.page.getByTestId("order-attachment-file").setInputFiles({
      name: file.filename,
      mimeType: file.contentType,
      buffer: file.bytes,
    });
    await this.page.getByTestId("upload-order-attachment").click();
  }

  /** Cancels from the card; a reason is only sent when the form asks for one. */
  async cancel(reason?: string): Promise<void> {
    await expect(this.page.getByTestId("cancel-order-form")).toBeVisible();

    if (reason !== undefined) {
      await this.page.getByTestId("cancel-order-reason").fill(reason);
    }

    await this.page.getByTestId("cancel-order-submit").click();
  }
}
