# 0001 — The SUT context is a pinned checkout plus generated artefacts

- **Date:** 2026-11-15
- **Status:** accepted

## Context

The suite tests a product that lives in another repository and changes on its own schedule. Agents and
new contributors need three things: the SUT available to build the stack, stable knowledge of what the
SUT looks like (test ids, routes, endpoints, enums), and a way to notice when that knowledge has gone
stale.

Alternatives considered:

1. **Git submodule** at `sut/`. Precise, but every clone needs `--recurse-submodules`, the submodule
   pointer is invisible in review, and a detached checkout inside another repository confuses tooling.
2. **Vendored copy of the SUT source.** Always readable, but duplicates an entire repository and its
   history, and invites local edits to the copy.
3. **Read the SUT at test time** — import its source or scrape its running UI for locators. Couples the
   suite to internals, makes tests fail for reasons unrelated to behaviour, and cannot work offline.
4. **Publish the SUT's context from the SUT repository** (an npm package or a generated file shipped
   with releases). Clean ownership, but requires a release pipeline in a repository that has none and
   blocks the suite until that exists.

## Decision

- `SUT_DIR` (default `../order-desk`) points at a **read-only checkout** that the developer or CI
  provides; nothing is committed from it except generated facts.
- `sut.lock.json` pins the commit those facts came from, so CI checks out the same revision.
- `scripts/sut/sync-context.mjs` derives `docs/generated/{testids,routes,endpoints,enums,docs-index,
  context}.json` from the checkout. The artefacts are committed, so reading the context costs nothing
  and works offline.
- `pnpm sut:check` fails when the artefacts disagree with the checkout; `pnpm sut:status` reports
  drift between the local checkout and the lock.

## Consequences

- The suite is readable without the SUT: an agent opens one small directory instead of a monorepo.
- The lock bump is an explicit, reviewable change: a diff of the artefacts shows exactly which ids,
  routes and endpoints moved, which is also a hint about which tests will break.
- The generator is a parser over source files, so it can lag behind a syntax change in the SUT. That
  is visible (the artefact diff is empty or wrong) and fixable in one file; it is not silent, because
  `sut:check` compares the generated output against the source, not against expectations.
- Two checkouts exist on a developer machine, and the e2e stack builds from `SUT_DIR`. A missing
  checkout fails `sut:status` and `sut:check` with a message naming the repository to clone.
- Generated JSON is not the whole truth: intent (why a status exists, who may cancel) stays in
  hand-written pages under `docs/sut/`, which are reviewed like code.
