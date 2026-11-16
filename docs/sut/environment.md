# Environment

## What the stack runs

| Container   | Image / build                        | Published on | Purpose                          |
| ----------- | ------------------------------------ | ------------ | -------------------------------- |
| `web`       | SUT `apps/web/Dockerfile` (nginx)    | 7200         | SPA + `/api` reverse proxy        |
| `api`       | SUT `apps/api/Dockerfile`            | 7201         | NestJS API, runs migrations first |
| `postgres`  | `postgres:17-alpine`                 | 7202         | database                          |
| `seaweedfs` | `chrislusf/seaweedfs:4.52`           | 7203, 7204   | S3 for attachments, admin UI      |

Only `web` is meant to be browsed: nginx forwards its `/api` path to the `api` container.

## Configuration that shapes behaviour

Set on the `api` container by `docker-compose.e2e.yml`:

| Variable                        | Value in the e2e stack                      | Effect                                          |
| ------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `PORT`                          | `6201`                                      | in-container API port                           |
| `DATABASE_URL`                  | `postgresql://order_desk:...`               | database                                        |
| `BETTER_AUTH_URL`               | `<web origin>/api/auth`                     | Better Auth base URL                            |
| `BETTER_AUTH_SECRET`            | fixed 48-char string                        | cookie signing                                  |
| `FRONTEND_ORIGIN`               | `http://127.0.0.1:7200`                     | CORS origin and the only trusted auth origin    |
| `TRUST_PROXY`                   | `true`                                      | honour the proxy headers nginx sets             |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `admin@example.test` / `e2e-admin-password` | the administrator the reset recreates           |
| `DEVTOOLS_ENABLED`              | `true`                                      | turns the devtools group on                     |
| `DEVTOOLS_API_KEY`              | 39-char string                              | key for the devtools group (min 32 bytes)       |
| `DEVTOOLS_SEED_PASSWORD`        | `e2e-account-password`                      | password of the seeded fixture accounts         |
| `AUTH_RATE_LIMIT_MAX`           | `1000`                                      | general auth rate limit, raised for test volume |
| `AUTH_SIGN_IN_RATE_LIMIT_MAX`   | `1000`                                      | sign-in limit, raised for the same reason       |
| `ORDER_ATTACHMENT_LIMIT`        | `20`                                        | maximum attachments per order                   |
| `S3_ENDPOINT`, `S3_*`           | `http://seaweedfs:8333` etc.                | attachment storage                              |

Built into the web image (a build argument, not a runtime variable):

| Variable       | Value              | Why                                                          |
| -------------- | ------------------ | ------------------------------------------------------------ |
| `VITE_API_URL` | `<web origin>/api` | the SPA inlines it at build time; changing it needs a rebuild |

## Configuration of the suite

Read by `support/env.ts` from the environment or `.env.e2e` (see `.env.e2e.example`):

| Variable               | Default                     | Meaning                                          |
| ---------------------- | --------------------------- | ------------------------------------------------ |
| `SUT_DIR`              | `../order-desk`             | SUT checkout used by the generators and the build |
| `BASE_URL`             | `http://127.0.0.1:7200`     | browser origin                                   |
| `API_URL`              | `${BASE_URL}/api`           | API origin                                       |
| `E2E_STACK`            | `auto`                      | `auto` starts or rebuilds, `attach` requires a matching stack, `off` skips checks |
| `E2E_RESET`            | `run`                       | `run` / `never`                                  |
| `E2E_ALLOW_REMOTE`     | `0`                         | allow a non-loopback target                      |
| `E2E_ADMIN_EMAIL`      | `admin@example.test`        | administrator the reset recreates                |
| `E2E_ADMIN_PASSWORD`   | `e2e-admin-password`        | its password                                     |
| `E2E_CUSTOMER_EMAIL`   | `e2e.customer@example.test` | baseline customer created by the setup project    |
| `E2E_EXECUTOR_EMAIL`   | `e2e.executor@example.test` | baseline executor                                |
| `E2E_PASSWORD`         | `e2e-account-password`      | password of the baseline accounts                |
| `E2E_DEVTOOLS_API_KEY` | 39-char default             | must match `DEVTOOLS_API_KEY` of the running stack |
| `QASE_MODE`            | `off`                       | `off` locally and in pull requests, `testops` on main |

