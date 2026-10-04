import { meetsRequirement } from "./progress";
import type { CrosstabCell } from "./analytics";
import type { DevLevel } from "./constants";
import type { Completion, TrainingObjective } from "./types";

/**
 * TO 6.1 (drill fundamentals) is no longer directly graded -- its 11 sub-objectives (6.1.1-6.1.11,
 * one per specific D&C/FM session) are, each strictly Complete/Incomplete (never Partial, since
 * every one of them covers exactly one PMT -- Quick Log's "PC" button only ever appears for an
 * objective spanning more than one occurrence). "6.1" itself stays in the catalog as an inert
 * parent (empty proficiencyByLevel everywhere, graded: false) purely so this rollup has a stable id
 * to compute a combined status against wherever "6.1 overall" needs to be shown.
 */
export const SIX_ONE_PARENT_ID = "2-6.1";

export const SIX_ONE_SUB_IDS = [
  "2-6.1.1",
  "2-6.1.2",
  "2-6.1.3",
  "2-6.1.4",
  "2-6.1.5",
  "2-6.1.6",
  "2-6.1.7",
  "2-6.1.8",
  "2-6.1.9",
  "2-6.1.10",
  "2-6.1.11",
] as const;

/** D&C: Block 1 Evaluation -- passing it also covers every EARLIER D&C-only sub (not the FM one, 6.1.2, interleaved before it) per the SOP's "Block one is everything covered in D&C until that point." */
const BLOCK_1_ID = "2-6.1.5";
const BLOCK_1_AUTO_COVERS = ["2-6.1.1", "2-6.1.3", "2-6.1.4"];

/** D&C: Block 2 Evaluation -- a genuine Complete here forces the WHOLE 6.1 rollup to Complete outright, even if an FM sub (6.1.2/6.1.6/6.1.9/6.1.10) is still Incomplete -- Block 2 is cumulatively everything. */
const BLOCK_2_ID = "2-6.1.11";

/**
 * The combined "6.1" status for one cadet, built from their 11 sub-objective completions -- same
 * shape as `crosstabCellFor` so it drops straight into the crosstab's existing cell rendering.
 * undefined when 6.1 isn't applicable at this cadet's dev level at all (e.g. SCL).
 */
export function computeSixOneRollup(catalog: TrainingObjective[], devLevel: DevLevel | undefined, cadetCompletions: Completion[]): CrosstabCell | undefined {
  if (!devLevel) return undefined;
  const catalogById = new Map(catalog.map((o) => [o.id, o]));

  const codeFor = (id: string): string => catalogById.get(id)?.proficiencyByLevel[devLevel] ?? "";
  const applicableSubIds: string[] = SIX_ONE_SUB_IDS.filter((id) => codeFor(id) !== "");
  if (applicableSubIds.length === 0) return undefined;

  const isSubComplete = (id: string): boolean => {
    const required = codeFor(id);
    if (required === "") return true; // not required at this level -- never blocks the rollup
    const completion = cadetCompletions.find((c) => c.objectiveId === id);
    return meetsRequirement(completion, required);
  };

  // A representative code to display alongside C/PC -- every sub shares the same per-level code
  // (all copied from the old single "6.1" objective), so any applicable one works.
  const displayCode = codeFor(applicableSubIds[0]!) as CrosstabCell["code"];

  if (isSubComplete(BLOCK_2_ID)) return { code: displayCode, status: "complete" };

  const covered = new Set(applicableSubIds.filter(isSubComplete));
  if (isSubComplete(BLOCK_1_ID)) {
    for (const id of BLOCK_1_AUTO_COVERS) if (applicableSubIds.includes(id)) covered.add(id);
  }

  if (covered.size === 0) return { code: displayCode, status: "incomplete" };
  if (covered.size === applicableSubIds.length) return { code: displayCode, status: "complete" };
  return { code: displayCode, status: "partial" };
}
