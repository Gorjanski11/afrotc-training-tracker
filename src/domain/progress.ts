import { PROFICIENCY_RANK, type DevLevel, type ProficiencyCode } from "./constants";
import type { Completion, PmtEvent, TrainingObjective } from "./types";

export interface CadetProgress {
  requiredCount: number;
  completedCount: number;
  missedCount: number;
  percent: number;
}

/**
 * Per-objective status relative to the PMT schedule and "today". For an objective covered by
 * several PMTs (material split across sessions), each occurrence is graded independently -- a
 * qualifying completion at one occurrence never substitutes for another, since they typically
 * cover different topics.
 * - not-scheduled: no PMT has ever covered this objective. Excluded from the
 *   required count entirely -- it isn't due until a PMT actually covers it.
 * - upcoming: a PMT covers it, and every occurrence that isn't yet satisfied is still in the
 *   future. Also excluded from the required count -- not due yet.
 * - due: reserved for a future grading-window/grace-period use; getObjectiveStatus never returns
 *   it today -- a past, unsatisfied occurrence reads as "missed" immediately (see below).
 * - missed: at least one occurrence's date has passed without a qualifying completion logged
 *   for that specific occurrence -- permanently lost, since a later PMT won't re-teach it. This
 *   is the only status that should ever read as a hard flag.
 * - completed: every occurrence has a completion that meets or exceeds the required proficiency
 *   (for a single-occurrence objective, any qualifying completion for it).
 */
export type ObjectiveDueStatus = "not-scheduled" | "upcoming" | "due" | "missed" | "completed";

export interface ObjectiveStatusInfo {
  status: ObjectiveDueStatus;
  occurrences: PmtEvent[];
  bestCompletion?: Completion;
}

/** Best (highest-proficiency) logged completion for a given Training Objective, if any -- across every occurrence, informational only (see getObjectiveStatus for what actually decides completion). */
export function bestCompletionForObjective(objectiveId: string, cadetCompletions: Completion[]): Completion | undefined {
  const relevant = cadetCompletions.filter((c) => c.objectiveId === objectiveId);
  if (relevant.length === 0) return undefined;
  return relevant.reduce((best, c) =>
    PROFICIENCY_RANK[c.proficiencyAchieved] > PROFICIENCY_RANK[best.proficiencyAchieved] ? c : best
  );
}

/** The completion (if any) logged for a given Training Objective at one specific PMT occurrence. */
export function completionForOccurrence(objectiveId: string, pmtEventId: string, cadetCompletions: Completion[]): Completion | undefined {
  return cadetCompletions.find((c) => c.objectiveId === objectiveId && c.pmtEventId === pmtEventId);
}

/** A Partial entry never satisfies a requirement, no matter which code was entered -- it only vouches for that occurrence's own material, not a definitive pass. */
export function meetsRequirement(completion: Completion | undefined, required: string): boolean {
  return (
    !!completion &&
    !completion.partial &&
    required !== "" &&
    PROFICIENCY_RANK[completion.proficiencyAchieved as ProficiencyCode] >= PROFICIENCY_RANK[required as ProficiencyCode]
  );
}

