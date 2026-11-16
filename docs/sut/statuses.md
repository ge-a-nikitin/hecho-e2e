# Order statuses

`OrderStatus` values are uppercase and case-sensitive (see `docs/generated/enums.json`). The table
maps each status to the action that produces it; the endpoints are the ones in
`docs/generated/endpoints.json`.

| Status                | Meaning                                                      | Produced by                                                        |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `NEW`                 | customer draft, still editable                                | `POST /orders` (create), `PATCH /orders/:id` (edit draft)           |
| `WAITING_DISTRIBUTION`| submitted without an executor, open to the pool               | `POST /orders/:id/submit`; also where a declined assignment returns  |
| `ASSIGNED`            | one executor owns it, waiting for an accepted estimate        | `POST /orders/:id/submit` with an executor, `POST /orders/:id/claim`, `POST /orders/:id/assign` |
| `IN_PROGRESS`         | estimate accepted, work underway                              | customer accepts the estimate (`POST /orders/:id/estimates/:estimateId/respond`); executor resumes revisions (`POST /orders/:id/resume-revisions`) |
| `ON_REVIEW`           | executor submitted the result                                 | `POST /orders/:id/submit-review`                                    |
| `NEEDS_REVISION`      | customer asked for changes                                    | `POST /orders/:id/request-revision`                                 |
| `INVOICE_ISSUED`      | administrator issued an invoice; payment may be reported      | `POST /orders/:orderId/invoices`                                    |
| `INVOICE_PAID`        | administrator confirmed the payment report                    | `POST /orders/:orderId/invoices/:invoiceId/payment-reports/:reportId/confirm` |
| `COMPLETED`           | administrator closed a paid order                             | `POST /orders/:id/complete`                                         |
| `CANCELLED`           | closed before money moved                                     | `POST /orders/:id/cancel`                                           |

## Allowed transitions in practice

```
NEW ──submit (no executor)──▶ WAITING_DISTRIBUTION ──claim / assign──▶ ASSIGNED
 │                                  ▲                                     │
 └──submit (executor chosen)───────┼─────────────────────────────────────┘
                                    │ decline (executor)
                                    │
ASSIGNED ──estimate accepted──▶ IN_PROGRESS ──submit-review──▶ ON_REVIEW
   ▲                                  ▲                            │
   │ reassign (admin)                 │ resume-revisions           │ request-revision
   └──────────────────────────────────┴────── NEEDS_REVISION ◀─────┘
                                                │
ON_REVIEW ──accept work (customer, keeps status)──▶ invoice issued ──▶ INVOICE_ISSUED
INVOICE_ISSUED ──report payment──▶ (admin review) ──confirm──▶ INVOICE_PAID ──complete──▶ COMPLETED
```

Notes that decide test design:

- Accepting the work does **not** change the status; it only records the acceptance time. The order
  moves to `INVOICE_ISSUED` when the invoice is issued. A test that expects a status change right
  after "accept work" is testing a product that does not exist.
- The estimate must be accepted before work starts; `IN_PROGRESS` is unreachable from `ASSIGNED`
  without it.
- `CANCELLED` is reachable from any pre-invoice status by the right role: customer or administrator
  before work starts, administrator only afterwards and only with a reason.
- Voiding an unpaid invoice takes the order out of `INVOICE_ISSUED` and allows a new invoice; a paid
  invoice cannot be voided.

## Where the status is visible

Every panel's order card and order list render the status label, and the order detail shows the full
status history with the actor. The label is copy, not the enum: in English `NEW` reads "Draft",
`WAITING_DISTRIBUTION` reads "Awaiting distribution", `ASSIGNED` reads "Assigned", and no test id
addresses it (`docs/sut/quirks.md`, "Orders: creating and submitting"). Test ids of the order card and
its actions are listed in `docs/generated/testids.json`; the most useful ones are:

| Test id                            | Screen                                        |
| ---------------------------------- | --------------------------------------------- |
| `order-card-<id>`                  | list row of an order                          |
| `open-order-<id>`                  | open the detail card from a customer/admin row |
| `claim-order-<id>`                 | take an order from the pool (executor)        |
| `decline-order-<id>`               | decline an assignment (executor)              |
| `estimate-hours-<id>` + submit     | propose an estimate (executor)                |
| `accept-estimate-<id>`             | accept the estimate (customer)                |
| `accept-work-<id>`                 | accept the result (customer)                  |
| `request-revision-<id>`            | ask for changes (customer)                    |
| `submit-review-<id>`               | submit the result (executor)                  |
| `resume-revisions-<id>`            | continue after a revision request (executor)  |
| `issue-invoice-<id>`               | issue an invoice (admin)                      |
| `complete-order-<id>`              | complete a paid order (admin)                 |
| `confirm-payment-<id>` / `reject-payment-<id>` | review a payment receipt (admin)  |
