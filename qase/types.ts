/**
 * Shape of a catalogue entry.
 *
 * The same structure drives the TestOps payload, so every field here has a
 * meaning in Qase: a case that is written in full is readable without the
 * repository, which is the point of keeping the catalogue outside the spec files.
 */
export type QaseSeverity = "blocker" | "critical" | "major" | "normal" | "minor" | "trivial";
export type QasePriority = "high" | "medium" | "low";
export type QaseLayer = "e2e" | "api" | "unit";
export type QaseCaseType =
  | "functional"
  | "smoke"
  | "regression"
  | "security"
  | "usability"
  | "performance"
  | "acceptance"
  | "compatibility"
  | "integration"
  | "exploratory"
  | "other";
export type QaseBehavior = "positive" | "negative" | "destructive";

export interface QaseStep {
  readonly action: string;
  readonly expected: string;
  readonly data?: string;
}

export interface QaseCase {
  /** Stable key: identity of the case in TestOps, carried in its `order-desk-e2e:` tag. */
  readonly key: string;
  /** Must equal the test title in the spec, so `qc()` can reject drift. */
  readonly title: string;
  /** TestOps suite path; every path starts with `E2E` so the shared project stays navigable. */
  readonly suite: readonly string[];
  readonly description: string;
  readonly preconditions?: string;
  readonly postconditions?: string;
  readonly steps: readonly QaseStep[];
  readonly severity: QaseSeverity;
  readonly priority: QasePriority;
  readonly layer: QaseLayer;
  readonly type: QaseCaseType;
  readonly behavior?: QaseBehavior;
}
