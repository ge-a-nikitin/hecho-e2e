# The system under test

HECHO order desk is a single-organization work-order board: customers create orders, executors take
and perform them, administrators distribute work, manage accounts and money. The product lives in a
separate repository; this directory records everything a test author needs to know about it without
opening that repository.

| Page                                   | Answers                                                |
| -------------------------------------- | ------------------------------------------------------ |
| [domain.md](./domain.md)               | roles, order lifecycle, estimates, invoices, payments  |
| [statuses.md](./statuses.md)           | every order status and who moves it where              |
| [routes.md](./routes.md)               | screens, URLs, test ids, desktop vs mobile             |
| [api.md](./api.md)                     | endpoints, access rules, error semantics               |
| [devtools.md](./devtools.md)           | the test-only data API (seed, reset, accounts)         |
| [environment.md](./environment.md)     | configuration of the stack and what it changes         |
| [quirks.md](./quirks.md)               | behaviour that looks like a bug and is not (or is)     |

## How this directory stays true

Hand-written pages explain intent. Facts that can drift mechanically are generated into
`docs/generated/` by `scripts/sut/sync-context.mjs` from a pinned SUT checkout:

| Artefact                 | Contents                                                      |
| ------------------------ | ------------------------------------------------------------- |
| `testids.json`           | every `data-testid`: literal, templated and computed          |
| `routes.json`            | `<Route>` paths and the role-to-panel map                     |
| `endpoints.json`         | method, path, handler, controller, declared access, file:line |
| `enums.json`             | Prisma enums, i.e. the exact case-sensitive values            |
| `docs-index.json`        | SUT documentation files with title, size and hash             |
| `context.json`           | which commit and which input files produced the snapshot      |

```bash
pnpm sut:status   # checkout, commit, drift, snapshot freshness
pnpm sut:sync     # regenerate after the SUT moves
pnpm sut:check    # CI gate: the snapshot matches the checkout
```

`pnpm sut:check` fails when a hand-edited artefact or a stale snapshot disagrees with the SUT, so a
generated file is never the place to express an opinion. Anything this directory states that the
generator cannot derive is maintained by hand and reviewed like code.
