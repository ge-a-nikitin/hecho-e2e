import type { QaseCase } from "../types.js";

/**
 * Customer / Orders — the create and submit slice.
 *
 * One entry per test in `tests/orders/customer-orders.spec.ts`, with the title
 * kept identical so `qc()` can reject drift. Expected results name the status
 * label the panel renders for each status; the mapping is recorded in
 * `docs/sut/quirks.md`, because the SUT exposes no test id for the label.
 */
export const ordersCases = [
  {
    key: "orders.draft.create",
    title: "Saves a new order as a draft and leaves it editable",
    suite: ["E2E", "Orders", "Creating"],
    description:
      "The customer fills the create-order form and saves it as a draft instead of sending it, so " +
      "the first step of the order lifecycle exists through the panel and the order stays editable " +
      "after a reload.",
    preconditions:
      "A customer account with no orders yet, an active category, and the customer signed in " +
      "through the shared sign-in step.",
    steps: [
      {
        action: "Open the customer panel.",
        expected: "The panel is empty: the empty state is visible instead of an order list.",
      },
      {
        action:
          "Click Create order, fill the title and the description, choose the category and click Save draft.",
        expected: "A row for the new order appears with its title and the status label Draft.",
      },
      {
        action: "Reload the panel.",
        expected:
          "The same row is still there with the status label Draft, and Edit is offered for it.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.draft.create-submit",
    title: "Creates and submits an order in one form submission",
    suite: ["E2E", "Orders", "Creating"],
    description:
      "A customer who is ready to publish presses the create-and-send button on the same form, and " +
      "the order never sits in an editable draft state: it arrives in the pool immediately, so the " +
      "one-action path produces the same state as save-then-submit.",
    preconditions:
      "A customer account with no orders yet, an active category, and the customer signed in " +
      "through the shared sign-in step.",
    steps: [
      {
        action:
          "Click Create order, fill the title and the description, choose the category and click Create and send.",
        expected: "A row for the new order appears with the status label Awaiting distribution.",
      },
      {
        action: "Look at the row's actions.",
        expected: "The submit action is not offered, because the order is past the draft status.",
      },
      {
        action: "Reload the panel.",
        expected: "The row still shows Awaiting distribution.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.draft.create-optional",
    title: "Keeps the optional due date and location on a saved draft",
    suite: ["E2E", "Orders", "Creating"],
    description:
      "The customer saves a draft together with the optional due date and location, then reopens " +
      "the order card and finds both values stored as entered, so the fields a draft exists for are " +
      "persisted and not merely held in the form.",
    preconditions:
      "A customer account with no orders yet, an active category, and the customer signed in " +
      "through the shared sign-in step.",
    steps: [
      {
        action:
          "Click Create order, fill title, description and category, set a due date and a work location, then click Save draft.",
        expected: "A row for the new order appears with the status label Draft.",
      },
      {
        action: "Open the order card.",
        expected:
          "The card shows the same calendar day and the same location text the form was given; a due date has no time component, so it cannot shift.",
      },
      {
        action: "Close the card, reload the panel and open the card again.",
        expected: "Both values are unchanged.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.draft.submit-pool",
    title: "Submits a draft without an executor and puts it in the pool",
    suite: ["E2E", "Orders", "Submitting"],
    description:
      "A saved draft is published to the pool by the customer, which leaves the editable draft " +
      "behind and makes the order visible to executors — the state the executor slice of the suite " +
      "starts from.",
    preconditions:
      "A customer account that owns a draft in the status NEW without an executor, and the " +
      "customer signed in through the shared sign-in step.",
    steps: [
      {
        action: "Open the customer panel.",
        expected:
          "The row shows Draft and offers the submit action for that order.",
      },
      {
        action: "Click the submit action of the row.",
        expected:
          "The same row shows Awaiting distribution and no longer offers the submit action.",
      },
      {
        action: "Reload the panel.",
        expected: "The status is still Awaiting distribution.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.draft.submit-executor",
    title: "Submits a draft with a chosen executor and assigns it",
    suite: ["E2E", "Orders", "Submitting"],
    description:
      "The same submit action lands in a different status when the draft carries an executor, so " +
      "the order skips the pool and is owned from the start; the assertion is the destination " +
      "status, not the absence of an error.",
    preconditions:
      "A customer account owning a draft that carries an executor, an active executor account to " +
      "attach to it, and the customer signed in through the shared sign-in step.",
    steps: [
      {
        action: "Open the customer panel.",
        expected: "The row shows Draft and names the executor it carries.",
      },
      {
        action: "Click the submit action of the row.",
        expected: "The row shows Assigned and not Awaiting distribution.",
      },
      {
        action: "Reload the panel.",
        expected: "The row still shows Assigned.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.draft.submit-again",
    title: "Rejects submitting the same order twice",
    suite: ["E2E", "Orders", "Guards"],
    description:
      "A submitted order is no longer a draft, so a repeated submission must change nothing: no " +
      "second status change and no second assignment offer, which is the guard that keeps the " +
      "distribution pool consistent.",
    preconditions:
      "A customer account owning an order that is already in the status WAITING_DISTRIBUTION, and " +
      "the customer signed in through the shared sign-in step.",
    steps: [
      {
        action: "Open the customer panel.",
        expected:
          "The row shows Awaiting distribution and the submit action is not offered, because the UI already reflects the guard.",
      },
      {
        action: "Send POST /api/orders/:id/submit again with the page's own session.",
        expected: "The API answers 409 with a message naming the state conflict.",
      },
      {
        action: "Reload the panel.",
        expected:
          "Exactly one row carries that title and its status is still Awaiting distribution.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "regression",
    behavior: "negative",
  },
  {
    key: "orders.submit.pool-visibility",
    title: "Offers a submitted order to executors in the pool",
    suite: ["E2E", "Orders", "Submitting"],
    description:
      "A submission is only complete when the other side can act on it: the order that left the " +
      "customer's draft state has to appear in the executor pool with its claim affordance, while a " +
      "draft must never be offered there. The case follows one submission across the role boundary, " +
      "so the status change on the customer panel is proved to have a consequence.",
    preconditions:
      "A customer account owning a draft without an executor, an executor account that owns nothing, " +
      "and both accounts reachable through the shared sign-in step.",
    steps: [
      {
        action: "Ask the API for the orders the executor can see while the order is still a draft.",
        expected:
          "The draft is not among them, because a draft has not left the customer's own list.",
      },
      {
        action:
          "Sign in as the customer, open the panel and click the submit action of the row.",
        expected: "The row shows Awaiting distribution.",
      },
      {
        action: "Sign the same browser in as the executor and open the executor panel.",
        expected:
          "The order is listed in the pool and offers its claim action, so the submitted order is visible and claimable for executors.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
] as const satisfies readonly QaseCase[];
