/**
 * Pure planning rules for the TestOps sync.
 *
 * scripts/qase/sync-cases.ts performs the HTTP calls; everything it decides is
 * computed here, so the identity, archiving and conflict rules are testable
 * offline instead of against a live project.
 *
 * Identity is the `order-desk-e2e:<key>` tag the sync writes on every case: a
 * case found by tag keeps its numeric ID (and its history) when the catalogue
 * renames it, moves it, or brings a retired key back. TestOps has no case archive
 * in its API, so retiring a case means moving it under
 * `Archive / <original top level suite>` rather than deleting anything.
 */

/** Prefix of the tag that ties a TestOps case to a catalogue key. */
export const caseTagPrefix = "order-desk-e2e:";

/** Top level suite that holds cases whose keys left the catalogue. */
export const archiveSuite = "Archive";

/** A catalogue entry with its suite path already resolved to a TestOps suite ID. */
export interface PlannedCase {
  readonly key: string;
  readonly title: string;
  readonly suiteId: number;
}

/** TestOps case as the planner sees it, independent of the API payload shape. */
export interface RemoteCase {
  readonly id: number;
  readonly title: string;
  readonly suiteId: number | null;
  readonly tags: readonly string[];
}

/** One node of the TestOps suite tree. */
export interface SuiteRef {
  readonly id: number;
  readonly title: string;
  readonly parentId: number | null;
}

export interface CaseMatch {
  readonly planned: PlannedCase;
  readonly remote: RemoteCase;
}

export interface MatchPlan {
  readonly matches: readonly CaseMatch[];
  readonly missing: readonly PlannedCase[];
  /** Keys whose tag appears on more than one case; the sync must not guess. */
  readonly conflicts: readonly { readonly key: string; readonly ids: readonly number[] }[];
}

export interface ArchiveMove {
  readonly key: string;
  readonly id: number;
  readonly from: readonly string[];
  readonly to: readonly string[];
}

/** Reads the catalogue key out of a case's tags, if the case is one of ours. */
export function caseKeyOf(tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    if (tag.startsWith(caseTagPrefix)) {
      const key = tag.slice(caseTagPrefix.length).trim();

      return key === "" ? undefined : key;
    }
  }

  return undefined;
}

/** Tag title TestOps derives from a suite node; every case carries its suite slugs. */
export function slugTag(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/**
 * The tag titles a case is written with, before deduplication: its identity, its
 * layer and every suite slug. Kept separate from `caseTags()` so the raw
 * composition, collisions included, stays visible instead of silently collapsing.
 */
export function caseTagCandidates(key: string, layer: string, suite: readonly string[]): string[] {
  return [`${caseTagPrefix}${key}`, layer, ...suite.map(slugTag)];
}

/**
 * Tags written on a case. TestOps keeps tags as a set, so the list is deduplicated:
 * the layer and a suite slug can collide (layer `e2e` and the root suite `E2E` both
 * slug to `e2e`), and a repeated tag in the payload made every sync rewrite the
 * case without ever converging.
 */
export function caseTags(key: string, layer: string, suite: readonly string[]): string[] {
  return [...new Set(caseTagCandidates(key, layer, suite))];
}

/** Walks the suite tree upwards and returns the path from the root. */
export function suitePathOf(suites: readonly SuiteRef[], suiteId: number | null): string[] {
  const suitesById = new Map(suites.map((suite) => [suite.id, suite]));
  const path: string[] = [];
  const visited = new Set<number>();
  let current = suiteId;

  while (current !== null && !visited.has(current)) {
    const suite = suitesById.get(current);

    if (suite === undefined) break;

    path.unshift(suite.title);
    visited.add(current);
    current = suite.parentId;
  }

  return path;
}


/**
 * Decides which remote case belongs to which catalogue key.
 *
 * A tag match always wins, so a renamed case is updated in place. A case without
 * any catalogue tag is adopted only when it already sits at the exact suite and
 * title, which keeps cases created before tagging from being duplicated.
 */
export function planMatches(
  planned: readonly PlannedCase[],
  remote: readonly RemoteCase[],
): MatchPlan {
  const casesByKey = new Map<string, RemoteCase[]>();

  for (const remoteCase of remote) {
    const key = caseKeyOf(remoteCase.tags);

    if (key === undefined) continue;

    const found = casesByKey.get(key) ?? [];
    found.push(remoteCase);
    casesByKey.set(key, found);
  }

  const conflicts = [...casesByKey.entries()]
    .filter(([, cases]) => cases.length > 1)
    .map(([key, cases]) => ({ key, ids: cases.map((entry) => entry.id).sort((a, b) => a - b) }));

  const claimed = new Set<number>();
  const matches: CaseMatch[] = [];
  const missing: PlannedCase[] = [];

  for (const entry of planned) {
    const byTag = (casesByKey.get(entry.key) ?? []).find((candidate) => !claimed.has(candidate.id));

    if (byTag !== undefined) {
      claimed.add(byTag.id);
      matches.push({ planned: entry, remote: byTag });
      continue;
    }

    const byLocation = remote.find(
      (remoteCase) =>
        !claimed.has(remoteCase.id) &&
        caseKeyOf(remoteCase.tags) === undefined &&
        remoteCase.title === entry.title &&
        (remoteCase.suiteId ?? null) === entry.suiteId,
    );

    if (byLocation !== undefined) {
      claimed.add(byLocation.id);
      matches.push({ planned: entry, remote: byLocation });
      continue;
    }

    missing.push(entry);
  }

  return { matches, missing, conflicts };
}

/**
 * Plans the retirement of cases whose keys left the catalogue.
 *
 * Untagged cases belong to somebody else and are never touched, and a case that
 * is already inside `Archive` is left alone so repeated syncs converge.
 */
export function planArchives(
  plannedKeys: ReadonlySet<string>,
  remote: readonly RemoteCase[],
  suites: readonly SuiteRef[],
): ArchiveMove[] {
  const moves: ArchiveMove[] = [];

  for (const remoteCase of remote) {
    const key = caseKeyOf(remoteCase.tags);

    if (key === undefined || plannedKeys.has(key)) continue;

    const from = suitePathOf(suites, remoteCase.suiteId);

    if (from[0] === archiveSuite) continue;

    moves.push({
      key,
      id: remoteCase.id,
      from,
      to: [archiveSuite, from[0] ?? "Unsorted"],
    });
  }

  return moves;
}

/** What applying a plan would change in TestOps, as the sync report counts it. */
export interface SyncChanges {
  readonly createdSuites: number;
  readonly createdCases: number;
  readonly updatedCases: number;
  readonly archivedCases: number;
}

/**
 * True when applying the plan writes anything.
 *
 * The post-merge check runs the sync in dry-run mode and treats a non-empty plan
 * as drift: the catalogue in the repository and the cases in TestOps disagree,
 * and results would land on cases nobody is maintaining until somebody syncs.
 */
export function hasDrift(changes: SyncChanges): boolean {
  return (
    changes.createdSuites > 0 ||
    changes.createdCases > 0 ||
    changes.updatedCases > 0 ||
    changes.archivedCases > 0
  );
}

