import type { QaseCase } from "../types.js";

/**
 * Customer orders: editing a draft and cancelling before work.
 *
 * One entry per test in `tests/orders/customer-orders-edit.spec.ts`. Both halves
 * check a permission the screen and the endpoint share: what the panel offers has
 * to match what the API accepts, so each case reads one and calls the other.
 */
export const ordersEditCases = [
  {
    key: "orders.draft.edit",
    title: "Edits a draft order and the change survives a reload",
    suite: ["E2E", "Customer orders", "Editing"],
    description:
      "The customer reopens a draft, changes its title and description and saves; the list and the card " +
      "show the new text after a reload and the order is still a draft, since `NEW` is the only status " +
      "whose fields are editable.",
    preconditions:
      "A customer account with its own session, an active category, and one draft created through the " +
      "data factory.",
    steps: [
      {
        action: "Sign in as the customer and open the panel.",
        expected: "The draft row offers its draft actions, including the edit action.",
      },
      {
        action: "Click the edit action of the row.",
        expected: "The edit form opens with the stored title and description prefilled.",
      },
      {
        action: "Change the title and the description and save the draft.",
        expected: "The form closes and the row shows the new title.",
      },
      {
        action: "Reload the panel and open the order card.",
        expected:
          "The card shows the new title and description, and the order is still in the draft status.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.draft.edit-after-submit",
    title: "Refuses to edit an order that already left the draft",
    suite: ["E2E", "Customer orders", "Guards"],
    description:
      "Editability ends with the submission: the submitted order offers no draft actions, and an edit " +
      "sent straight to the API is refused and leaves both the text and the status untouched. The case " +
      "pairs the screen with the endpoint so neither can regress alone.",
    preconditions:
      "A customer account with its own session and an order it submitted, so the order waits in the " +
      "distribution pool.",
    steps: [
      {
        action: "Sign in as the customer and open the panel.",
        expected: "The submitted row offers no edit action and no draft actions block.",
      },
      {
        action: "Send an edit of the title to the API with the page's own session.",
        expected: "The API answers 409 with a message naming the draft rule.",
      },
      {
        action: "Reload the panel.",
        expected: "The row still shows the original title and the order is still awaiting distribution.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
  {
    key: "orders.cancel.before-work",
    title: "Cancels a submitted order before work starts",
    suite: ["E2E", "Customer orders", "Cancellation"],
    description:
      "The customer cancels an order that nobody has taken from the pool yet, without a reason, and the " +
      "order leaves the pool for executors. The control is the cancel form inside the order card, and " +
      "the proof that the cancellation mattered is that no executor can claim the order afterwards.",
    preconditions:
      "A customer account, an executor account and an order submitted without an executor, so it waits " +
      "in the pool.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The order is listed in the pool and offers its claim action.",
      },
      {
        action: "Sign in as the customer, open the order card and submit the cancel form without a reason.",
        expected: "The cancel form disappears from the card.",
      },
      {
        action: "Sign in as the executor again and open the executor panel.",
        expected: "The order offers no claim action, because it left the pool.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.cancel.withdraws-estimate",
    title: "Cancelling an assigned order withdraws the estimate awaiting an answer",
    suite: ["E2E", "Customer orders", "Cancellation"],
    description:
      "A cancelled order never carries a half-finished assignment: the customer cancels while the " +
      "executor's estimate still waits for an answer, and the proposal is withdrawn together with the " +
      "order instead of staying behind as a question nobody can answer.",
    preconditions:
      "A customer account and an executor with an hourly rate, and an order assigned to that executor " +
      "whose estimate is still pending.",
    steps: [
      {
        action: "Sign in as the customer and open the panel.",
        expected: "The row offers the answer block for the pending estimate.",
      },
      {
        action: "Open the order card and submit the cancel form.",
        expected: "The cancel form disappears.",
      },
      {
        action: "Close the card and look at the row.",
        expected: "The estimate answer block is gone, and the order reads as cancelled.",
      },
      {
        action: "Sign in as the executor and open the executor panel.",
        expected:
          "The order offers neither the estimate form nor a claim action: a cancelled order keeps its executor " +
          "but no action.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.cancel.after-work-by-customer",
    title: "Refuses a customer cancellation once work has started",
    suite: ["E2E", "Customer orders", "Guards"],
    description:
      "After work starts only the administrator may cancel: the customer's card offers no cancel form, " +
      "and a cancellation sent to the API is refused with a forbidden answer and leaves the order where " +
      "it was. The rule is a product decision, so the case asserts the code and the unchanged status.",
    preconditions:
      "A customer account and an executor, and an order whose estimate the customer accepted, so the " +
      "order is in progress.",
    steps: [
      {
        action: "Sign in as the customer and open the order card.",
        expected: "The card offers no cancel form.",
      },
      {
        action: "Send a cancellation to the API with the page's own session.",
        expected: "The API answers 403 forbidden, not a state conflict.",
      },
      {
        action: "Reload the panel.",
        expected: "The order is still in progress, so the refusal changed nothing.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
] as const satisfies readonly QaseCase[];
