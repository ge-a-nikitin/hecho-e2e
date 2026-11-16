# Backlog

What is deliberately not done yet, why, and when to revisit. Ordered by expected value.

## 1. Coverage of the order lifecycle

The customer side of creating an order is covered — draft, create-and-submit, optional fields kept on a
draft, submission into the pool, submission with a chosen executor, the double-submit guard, and the
order appearing to an executor (`orders.*` in `tests/orders/customer-orders.spec.ts`). Everything after
submission is not: executor claim + estimate, customer acceptance, submit/review/revision, invoice,
payment report, confirm, complete, cancellation rules, administrative user management. The P0/P1 rows
of `docs/strategy.md` are the plan; take them in that order, each as its own pull request, because each
needs a catalogue entry and a data-factory step reviewed on its own.

Every browser project runs every case, so `pnpm e2e` currently reports `17` executions (7 cases × 2
viewports + 3 setup fixtures) and TestOps `14` rows (`docs/qase.md`). Neither script passes
`--pass-with-no-tests`, so a suite that lost its cases would fail loudly instead of reporting an empty
green run.

## 2. Parallelism

`workers: 1`. The stack is one shared database, so parallel tests would collide on lists and counts.
**Revisit when** the suite passes ~10 minutes: make each case own its data (unique actors, never
assert global counts), then raise `workers` and watch for ordering assumptions.

## 3. Cross-browser projects

Only Chromium (desktop and Pixel 7). Firefox and WebKit would catch engine-specific layout and date
handling. **Why deferred:** runtime cost without evidence that the product breaks there. **Revisit
when** a real defect is found on another engine, or on demand for a release check.

## 4. Accessibility and visual checks

No axe scan, no screenshot comparison. Both need tooling decisions (ruleset, tolerance, baselines)
and stable data. **Revisit after** the P1 lifecycle coverage is in place.

## 5. Download content assertions

Cases can assert that a download starts and what filename it suggests; they do not open the PDF or
the attachment. **Why deferred:** the value is low compared with the fragility of PDF parsing.
**Revisit when** a defect concerns the document content itself.

## 6. Rate-limit case

The e2e stack raises the auth limits (1000) so the suite can sign in repeatedly. A 429 case needs the
password endpoints whose limit is untouched, or a stack started with a lower limit. **Revisit when**
the auth area gets serious negative coverage; the stack may need a second compose profile.

## 7. Localisation smoke

The UI switches between English and Russian (`language-en`, `language-ru`) but no case covers it.
**Why deferred:** copy assertions are brittle and the default language is already exercised.
**Revisit when** a translation defect reaches production.

## 8. Nightly schedule

No scheduled run. `checks.yml` runs on every pull request and on `main`; a nightly would catch SUT
changes only if the lock moves. **Revisit when** the SUT is bumped on a schedule, or when the suite
grows beyond one pull-request run.

## 9. Lock maintenance automation

`sut.lock.json` is bumped by hand. An automated pull request (on a SUT release, or daily) that bumps
the ref and runs `pnpm sut:sync` would keep the context current without a human remembering.
**Revisit when** the SUT ships more than weekly.

## 10. Two roles on screen at once

Sessions come from `test.use(sessionOf.<role>)`, which keeps the project's device emulation but fixes
one role per spec. **Measured:** a journey that *switches* roles in sequence needs neither — `/login`
stays reachable while a session exists and the form replaces it, so `signInAs(page, first)` …
`signInAs(page, second)` works inside one test (`orders.submit.pool-visibility`, `docs/sut/quirks.md`).
What is still missing is the other shape: two roles visible side by side, where a case compares what
the customer and the executor see at the same moment. That needs a helper creating a second context
with the project's device options. **Revisit when** such a comparison is worth the complexity; most
journeys can be split into two cases with API state in between.

## 11. Qase runs per project

**Measured:** both browser projects report into one run, and one case with two results arrived as a
single row with a single status, so a mobile-only failure was indistinguishable from a failure
everywhere (probe run 62: one failed row for a case that passed on `chromium`). Publishing the
`Viewport` parameter per result splits that row in two and keeps the run whole (probe run 63:
`total 5`, `passed 4`, `failed 1`), which is the shape `support/fixtures.ts` ships and `docs/qase.md`
records; the setup fixtures are excluded, so a main-branch run reports `14` rows for the seven cases
(runs 67 and 68: `total 14`, `passed 14`). Two runs, one per project, are therefore unnecessary.
**Revisit when** a per-viewport run *title* is needed (a mobile-only nightly, say), or when TestOps
changes how it groups results by parameters.

## 12. SUT-side pull-request trigger

`.github/workflows/run-suite.yml` exists: the repository that owns the SUT can call it with
`sut-ref: ${{ github.sha }}` and have its own pull request tested with the current suite
([0003](decisions/0003-reusable-suite-workflow.md)). **Why still open:** the caller workflow lives in
the SUT repository, which is a change over there; until it merges nothing triggers the suite on a SUT
pull request. **Revisit** when it lands: check that the run stamps the reviewed commit, then decide
whether the job becomes a required check next to the unit and integration runs. The known costs are
one image build plus one browser run per SUT pull request, and a run that reddens their pull requests
whenever this workflow breaks — so `main` here has to stay green.

## 13. A test id for the order status

`docs/sut/statuses.md` promises a status label on every card, but the SUT exposes no id for it, so the
customer cases read the English copy inside `order-card-<id>` (`docs/sut/quirks.md`). **Why deferred:**
the request belongs to the SUT repository, and the current assertions hold while English is the default
language. **Revisit when** an `order-status-<id>` id exists: replace the copy assertions in
`tests/orders/customer-orders.spec.ts`, drop the note from `quirks.md`, and delete this entry.

## 14. `seed()` on the devtools client

`POST /api/devtools/seed` and `DELETE /api/devtools/seed` are documented (`docs/sut/devtools.md:50-67`),
but `support/devtools.ts` exposes no wrapper: a case that wants "a board with work in every status" has
to go through `support/http.ts`. **Why deferred:** no case needs it yet, and an unused method is code
nobody exercises. **Revisit** with the first case that seeds, and wrap both calls then.
