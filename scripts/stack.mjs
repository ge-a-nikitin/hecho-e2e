#!/usr/bin/env node
/**
 * Lifecycle wrapper around docker-compose.e2e.yml.
 *
 * `up` builds both images (the web bundle inlines VITE_API_URL at build time, so
 * a port change requires a rebuild, not a restart) and waits for the API
 * healthcheck. `down` also removes the volumes: the database is disposable by
 * design, and a stack that keeps yesterday's data hides a broken reset.
 *
 * Every build is stamped with the checkout it came from
 * (`org.hecho.sut.commit` / `.state` / `.dirty`). `status` compares that stamp
 * with `SUT_DIR`, and `status --json` is what support/stack.ts reads to decide
 * whether a running stack is worth testing at all: an image older than the
 * checkout is rebuilt instead of being trusted.
 *
 * Playwright's global setup calls `up` itself when E2E_STACK=auto, so a normal
 * `pnpm e2e` needs no manual step; the explicit commands exist for debugging.
 *
 * Usage: node scripts/stack.mjs up|down|reset|status|logs
 *   status --json                provenance only: no docker ps, no HTTP probe
 *   logs --no-follow [--tail N]  dump the log without blocking (CI failure step)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composePath = resolve(repoRoot, "docker-compose.e2e.yml");
const envPath = resolve(repoRoot, ".env.e2e");
const lockPath = resolve(repoRoot, "sut.lock.json");
const argv = process.argv.slice(2);
const command = argv[0] ?? "status";
const flags = new Set(argv.slice(1).filter((arg) => arg.startsWith("--")));
const fileEnvironment = readEnvFile(envPath);

const baseUrl = (process.env.BASE_URL ?? fileEnvironment.BASE_URL ?? "http://127.0.0.1:7200").replace(
  /\/+$/u,
  "",
);
const devtoolsKey =
  process.env.E2E_DEVTOOLS_API_KEY ??
  fileEnvironment.E2E_DEVTOOLS_API_KEY ??
  "e2e-devtools-key-at-least-32-characters";
// The suite never moves this checkout: it reads the commit to stamp the build
// and to compare it with the images, nothing more. support/env.ts reads the same
// chain for BASE_URL and the credentials, and deliberately not SUT_DIR.
const sutDir = resolve(
  repoRoot,
  process.env.SUT_DIR ?? fileEnvironment.SUT_DIR ?? readLockedDir() ?? "../order-desk",
);

switch (command) {
  case "up":
    compose(["up", "-d", "--build", "--wait"], provenanceEnv());
    await requireHealthy();
    break;
  case "down":
    compose(["down", "--volumes", "--remove-orphans"]);
    break;
  case "reset":
    await requireHealthy();
    await resetData();
    break;
  case "status": {
    const build = inspectBuild();
    if (flags.has("--json")) {
      console.info(JSON.stringify(build, null, 2));
      break;
    }
    compose(["ps"]);
    await reportHealth();
    reportBuild(build);
    break;
  }
  case "logs":
    compose([
      "logs",
      ...(flags.has("--no-follow") ? [] : ["--follow"]),
      "--tail",
      option("--tail") ?? "100",
    ]);
    break;
  default:
    console.error(`unknown command "${command}": use up, down, reset, status or logs.`);
    process.exitCode = 1;
}

function compose(args, extraEnv = {}) {
  const envFileArgs = existsSync(envPath) ? ["--env-file", envPath] : [];
  const result = spawnSync(
    "docker",
    ["compose", "-f", composePath, ...envFileArgs, ...args],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, ...fileEnvironment, ...extraEnv },
    },
  );

  if (result.error) {
    throw new Error(`could not run docker compose: ${result.error.message}. Is Docker running?`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function option(name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

/** `sut.lock.json` may point at a non-default checkout (`localDir`). */
function readLockedDir() {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8")).localDir;
  } catch {
    return undefined;
  }
}

/**
 * A read-only git call against the checkout. `--no-optional-locks` keeps git
 * from rewriting `.git/index` for a stat refresh, so asking a question never
 * modifies the SUT repository.
 */
