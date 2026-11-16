# 0002 — A running stack declares which checkout it was built from

- **Date:** 2026-11-16
- **Status:** accepted

## Context

`docker-compose.e2e.yml` builds the `api` and `web` images from `SUT_DIR` and keeps them between
runs (`E2E_STACK=auto` starts the stack once and leaves it warm, because a cold build plus a cold
database costs minutes). Docker only rebuilds what the compose file says changed, and the compose file
says nothing about the commit: after `git -C ../order-desk pull`, `pnpm e2e` happily tested
yesterday's images against today's expectations. The failure mode is the worst kind — the suite is
green, the report is real, and the product in the report is not the product in the checkout.

The suite must not fix this by touching the SUT checkout: `AGENTS.md` forbids editing it, and a test
tool that runs `git pull` inside a developer's working copy is a tool nobody trusts.

Alternatives considered:

1. **Rebuild on every run** (`docker compose up --build` unconditionally). Correct, but a warm run
   becomes a cold one, which pushes people towards `E2E_STACK=off` and unverified runs.
2. **Delete the stack and rebuild after a commit changes** (`git rev-parse HEAD` cached in a local
   file). Needs a file that can go stale or disagree with what Docker actually holds, and it cannot
   see an image built by hand.
3. **Ask the running container what it contains** (a `/api/version` endpoint, a build argument
   reported by the web bundle). Requires SUT changes for a testing concern, and the SUT is read-only
   here.
4. **Stamp the images and compare** — image labels are read back with `docker image inspect`,
   need no SUT change, and describe the artefact rather than a bookkeeping file.

## Decision

- Both images are built with `org.hecho.sut.commit`, `org.hecho.sut.state` and `org.hecho.sut.dirty`
  labels, filled from the checkout by `scripts/stack.mjs` before `docker compose up`.
- `org.hecho.sut.state` is the commit for a clean tree and `<commit>+dirty-<sha1>` for a dirty one,
  where the hash covers `git diff HEAD` plus the untracked file list. A dirty checkout is therefore
  rebuilt when, and only when, its uncommitted delta changes.
- `scripts/stack.mjs status --json` reads the labels back and answers one question: is the running
  build the one this checkout produces? `support/stack.ts` acts on that answer, and `pnpm
  stack:status` prints it, so a local run and `pnpm e2e` cannot disagree about freshness.
- `E2E_STACK=auto` rebuilds a stale stack and says why; `E2E_STACK=attach` (CI) fails the run
  instead, because a CI job that silently rebuilds is a CI job whose build was not what was reviewed.
  `E2E_STACK=off` skips the check like it skips everything else.
- The only git commands run against the checkout are reads: `rev-parse`, `rev-list`, `diff`,
  `ls-files` and `status`, all with `--no-optional-locks` so even the index is left alone.

## Consequences

- A run after a `git pull` rebuilds both images once and then stays warm: the next run finds a
  matching stamp. The cost of correctness is one build per SUT change, not one per run.
- The label is on the image, so it survives `stack:down`/`stack:up` and describes exactly what the
  container runs; nothing has to be kept in sync by hand.
- Images built before this change have no label and are treated as stale, which is the safe reading
  and is what makes the first run after the change rebuild.
- A checkout that is not a git repository cannot be compared with the images: `status` reports that
  instead of forcing a rebuild on every run, and `E2E_STACK=attach` still refuses to guess.
- `pnpm stack:status` gained a second job — it is now the answer to "what am I actually testing",
  so its output names the checkout, the images and the drift from `origin/main`.
- Untracked file *contents* are not in the fingerprint (only their names). A rebuild is needed to
  pick up edits to a file that was already untracked at build time, which matches Docker's own
  behaviour with `COPY` and is not worth a content hash of an arbitrary tree.
