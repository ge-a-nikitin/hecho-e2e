#!/usr/bin/env node
/**
 * Generates and verifies the SUT context artefacts in docs/generated/.
 *
 * The system under test lives in another repository and changes on its own
 * schedule. Agents working here must not read the SUT source to know which test
 * ids, routes, endpoints and enums exist, so this script derives them into small
 * JSON files that are committed. A committed artefact is a snapshot: `status`
 * says whether the local SUT has moved past it, and `check` (which CI runs
 * against the pinned checkout) fails when the snapshot no longer matches. The
 * snapshot therefore records the SUT commit and never a path into this working
 * copy, so `check` passes wherever the checkout lives (`../order-desk` locally,
 * `sut/order-desk` in CI).
 *
 * Usage:
 *   node scripts/sut/sync-context.mjs status
 *   node scripts/sut/sync-context.mjs sync
 *   node scripts/sut/sync-context.mjs check
 *
 * The SUT directory comes from SUT_DIR, then .env.e2e, then sut.lock.json.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const generatedDir = resolve(repoRoot, "docs/generated");
const lockPath = resolve(repoRoot, "sut.lock.json");
const command = process.argv[2] ?? "status";

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const fileEnvironment = readEnvFile(resolve(repoRoot, ".env.e2e"));
const sutDir = resolve(
  repoRoot,
  process.env.SUT_DIR ?? fileEnvironment.SUT_DIR ?? lock.localDir ?? "../order-desk",
);

main().catch((error) => {
  console.error(`sut:${command} failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  assertSut();
  const inputs = collectInputs();
  const artefacts = buildArtefacts(inputs);

  if (command === "status") {
    printStatus(artefacts);
    return;
  }

  if (command === "sync") {
    mkdirSync(generatedDir, { recursive: true });
    for (const [name, content] of Object.entries(artefacts)) {
      writeFileSync(resolve(generatedDir, name), `${JSON.stringify(content, null, 2)}\n`);
    }
    console.info(`Wrote ${Object.keys(artefacts).length} artefacts to docs/generated from ${shortSha(sutHead())}.`);
    return;
  }

  if (command === "check") {
    const stale = [];
    for (const [name, content] of Object.entries(artefacts)) {
      const path = resolve(generatedDir, name);
      const expected = `${JSON.stringify(content, null, 2)}\n`;
      if (!existsSync(path)) {
        stale.push(`${name} is missing`);
        continue;
      }
      if (readFileSync(path, "utf8") !== expected) {
        stale.push(`${name} does not match the SUT checkout`);
      }
    }

    if (stale.length > 0) {
      console.error("docs/generated is stale:");
      for (const line of stale) console.error(`  - ${line}`);
      console.error("Run `pnpm sut:sync` and commit the regenerated artefacts.");
      process.exitCode = 1;
      return;
    }

    console.info(`docs/generated matches ${shortSha(sutHead())} (${inputs.files.length} input files).`);
    return;
  }

  throw new Error(`unknown command "${command}": use status, sync or check.`);
}

function assertSut() {
  if (!existsSync(sutDir)) {
    throw new Error(
      `no SUT checkout at ${sutDir}. Clone ${lock.repository} next to this repository, ` +
        "or set SUT_DIR to an existing checkout.",
    );
  }
  if (!existsSync(resolve(sutDir, "apps/web/src"))) {
    throw new Error(`${sutDir} does not look like the HECHO repository: apps/web/src is missing.`);
  }
}

function collectInputs() {
  const files = [
    ...walk(resolve(sutDir, "apps/web/src")).filter((path) => /\.(ts|tsx)$/u.test(path)),
    ...walk(resolve(sutDir, "apps/api/src")).filter((path) => path.endsWith(".controller.ts")),
    resolve(sutDir, "apps/api/prisma/schema.prisma"),
    ...walk(resolve(sutDir, "docs/en")).filter((path) => path.endsWith(".md")),
    resolve(sutDir, "README.en.md"),
  ].filter((path) => existsSync(path));

  const contents = new Map(files.map((path) => [path, readFileSync(path, "utf8")]));
  const digest = createHash("sha256");
  for (const path of [...files].sort()) {
    digest.update(`${relative(sutDir, path)}:${sha256(contents.get(path) ?? "")}\n`);
  }

  return { files, contents, inputsHash: digest.digest("hex") };
}

function buildArtefacts(inputs) {
  const base = {
    generatedBy: "scripts/sut/sync-context.mjs",
    repository: lock.repository,
    sutRef: lock.ref,
  };

  const testIds = extractTestIds(inputs);
  const routes = extractRoutes(inputs);
  const endpoints = extractEndpoints(inputs);
  const enums = extractEnums(inputs);
  const documents = extractDocs(inputs);

  return {
    "testids.json": { ...base, counts: testIds.counts, ids: testIds.ids },
    "routes.json": { ...base, routes: routes.routes, panelPaths: routes.panelPaths },
    "endpoints.json": { ...base, endpoints },
    "enums.json": { ...base, enums },
    "docs-index.json": { ...base, documents },
    "context.json": {
      ...base,
      inputsHash: inputs.inputsHash,
      inputFiles: inputs.files.map((path) => relative(sutDir, path)).sort(),
      counts: {
        testIds: testIds.counts,
        routes: routes.routes.length,
        endpoints: endpoints.length,
        enums: Object.keys(enums).length,
        documents: documents.length,
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Test ids                                                                    */
/* -------------------------------------------------------------------------- */

