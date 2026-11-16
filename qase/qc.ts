import { qase } from "playwright-qase-reporter";
import { qaseCaseIds } from "./case-ids.js";
import { qaseCases, type QaseCase, type QaseCaseKey } from "./index.js";

const casesByKey = new Map<string, QaseCase>(
  qaseCases.map((entry): [string, QaseCase] => [entry.key, entry]),
);

/**
 * Resolves a catalogue key into the test title the Qase reporter understands.
 *
 * The catalogue is the single source of truth: this helper fails collection when
 * a key is missing or when the title no longer matches, so a renamed test cannot
 * quietly report to the wrong case. Until `qase:sync` has stored a numeric ID the
 * title is returned unchanged, which keeps offline runs independent of Qase.
 */
export function qc(key: QaseCaseKey, title: string): string {
  const entry = casesByKey.get(key);

  if (entry === undefined) {
    throw new Error(`Unknown Qase case "${key}". Add it to qase/cases/ before using qc().`);
  }

  if (entry.title !== title) {
    throw new Error(
      `Qase case "${key}" is titled "${entry.title}" in the catalogue but "${title}" in the suite. ` +
        "Keep both titles identical so the result lands on the right case.",
    );
  }

  const id = qaseCaseIds[key];

  return id === undefined ? title : qase(id, title);
}
