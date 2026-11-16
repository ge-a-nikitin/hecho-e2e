# Test strategy

## Purpose

The suite answers one question: **can a real user of HECHO complete their work through the browser?**
It does not replace the SUT's unit and integration suites; it covers the seams those cannot: routing,
session cookies, role-specific screens, downloads, responsive layout and the order lifecycle end to
end.

## Principles

1. **Test the journey, not the implementation.** A case starts from a state a user can reach and
   asserts what the user observes: a status label, a row in a list, a redirect, a downloaded file.
2. **Prepare state through the API, verify through the UI.** Fixtures create accounts, categories and
   orders over HTTP; the browser is reserved for the behaviour under test. Runs stay fast and a red
   build points at one layer.
3. **One case, one reason to fail.** A case that asserts five things fails for five reasons and its
   red build says nothing.
4. **Deterministic data.** Every run starts from a reset, every case owns the data it mutates, and
   nothing depends on rows another case created.
5. **Locators are contracts.** `data-testid` only; a missing id is a request to the SUT, not a reason
   to write a CSS selector that survives one refactor.
6. **No flake tolerance.** A CI retry absorbs infrastructure noise, not a race. A case that fails
   intermittently is fixed or quarantined with an issue link.

## Coverage map

Priorities follow risk and user impact. P0 is the smoke path without which the product has no value;
P1 is the rest of the agreed functionality; P2 is edge cases and negative paths.

| Area            | P0                                                  | P1                                                                  | P2                                                 |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| Public + auth   | landing → sign-in form; customer sign-in opens panel | registration, sign-out, wrong password, role cannot open another panel | rate limit 429, session expiry                   |
| Customer orders | create and submit an order                          | draft edit, filters/search/paging, cancel before work, comments, attachment upload and download | validation errors, empty states   |
| Executor flow   | claim from the pool, propose an estimate            | decline, time tracking, submit for review, resume revisions          | reassignment of started work                       |
| Estimates       | customer accepts, order reaches in progress          | reject with comment, estimate withdrawn on cancel                    | re-estimate after reassignment                     |
| Review          | executor submits, customer accepts the work          | request revision → resume → submit again                             | —                                                  |
| Money           | admin issues an invoice                             | customer reports payment, admin confirms → paid, admin completes      | reject report, void unpaid invoice, reissue         |
| Administration  | admin assigns an order from the pool                | create executor, reset password, deactivate, categories               | cannot deactivate an executor with unfinished work  |
| Profile         | executor sets the hourly rate                       | change name/email, change password, session revocation                | —                                                  |
| Access control  | —                                                   | each role cannot reach another role's panel                           | API-level forbidden/not-found behaviour            |

The table is the plan, not the current state: `docs/backlog.md` records what is still missing.

## Data strategy

- **Reset once per run** (`E2E_RESET=run`), then create everything a case needs.
- **Baseline accounts** (customer, executor, admin) come from the setup project and are used read-only
  by cases that only need a role. A case that changes an account creates its own actor.
- **Factories over fixtures.** `DataFactory.createActor()` gives an isolated account with a session
  cookie; `createOrder()`, `submitDraft()`, `category()` build lifecycle preconditions.
- **The seed endpoint** (`POST /api/devtools/seed`) is for "a board with work in every status"; the
  client has no `seed()` wrapper yet, so call it through `support/http.ts` when a case needs it. Never
  mix seeding into a case with exact counts.
- **Walk the lifecycle through the API** and verify in the UI only the step under test.

## Browsers and devices

`chromium` and `pixel-7` run the same specs. The mobile project is not decoration: panel navigation,
the sign-out control and the order card genuinely differ. Cross-browser parity is out of scope; see
`docs/backlog.md`.

## Flake policy

1. Investigate before retrying: read the trace, not the retry count.
2. `retries: 1` on CI only; two different failures are two defects.
3. Known-broken product behaviour is `test.fixme` with an issue link and a backlog entry — never a
   relaxed assertion.
4. A flaky case that cannot be fixed immediately is quarantined by tag and listed in
   `docs/backlog.md` with the condition for removing it.

## What this suite does not cover

- Load and performance, accessibility audits, visual regression, API contract testing.
- Email flows (none exist yet: no password recovery, no notifications).
- PDF content and image rendering beyond "the download happens with the expected filename".
- Cross-browser engines, real devices, network-condition simulation.

## Maintenance

The SUT is a moving target, so the suite keeps a generated snapshot of it (`docs/generated/`) and
fails CI when the snapshot is stale. A SUT change arrives here as a lock bump, a regenerated snapshot
and the cases the change affects — in one pull request.
