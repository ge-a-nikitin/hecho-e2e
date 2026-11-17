import type { QaseCase } from "../types.js";

/**
 * Customer / Estimates: answering the executor's proposal.
 *
 * One entry per test in `tests/estimates/customer-estimates.spec.ts`. An estimate
 * gates the work, so each expected result names the status the answer produces —
 * acceptance starts the order, a rejection returns it to the pool — and the cases
 * read the other side of the role boundary as well.
 */
export const estimatesCases = [
  {
    key: "estimates.customer.accept",
    title: "Accepts the estimate and the order starts",
    suite: ["E2E", "Estimates", "Accepting"],
    description:
      "The customer accepts the proposed estimate and the order leaves the pre-work state: the answer " +
      "block disappears and the executor is offered the work-time form, which only an order in progress " +
      "has. The case reads both sides, so the acceptance is proved to have a consequence.",
    preconditions:
      "A customer account, an executor with a rate, and an order assigned to that executor whose estimate " +
      "is still pending.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row offers the answer block with its accept action.",
      },
      {
        action: "Click the accept action.",
        expected: "The answer block disappears and the row reads as in progress.",
      },
      {
        action: "Open the order card.",
        expected: "The card reads as in progress, and the order carries an accepted estimate.",
      },
      {
        action: "Sign in as the executor and open the executor panel.",
        expected:
          "The work-time form is offered for the order and the estimate form is gone, so the work has started.",
      },
    ],
    severity: "blocker",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "estimates.customer.reject",
    title: "Rejects the estimate with a comment and the order returns to the pool",
    suite: ["E2E", "Estimates", "Rejecting"],
    description:
      "The customer answers the proposal with a rejection and a comment. The order does not stay with " +
      "the executor: the assignment is released, the estimate is recorded as rejected with the customer's " +
      "reason, and the order is offered to the pool again, which is what makes a rejection actionable.",
    preconditions:
      "A customer account, an executor with a rate, and an order assigned to that executor whose estimate " +
      "is still pending.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row offers the answer block for the pending estimate.",
      },
      {
        action: "Type a reason and click the reject action.",
        expected: "The answer block disappears and the row reads as awaiting distribution.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected:
          "The order is awaiting distribution without an executor, and its estimate is rejected with the comment.",
      },
      {
        action: "Sign in as the executor and open the executor panel.",
        expected:
          "The order offers its claim action again, and the estimate form is gone because it is no longer assigned.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "estimates.customer.await-proposal",
    title: "Offers no estimate controls to the customer before the executor proposes",
    suite: ["E2E", "Estimates", "Proposal visibility"],
    description:
      "An assigned order without a proposal asks the customer nothing; once the executor proposes, the " +
      "same order offers accept and reject. The pair of readings is the point: the control appears " +
      "because of the proposal, not because the order became assigned.",
    preconditions:
      "A customer account, an executor with a rate, and an order assigned to that executor with no " +
      "estimate proposed yet.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row reads as assigned and offers no answer block.",
      },
      {
        action: "Sign in as the executor and propose an estimate from the panel.",
        expected: "The estimate form is replaced by the stored proposal.",
      },
      {
        action: "Sign in as the customer and open the panel again.",
        expected: "The same row now offers the answer block with the accept and reject actions.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "estimates.customer.answer-twice",
    title: "Refuses a second answer to an estimate that is already accepted",
    suite: ["E2E", "Estimates", "Guards"],
    description:
      "Once an estimate is accepted the panel stops offering an answer, and a second answer sent straight " +
      "to the API is refused with a state conflict that leaves the order exactly as the first acceptance " +
      "produced it.",
    preconditions:
      "A customer account and an order whose estimate the customer already accepted, so the order is in progress.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row offers no answer block.",
      },
      {
        action: "Send an acceptance for the same estimate to the API with the page's own session.",
        expected: "The API answers 409 with a state conflict.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected: "The order is still in progress and its estimate is still accepted.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
] as const satisfies readonly QaseCase[];