export function getObjectiveStatus(
  objective: TrainingObjective,
  devLevel: DevLevel,
  pmtEvents: PmtEvent[],
  cadetCompletions: Completion[],
  today: Date = new Date()
): ObjectiveStatusInfo {
  const required = objective.proficiencyByLevel[devLevel]; // "" means not required at this level
  const occurrences = pmtEvents
    .filter((e) => e.objectiveIds.includes(objective.id))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const bestCompletion = bestCompletionForObjective(objective.id, cadetCompletions);
  const now = today.getTime();

  if (occurrences.length === 0) {
    // No PMT has ever covered it, but a manually-backdated completion still counts.
    if (meetsRequirement(bestCompletion, required)) return { status: "completed", occurrences, bestCompletion };
    return { status: "not-scheduled", occurrences, bestCompletion };
  }

  if (occurrences.length === 1) {
    // Single occurrence: any qualifying completion for this objective satisfies it -- doesn't
    // have to be scoped to that one pmtEventId, so completions logged before pmtEventId existed
    // still count.
    if (meetsRequirement(bestCompletion, required)) return { status: "completed", occurrences, bestCompletion };
    const past = new Date(occurrences[0].eventDate).getTime() <= now;
    return { status: past ? "missed" : "upcoming", occurrences, bestCompletion };
  }

  // Multi-occurrence: each PMT covers different material for the same objective, so every
  // occurrence must be independently satisfied -- a qualifying completion at one PMT never
  // substitutes for another, and a past occurrence with nothing logged against it specifically
  // is permanently missed (no future PMT will re-teach what that session covered).
  let anyMissed = false;
  let allSatisfied = true;
  for (const occurrence of occurrences) {
    const satisfied = meetsRequirement(completionForOccurrence(objective.id, occurrence.id, cadetCompletions), required);
    if (!satisfied) {
      allSatisfied = false;
      if (new Date(occurrence.eventDate).getTime() <= now) anyMissed = true;
    }
  }
  if (allSatisfied) return { status: "completed", occurrences, bestCompletion };
  if (anyMissed) return { status: "missed", occurrences, bestCompletion };
  return { status: "upcoming", occurrences, bestCompletion };
}

/**
 * A Training Objective counts toward the required denominator once the
 * schedule has actually put it "due" (at least one PMT occurrence has
 * passed) -- not simply because it's applicable to the cadet's dev level.
 * Objectives with no scheduled PMT yet, or only future ones, don't count
 * against the cadet. Non-graded objectives never count at all, regardless
 * of schedule.
 *
 * `missedCount` is the number of objectives with status "missed" -- every
 * occurrence has passed with nothing logged, i.e. there's no PMT left that
 * covers it. This is the only thing that should ever flag a cadet (see
 * shouldFlagCadet below); `percent` is informational and shouldn't drive
 * flagging on its own, since a cadet with nothing due yet is 0/0 (0%)
 * without having missed anything.
 */
export function computeCadetProgress(
  devLevel: DevLevel | undefined,
  objectives: TrainingObjective[],
  cadetCompletions: Completion[],
  pmtEvents: PmtEvent[],
  today: Date = new Date()
): CadetProgress {
  if (!devLevel) {
    return { requiredCount: 0, completedCount: 0, missedCount: 0, percent: 0 };
  }

  let requiredCount = 0;
  let completedCount = 0;
  let missedCount = 0;

  for (const objective of objectives) {
    if (!objective.graded) continue; // non-graded objectives are reference-only, never tracked
    if (objective.proficiencyByLevel[devLevel] === "") continue; // not applicable at this level
    const info = getObjectiveStatus(objective, devLevel, pmtEvents, cadetCompletions, today);
    if (info.status === "not-scheduled" || info.status === "upcoming") continue;
    requiredCount++;
    if (info.status === "completed") completedCount++;
    if (info.status === "missed") missedCount++;
  }

  const percent = requiredCount === 0 ? 0 : Math.round((completedCount / requiredCount) * 100);
  return { requiredCount, completedCount, missedCount, percent };
}

/** The only condition that should ever flag a cadet: at least one Training Objective has run out of PMTs with nothing logged. */
export function shouldFlagCadet(progress: CadetProgress): boolean {
  return progress.missedCount > 0;
}

/**
 * "Overdue" (used by every overdue filter in the app) means status "due" OR
 * "missed" -- at least one covering PMT has already happened without a
 * qualifying completion logged, whether or not there's still a future PMT
 * that could also satisfy it. "not-scheduled"/"upcoming"/"completed" are
 * never overdue.
 */
export function isOverdue(status: ObjectiveDueStatus): boolean {
  return status === "due" || status === "missed";
}
