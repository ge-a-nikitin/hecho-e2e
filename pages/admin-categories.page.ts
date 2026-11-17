import { expect, type Locator, type Page } from "@playwright/test";

/**
 * `/admin/categories`: the only screen that creates and deactivates categories.
 *
 * A category the administrator deactivates disappears from the customer's
 * create-order select, which is the consequence the admin case asserts; the
 * screen itself only reports that the row changed. A newly created category is
 * found by its id, because a run that reuses a database may already hold its
 * name.
 */
export class AdminCategoriesPage {
  constructor(private readonly page: Page) {}

  row(categoryId: string): Locator {
    return this.page.getByTestId(`category-row-${categoryId}`);
  }

  /** Creates a category through the form and returns once the list names it. */
  async create(name: string): Promise<void> {
    await this.page.getByTestId("category-name-input").fill(name);
    await this.page.getByTestId("create-category").click();
    await expect(this.page.getByTestId("categories-list")).toContainText(name);
  }

  async deactivate(categoryId: string): Promise<void> {
    await this.page.getByTestId(`category-active-toggle-${categoryId}`).click();
    await expect(this.page.getByTestId(`category-inactive-${categoryId}`)).toBeVisible();
  }

  async rename(categoryId: string, name: string): Promise<void> {
    await this.page.getByTestId(`rename-category-${categoryId}`).click();
    await this.page.getByTestId(`category-edit-name-${categoryId}`).fill(name);
    await this.page.getByTestId(`save-category-${categoryId}`).click();
    await expect(this.row(categoryId)).toContainText(name);
  }
}
