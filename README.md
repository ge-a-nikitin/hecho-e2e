
# hecho-e2e

End-to-end tests for **HECHO order desk** — a work-order board with customer, executor and
administrator roles. The product is maintained in a separate repository and is consumed here as a
read-only system under test (SUT).

The suite drives a real browser against a real stack (web, API, PostgreSQL, SeaweedFS) and reports
its cases to Qase TestOps.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.e2e.example .env.e2e       # optional: every value already has a default

pnpm e2e                           # builds and starts the stack if needed, runs both projects
```

The first run builds two container images from the SUT, so it takes a few minutes. Later runs reuse
the running stack.

## Commands

| Command                         | What it does                                                       |
| ------------------------------- | ------------------------------------------------------------------ |
| `pnpm e2e`                    | full suite: setup project, then `chromium` and `pixel-7`       |
| `pnpm e2e:smoke`              | only the `@smoke` cases                                          |
| `pnpm e2e --project=chromium` | the fast loop while writing a case                                 |
| `pnpm e2e --ui`               | interactive mode                                                   |
| `pnpm report`                 | open the last HTML report                                          |
| `pnpm stack:up`               | build and start the e2e stack, wait for health                     |
| `pnpm stack:down`             | stop the stack and delete its volumes                              |
| `pnpm stack:reset`            | wipe the database through `POST /api/devtools/reset`             |
| `pnpm stack:status`           | containers, API health, devtools probe                             |
| `pnpm sut:status`             | which SUT commit is checked out and whether the context is current |
| `pnpm sut:sync`               | regenerate `docs/generated/` from the SUT checkout               |
| `pnpm sut:check`              | fail when `docs/generated/` does not match the checkout          |
| `pnpm qase:check`             | offline parity between the catalogue and the specs                 |
| `pnpm qase:sync`              | publish the catalogue to TestOps and refresh `qase/case-ids.ts`  |

## Requirements

- Node.js 22 and pnpm 12 (the `packageManager` field pins the exact pnpm).
- Docker with Compose v2, for the e2e stack.
- A checkout of the SUT at `../order-desk`, or `SUT_DIR` pointing at it. CI checks it out from the
  commit pinned in `sut.lock.json`.

## Layout

```
tests/           Playwright specs: setup, then one directory per domain area
support/         env, HTTP client, devtools client, data factory, stack lifecycle
qase/            TestOps catalogue, qc() title resolver, generated case ids
docs/sut/        what the SUT does: domain, statuses, routes, API, devtools, environment, quirks
docs/generated/  machine-derived snapshot of the SUT: test ids, routes, endpoints, enums
scripts/         SUT context generator, stack wrapper, Qase sync and check
docker-compose.e2e.yml   the ephemeral stack on ports 7200-7204
```

The suite is currently empty by design: the catalogue and the specs were reset, so the first case
starts from a clean board. `docs/backlog.md` records that state and the order in which coverage
returns.

## Where to start reading

- `docs/conventions.md` — how a case is written here: locators, Qase keys, data, assertions.
- `docs/strategy.md` — what is covered, in which order, and why.
- `docs/sut/` — the SUT as a black box: roles, order lifecycle, screens, API, devtools.
- `docs/qase.md` — how cases reach TestOps.

## Running against another environment

`BASE_URL` selects the web origin and `API_URL` the API origin. The suite resets data through the
devtools API, so a non-loopback target is refused unless `E2E_ALLOW_REMOTE=1` is set; pair that with
`E2E_RESET=never` and `E2E_STACK=off`, and provide the accounts of that environment through
`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_CUSTOMER_EMAIL`, `E2E_EXECUTOR_EMAIL` and
`E2E_PASSWORD`.

## Qase

Cases live in the shared `HECHO` project under `E2E / …` suites. Local and pull-request runs keep
`QASE_MODE=off` and need no token; `main` publishes a run. See `docs/qase.md`.
