# Generated SUT context

Every file here is written by `pnpm sut:sync` (`scripts/sut/sync-context.mjs`) from the SUT checkout.
Do not edit them by hand: `pnpm sut:check` compares them with the source and fails on any difference.

| File             | Contents                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| `context.json`   | repository, pinned ref, `SUT_DIR`, input hashes and the artefact counts   |
| `testids.json`   | `data-testid` values: literal, templated (`order-card-${order.id}`) and computed expressions |
| `routes.json`    | `<Route>` paths with their elements, and the role-to-panel path map       |
| `endpoints.json` | method, path, handler, controller, declared access, file and line          |
| `enums.json`     | Prisma enums — the exact, case-sensitive domain values                    |
| `docs-index.json`| the SUT's own documentation: path, title, size, hash                       |

Read them instead of the SUT source. A value that is missing here is a gap in the generator, and the
fix belongs in `scripts/sut/sync-context.mjs`, not in a test.

`pnpm sut:status` prints the checkout, its HEAD, whether the worktree is dirty and whether these files
are fresh; a stale snapshot is regenerated with `pnpm sut:sync` and committed together with the lock
bump that caused it.
