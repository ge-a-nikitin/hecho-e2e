# Quirks

Behaviour that costs time when it surprises you. Each entry says what you see, why, and what to do in
a test. If a test exposes something not listed here, add it.

## Authentication

**`MISSING_OR_NULL_ORIGIN` on sign-in.** Better Auth requires an `Origin` header that matches
`FRONTEND_ORIGIN`, and it answers 403 without one. `support/http.ts` always sends the web origin; a
hand-written `fetch` must do the same.

**Sign-in rate limit.** Three attempts per ten seconds by default, per address. The e2e stack raises
`AUTH_RATE_LIMIT_MAX` and `AUTH_SIGN_IN_RATE_LIMIT_MAX` to 1000, so a case that *wants* a 429 needs
the password endpoints whose own limit is untouched, or a stack started with the limit lowered.

**Sessions outlive the data.** `POST /api/devtools/reset` revokes sessions, but `.auth/*.json` from a
previous run still exists on disk. A 401 right after `stack:down`/`stack:up` means the stored cookies
predate the reset: run `pnpm e2e` so the setup project writes them again.

**Both sign-out buttons exist.** `sign-out` (sidebar) and `mobile-sign-out` (top bar) are always in
the DOM, one hidden by CSS. A locator that matches both fails strict mode; filter by visibility.

**Signing in again replaces a live session.** `/login` stays reachable while a session cookie exists
(it does not bounce a signed-in visitor), and submitting the form swaps the session for the new
account: the next navigation lands on that role's panel. So a case that needs a second role after the
first one has finished does not sign out and does not open a second context — it calls the shared step
again (`orders.submit.pool-visibility`).

## Rendering and routing

**The SPA is served for every path.** Deep links work through nginx's `try_files ... /index.html`.
A 404 page for an unknown panel sub-route comes from the app, not from the server.

**Panel role check.** Opening `/admin` with a customer session redirects to `/customer` — the panel the
session owns — and not to the sign-in form; `/login` is what a browser without any session gets. Assert the
URL, not the absence of the panel (`apps/web/src/app.tsx:323-335`).

**Order card is a route.** `/<panel>/orders/<id>` renders the card over the list; closing it
navigates back. Screenshots of the card on mobile show a bottom sheet, not a dialog.

**Two empty states.** `orders-empty-state` means "no orders at all", `orders-no-results` means
"filters exclude everything". They are different cases.

**Client-side paging.** Ten rows per page, computed in the browser from the full list. With eleven
orders, page one shows ten and page two shows one; the API has no paging parameters.

## Orders: creating and submitting

**Two submit buttons on one form.** `save-draft` creates the order in `NEW`; `submit-create-order`
("Create and send") creates it *and* submits it, so the order arrives in `WAITING_DISTRIBUTION`
(`ASSIGNED` when the form already names an executor). Both are a single request: there is no
intermediate draft to observe.

**A rejected estimate returns the order to the pool.** Answering a proposal with a rejection records the
comment, sets the estimate to `REJECTED`, **releases the executor** and moves the order back to
`WAITING_DISTRIBUTION` (`apps/api/src/orders/orders.service.ts:432-492`). Only an acceptance keeps the
executor and starts the work. A case that expects a rejected order to stay with its executor is testing a
product that does not exist.

**A cancelled order keeps its executor.** Cancelling ends the active assignment and withdraws an estimate
awaiting an answer, but `executorId` stays on the order, so the order still appears in that executor's list
— without a single action, because the status offers none.

**The list behind the order card is not refreshed by the card.** The card is a route rendered over the
list, and the list does not re-read its orders when the card closes: a change made inside the card (a
cancel, a comment that changes a status) shows in the row only after a reload.

**A status is copy, not an id.** Rows and cards render a localised label and the snapshot holds no
`order-status*` id: `NEW` reads "Draft", `WAITING_DISTRIBUTION` reads "Awaiting distribution",
`ASSIGNED` reads "Assigned". A case asserts that text inside `order-card-<id>`; the missing id is
requested in `docs/backlog.md` §13 rather than worked around.

**The category select gates the form.** With no category the form shows `no-categories` and both
submit buttons stay disabled, so a category has to exist before the panel is opened.
`factory.category()` creates one (with an administrator inside) and reuses an existing one, because a
category name is unique.

**Draft actions sit on the row.** `draft-actions-<id>` holds `edit-order-<id>` and
`submit-draft-<id>`; the submit button reads "Send for distribution" without an executor and "Send to
executor" with one. Once the order leaves `NEW` the whole block disappears, so "the action is gone" and
"the status changed" are the same assertion told twice.

**An empty list unmounts `orders-list`.** A fresh account renders `orders-empty-state` instead, so a
case cannot wait for `orders-list` there.

**A repeated submit answers 409.** `POST /api/orders/:id/submit` on anything but a draft returns
`409 CONFLICT` with `message: "Only a new draft can be submitted"` and changes neither the status nor
the history. `app-toast` is mounted permanently, so its presence proves nothing; assert the status code
and the unchanged row.

**A pool row carries no test id of its own.** The executor list renders each order as an
`order-list-card` article with no `data-testid`, and `order-card-<id>` exists only on the customer
panel: an executor-side case addresses the actions inside the row — `open-order-<id>` and
`claim-order-<id>` — and `claim-order-<id>` is the affordance that means "this order is in the pool and
I may take it". `executor-orders-loading` is mounted while the pool loads, so a case waits for the
action rather than for the list container. A submitted draft is visible to every executor in
`WAITING_DISTRIBUTION` until one of them claims it.

**The detail card loads lazily.** `order-detail` is visible before its content ("Loading order…"), so a
case asserts the values inside it, never the container alone.

## Data

**The reset is total.** It deletes users, orders, invoices, the invoice counter and the object
bucket. Any test relying on pre-existing data breaks if a previous test reset — which is exactly why
the run starts from a known state.

**Seed is idempotent and owns its rows.** `POST /api/devtools/seed` replaces only what it created
(accounts `devtools.*@example.test`, two categories, orders in several statuses). Mixing seed data
into a case with exact counts makes the case depend on the fixture version.

**`GET /api/orders` returns everything visible.** A customer with 30 orders gets 30 rows in one
response; the UI pages them. Assertions about "the list contains exactly N" must count what the API
returns for that actor.

**Invoice numbers restart.** After a reset the next invoice is number 1 again; never hard-code a
number that a previous run produced.

## Stack

**The web bundle bakes the API URL.** `VITE_API_URL` is a build argument; changing the port or the
origin without rebuilding gives a bundle that calls the old address. `pnpm stack:up` rebuilds.

**`api` and `web` health.** Compose waits for the API healthcheck before starting the web container,
and `--wait` waits for both. A failing build shows up as "container unhealthy", not as a test failure.

**Uploads are capped at 1 MB per file.** A large fixture file fails with `413`, produced by the API,
not nginx.

## Dates and locale

**Dates are rendered in the browser's time zone.** The suite pins `timezoneId: "UTC"` to keep
assertions stable; a due date is a calendar day without a time component.

**The UI language is switchable.** Default English; `language-ru` switches to Russian at runtime.
Assertions on copy are brittle in both languages, which is why the suite uses test ids.
