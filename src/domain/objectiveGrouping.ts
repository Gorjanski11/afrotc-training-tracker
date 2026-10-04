import { PLO_SECTIONS } from "./constants";
import type { ProgramLearningOutcomeSection, TrainingObjective } from "./types";

/**
 * Deterministic Firestore doc ID for a Training Objective. Objective `number`s
 * are NOT globally unique -- "1.1" recurs in every PLO section (Leader of
 * Character 1.1, Disciplined Professional 1.1, etc.) -- so the doc ID must
 * combine `ploOrder` and `number` to avoid silently overwriting objectives
 * from different sections during catalog import.
 */
export function objectiveDocId(ploOrder: number, number: string): string {
  return `${ploOrder}-${number}`;
}

/** Numeric-aware compare for objective numbers like "2.1" vs "2.10" (plain string compare would sort "2.10" before "2.2"). */
/**
 * Numeric, per-segment comparison for any number of dot-separated parts -- "6.1" < "6.1.1" < "6.1.2"
 * < ... < "6.1.10" < "6.1.11" (a 2-segment comparator here would silently drop the 3rd segment,
 * collapsing every "6.1.X" sub-objective to the same sort key as "6.1" itself).
 */
export function compareObjectiveNumbers(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Builds the PLO -> sub-area -> objectives tree used by Cadet Detail and the Reference Library, in document order. */
export function groupByPlo(objectives: TrainingObjective[]): ProgramLearningOutcomeSection[] {
  const sections: ProgramLearningOutcomeSection[] = PLO_SECTIONS.map((plo, i) => ({ plo, ploOrder: i + 1, subAreas: [] }));

  const sorted = [...objectives].sort((a, b) => {
    if (a.ploOrder !== b.ploOrder) return a.ploOrder - b.ploOrder;
    return compareObjectiveNumbers(a.number, b.number);
  });

  for (const objective of sorted) {
    const section = sections.find((s) => s.ploOrder === objective.ploOrder);
    if (!section) continue;
    let subArea = section.subAreas.find((sa) => sa.subArea === objective.subArea);
    if (!subArea) {
      subArea = { subArea: objective.subArea, objectives: [] };
      section.subAreas.push(subArea);
    }
    subArea.objectives.push(objective);
  }

  return sections.filter((s) => s.subAreas.length > 0);
}
