import type { QaseCase } from "../types.js";

/**
 * Customer orders: finding one order among many.
 *
 * One entry per test in `tests/orders/customer-order-lists.spec.ts`. The filter
 * arithmetic — which rows a search or a status filter keeps, and the reset that
 * clears them — is pinned by the web layer's unit tests over the pure functions,
 * so this module keeps only the states a browser has to render: the page
 * controls, the two different empty screens, the card as a route, and the list
 * the ownership rule leaves visible.
 */
export const ordersListCases = [
  {
    key: "orders.list.paging",
    title: "Walks a long list with the next and previous page controls",
    suite: ["E2E", "Customer orders", "Paging"],
    description:
      "The panel pages ten rows at a time in the browser, because the API has no paging parameters: an " +
      "account with eleven orders sees ten, then the eleventh after the next control, then the first " +
      "ten again after the previous one. The case checks what the controls do, not the slice arithmetic.",
    preconditions:
      "A customer account with its own session and exactly eleven orders created through the data factory.",
    steps: [
      {
        action: "Sign in as the customer and open the panel.",
        expected:
          "Ten rows are listed and the page summary reports the first page of two for eleven orders.",
      },
      {
        action: "Click the next page control.",
        expected: "One row is listed and the summary reports the second page of two.",
      },
      {
        action: "Click the previous page control.",
        expected: "Ten rows are listed again and the summary reports the first page.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.list.empty-board",
    title: "Shows the empty board for a customer without orders",
    suite: ["E2E", "Customer orders", "Empty states"],
    description:
      "An account that has never created an order sees the empty board, and the list container is not " +
      "mounted at all. It is a different screen from the state a search leaves behind, which is pinned " +
      "by the web layer, so this case exists to keep a future regression from merging the two.",
    preconditions: "A customer account with its own session and no orders.",
    steps: [
      {
        action: "Sign in as the customer and open the panel.",
        expected: "The empty board is visible and the list container is absent.",
      },
      {
        action: "Look for the filtered-out state.",
        expected: "The no-results screen is not shown, because nothing was filtered.",
      },
    ],
    severity: "major",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.list.deep-link",
    title: "Opens the order card over the list from a deep link",
    suite: ["E2E", "Customer orders", "Card over list"],
    description:
      "An order address pasted into the address bar opens the card over the list on that panel, and " +
      "closing it returns to the list. The card loads its own entity, so the assertion is the title " +
      "inside it rather than the container that appears first.",
    preconditions:
      "A customer account with its own session and one order whose title is unique to the case.",
    steps: [
      {
        action: "Open the order card address directly.",
        expected: "The card is visible and shows the order's title, not the loading placeholder.",
      },
      {
        action: "Close the card.",
        expected: "The address is the panel route and the row is listed again.",
      },
    ],
    severity: "minor",
    priority: "low",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.list.foreign-order",
    title: "Keeps another customer's order out of the list",
    suite: ["E2E", "Customer orders", "Visibility"],
    description:
      "A customer sees only their own orders: another customer's order is not in the list, a search " +
      "for its title finds nothing, and the API returns the same restricted set the screen renders. " +
      "The case is a role boundary, so it asserts the absence on both sides.",
    preconditions:
      "Two customer accounts with their own sessions, one order for each, and a unique title for the " +
      "order the case must not see.",
    steps: [
      {
        action: "Sign in as the first customer and open the panel.",
        expected: "Their own order is listed.",
      },
      {
        action: "Search for the other customer's title.",
        expected: "The no-results state is shown and the foreign order never appears.",
      },
      {
        action: "Read the order list through the API with the first customer's account.",
        expected:
          "The response holds their own order and does not hold the other customer's order.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
] as const satisfies readonly QaseCase[];