Host ports can be moved with `WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, `S3_PORT` and
`SEAWEEDFS_ADMIN_PORT`; a new web port also needs `E2E_WEB_ORIGIN` and `BASE_URL`.

## What the running stack was built from

The `api` and `web` images are built from `SUT_DIR` and carry that checkout as image labels:

| Label                  | Example   | Meaning                                                                   |
| ---------------------- | --------- | ------------------------------------------------------------------------- |
| `org.hecho.sut.commit` | `0db653e` | short `HEAD` of the checkout at build time                                |
| `org.hecho.sut.state`  | `0db653e` | the commit, or `<commit>+dirty-<sha1>` when the tree had uncommitted work |
| `org.hecho.sut.dirty`  | `0` / `1` | whether the build included uncommitted work                               |

`pnpm stack:status` reads the labels back and compares them with the checkout:

| Verdict   | When                                                             | `E2E_STACK=auto`  | `E2E_STACK=attach` |
| --------- | ---------------------------------------------------------------- | ----------------- | ------------------ |
| `current` | both images carry the state of the checkout                      | run as-is         | run as-is          |
| `stale`   | a label is missing, names another state, or the image is absent   | rebuild, then run | fail the run       |

`node scripts/stack.mjs status --json` prints the same answer as JSON, and `support/stack.ts` reads
it: nothing else in the suite decides whether a warm stack matches the checkout. Rebuilding goes
through `docker compose up --build`, and the API container applies pending migrations on start, so an
ordinary SUT change needs no `stack:down`.

The suite never moves the checkout: `git -C ../order-desk pull` stays a human step, and a checkout
behind `origin/main` is reported as a note, not fixed. A checkout that is not a git repository cannot
be compared with the images, which `status` says out loud instead of rebuilding on every run.

See [0002](../decisions/0002-build-provenance.md) for why the stamp lives on the image rather than in
a local file.

## Continuous integration

CI runs the same stack with `E2E_STACK=attach`, so a job can never test an image it did not build:

| Workflow                | Trigger                | What it does                                                              |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `checks.yml` → `static` | pull request, `main`   | lint, typecheck, `qase:check`; no SUT checkout, no Docker                 |
| `checks.yml` → `suite`  | pull request, `main`   | calls `run-suite.yml` with `sut-ref: pin` and `verify-sut-context: true`  |
| `run-suite.yml`         | called                 | checks out the suite and the SUT, builds, runs, reports `run-link`        |
| `qase.yml`              | `main`                 | the same suite inline with `QASE_MODE=testops`, token in `production`     |

`run-suite.yml` is public on purpose: the repository that owns the SUT calls it with
`sut-ref: ${{ github.sha }}`, which is how a pull request there is tested against its own commit
rather than the pin. `qase.yml` stays inline because a job that calls a reusable workflow cannot use
`environment`, and the token must not become a repository secret. See
[0003](../decisions/0003-reusable-suite-workflow.md).

## Reset semantics

The global setup resets the database once per run: everything is deleted, the administrator is
recreated from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, all sessions are revoked and the object bucket is
purged. Consequences:

- `.auth/*.json` written by a previous run is invalid until the setup project runs again.
- Invoice numbering restarts at 1.
- `E2E_RESET=never` is the only sensible mode against a shared environment; each case must then
  create its own data and must not assume an empty database.

## Time, locale, viewport

`locale: "en-US"` and `timezoneId: "UTC"` keep date rendering stable. The UI has a language switcher
(`language-en`, `language-ru`), English by default. `chromium` runs Desktop Chrome and `pixel-7` runs
the Pixel 7 descriptor (touch, mobile viewport); both run the same specs.
