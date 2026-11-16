import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Maps catalogue keys to the spec files that run them.
 *
 * The mapping is derived, never hand-maintained: `qase:check` asserts both
 * directions of it, and the sync credits the owning spec in the case description.
 * Keeping the scan in one place means the check and the sync cannot disagree
 * about which file a key belongs to.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scannedRoot = resolve(repoRoot, "tests");
const caseCall = /\bqc\(\s*"([^"]+)"/gu;

export function listSpecFiles(): string[] {
  return walk(scannedRoot)
    .filter((path) => path.endsWith(".spec.ts"))
    .sort();
}

export function qcUsageIndex(): ReadonlyMap<string, readonly string[]> {
  const usage = new Map<string, string[]>();

  for (const file of listSpecFiles()) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(caseCall)) {
      const key = match[1];
      const paths = usage.get(key) ?? [];
      const relativePath = relative(repoRoot, file);

      if (!paths.includes(relativePath)) paths.push(relativePath);
      usage.set(key, paths);
    }
  }

  return new Map([...usage].sort(([left], [right]) => left.localeCompare(right)));
}

function walk(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .map((entry) => resolve(directory, entry))
    .filter((entry) => statSync(entry).isFile());
}
