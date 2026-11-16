#!/usr/bin/env node
/**
 * Lifecycle wrapper around docker-compose.e2e.yml.
 *
 * `up` builds both images (the web bundle inlines VITE_API_URL at build time, so
 * a port change requires a rebuild, not a restart) and waits for the API
 * healthcheck. `down` also removes the volumes: the database is disposable by
 * design, and a stack that keeps yesterday's data hides a broken reset.
 *
 * Playwright's global setup calls `up` itself when E2E_STACK=auto, so a normal
 * `pnpm e2e` needs no manual step; the explicit commands exist for debugging.
 *
 * Usage: node scripts/stack.mjs up|down|reset|status|logs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composePath = resolve(repoRoot, "docker-compose.e2e.yml");
const envPath = resolve(repoRoot, ".env.e2e");
const command = process.argv[2] ?? "status";
const fileEnvironment = readEnvFile(envPath);

const baseUrl = (process.env.BASE_URL ?? fileEnvironment.BASE_URL ?? "http://127.0.0.1:7200").replace(
  /\/+$/u,
  "",
);
const devtoolsKey =
  process.env.E2E_DEVTOOLS_API_KEY ??
  fileEnvironment.E2E_DEVTOOLS_API_KEY ??
  "e2e-devtools-key-at-least-32-characters";

switch (command) {
  case "up":
    compose(["up", "-d", "--build", "--wait"]);
    await requireHealthy();
    break;
  case "down":
    compose(["down", "--volumes", "--remove-orphans"]);
    break;
  case "reset":
    await requireHealthy();
    await resetData();
    break;
  case "status":
    compose(["ps"]);
    await reportHealth();
    break;
  case "logs":
    compose(["logs", "--follow", "--tail", "100"]);
    break;
  default:
    console.error(`unknown command "${command}": use up, down, reset, status or logs.`);
    process.exitCode = 1;
}

function compose(args) {
  const envFileArgs = existsSync(envPath) ? ["--env-file", envPath] : [];
  const result = spawnSync(
    "docker",
    ["compose", "-f", composePath, ...envFileArgs, ...args],
    { cwd: repoRoot, stdio: "inherit", env: { ...process.env, ...fileEnvironment } },
  );

  if (result.error) {
    throw new Error(`could not run docker compose: ${result.error.message}. Is Docker running?`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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
