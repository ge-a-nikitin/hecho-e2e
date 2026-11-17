import type { QaseCase } from "../types.js";

/**
 * Executor / Orders: the pool, the estimate, the work log and the two ways an
 * assignment ends.
 *
 * One entry per test in `tests/executor/executor-orders.spec.ts`. The panel has no
 * row id, so every expected result here names the action a row offers; that is
 * also what the assertion reads, and it doubles as a statement about the status.
 */
export const executorCases = [
  {
    key: "executor.pool.claim",
    title: "Claims an order from the pool and becomes its executor",
    suite: ["E2E", "Orders", "Claiming"],
    description:
      "The first executor to claim a pooled order locks it to themselves: the claim action disappears, " +
      "the estimate form appears, and the order names the executor. Distribution therefore ends with an " +
      "owner who can price the work, not with an order that stays in the pool.",
    preconditions:
      "An executor account, a customer account whose order was submitted without an executor, and an " +
      "active category for that order.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The order is listed in the pool and offers its claim and open actions.",
      },
      {
        action: "Click the claim action of the order.",
        expected:
          "The claim action disappears and the estimate form is offered for the same order.",
      },
      {
        action: "Open the order card.",
        expected: "The card reads as assigned and names this executor.",
      },
      {
        action: "Refresh the panel.",
        expected:
          "The estimate form is still offered and no claim action is rendered, so the ownership survived a fresh read.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "executor.order.preassigned",
    title: "Shows an order submitted with the executor chosen as assigned already",
    suite: ["E2E", "Orders", "Claiming"],
    description:
      "A customer who names an executor skips the pool, so the executor has to find the order already " +
      "theirs: no claim action, the estimate form present, and the card naming them. It is the second " +
      "producer of an assignment, and it has to look like the first from the executor's side.",
    preconditions:
      "An executor account and an order a customer submitted with that executor already chosen.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The order is listed without a claim action.",
      },
      {
        action: "Look at the row's actions.",
        expected: "The estimate form is offered, so the order needs a price before work can start.",
      },
      {
        action: "Open the order card.",
        expected: "The card reads as assigned and names this executor.",
      },
    ],
    severity: "major",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "executor.pool.claim-locked",
    title: "Refuses a claim on an order another executor already took",
    suite: ["E2E", "Orders", "Guards"],
    description:
      "Two executors look at the same pooled order and one claims it first. The second sees no claim " +
      "action and cannot take the order by calling the endpoint directly, so a claimed order never ends " +
      "up with two owners and the first assignment stands.",
    preconditions:
      "Two executor accounts, a customer account, and an order the first executor has already claimed.",
    steps: [
      {
        action: "Sign in as the second executor and open the executor panel.",
        expected: "The order is not offered for claiming, because the pool no longer holds it.",
      },
      {
        action: "Send a claim for the order to the API with the second executor's session.",
        expected: "The API answers 409 with a state conflict.",
      },
      {
        action: "Sign in as the first executor and open the panel.",
        expected:
          "The order still offers the estimate form and no claim action, so the first owner kept the order.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "regression",
    behavior: "negative",
  },
  {
    key: "executor.pool.detail",
    title: "Opens a pooled order and reads the full description",
    suite: ["E2E", "Orders", "Claiming"],
    description:
      "An executor reads a pooled order in full before taking it: the card carries the whole brief and " +
      "the status, and closing it returns to the pool with the claim action still offered. The case " +
      "keeps the detail a read-only decision screen rather than a place that changes the order.",
    preconditions:
      "An executor account and a customer order submitted without an executor, so it waits in the pool.",
    steps: [
      {
        action: "Sign in as the executor, open the panel and open the pooled order.",
        expected: "The card shows the full description and reads as awaiting distribution.",
      },
      {
        action: "Close the card.",
        expected: "The address is the panel route and the order still offers its claim action.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "executor.estimate.propose",
    title: "Proposes an estimate and leaves the order assigned",
    suite: ["E2E", "Orders", "Estimating"],
    description:
      "The assigned executor proposes hours from the panel and the order stays assigned: the amount is " +
      "the executor's own rate multiplied by the hours, and the work only starts when the customer " +
      "accepts. The case therefore asserts the stored estimate and the unchanged status together.",
    preconditions:
      "An executor account with an hourly rate and an order assigned to that executor, with no estimate " +
      "proposed yet.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The order offers the hours field and its submit control.",
      },
      {
        action: "Enter three hours and submit the estimate.",
        expected: "The form is replaced by the stored proposal.",
      },
      {
        action: "Open the order card.",
        expected: "The card still reads as assigned, not as in progress.",
      },
      {
        action: "Read the order through the API as the executor.",
        expected: "The order carries one pending estimate of three hours worth the rate times three.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "executor.estimate.handoff",
    title: "Offers the proposed estimate to the customer for a decision",
    suite: ["E2E", "Orders", "Estimating"],
    description:
      "A proposal is only worth anything when the customer can act on it: the estimate the executor sent " +
      "is offered on the customer's order card together with the accept and reject actions, while the " +
      "order still reads as assigned. Accepting and rejecting are the estimates slice.",
    preconditions:
      "A customer account, an executor with a rate, and an order assigned to that executor whose estimate " +
      "is pending.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The order's row reads as assigned.",
      },
      {
        action: "Look at the row's answer block.",
        expected:
          "The estimate is offered with an accept action and a reject action, so the pending proposal is the customer's to answer.",
      },
      {
        action: "Open the order card.",
        expected: "The card still reads as assigned, because only the answer moves the order on.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "executor.order.decline",
    title: "Declines an assigned order and it returns to the pool",
    suite: ["E2E", "Executor", "Declining"],
    description:
      "An executor who does not want an assigned order hands it back: the decline action disappears, the " +
      "order is offered in the pool again, and a second executor can take it. The pool is the assertion, " +
      "because that is what makes a refused assignment harmless.",
    preconditions:
      "Two executor accounts and an order a customer submitted with the first executor chosen.",
    steps: [
      {
        action: "Sign in as the first executor and open the executor panel.",
        expected: "The order offers the decline action and no claim action.",
      },
      {
        action: "Click the decline action.",
        expected:
          "The decline action and the estimate form disappear, and the claim action is offered again.",
      },
      {
        action: "Sign in as the second executor and open the panel.",
        expected: "The order offers its claim action, so it is back in the pool.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected: "The order is awaiting distribution and carries no executor.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "executor.order.decline-pool",
    title: "Refuses to decline an order that is not an assignment",
    suite: ["E2E", "Executor", "Guards"],
    description:
      "Declining answers an assignment: on an order that sits in the pool the executor is offered no " +
      "decline control, and a decline sent to the API is refused with a state conflict that leaves the " +
      "order in the pool. The case pairs the screen with the endpoint so neither can drift alone.",
    preconditions:
      "An executor account and a customer order submitted without an executor, so it waits in the pool.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The order offers its claim action and no decline action.",
      },
      {
        action: "Send a decline for the order to the API with the executor's session.",
        expected: "The API answers 409 with a state conflict.",
      },
      {
        action: "Read the order through the API as the customer and refresh the panel.",
        expected:
          "The order is still awaiting distribution without an executor and still offers its claim action.",
      },
    ],
    severity: "major",
    priority: "low",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
  {
    key: "executor.order.time",
    title: "Records work time on an order in progress",
    suite: ["E2E", "Executor", "Work log"],
    description:
      "While the order is in progress the executor logs minutes and a note; the entry is stored on the " +
      "order, survives a reload and is rendered on the card. The customer's review and the invoice both " +
      "lean on that record, which is why it is asserted through the API and the screen.",
    preconditions:
      "An executor with a rate and an order it owns whose estimate the customer accepted, so the order is " +
      "in progress and holds no time entry yet.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The order offers the minutes field, the note field and the save action.",
      },
      {
        action: "Enter 90 minutes with a note and save.",
        expected: "The order stores that entry with its note.",
      },
      {
        action: "Refresh the panel and open the order card.",
        expected:
          "The form shows the stored 90 minutes and the card renders the duration as one hour and thirty minutes.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "executor.order.time-again",
    title: "Replaces the recorded time instead of adding a second entry",
    suite: ["E2E", "Executor", "Work log"],
    description:
      "An order holds one time entry, so a second save corrects the first rather than adding a line: the " +
      "minutes and the note are both replaced, and the form reopens on the corrected value. The case " +
      "pins a data model the draft assumed to be a log and the schema says is a single record.",
    preconditions:
      "An executor with a rate, an order in progress, and one time entry already recorded for it.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The minutes field opens on the stored 30 minutes.",
      },
      {
        action: "Enter 45 minutes with a new note and save.",
        expected: "The order stores 45 minutes with the new note.",
      },
      {
        action: "Refresh the panel.",
        expected:
          "The field shows 45 minutes, so the second save replaced the entry instead of adding one.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
] as const satisfies readonly QaseCase[];
