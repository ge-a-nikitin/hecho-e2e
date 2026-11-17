import type { QaseCase } from "../types.js";

/**
 * Review: the executor submits the result and the customer answers.
 *
 * One entry per test in `tests/review/review.spec.ts`. Accepting the work is the
 * interesting rule: it records a fact and keeps the order in review, because the
 * invoice that follows is a separate act. Every case reads both sides of the role
 * boundary, so an answer is proved to reach the other participant.
 */
export const reviewCases = [
  {
    key: "review.executor.submit",
    title: "Submits the finished work and the order reaches review",
    suite: ["E2E", "Review", "Submitting"],
    description:
      "While the order is in progress the executor records time and submits the result; the work " +
      "affordances disappear and the customer is offered the two answers. Submission is the only way an " +
      "invoice can ever follow, so the case ends at the customer's side of the boundary.",
    preconditions:
      "A customer account, an executor with a rate, and an order in progress whose estimate the customer " +
      "accepted.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The order offers the work-time form and the submit action.",
      },
      {
        action: "Click the submit action.",
        expected: "The work-time form and the submit action disappear.",
      },
      {
        action: "Sign in as the customer and open the customer panel.",
        expected:
          "The row reads as under review and offers the accept-work and request-revision actions.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected: "The order is under review.",
      },
    ],
    severity: "blocker",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "review.customer.accept-work",
    title: "Accepts the work and the order keeps its status",
    suite: ["E2E", "Review", "Accepting"],
    description:
      "The customer accepts a submitted result: the review controls are answered and disappear, and the " +
      "order stays in review because the acceptance is a recorded fact and not a status. The " +
      "administrator is then offered the invoice, which is the only next step the lifecycle allows.",
    preconditions:
      "A customer account, an executor with a rate, and an order the executor has submitted for review.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row offers the answer block with the accept-work action.",
      },
      {
        action: "Click the accept-work action.",
        expected: "The answer block disappears and the row still reads as under review.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected: "The order is still under review and carries an acceptance time.",
      },
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The order offers the issue-invoice action.",
      },
    ],
    severity: "blocker",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "review.customer.request-revision",
    title: "Requests changes with a comment and the order moves to revision",
    suite: ["E2E", "Review", "Revision requests"],
    description:
      "The customer asks for changes with a written reason: the answer block is consumed, the order moves " +
      "to revision, and the executor is handed the order back with a resume control instead of a submit " +
      "control. That swap is what tells the executor work is needed.",
    preconditions:
      "A customer account, an executor with a rate, and an order the executor has submitted for review.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row offers the answer block with the request-revision action.",
      },
      {
        action: "Type a reason and send the request.",
        expected: "The answer block disappears and the row reads as needing revision.",
      },
      {
        action: "Sign in as the executor and open the executor panel.",
        expected:
          "The resolve action is offered for the order and the submit action is not, so the work has to be taken on again.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected: "The order needs revision.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "review.executor.resume",
    title: "Resumes after a revision request and submits the result again",
    suite: ["E2E", "Review", "Resuming"],
    description:
      "The executor takes the revision request on, the order returns to work, and a second submission " +
      "reaches the customer's review again. It is the loop the revision feature exists for, and it proves " +
      "the pair of actions rather than either one.",
    preconditions:
      "A customer account, an executor with a rate, and an order the customer has returned for revision.",
    steps: [
      {
        action: "Sign in as the executor and open the executor panel.",
        expected: "The order offers the action that starts the requested changes.",
      },
      {
        action: "Click the action that starts the changes.",
        expected: "The work-time form and the submit action are offered again.",
      },
      {
        action: "Submit the result a second time.",
        expected: "The work affordances disappear, so the order left the executor again.",
      },
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The answer block is offered a second time and the order is under review.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "review.customer.accept-before-review",
    title: "Refuses to accept work that was never submitted for review",
    suite: ["E2E", "Review", "Guards"],
    description:
      "Acceptance belongs to a submitted result: on an order that is still in progress the customer is " +
      "offered no review controls and an acceptance sent straight to the API is refused with a state " +
      "conflict that leaves the order — and its acceptance time — untouched.",
    preconditions:
      "A customer account, an executor with a rate, and an order in progress that the executor has not " +
      "submitted yet.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row reads as in progress and offers no answer block.",
      },
      {
        action: "Send an acceptance to the API with the page's own session.",
        expected: "The API answers 409 with a state conflict.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected: "The order is still in progress and carries no acceptance time.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
] as const satisfies readonly QaseCase[];
