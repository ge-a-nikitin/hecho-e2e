# Qase TestOps

Cases live in the shared `HECHO` project, next to the SUT's own API cases, separated by suite tree and
tag prefix.

## Identity

| Concept       | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Project       | `HECHO` (set in `qase.config.json`, overridable by env)  |
| Suite root    | `E2E / <Area> / <Screen>` — every suite starts with `E2E` |
| Case tag      | `order-desk-e2e:<key>`, one per case                      |
| Extra tags    | the layer (`e2e`) and slugged suite names                 |
| Catalogue     | `qase/cases/*.ts`, exported through `qase/index.ts`       |
| Generated ids | `qase/case-ids.ts`, written only by `pnpm qase:sync`      |

The suite prefix is not cosmetic: the SUT's sync archives (never deletes) untagged cases it adopts by
title and suite, and both repositories publish to the same project. `E2E` plus the tag prefix keeps
the two catalogues apart.

## Writing a case

```ts
{
  key: "orders.draft.create",
  suite: ["E2E", "Orders", "Draft"],
  title: "creates a draft order from the customer panel",
  severity: "critical",
  priority: "high",
  layer: "e2e",
  type: "functional",
  behavior: "positive",
  description: "Why the case exists, in prose. What breaks if it regresses, and what the case "
    + "deliberately does not cover.",
  preconditions: "The stack was reset; the baseline customer exists and has no orders.",
  steps: [
    { action: "Open the customer panel and start a new order.", expected: "The order form opens." },
    { action: "Fill title, description and category; save the draft.",
      expected: "The order appears in `NEW` with the entered title." },
  ],
}
```

Rules the offline check enforces (`pnpm qase:check`):

- keys are unique;
- every suite path starts with `E2E`;
- the description explains intent (at least 60 characters);
- every end-to-end case has preconditions;
- every step has an action and an expected result;
- each key is used by exactly one spec and every key is used at least once;
- the title in `qc(key, title)` matches the catalogue byte for byte;
- `qase/case-ids.ts` contains no key that left the catalogue.

Content is English, like the code. Steps describe what a tester would do and see, not what the
assertions call.

## Linking a result

```ts
test(qc("orders.draft.create", "creates a draft order from the customer panel"), async ({ page }) => {
  // ...
});
```

`qc()` validates the key and the title at collection time and prepends the numeric case ID when
`case-ids.ts` has one. Before the first sync it returns the bare title, so local runs and pull requests
never depend on Qase.

## Publishing

```bash
pnpm qase:check        # offline
pnpm qase:sync:dry     # plan only; exits 1 when the plan is not empty
pnpm qase:sync         # apply, then rewrite qase/case-ids.ts
```

The sync matches cases by tag, so a renamed or moved case keeps its ID and history, and only patches a
case whose metadata or content actually differs. A key that disappears from the catalogue has its
case moved to `Archive / <original top-level suite>` with tags and results intact; a key that returns
comes back with the same ID.

Tags are written as a set: the identity tag, the layer, and every suite slug, deduplicated by
`caseTags()`. The layer and the root suite slug collide by design (`e2e` on layer `e2e`, `e2e` from
suite `E2E`), and TestOps stores one entry per tag title — a repeated tag in the payload never matched
the stored case, so every sync rewrote all seven cases and the drift gate could not pass.

## Reporting

- Locally and in pull requests: `QASE_MODE=off`. No token, no network, deterministic checks. `.env.e2e`
  keeps that default; a one-off publishing run sets the variable in the shell —
  `QASE_MODE=testops pnpm e2e` — because the environment wins over the file.
- `main`: `.github/workflows/qase.yml` publishes a run (`QASE_MODE=testops`) and fails when
  `qase:sync:dry` would change anything, which means the catalogue and TestOps drifted.
- A run triggered from the SUT repository publishes through `.github/workflows/run-suite.yml` with
  `qase-mode: testops` and a title of the shape `Order Desk web · e2e · <sha>`, tagged `ci,e2e`, so a
  run caused by a SUT pull request is distinguishable from this repository's own. Its pull-request
  runs pass `qase-mode: off`: a fork never receives the token, and a pull request must stay green
  without one.
- The token is the environment secret `QASE_TESTOPS_API_TOKEN` of the `production` environment
  (Settings → Environments → `production` → Environment secrets). `qase.config.json` already names the
  project (`HECHO`) and the US host, so the workflow sets neither.
- A new or edited case has to be published and `qase/case-ids.ts` committed in the same pull request:
  the job runs `qase:sync:dry` before the suite, so merging an unsynced catalogue turns the pipeline
  red and no run reaches TestOps.
- `qase.config.json` keeps `mode: "off"` as the default so a forgotten environment variable cannot
  publish a debug run.
- A run that dies before the first test — the stack guard refusing a drifted build, for instance —
  still leaves an empty completed run in TestOps, because the reporter creates the run when it starts
  and completes it when it stops. Delete it by hand: it carries no results and no cases.

### One case, two viewports

Both browser projects run the same cases, so a case has two results in one run. The auto fixture
`qaseViewport` (`support/fixtures.ts`) labels each result with the parameter `Viewport`, whose value
is the Playwright project name, and TestOps then keeps one row per viewport. Measured with a case made
to fail on the Pixel 7 only:

| Probe | Run | What TestOps stored                                                     |
| ----- | --- | ----------------------------------------------------------------------- |
| 1     | 62  | one row for the case, status `failed` (`total 4`, `passed 3`)           |
| 2     | 63  | two rows, `passed` on `chromium` and `failed` on `pixel-7` (`total 5`)  |

Without the parameter the pair collapses into a single status, so a mobile-only failure looks like a
case that failed on both and the desktop result is not visible at all. Splitting the projects into two
runs is therefore unnecessary (`docs/backlog.md` §11).

The `setup` project is preparation rather than a case — it imports `@playwright/test` directly and never
calls `qc()` — so its three executions used to reach TestOps as auto-created cases with no catalogue
entry, which read as product cases nobody owns. They now call `qase.ignore()`
(`tests/setup/auth.setup.ts`): still executed, never reported. The shape of a full run is therefore
`7 × 2 = 14` rows, which is what the catalogue holds; the history of the measurement:

| Suite state                      | Run | TestOps stored |
| -------------------------------- | --- | -------------- |
| results not parameterised        | 54  | `total 10` (7 cases + 3 setup rows) |
| `Viewport` parameter added       | 64  | `total 17` (7 × 2 + 3)             |
| setup fixtures ignored           | 65  | `total 14` (7 × 2)                 |

## Testworthiness of a case

A case is worth keeping when it can fail for a reason that matters and would be noticed: it asserts an
observable outcome, it owns its data, and its title states the behaviour rather than the mechanics.
When a case stops meeting that bar — duplicated by another case, covering a removed feature, or
asserting an implementation detail — delete the test and its catalogue entry together.