function git(...args) {
  const result = spawnSync("git", ["--no-optional-locks", "-C", sutDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * What the images should be stamped with. A clean tree is just the commit; a
 * dirty tree adds a fingerprint of the uncommitted delta, so editing a file
 * after a dirty build invalidates the stamp (and not editing it does not).
 */
function checkoutState() {
  const commit = git("rev-parse", "--short", "HEAD");
  if (commit === undefined) return { commit: "unknown", state: "unknown", dirty: null };

  const delta = git("diff", "HEAD") ?? "";
  const untracked = git("ls-files", "--others", "--exclude-standard") ?? "";
  if (delta === "" && untracked === "") return { commit, state: commit, dirty: false };

  const fingerprint = createHash("sha1").update(delta).update("\0").update(untracked).digest("hex").slice(0, 8);
  return { commit, state: `${commit}+dirty-${fingerprint}`, dirty: true };
}

function provenanceEnv() {
  const { commit, state, dirty } = checkoutState();
  return { SUT_COMMIT: commit, SUT_STATE: state, SUT_DIRTY: dirty === true ? "1" : "0" };
}

function imageProvenance(image) {
  const result = spawnSync("docker", ["image", "inspect", image, "--format", "{{json .Config.Labels}}"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return { present: false, commit: null, state: null, dirty: null };

  let labels;
  try {
    labels = JSON.parse(result.stdout) ?? {};
  } catch {
    // An image built without the labels parses to `null` or fails outright;
    // both mean "unknown provenance", which the caller turns into a rebuild.
    labels = {};
  }

  return {
    present: true,
    commit: labels["org.hecho.sut.commit"] ?? null,
    state: labels["org.hecho.sut.state"] ?? null,
    dirty: labels["org.hecho.sut.dirty"] === "1",
  };
}

/**
 * The single verdict both `pnpm stack:status` and support/stack.ts rely on:
 * `stale` means the running images were not built from the current checkout.
 * It is synchronous on purpose — `status --json` has to work before Playwright
 * starts, and neither git nor docker needs to be awaited.
 */
function inspectBuild() {
  const checkout = checkoutState();
  const originMain = git("rev-parse", "--short", "origin/main") ?? null;
  const behind = Number(git("rev-list", "--count", "HEAD..origin/main") ?? "0");
  const ahead = Number(git("rev-list", "--count", "origin/main..HEAD") ?? "0");
  const images = { api: imageProvenance("order-desk-e2e-api"), web: imageProvenance("order-desk-e2e-web") };

  const names = (predicate) => Object.entries(images).filter(([, info]) => predicate(info)).map(([name]) => name);
  const absent = names((info) => !info.present);
  const unstamped = names((info) => info.present && info.state === null);
  const differing = Object.entries(images).filter(
    ([, info]) => info.present && info.state !== null && info.state !== checkout.state,
  );

  let stale = false;
  let reason;
  if (checkout.state === "unknown") {
    reason = `${sutDir} is not a git checkout, so the running build cannot be traced to a commit`;
  } else if (absent.length > 0) {
    stale = true;
    reason = `${subject(absent)} ${agree(absent, "is", "are")} not built yet`;
  } else if (unstamped.length > 0) {
    stale = true;
    reason =
      `${subject(unstamped)} ${agree(unstamped, "carries", "carry")} no build provenance label, ` +
      "so there is no way to tell which checkout it was built from";
  } else if (differing.length > 0) {
    stale = true;
    const names = differing.map(([name]) => name);
    const built = [...new Set(differing.map(([, info]) => info.state))].join(" and ");
    reason = `${subject(names)} ${agree(names, "was", "were")} built from ${built}, the checkout is ${checkout.state}`;
  } else {
    reason = `the running build matches the checkout at ${checkout.state}`;
  }

  const notes = [];
  if (behind > 0) {
    notes.push(`the checkout is ${behind} commit(s) behind origin/main (${originMain}): pull it to test main`);
  }
  if (ahead > 0) {
    notes.push(`the checkout is ${ahead} commit(s) ahead of origin/main: local commits are what gets built`);
  }
  if (checkout.dirty === true) {
    notes.push("the checkout has uncommitted changes: they are in the build only after a rebuild");
  }

  return {
    sutDir,
    checkout: { ...checkout, originMain, behind, ahead },
    images,
    stale,
    reason,
    notes,
  };
}

function reportBuild(build) {
  const checkout = build.checkout;
  console.info(
    `sut      ${build.sutDir} at ${checkout.state}` +
      (checkout.dirty === null ? "" : checkout.dirty ? " (uncommitted changes)" : " (clean)"),
  );
  for (const [name, info] of Object.entries(build.images)) {
    const built = !info.present ? "(absent)" : (info.state ?? "(no provenance label)");
    console.info(`image    ${name.padEnd(4)} ${built}`);
  }
  console.info(`build    ${build.stale ? "stale" : "current"}: ${build.reason}`);
  for (const note of build.notes) console.info(`note     ${note}`);
}

/** `api` / `api and web` into one noun phrase: the reason strings are read aloud in CI logs. */
function subject(names) {
  return names.length === 1 ? `the ${names[0]} image` : `the ${names.join(" and ")} images`;
}

function agree(names, singular, plural) {
  return names.length === 1 ? singular : plural;
}

async function reportHealth() {
  const health = await fetchJson("/api/health");
  console.info(`health   ${health.status === 200 ? "ok" : `HTTP ${health.status}`} (${baseUrl}/api/health)`);
  const devtools = await fetchJson("/api/devtools/users?role=ADMIN", { "x-devtools-api-key": devtoolsKey });
  console.info(
    `devtools ${devtools.status === 200 ? "ok" : `HTTP ${devtools.status}`} ` +
      (devtools.status === 404
        ? "(DEVTOOLS_ENABLED is false in this stack)"
        : devtools.status === 401
          ? "(x-devtools-api-key does not match DEVTOOLS_API_KEY)"
          : ""),
  );
}

async function requireHealthy() {
  const deadline = Date.now() + 180_000;

  for (;;) {
    const health = await fetchJson("/api/health");
    if (health.status === 200) {
      console.info(`stack is healthy at ${baseUrl}`);
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${baseUrl}/api/health answered ${health.status || "nothing"}: ` +
          "run `node scripts/stack.mjs logs` to see why the stack did not start.",
      );
    }
    await sleep(1_000);
  }
}

async function resetData() {
  const response = await fetch(`${baseUrl}/api/devtools/reset`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-devtools-api-key": devtoolsKey,
    },
    body: JSON.stringify({ confirm: "reset-all-data" }),
  });
  const body = await response.text();

  if (response.status !== 200) {
    throw new Error(`reset failed with ${response.status}: ${body}`);
  }

  console.info(`database reset: ${body}`);
}

async function fetchJson(path, headers = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { headers: { origin: baseUrl, ...headers } });
    await response.text();
    return { status: response.status };
  } catch {
    return { status: 0 };
  }
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};

  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trimStart().startsWith("#")) continue;

    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/u.exec(line);
    if (match === null) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/gu, "");
  }

  return values;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
