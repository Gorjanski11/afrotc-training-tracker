import { PROFICIENCY_RANK, type DevLevel, type ProficiencyCode } from "./constants";
import type { Completion, PmtEvent, TrainingObjective } from "./types";

export interface CadetProgress {
  requiredCount: number;
  completedCount: number;
  missedCount: number;
  percent: number;
}

/**
 * Per-objective status relative to the PMT schedule and "today":
 * - not-scheduled: no PMT has ever covered this objective. Excluded from the
 *   required count entirely -- it isn't due until a PMT actually covers it.
 * - upcoming: a PMT covers it, but every occurrence is still in the future.
 *   Also excluded from the required count -- not due yet.
 * - due: at least one occurrence has passed and at least one is still upcoming.
 *   Counted as required; not yet a "last chance gone" situation.
 * - missed: every occurrence has passed with no qualifying completion logged --
 *   there's no PMT left that covers this objective. This is the only status
 *   that should ever read as a hard flag.
 * - completed: a logged completion meets or exceeds the required proficiency.
 */
export type ObjectiveDueStatus = "not-scheduled" | "upcoming" | "due" | "missed" | "completed";

export interface ObjectiveStatusInfo {
  status: ObjectiveDueStatus;
  occurrences: PmtEvent[];
  bestCompletion?: Completion;
}

/** Best (highest-proficiency) logged completion for a given Training Objective, if any. */
export function bestCompletionForObjective(objectiveId: string, cadetCompletions: Completion[]): Completion | undefined {
  const relevant = cadetCompletions.filter((c) => c.objectiveId === objectiveId);
  if (relevant.length === 0) return undefined;
  return relevant.reduce((best, c) =>
    PROFICIENCY_RANK[c.proficiencyAchieved] > PROFICIENCY_RANK[best.proficiencyAchieved] ? c : best
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
  const achievedEnough =
    !!bestCompletion &&
    required !== "" &&
    PROFICIENCY_RANK[bestCompletion.proficiencyAchieved as ProficiencyCode] >= PROFICIENCY_RANK[required as ProficiencyCode];

  if (achievedEnough) {
    return { status: "completed", occurrences, bestCompletion };
  }
  if (occurrences.length === 0) {
    return { status: "not-scheduled", occurrences, bestCompletion };
  }

  const now = today.getTime();
  const past = occurrences.filter((e) => new Date(e.eventDate).getTime() <= now);
  const future = occurrences.filter((e) => new Date(e.eventDate).getTime() > now);

  if (past.length === 0) return { status: "upcoming", occurrences, bestCompletion };
  if (future.length > 0) return { status: "due", occurrences, bestCompletion };
  return { status: "missed", occurrences, bestCompletion };
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
