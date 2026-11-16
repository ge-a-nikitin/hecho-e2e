/**
 * Offline parity check between the Qase catalogue and the specs.
 *
 * Runs without a token and without the stack, so pull-request checks can prove
 * that every case is described once, that no spec reports to a key that does not
 * exist, and that a title has not drifted from the catalogue. TestOps itself is
 * only touched by `qase:sync`.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { qaseCaseIds } from "../../qase/case-ids.js";
import { qaseCases, type QaseCase } from "../../qase/index.js";
import { listSpecFiles } from "../../qase/spec-index.js";

const problems: string[] = [];
const callPattern = /\bqc\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/gu;
const catalogue = new Map<string, QaseCase>(qaseCases.map((entry) => [entry.key, entry]));

if (catalogue.size !== qaseCases.length) {
  problems.push("The catalogue contains a duplicate key.");
}

for (const entry of qaseCases) {
  const where = `case "${entry.key}"`;

  if (entry.title.trim() === "") problems.push(`${where} has an empty title`);
  if (entry.suite.length < 1 || entry.suite[0] !== "E2E") {
    problems.push(`${where} must live under an "E2E" suite, got "${entry.suite.join(" / ")}"`);
  }
  if (entry.description.trim().length < 60) {
    problems.push(`${where} needs a description that explains why the case exists`);
  }
  if (entry.layer === "e2e" && (entry.preconditions ?? "").trim() === "") {
    problems.push(`${where} is an end-to-end case and needs preconditions`);
  }
  if (entry.steps.length < 1) {
    problems.push(`${where} has no steps`);
  }
  for (const [index, step] of entry.steps.entries()) {
    if (step.action.trim() === "" || step.expected.trim() === "") {
      problems.push(`${where} step ${index + 1} needs both an action and an expected result`);
    }
  }
}

const usage = new Map<string, { readonly file: string; readonly title: string }[]>();

for (const file of listSpecFiles()) {
  const source = readFileSync(file, "utf8");
  const path = relative(process.cwd(), file);

  for (const match of source.matchAll(callPattern)) {
    const key = match[1];
    const title = match[2];
    const entries = usage.get(key) ?? [];

    entries.push({ file: path, title });
    usage.set(key, entries);

    const entry = catalogue.get(key);

    if (entry === undefined) {
      problems.push(`${path} uses unknown Qase key "${key}"`);
      continue;
    }
    if (entry.title !== title) {
      problems.push(
        `${path} titles "${key}" as "${title}" but the catalogue says "${entry.title}"`,
      );
    }
  }
}

for (const [key, entries] of usage) {
  if (entries.length > 1) {
    problems.push(
      `Qase key "${key}" is used by ${entries.length} tests: ${entries.map((entry) => entry.file).join(", ")}`,
    );
  }
}

for (const entry of qaseCases) {
  if (!usage.has(entry.key)) {
    problems.push(`Catalogue key "${entry.key}" is not used by any spec`);
  }
}

for (const [key, id] of Object.entries(qaseCaseIds)) {
  if (!catalogue.has(key)) {
    problems.push(`qase/case-ids.ts holds "${key}", which is not in the catalogue`);
  }
  if (id !== undefined && (!Number.isInteger(id) || id <= 0)) {
    problems.push(`qase/case-ids.ts holds an invalid ID ${String(id)} for "${key}"`);
  }
}

if (problems.length > 0) {
  console.error("The Qase catalogue and the suites disagree:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.info(
    `qase:check passed: ${qaseCases.length} catalogue cases, ${usage.size} keys used by ` +
      `${listSpecFiles().length} spec files, ${Object.keys(qaseCaseIds).length} published IDs.`,
  );
}
