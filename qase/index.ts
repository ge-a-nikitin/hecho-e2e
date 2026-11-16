import type { QaseCase } from "./types.js";

/**
 * The catalogue: one entry per test, one test per entry.
 *
 * Empty on purpose. The suite was reset, so no case is written yet and this list
 * carries nothing. Declared as `readonly QaseCase[]` rather than `as const`: on an
 * empty tuple the element type would be `never` and every consumer would lose
 * access to the fields. The key type tightens back into a literal union on its own
 * as soon as the list is rebuilt from `as const` modules.
 *
 * To add cases, create `qase/cases/<area>.ts` with an `as const` array satisfying
 * `readonly QaseCase[]` and spread it here. From that moment `qase:check` fails when
 * a key is used twice, when a spec uses a key that is not here, and when a title
 * drifts from the spec, so this list and the suites cannot fall out of sync without
 * a red check.
 */
export const qaseCases: readonly QaseCase[] = [];

export type QaseCaseKey = (typeof qaseCases)[number]["key"];

export type { QaseCase };
