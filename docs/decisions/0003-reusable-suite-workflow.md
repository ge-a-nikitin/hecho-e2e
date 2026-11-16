# 0003 — The suite is a reusable workflow other repositories call

- **Date:** 2026-11-16
- **Status:** accepted

## Context

The SUT and the suite live in separate repositories, and until now only the suite knew how to run
itself: `checks.yml` and `qase.yml` each spelled out the checkout, the pnpm setup, the stack and the
run. That is enough while the only consumer is this repository, and wrong the moment the SUT
repository wants the suite on its own pull requests — every SUT change is a breaking change discovered
only after a manual `sut.lock.json` bump, which is the opposite of shift-left.

Copying those ten steps into the SUT repository was the obvious move and the worst one: two
implementations of "build and run" diverge on the first fix, and the divergence is invisible because
each repository is green by its own definition.

A reusable workflow (`on: workflow_call`) is the supported way to have one implementation and several
callers. Two constraints shape the design:

1. A job that calls a reusable workflow may use only `name`, `uses`, `with`, `secrets`, `strategy`,
   `needs`, `if`, `concurrency`, `permissions` and `cache-mode`. `timeout-minutes` and `environment`
   are not among them, so the timeout has to live inside the called workflow, and a caller that needs
   an environment cannot be a caller at all.
2. `actions/checkout` without `repository` checks out the *caller's* repository, and there is no
   variable meaning "the repository that owns this workflow".

Alternatives considered:

1. **Copy the steps into the SUT repository** — two implementations, drift, and a fix that has to be
   made twice by two different pull requests.
2. **Publish a composite action or an npm package** that the SUT repository imports. Versioned and
   testable, but it moves the suite out of its own CI (nothing runs the composite action on the
   suite's `main`), and a package needs a release step that no one asked for.
3. **`workflow_dispatch` from the SUT via `gh workflow run`** — the run then happens in the *suite's*
   context, cannot post a check on the SUT pull request, and needs a token with `actions: write` in
   the SUT repository.

## Decision

- `.github/workflows/run-suite.yml` is the one implementation: it checks out the suite, resolves the
  SUT ref, checks out the SUT, installs, starts the stack, runs the suite and reports where the run is.
  It is called by `checks.yml` in this repository and by the SUT repository's `e2e.yml`.
- The contract is the inputs, the one optional secret and the one output: `sut-repository` (required),
  `sut-ref` (`pin` by default), `suite-ref` (`main`), `qase-mode` (`off`), `run-title`,
  `verify-sut-context` (only with `pin`), `QASE_TESTOPS_API_TOKEN` (`required: false`), `run-link`.
- `sut-ref: pin` is what this repository runs: the suite's own gate tests the commit whose generated
  context is committed. A caller that owns the SUT passes `${{ github.sha }}`, so the images it builds
  are the code under review.
- `verify-sut-context` runs `pnpm sut:check` and is refused unless `sut-ref: pin`, because the
  snapshot in `docs/generated/` belongs to the pinned commit and nothing else.
- The workflow sets `E2E_STACK=attach`: a stack whose provenance does not match the checkout fails the
  job instead of rebuilding behind a green result ([0002](0002-build-provenance.md)).
- `qase.yml` stays inline. Its token is an environment secret of `production`, `environment` cannot be
  used on a job that calls a reusable workflow, and demoting the token to a repository secret to remove
  the repetition would let every branch of this repository read it. The duplication is the price of
  keeping the token scoped; the parts that matter (specs, fixtures, `scripts/stack.mjs`) are shared.

## Consequences

- The SUT repository tests the commit it is reviewing with the current suite, and a breaking change
  fails there instead of at the next bump.
- `uses: …@main` takes the workflow *definition* from this repository's `main`, so a change to it
  reaches every caller immediately, while `suite-ref` only pins the checkout the specs come from. A
  caller that must not move follows a tag in both places; the second one is the one people forget.
- A defect in the workflow reddens the SUT repository's pull requests without a change there. That is
  the same trade as any shared gate, and the fix is a pull request here, so `main` must stay green.
- `sut.lock.json` no longer gates the SUT's CI: it still describes the snapshot this repository runs
  against, but a caller passing its own SHA never reads it. Nobody should read the pin as a guarantee
  about what the SUT tests.
- Every SUT pull request now pays for an image build and a browser suite (roughly six to eight
  minutes). That is why the SUT repository starts with a non-blocking run and only promotes it to a
  required check once it has been stable.
- The caller cannot cap the run; the 45-minute timeout in `run-suite.yml` is the only cap, so a hung
  container holds a runner for that long.
