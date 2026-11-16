# API

The API is a NestJS service. Every controller is mounted under **`/api`**, so the endpoint paths
below are relative to that prefix; `docs/generated/endpoints.json` is the authoritative list with
handler names, file and line.

- Interactive reference: `GET /api/docs` (Swagger UI), machine-readable `GET /api/docs-json`.
- Health: `GET /api/health`, public, used by the container healthcheck.
- Authentication: Better Auth session cookie `better-auth.session_token`; the browser sends it
  automatically because it talks to the same origin.

## Authentication endpoints

Better Auth owns `/api/auth/*`:

| Endpoint                        | Purpose                                    |
| ------------------------------- | ------------------------------------------ |
| `POST /api/auth/sign-up/email`  | register a customer                        |
| `POST /api/auth/sign-in/email`  | sign in with email and password            |
| `POST /api/auth/sign-out`       | end the session                            |
| `GET  /api/auth/get-session`    | current session or `null`                  |

Two rules matter in tests:

- **`Origin` is required and must match `FRONTEND_ORIGIN`**, otherwise Better Auth answers
  `MISSING_OR_NULL_ORIGIN` (403). `support/http.ts` always sends the web origin for this reason.
- **Sign-in is rate limited** (three attempts per ten seconds by default). The e2e stack raises the
  limit, so a deliberate 429 case needs the endpoints whose limit was left alone.

## Domain endpoints

| Area        | Endpoints                                                                                   | Access                        |
| ----------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| health      | `GET /health`                                                                                | public                        |
| categories  | `GET /categories`, `POST /categories`, `PATCH /categories/:id`, `PATCH /categories/:id/active` | read: all roles; write: admin |
| orders      | `GET /orders`, `POST /orders`, `GET /orders/:id`, `PATCH /orders/:id`                        | customer creates and edits drafts; all roles read what they may see |
| lifecycle   | `POST /orders/:id/submit`, `/claim`, `/decline`, `/assign`, `/estimate`, `/estimates/:estimateId/respond`, `/accept`, `/submit-review`, `/request-revision`, `/resume-revisions`, `/cancel`, `/complete` | per transition, see `statuses.md` |
| work log    | `POST /orders/:id/time`                                                                      | executor                      |
| comments    | `POST /orders/:id/comments`                                                                  | all participants              |
| attachments | `POST /orders/:orderId/attachments`, `GET /orders/:orderId/attachments/:attachmentId`        | participants; 1 MB per file   |
| invoices    | `POST /orders/:orderId/invoices`, `GET .../pdf`, `POST .../void`                             | admin                         |
| payments    | `POST /orders/:orderId/invoices/:invoiceId/payment-reports`, `.../:reportId/confirm`, `.../:reportId/reject`, `GET .../:reportId/file` | customer uploads, admin reviews |
| users       | `GET /users/me`, `PATCH /users/me/profile`, `PATCH /users/me/hourly-rate`                    | the signed-in user            |
| admin users | `GET /users/executors`, `GET /users/executors/available`, `POST /users/executors`, `PATCH /users/executors/:id`, `POST /users/executors/:id/reset-password`, `GET /users/customers`, `PATCH /users/:id/active`, `POST /users/:id/reset-password` | admin |
| devtools    | `POST/DELETE /devtools/seed`, `POST /devtools/reset`, `GET/POST /devtools/users`, `PATCH /devtools/users/:id` | `x-devtools-api-key`, see `devtools.md` |

`access` in `docs/generated/endpoints.json` is derived from the `@Roles(...)` decorator next to each
handler. It is a useful first guess, not a contract: the API enforces more than the role (a customer
sees only their own orders, an executor only theirs plus the pool).

## Responses and errors

- Lists return plain arrays; there is no server-side pagination. `GET /orders` returns everything the
  actor may see, and the browser filters and pages it.
- A successful read or update returns the entity (order, invoice, report) as stored.
- `POST /orders` and the other creating endpoints return `201`; `POST /devtools/reset` is documented
  as `200`. Do not assume a status code that Swagger does not state.
- Validation is strict: unknown body fields, unknown enum values and malformed ids are `400`. The
  DTOs use `class-validator`, and the global pipe runs with `whitelist` and `forbidNonWhitelisted`,
  so a stray field is an error rather than being ignored.
- `401` means no session (or a revoked one), `403` means the role or the ownership rule rejects the
  actor, `404` means the entity does not exist **or** the caller may not see it, `409` means a state
  conflict (for example a duplicate category name or an account that already exists).
- Errors come back as a JSON object with `statusCode`, `message` and `error`; `message` can be a
  string or an array of validation messages.

## Downloads

Invoice PDFs and attachment files are served as binary responses with a `Content-Disposition`
filename. A test can assert the download event and the suggested filename, or fetch the bytes with an
authenticated `APIRequestContext`; comparing PDF contents is out of scope.

## Things the API deliberately does not do

- No password recovery by email (deferred until mail is connected); an administrator resets
  passwords instead.
- No account deletion: accounts are deactivated.
- No post-payment corrections: a paid invoice is immutable.
