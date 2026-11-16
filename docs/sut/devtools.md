# Devtools API

A test-only group of endpoints that prepares and wipes data. It exists so an end-to-end suite never
touches PostgreSQL directly.

## Guard

| Condition                          | Response                                              |
| ---------------------------------- | ----------------------------------------------------- |
| `DEVTOOLS_ENABLED` is not `"true"` | `404` for every route, and the group is hidden from Swagger |
| `DEVTOOLS_API_KEY` missing         | `500`                                                 |
| key shorter than 32 bytes          | `500`                                                 |
| `x-devtools-api-key` absent/wrong  | `401`                                                 |

The key is compared in constant time. `support/devtools.ts` sends it on every call and turns the two
common failures into messages that name the cause (`DEVTOOLS_ENABLED` off, key mismatch), because a
bare 404 otherwise looks like a wrong URL.

The e2e stack enables the group with `DEVTOOLS_ENABLED=true` and the key from
`E2E_DEVTOOLS_API_KEY`.

## Endpoints

### `POST /api/devtools/users`

Creates an account for testing.

```json
{ "role": "CUSTOMER", "email": "buyer@example.test", "password": "at-least-8" }
```

Response `201` with `{ "id": "<userId>" }`. `role` is `CUSTOMER`, `EXECUTOR` or `ADMIN`
(case-sensitive). A duplicate email is `409`; a password shorter than 8 characters is `400`. The
account is created through Better Auth and its sessions are deleted, so it starts signed out.

### `GET /api/devtools/users?role=ADMIN`

Lists accounts of one role with `id`, `name`, `email`, `role`, `isActive` and `createdAt`. `role` is
required and validated as an enum, so `?role=admin` is a `400`.

### `PATCH /api/devtools/users/:id`

```json
{ "password": "new-password", "isActive": true }
```

Any subset of `email`, `password`, `isActive`; an empty body is a `400`. A changed email or password
revokes the user's sessions, so credentials change under a signed-in browser.

### `POST /api/devtools/seed`

Replaces the deterministic fixture (`apps/api/src/devtools/fixtures/test-data.json` in the SUT) and
returns `{ version, users, orders }`. It creates

- `devtools.admin@example.test` (`ADMIN`), `devtools.customer@example.test` (`CUSTOMER`) and
  `devtools.executor@example.test` (`EXECUTOR`, hourly rate 45),
- two categories,
- orders spread over the statuses, including one waiting for distribution and a draft.

All seeded accounts use the password from `DEVTOOLS_SEED_PASSWORD`. Seeding is idempotent: it removes
what it owned before and writes it again. Use it for "a board with work in every status"; do not mix
it into a case that asserts an exact empty state.

### `DELETE /api/devtools/seed`

Removes only the records the fixture owns and returns the counts it deleted. Accounts and orders a
test created itself stay.

### `POST /api/devtools/reset`

The sledgehammer, and what the global setup calls once per run.

```json
{ "confirm": "reset-all-data", "purgeFiles": true }
```

- `confirm` is mandatory and must be exactly `reset-all-data`; anything else is a `400`.
- Deletes every user with accounts and sessions, categories, orders with comments, estimates,
  assignments, status history, time entries and attachments, invoices with payment reports, and the
  invoice numbering. Recreates the single administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the
  same transaction.
- Revokes every session, so all `.auth/*.json` files become stale; invoice numbering restarts at 1.
- Purges the SeaweedFS bucket afterwards unless `purgeFiles` is `false`. A storage failure leaves the
  database reset and reports `files.error`; a test does not need to handle that, but a reader of the
  response should know the reset already happened.
- Answers `200`.

## Using it from a test

```ts
test.beforeEach(async ({ devtools }) => {
  await devtools.reset();             // empty database, admin recreated
});
```

The deterministic board (`POST /api/devtools/seed`, described above) has no wrapper on the client yet:
call the endpoint through `support/http.ts` when a case needs it, and add `seed()` to
`support/devtools.ts` at that point rather than in advance.

`DataFactory` builds on the same client: `createActor(role)` returns an id, an email, a password and a
session cookie; `ensureUser(role, email, password)` is idempotent and repairs a leftover account from
a run with `E2E_RESET=never`.

## Safety

The reset is irreversible and unauthenticated apart from the key. The suite therefore refuses a
non-loopback `BASE_URL` unless `E2E_ALLOW_REMOTE=1`, and `E2E_STACK=off` requires
`E2E_RESET=never`. Never point these at production.
