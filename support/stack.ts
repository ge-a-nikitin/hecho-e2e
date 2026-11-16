import { spawnSync } from "node:child_process";
import path from "node:path";
import { ALLOW_REMOTE, BASE_URL, STACK_MODE, isLoopback } from "./env.js";

/**
 * The stack is the suite's only dependency, and it is disposable: the global
 * setup may start it, but it never stops it, so a second run starts warm and a
 * developer can inspect the container that failed a test.
 */
export async function isHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForHealth(timeoutMs = 180_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    await sleep(1_000);
  }

  return false;
}

/**
 * Applies E2E_STACK: `auto` starts the compose stack when the API does not
 * answer and rebuilds it when the running images predate the checkout,
 * `attach` requires an already running stack that was built from this checkout,
 * `off` trusts the operator.
 */
export async function ensureStack(): Promise<void> {
  assertSafeTarget();

  if (STACK_MODE === "off") return;

  if (await isHealthy()) {
    const build = readBuild();

    if (build === undefined) {
      console.info("[stack] could not read the build provenance of the running stack; using it as-is");
      return;
    }

    if (!build.stale) {
      console.info(`[stack] ${build.reason}`);
      for (const note of build.notes) console.info(`[stack] ${note}`);
      return;
    }

    if (STACK_MODE === "attach") {
      throw new Error(
        `${BASE_URL} answers, but ${build.reason}. E2E_STACK=attach forbids rebuilding it: ` +
          "run `pnpm stack:up` for the checkout under test, or point SUT_DIR at the one the stack was built from.",
      );
    }

    await startStack(`[stack] ${build.reason}; rebuilding before the run ...`);
    return;
  }

  if (STACK_MODE === "attach") {
    throw new Error(
      `${BASE_URL}/api/health does not answer and E2E_STACK=attach forbids starting the stack. ` +
        "Run `pnpm stack:up` first.",
    );
  }

  await startStack(`[stack] ${BASE_URL} is down, starting docker-compose.e2e.yml ...`);
}

/**
 * The shape of `node scripts/stack.mjs status --json`: only the fields this file
 * acts on. scripts/stack.mjs owns the docker and git calls, so the verdict that
 * fails a run here is the same one `pnpm stack:status` prints.
 */
interface BuildProvenance {
  readonly stale: boolean;
  readonly reason: string;
  readonly notes: readonly string[];
}

function readBuild(): BuildProvenance | undefined {
  const result = spawnSync("node", [path.resolve(process.cwd(), "scripts/stack.mjs"), "status", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) return undefined;

  try {
    return JSON.parse(result.stdout) as BuildProvenance;
  } catch {
    return undefined;
  }
}

async function startStack(intro: string): Promise<void> {
  console.info(intro);
  const result = spawnSync("node", [path.resolve(process.cwd(), "scripts/stack.mjs"), "up"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error("Could not start the e2e stack: see the docker compose output above.");
  }

  if (!(await waitForHealth())) {
    throw new Error(
      `The stack started but ${BASE_URL}/api/health never became healthy. ` +
        "Inspect it with `pnpm stack:logs`.",
    );
  }
}

/**
 * Refuses to point the destructive devtools reset at a remote host.
 *
 * The reset wipes every order, user and invoice, so the default target must be
 * the local stack; a deployed environment needs an explicit E2E_ALLOW_REMOTE=1.
 */
export function assertSafeTarget(): void {
  if (isLoopback(BASE_URL) || ALLOW_REMOTE) return;

  throw new Error(
    `BASE_URL=${BASE_URL} is not a loopback address, and the suite resets data through ` +
      "POST /api/devtools/reset. Set E2E_ALLOW_REMOTE=1 only for a disposable environment.",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
