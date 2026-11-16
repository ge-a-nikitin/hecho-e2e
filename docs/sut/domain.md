# Domain

## Roles

One account has exactly one role (`UserRole`: `CUSTOMER`, `EXECUTOR`, `ADMIN`), and each role has
its own panel. Signing in with a customer account never opens the administrator panel: the panel
route checks the session role and redirects.

| Role      | Can do                                                                                  |
| --------- | --------------------------------------------------------------------------------------- |
| Customer  | register, create and edit drafts, submit them, accept or reject estimates, accept work, request revisions, report payment, comment, cancel before work starts, edit own profile |
| Executor  | set own hourly rate, claim an order from the pool, decline an assignment, propose an estimate, track time, submit work, resume revisions, comment, cancel? (no) |
| Admin     | see all orders, assign and reassign, issue and void invoices, review payment reports, confirm payment, complete a paid order, cancel with a reason, manage categories, manage accounts |

Only the administrator can create categories and executor accounts. Customers self-register.

## The order lifecycle

An order is a `WorkOrder` with a status, a category, an optional executor, and related estimates,
assignments, time entries, comments, attachments and invoices.

1. **Draft.** The customer creates an order; it is `NEW` and the only status where the main fields
   (title, description, category, executor, due date, location) can be edited. Required: title,
   description, category. Optional: executor (leaving it empty means the pool), due date, location.
2. **Submission.** `POST /orders/:id/submit` moves the draft to `WAITING_DISTRIBUTION` when no
   executor was chosen, or to `ASSIGNED` when one was.
3. **Distribution.** An unassigned submitted order is visible in the executor pool (full description
   and attachments) and to the administrator. The first executor to claim it locks it to themselves;
   the administrator can assign it explicitly. One executor performs one order.
4. **Estimate.** The assigned executor proposes hours; the amount is the executor's own hourly rate
   multiplied by those hours. The customer accepts or rejects with a comment. Work cannot start
   before the estimate is accepted.
5. **Work.** `IN_PROGRESS`. The executor records time and submits the result for review
   (`ON_REVIEW`).
6. **Review.** The customer accepts the work or requests changes (`NEEDS_REVISION`). Revisions return
   to `IN_PROGRESS` and then to `ON_REVIEW` again. Accepting the work records the acceptance time but
   keeps the order `ON_REVIEW`.
7. **Money.** The administrator issues an invoice (`INVOICE_ISSUED`). The customer uploads a payment
   receipt; the administrator confirms (`INVOICE_PAID`) or rejects the report, in which case the
   order stays `INVOICE_ISSUED` and a new receipt can be uploaded.
8. **Completion.** After the payment is confirmed the administrator completes the order
   (`COMPLETED`). Completion is a separate action from confirming the payment.

## Reassignment

The administrator may reassign an order. Reassignment returns the order to `ASSIGNED` with the
approved hours, rate and amount cleared, because the new executor has their own rate and proposes a
new estimate; previously recorded time stays on the order, and the history keeps the previous
assignment.

## Cancellation

- Before work starts: the customer or the administrator may cancel; no reason is required.
- After work starts: only the administrator; a reason is required.
- After an invoice is issued: cancellation is impossible. An unpaid invoice is voided with a reason
  and a new one can be issued; a paid invoice is immutable.
- Cancelling ends the active assignment and withdraws an estimate still awaiting the customer's
  answer, so a cancelled order never carries a half-finished assignment.

## Invoices and payment reports

`InvoiceStatus`: `ISSUED`, `PAID`, `VOID`. `PaymentReportStatus`: `PENDING`, `REJECTED`,
`CONFIRMED`. Invoice numbers are yearly sequences restarting after a reset. An invoice snapshots the
amount and the executor details at issue time, which is why voiding and reissuing is safe.

## Lists, search and paging

Every panel's order list supports search over title and description, filters by status and category,
and paging of 10 rows. Filtering and paging happen **in the browser** over the orders the API
returned, so a test that needs an order on the first page must control how many orders exist.

## Visibility

- A customer sees only their own orders.
- An executor sees the orders assigned to them plus the unassigned pool.
- The administrator sees everything.
- Comments are visible to every participant of the order.
