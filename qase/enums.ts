import type {
  QaseBehavior,
  QaseCaseType,
  QaseLayer,
  QasePriority,
  QaseSeverity,
} from "./types.js";

/**
 * Field codes of the TestOps API: the one place where a catalogue name becomes
 * the integer TestOps stores.
 *
 * The API accepts these codes but never lists them, and the order of the dropdown
 * in the UI is not the order of the codes, so the tables are read off a live case
 * card instead of being derived from a list position. `qase:check` pins every
 * catalogue entry to a code, because a silent shift here files cases under the
 * wrong type rather than failing a run.
 */
export const severityIds = {
  blocker: 1,
  critical: 2,
  major: 3,
  normal: 4,
  minor: 5,
  trivial: 6,
} as const satisfies Record<QaseSeverity, number>;

export const priorityIds = {
  high: 1,
  medium: 2,
  low: 3,
} as const satisfies Record<QasePriority, number>;

export const layerIds = {
  e2e: 1,
  api: 2,
  unit: 3,
} as const satisfies Record<QaseLayer, number>;

export const typeIds = {
  other: 1,
  smoke: 2,
  regression: 3,
  security: 4,
  usability: 5,
  performance: 6,
  acceptance: 7,
  functional: 8,
  compatibility: 9,
  integration: 10,
  exploratory: 11,
} as const satisfies Record<QaseCaseType, number>;

export const behaviorIds = {
  positive: 1,
  negative: 2,
  destructive: 3,
} as const satisfies Record<QaseBehavior, number>;
