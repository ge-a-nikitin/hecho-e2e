# Conventions

How a case is written in this repository. This is the tracked contract, so a contributor who cloned
the repository without the local agent configuration still knows what a change has to look like; the
agent workflow that complements it lives in a local, untracked `AGENTS.md`. The linter enforces part of
this list; review enforces the rest.

## Layout of a case

```ts
import { qc } from "../../qase/qc.js";
import { expect, sessionOf, test } from "../../support/fixtures.js";

test.describe("Customer orders", () => {
  test.use(sessionOf.customer);

  test(
    qc("orders.draft.create", "creates a draft order from the customer panel"),
    { tag: "@regression" },
    async ({ page, factory }) => {
      // ...
    },
  );
});
```

Specs live in `tests/<area>/` and are named in lowercase kebab-case ending in `.spec.ts`. One file
groups the cases of one area and one role. `tests/setup/` belongs to the setup project and never
runs in a browser project.

## One test, one Qase key

The title comes from the catalogue through `qc("<key>", "<title>")`. The key must exist in
`qase/index.ts`, and the title must match the catalogue entry exactly: `qc()` throws at collection
time on an unknown key or a drifted title, and `pnpm qase:check` reports the same problem offline.
A test that has a case never gets a bare title.

When a case is deleted, its catalogue entry is deleted in the same change.

## Locators

`page.getByTestId("order-title")` and nothing else — no CSS, no XPath, no text matching for control
flow. Templated ids are written literally in the test:

```ts
await page.getByTestId(`open-order-${order.id}`).click();
```

The ids come from `docs/generated/testids.json`, which is derived from the SUT. If an id is missing,
it is requested in the SUT repository; the test does not fall back to a selector.

## Sessions and data

- Signed-in case: `test.use(sessionOf.customer)` (or `.admin`, `.executor`). The session files are
  written by the setup project; a missing file fails with instructions.
- A case that signs in inside the test calls the shared step `signInAs(page, actor)`
  (`support/steps/sign-in.ts`). It takes the user type and nothing else: a role name resolves to the
  credentials in the environment, an actor created by the factory brings its own. The step returns once
  that role's panel is on screen. No case types an email or a password of its own.
- A case that needs a second role after the first one has finished signs in again with the same step:
  `/login` stays reachable while a session exists and the form replaces it, so no sign-out, no second
  context (`docs/sut/quirks.md`). Two roles visible *at the same time* is out of scope until a case
  needs it (`docs/backlog.md` §11).
- A case that needs its own actor calls `factory.createActor("CUSTOMER")` and gets a cookie. The
  baseline accounts are read-only: a case that changes an account creates its own actor instead.
- Data is prepared with `factory` (public API) or the devtools API, in `beforeEach` or at the top of
  the test. Never share mutable state between cases, never rely on an order another test created,
  and never assert an absolute count that another test can move.

## Assertions

Assert the user-visible outcome — a status label, a list row, a redirect, a download — not the
absence of an error. `toBeDefined()` is rejected by lint: say which field matters.

## Waits

No fixed waits: `waitForTimeout` is rejected by lint. Wait for the observable state instead:

```ts
await expect(page).toHaveURL(/\/orders\/\d+$/u);
await expect(page.getByTestId("order-status")).toHaveText("IN_PROGRESS");
```

`expect.poll` covers a value that settles asynchronously without a UI signal.

## Tags

`@smoke` for the fast path that must never break, `@regression` for everything else.
`pnpm e2e:smoke` runs the smoke tag.

## Page objects

`pages/*.page.ts` hold the locators and actions of one screen. A page object never asserts a
business outcome; its `expect*` methods only say "this screen is ready".

## Two viewports

`chromium` and `pixel-7` run the same suite. A case that only makes sense on one of them says so and
explains why:

```ts
test.skip(testInfo.project.name !== "pixel-7", "the order card only collapses on mobile");
```

`eslint.config.mjs` allows a conditional `test.skip` with a reason and still rejects a bare
`test.skip()`, which would silently drop the case everywhere.

Both projects publish, and every result carries the `Viewport` parameter (the auto fixture
`qaseViewport` in `support/fixtures.ts`). TestOps keeps one row per viewport, so a mobile-only failure
is a failed row of its own rather than a status shared with the desktop execution. Removing that
fixture collapses the two results into a single row again; `docs/qase.md` records the measurement.

## Parked cases

A case blocked by a product defect is parked with `test.fixme("<link to the SUT issue>")` and a
comment, recorded in `docs/backlog.md`, and left otherwise intact. Deleting the case or weakening
the assertion is not a fix.

## Commits

Conventional Commits, lowercase, imperative, English:
`feat(orders): cancel a draft order as the customer`. One logical change per commit. An agent
proposes the message and the file list when a change is complete and waits for approval; it does not
commit on its own, and never to `main`.