function extractTestIds(inputs) {
  const ids = [];
  const counts = { literal: 0, template: 0, expression: 0 };

  for (const [path, source] of inputs.contents) {
    if (!/\.(ts|tsx)$/u.test(path) || !path.includes("apps/web/src")) continue;

    for (const found of scanTestIds(source)) {
      const file = relative(sutDir, path);
      const line = lineOf(source, found.index);

      if (found.kind === "literal") {
        ids.push({ testId: found.value, file, line });
        counts.literal += 1;
      } else if (found.kind === "literal-set") {
        for (const value of found.value) {
          ids.push({ testId: value, file, line });
          counts.literal += 1;
        }
      } else if (found.kind === "template") {
        ids.push({ pattern: found.value, file, line });
        counts.template += 1;
      } else {
        ids.push({ expression: found.value, file, line });
        counts.expression += 1;
      }
    }
  }

  ids.sort((left, right) => {
    const leftKey = left.testId ?? left.pattern ?? left.expression ?? "";
    const rightKey = right.testId ?? right.pattern ?? right.expression ?? "";
    return leftKey.localeCompare(rightKey) || left.file.localeCompare(right.file);
  });

  return { ids, counts };
}

function scanTestIds(source) {
  const needle = "data-testid=";
  const found = [];
  let cursor = 0;

  for (;;) {
    const index = source.indexOf(needle, cursor);
    if (index === -1) return found;

    const parsed = readJsxAttributeValue(source, index + needle.length);
    if (parsed === undefined) {
      cursor = index + needle.length;
      continue;
    }

    found.push({ index, ...parsed });
    cursor = parsed.end;
  }
}

/**
 * Reads the value of a JSX attribute: a quoted literal, `{"text"}`, a template
 * literal, a ternary of literals, or an expression the caller must resolve by
 * hand. Template literals keep their `${...}` placeholders, which is what makes
 * `order-card-${order.id}` usable as a pattern.
 */
function readJsxAttributeValue(source, start) {
  let cursor = start;
  while (cursor < source.length && /\s/u.test(source[cursor])) cursor += 1;

  const quote = source[cursor];
  if (quote === '"' || quote === "'") {
    const end = source.indexOf(quote, cursor + 1);
    if (end === -1) return undefined;
    return { kind: "literal", value: source.slice(cursor + 1, end), end: end + 1 };
  }

  if (quote !== "{") return undefined;

  const closing = findClosingBrace(source, cursor);
  if (closing === -1) return undefined;

  const inner = source.slice(cursor + 1, closing).trim();
  const end = closing + 1;

  const template = /^`([\s\S]*)`$/u.exec(inner);
  if (template !== null) return { kind: "template", value: template[1], end };

  const literal = /^"([^"]*)"$/u.exec(inner) ?? /^'([^']*)'$/u.exec(inner);
  if (literal !== null) return { kind: "literal", value: literal[1], end };

  const alternatives = [...inner.matchAll(/(["'])((?:(?!\1).)*)\1/gu)].map((match) => match[2]);
  if (inner.includes("?") && alternatives.length > 0) {
    return { kind: "literal-set", value: alternatives, end };
  }

  return { kind: "expression", value: inner, end };
}

function findClosingBrace(source, openIndex) {
  let depth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === '"' || char === "'" || char === "`") {
      index = skipString(source, index);
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function skipString(source, start) {
  const quote = source[start];

  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === quote) return index;
  }

  return source.length;
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

function extractRoutes(inputs) {
  const appPath = resolve(sutDir, "apps/web/src/app.tsx");
  const source = inputs.contents.get(appPath) ?? "";
  const routes = [];

  for (const match of source.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z0-9_]+)/gu)) {
    routes.push({ path: match[1], element: match[2], line: lineOf(source, match.index) });
  }

  const panelPaths = {};
  const block = /const panelPaths[^=]*=\s*\{([\s\S]*?)\};/u.exec(source);
  if (block !== null) {
    for (const match of block[1].matchAll(/([A-Z]+):\s*"([^"]+)"/gu)) {
      panelPaths[match[1]] = match[2];
    }
  }

  return { routes, panelPaths };
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

function extractEndpoints(inputs) {
  const endpoints = [];

  for (const [path, source] of inputs.contents) {
    if (!path.endsWith(".controller.ts")) continue;

    const file = relative(sutDir, path);
    const base = /@Controller\("([^"]*)"\)/u.exec(source)?.[1] ?? "";
    const requiresDevtoolsKey = source.includes("DevToolsGuard");

    for (const match of source.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:"([^"]*)")?\s*\)/gu)) {
      const method = match[1].toUpperCase();
      const subPath = match[2] ?? "";
      const tail = source.slice(match.index + match[0].length);
      const handler = /\n\s*(?:public\s+)?(?:async\s+)?([A-Za-z0-9_]+)\s*\(/u.exec(tail)?.[1] ?? null;

      endpoints.push({
        method,
        // The API mounts every controller under /api; paths here stay relative to it.
        path: `/${[base, subPath].filter((part) => part !== "").join("/")}`,
        handler,
        controller: base,
        requiresDevtoolsKey,
        access: accessOf(source, base, subPath, match.index + match[0].length),
        file,
        line: lineOf(source, match.index),
      });
    }
  }

  endpoints.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method));

  return endpoints;
}

