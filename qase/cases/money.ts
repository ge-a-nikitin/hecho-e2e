import type { QaseCase } from "../types.js";

/**
 * Money: the invoice, the receipt and its review.
 *
 * One entry per test in `tests/invoices/money.spec.ts`. Two roles act on one
 * order, so each case asserts the stored invoice or report and then the
 * affordance the other role is offered; that pairing is what makes the money
 * slice end-to-end rather than a screen test.
 */
export const moneyCases = [
  {
    key: "money.admin.issue-invoice",
    title: "Issues an invoice for an accepted work",
    suite: ["E2E", "Money", "Invoicing"],
    description:
      "The administrator issues the invoice for work the customer accepted: the order moves to the " +
      "invoiced status, the invoice carries a numbered amount that matches the approved estimate, and the " +
      "customer's panel is where the payment is reported from.",
    preconditions:
      "A customer account, an executor with a rate, and an order in review whose work the customer accepted.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The order offers the issue-invoice action.",
      },
      {
        action: "Click the issue action.",
        expected: "The order offers its payment review block and the order moves to the invoiced status.",
      },
      {
        action: "Read the order through the API as the administrator.",
        expected:
          "The order is invoiced, its invoice is issued, numbered, and worth the approved amount.",
      },
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row offers the invoice with the payment reporting control.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "money.customer.report-payment",
    title: "Reports a payment and hands the receipt to the administrator",
    suite: ["E2E", "Money", "Payment reports"],
    description:
      "The customer uploads a receipt for the invoice, and the administrator is offered that file for " +
      "review. The case asserts the stored report and the review controls, because a receipt that does " +
      "not reach the reviewer is the same as one that was never sent.",
    preconditions:
      "A customer account, an executor with a rate, and an order with an issued invoice.",
    steps: [
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row offers the receipt upload and the report action for the invoice.",
      },
      {
        action: "Choose a PDF receipt and report the payment.",
        expected: "The order stores the report as pending review under the file name that was uploaded.",
      },
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected:
          "The order offers the submitted receipt for download together with the confirm and reject actions.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "money.admin.confirm-payment",
    title: "Confirms the reported payment and the order is paid",
    suite: ["E2E", "Money", "Payment review"],
    description:
      "The administrator confirms the receipt the customer sent: the report becomes confirmed, the " +
      "invoice becomes paid and the order moves to the paid status. Completion is a separate act, so the " +
      "customer already sees a paid invoice while the order is still open.",
    preconditions:
      "A customer account, an executor with a rate, and an order with an issued invoice whose receipt is " +
      "waiting for review.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The order offers the confirm action for the pending receipt.",
      },
      {
        action: "Click the confirm action.",
        expected: "The order moves to the paid status and offers the completion action.",
      },
      {
        action: "Read the order through the API as the administrator.",
        expected: "The invoice is paid and its report is confirmed.",
      },
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The row reads as an invoice that has been paid.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "money.admin.complete",
    title: "Completes a paid order",
    suite: ["E2E", "Money", "Completion"],
    description:
      "Completion is the last step and a separate one: the administrator closes an order whose payment " +
      "was confirmed, and only then does the customer's row read as completed. The case exists because " +
      "the product keeps paying and closing apart on purpose.",
    preconditions:
      "A customer account, an executor with a rate, and an order whose invoice is paid.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The order offers the completion action.",
      },
      {
        action: "Click the completion action.",
        expected: "The completion block disappears from the order.",
      },
      {
        action: "Read the order through the API as the administrator.",
        expected: "The order is completed and carries a completion time.",
      },
      {
        action: "Sign in as the customer, open the panel and open the order card.",
        expected: "Both the row and the card read as completed.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "money.admin.reject-report",
    title: "Rejects a payment report and keeps the order invoiced",
    suite: ["E2E", "Money", "Payment review"],
    description:
      "A refused receipt does not end the invoice: the administrator rejects the report with a reason, " +
      "the order stays payable, and the customer's panel offers the upload again. The case pins the " +
      "recoverable path a wrong receipt has to have.",
    preconditions:
      "A customer account, an executor with a rate, and an order with an issued invoice whose receipt is " +
      "waiting for review.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The order offers the reject action for the pending receipt.",
      },
      {
        action: "Type a reason and reject the receipt.",
        expected: "The order shows the receipt as rejected with the review comment.",
      },
      {
        action: "Read the order through the API as the administrator.",
        expected: "The order is still invoiced, its invoice is still issued and the report is rejected.",
      },
      {
        action: "Sign in as the customer and open the customer panel.",
        expected: "The receipt upload is offered again, so the customer can send a better one.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "negative",
  },
  {
    key: "money.admin.void-invoice",
    title: "Voids an unpaid invoice and issues a new one",
    suite: ["E2E", "Money", "Invoicing"],
    description:
      "An unpaid invoice can be voided with a reason, and the order stays invoiced so a replacement can " +
      "be issued. The second invoice is a new record with a new number rather than an edit, which is the " +
      "reason the invoice snapshots its amounts at issue time.",
    preconditions:
      "A customer account, an executor with a rate, and an order with an issued invoice and no payment " +
      "report awaiting review.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The order offers the void form with a reason field for the issued invoice.",
      },
      {
        action: "Type a reason and void the invoice.",
        expected: "The order keeps its invoiced status and the invoice is recorded as void.",
      },
      {
        action: "Issue the invoice again.",
        expected: "The order holds two invoices: the void one and a newly issued one with another number.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "money.admin.void-paid",
    title: "Refuses to void a paid invoice",
    suite: ["E2E", "Money", "Guards"],
    description:
      "A paid invoice is immutable: the administrator is offered no void control for it, and a void sent " +
      "straight to the API is refused with a state conflict that leaves the invoice paid and the order " +
      "where it was. There is no post-payment correction by design.",
    preconditions:
      "A customer account, an executor with a rate, and an order whose invoice is paid.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The paid invoice offers no void form.",
      },
      {
        action: "Send a void for the paid invoice to the API with the page's own session.",
        expected: "The API answers 409 with a state conflict.",
      },
      {
        action: "Read the order through the API as the administrator.",
        expected: "The invoice is still paid and the order is still in the paid status.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
] as const satisfies readonly QaseCase[];
