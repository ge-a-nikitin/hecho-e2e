import { ordersCases } from "./cases/orders.js";
import type { QaseCase } from "./types.js";

/**
 * The catalogue: one entry per test, one test per entry.
 *
 * Each area owns a module under `qase/cases/` and is spread here. From that
 * moment `qase:check` fails when a key is used twice, when a spec uses a key that
 * is not here, and when a title drifts from the spec, so this list and the
 * suites cannot fall out of sync without a red check.
 *
 * To add cases, create `qase/cases/<area>.ts` with an `as const` array satisfying
 * `readonly QaseCase[]` and spread it here.
 */
export const qaseCases: readonly QaseCase[] = [...ordersCases];

export type QaseCaseKey = (typeof qaseCases)[number]["key"];

export type { QaseCase };
