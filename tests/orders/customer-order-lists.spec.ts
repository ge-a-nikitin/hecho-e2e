import { CustomerOrdersPage } from "../../pages/customer-orders.page.js";
import { OrderDetailPage } from "../../pages/order-detail.page.js";
import { qc } from "../../qase/qc.js";
import { expect, test } from "../../support/fixtures.js";
import { signInAs } from "../../support/steps/sign-in.js";

/**
 * Customer / Orders: how a person finds one order among many.
 *
 * The list is rendered from what `GET /orders` returned, and paging happens in
 * the browser (`docs/sut/quirks.md:97-99`), so every count here is a count of the
 * actor's own rows. The four cases left after the web layer took the filter math
 * are the ones a browser is needed for: the page controls move between pages, the
 * empty board is a different screen from a filtered-out list, the card is a route
 * that can be opened directly, and the list never shows another customer's order.
 */
const uniqueTitle = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;

test.describe("Customer order list", () => {
  test(
    qc("orders.list.paging", "Walks a long list with the next and previous page controls"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const orders = new CustomerOrdersPage(page);

      for (let index = 1; index <= 11; index += 1) {
        await factory.createOrder(customer, { title: `${uniqueTitle("Paged order")} ${index}` });
      }

      // The count comes from the API the panel renders, not from the database:
      // eleven orders exist for this account and nothing else does.
      expect(await factory.listOrders(customer)).toHaveLength(11);

      await signInAs(page, customer);
      await orders.open();

      await expect(orders.rows()).toHaveCount(10);
      await expect(orders.pageSummary()).toContainText("of 11");
      await expect(orders.pageSummary()).toContainText("page 1 of 2");

      await orders.nextPage();

      await expect(orders.rows()).toHaveCount(1);
      await expect(orders.pageSummary()).toContainText("page 2 of 2");

      await orders.previousPage();

      await expect(orders.rows()).toHaveCount(10);
      await expect(orders.pageSummary()).toContainText("page 1 of 2");
    },
  );

  test(
    qc("orders.list.empty-board", "Shows the empty board for a customer without orders"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const orders = new CustomerOrdersPage(page);

      expect(await factory.listOrders(customer)).toHaveLength(0);

      await signInAs(page, customer);
      await orders.open();

      // An account without orders gets the empty board, not the filtered-out
      // state, and the list container is not mounted at all.
      await expect(orders.emptyBoard()).toBeVisible();
      await expect(orders.list()).toBeHidden();
      await expect(orders.noResults()).toBeHidden();
    },
  );

  test(
    qc("orders.list.deep-link", "Opens the order card over the list from a deep link"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const title = uniqueTitle("Linked order");
      const order = await factory.createOrder(customer, { title });
      const orders = new CustomerOrdersPage(page);
      const detail = new OrderDetailPage(page);

      await signInAs(page, customer);

      // The card is a route, so the address alone has to open it.
      await page.goto(`/customer/orders/${order.id}`);
      await detail.expectOpen(order.id);
      await expect(detail.surface()).toContainText(title);

      await detail.close();
      await expect(page).toHaveURL(/\/customer$/u);
      await expect(orders.card(order.id)).toBeVisible();
    },
  );

  test(
    qc("orders.list.foreign-order", "Keeps another customer's order out of the list"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      const customer = await factory.createActor("CUSTOMER");
      const otherCustomer = await factory.createActor("CUSTOMER");
      const own = await factory.createOrder(customer, { title: uniqueTitle("Own order") });
      const foreignTitle = uniqueTitle("Foreign order");

      await factory.createOrder(otherCustomer, { title: foreignTitle });

      const orders = new CustomerOrdersPage(page);

      await signInAs(page, customer);
      await orders.open();

      await expect(orders.card(own.id)).toBeVisible();

      // No filter can reveal an order the API never returned: the search that
      // matches the foreign title finds nothing at all.
      await orders.search(foreignTitle);
      await expect(orders.noResults()).toBeVisible();
      await expect(orders.list()).toBeHidden();

      const visible = await factory.listOrders(customer);

      expect(visible.map((entry) => entry.id)).not.toContain(
        (await factory.listOrders(otherCustomer))[0]?.id,
      );
      expect(visible.map((entry) => entry.id)).toContain(own.id);
    },
  );
});