/**
 * Summarizes who may call the endpoint: the devtools key, a public route, the
 * roles named by the handler's own `@Roles(...)`, the roles of a controller-wide
 * decorator, or plain authentication. The SUT places `@Roles` right after the
 * HTTP decorator, so the segment between that decorator and the handler name is
 * where the answer lives; `/api/docs` (Swagger) stays the authority.
 */
function accessOf(source, base, subPath, decoratorEnd) {
  if (base === "devtools") return "devtools-key";
  if (base === "auth") return "public:better-auth";
  if (`${base}${subPath === "" ? "" : `/${subPath}`}` === "health") return "public";

  const handlerOffset = source
    .slice(decoratorEnd)
    .search(/\n\s*(?:public\s+)?(?:async\s+)?[A-Za-z0-9_]+\s*\(/u);
  const segment = source.slice(decoratorEnd, decoratorEnd + (handlerOffset === -1 ? 400 : handlerOffset));

  const methodRoles = /@Roles\(([^)]*)\)/u.exec(segment);
  if (methodRoles !== null) return `roles:${normalizeRoles(methodRoles[1])}`;

  const classStart = source.indexOf("export class");
  const classRoles = classStart === -1 ? null : /@Roles\(([^)]*)\)/u.exec(source.slice(0, classStart));
  if (classRoles !== null) return `roles:${normalizeRoles(classRoles[1])}`;

  return "authenticated";
}

function normalizeRoles(list) {
  return list.replace(/[\s"]/gu, "").replace(/UserRole\./gu, "");
}

/* -------------------------------------------------------------------------- */
/* Enums and documentation                                                     */
/* -------------------------------------------------------------------------- */

function extractEnums(inputs) {
  const schemaPath = resolve(sutDir, "apps/api/prisma/schema.prisma");
  const source = inputs.contents.get(schemaPath) ?? "";
  const enums = {};

  for (const match of source.matchAll(/enum\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/gu)) {
    enums[match[1]] = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//") && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/u)[0]);
  }

  return enums;
}

function extractDocs(inputs) {
  const documents = [];

  for (const [path, source] of inputs.contents) {
    if (!path.endsWith(".md")) continue;

    documents.push({
      path: relative(sutDir, path),
      title: /^#\s+(.+)$/mu.exec(source)?.[1]?.trim() ?? null,
      bytes: Buffer.byteLength(source),
      sha256: sha256(source),
    });
  }

  documents.sort((left, right) => left.path.localeCompare(right.path));

  return documents;
}


/* -------------------------------------------------------------------------- */
/* Reporting and helpers                                                       */
/* -------------------------------------------------------------------------- */

function printStatus(artefacts) {
  const head = sutHead();
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const dirty = git(["status", "--porcelain"]).trim() !== "";
  const contextPath = resolve(generatedDir, "context.json");
  const committed = existsSync(contextPath)
    ? JSON.parse(readFileSync(contextPath, "utf8"))
    : undefined;
  const current = artefacts["context.json"];
  const fresh = committed !== undefined && committed.inputsHash === current.inputsHash;

  console.info(`SUT        ${sutDir}`);
  console.info(`Repository ${lock.repository}`);
  console.info(`Locked ref ${lock.ref}`);
  console.info(
    `HEAD       ${head} (${branch})${head === lock.ref ? "" : "   <- differs from the locked ref"}`,
  );
  console.info(`Worktree   ${dirty ? "has uncommitted changes" : "clean"}`);
  console.info(
    `Context    ${fresh ? "fresh" : committed === undefined ? "not generated yet" : "STALE"}`,
  );
  console.info(
    `Artefacts  ${current.counts.testIds.literal} literal + ${current.counts.testIds.template} templated ` +
      `+ ${current.counts.testIds.expression} computed test ids, ${current.counts.routes} routes, ` +
      `${current.counts.endpoints} endpoints, ${current.counts.enums} enums, ` +
      `${current.counts.documents} documents`,
  );

  if (!fresh) {
    console.info("Run `pnpm sut:sync` to regenerate docs/generated from this checkout.");
  }
}

function sutHead() {
  try {
    return git(["rev-parse", "HEAD"]).trim();
  } catch {
    return "unknown";
  }
}

function git(args) {
  return execFileSync("git", ["--no-pager", "-C", sutDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function shortSha(sha) {
  return /^[0-9a-f]{40}$/u.test(sha) ? sha.slice(0, 7) : sha;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  if (!statSync(directory).isDirectory()) return [directory];

  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .map((entry) => resolve(directory, entry))
    .filter((entry) => statSync(entry).isFile());
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


