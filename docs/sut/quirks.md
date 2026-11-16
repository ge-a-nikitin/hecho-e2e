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

## Rendering and routing

**The SPA is served for every path.** Deep links work through nginx's `try_files ... /index.html`.
A 404 page for an unknown panel sub-route comes from the app, not from the server.

**Panel role check.** Opening `/admin` with a customer session redirects to `/login` after the
session loads. Assert the URL, not the absence of the panel.

**Order card is a route.** `/<panel>/orders/<id>` renders the card over the list; closing it
navigates back. Screenshots of the card on mobile show a bottom sheet, not a dialog.

**Two empty states.** `orders-empty-state` means "no orders at all", `orders-no-results` means
"filters exclude everything". They are different cases.

**Client-side paging.** Ten rows per page, computed in the browser from the full list. With eleven
orders, page one shows ten and page two shows one; the API has no paging parameters.

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
