import { PROFICIENCY_RANK, type DevLevel, type ProficiencyCode } from "./constants";
import { computeCadetProgress, getObjectiveStatus, isOverdue, meetsRequirement, shouldFlagCadet } from "./progress";
import { compareByLastName } from "./nameUtils";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "./types";

export interface CohortSummary {
  overallPercent: number;
  totalRequired: number;
  totalCompleted: number;
  flaggedCount: number;
  overdueInstances: number;
}

export interface CadetCompletionRow {
  cadetId: string;
  name: string;
  devLevel: DevLevel | undefined;
  percent: number;
  missedCount: number;
  flagged: boolean;
}

export interface PloCompletionRow {
  plo: string;
  ploOrder: number;
  percent: number;
  requiredCount: number;
  completedCount: number;
}

export interface MissedObjectiveRow {
  objectiveId: string;
  number: string;
  title: string;
  plo: string;
  overdueCount: number;
}

function completionsByCadetId(completions: Completion[]): Map<string, Completion[]> {
  const map = new Map<string, Completion[]>();
  for (const c of completions) {
    const list = map.get(c.cadetId) ?? [];
    list.push(c);
    map.set(c.cadetId, list);
  }
  return map;
}

export function computeCohortSummary(cadets: Cadet[], catalog: TrainingObjective[], completions: Completion[], pmtEvents: PmtEvent[]): CohortSummary {
  const byCadet = completionsByCadetId(completions);
  let totalRequired = 0;
  let totalCompleted = 0;
  let flaggedCount = 0;
  let overdueInstances = 0;

  for (const cadet of cadets) {
    const progress = computeCadetProgress(cadet.devLevel, catalog, byCadet.get(cadet.id) ?? [], pmtEvents);
    totalRequired += progress.requiredCount;
    totalCompleted += progress.completedCount;
    if (cadet.status === "Active" && shouldFlagCadet(progress)) flaggedCount++;

    if (!cadet.devLevel) continue;
    for (const objective of catalog) {
      if (!objective.graded || objective.proficiencyByLevel[cadet.devLevel] === "") continue;
      const info = getObjectiveStatus(objective, cadet.devLevel, pmtEvents, byCadet.get(cadet.id) ?? []);
      if (isOverdue(info.status)) overdueInstances++;
    }
  }

  const overallPercent = totalRequired === 0 ? 0 : Math.round((totalCompleted / totalRequired) * 100);
  return { overallPercent, totalRequired, totalCompleted, flaggedCount, overdueInstances };
}

export function computeCompletionByCadet(cadets: Cadet[], catalog: TrainingObjective[], completions: Completion[], pmtEvents: PmtEvent[]): CadetCompletionRow[] {
  const byCadet = completionsByCadetId(completions);
  return cadets
    .map((cadet) => {
      const progress = computeCadetProgress(cadet.devLevel, catalog, byCadet.get(cadet.id) ?? [], pmtEvents);
      return {
        cadetId: cadet.id,
        name: cadet.name,
        devLevel: cadet.devLevel,
        percent: progress.percent,
        missedCount: progress.missedCount,
        flagged: cadet.status === "Active" && shouldFlagCadet(progress),
      };
    })
    .sort((a, b) => compareByLastName(a.name, b.name));
}

export type CrosstabStatus = "complete" | "partial" | "incomplete" | "notCovered" | "not-applicable";

export interface CrosstabCell {
  /** Absent only for "not-applicable" (no proficiency code makes sense when the objective isn't evaluated at this cadet's level at all). */
  code?: ProficiencyCode;
  /** Mirrors Quick Log's own C/PC/INC states, plus notCovered for a presence-based absence, plus not-applicable when this objective isn't evaluated at this cadet's dev level at all (Section: crosstab C/PC/INC convention). */
  status: CrosstabStatus;
}

/**
 * One cadet's cell in the "Completed TO's by Cadet" crosstab (Section D) -- "not-applicable" when
 * this objective isn't evaluated at the cadet's dev level at all (renders as a solid N/A box), plain
 * `undefined` when it IS applicable but nothing's been logged against it yet (renders blank -- still
 * outstanding, not yet due for a flag). Otherwise picks the single best-standing completion across
 * every occurrence, in priority order: a genuine Complete (meets the requirement, not Partial, not
 * Not Covered) beats a Partial complete, which beats a plain Incomplete, which beats a Not Covered
 * placeholder -- e.g. a cadet with a qualifying Complete at one occurrence and a Not Covered at
 * another still shows Complete, not Not Covered. Ties within a tier go to the highest-ranked code.
 */
export function crosstabCellFor(objective: TrainingObjective, devLevel: DevLevel, cadetCompletions: Completion[]): CrosstabCell | undefined {
  const required = objective.proficiencyByLevel[devLevel];
  if (required === "") return { status: "not-applicable" };
  const relevant = cadetCompletions.filter((c) => c.objectiveId === objective.id);
  if (relevant.length === 0) return undefined;

  const best = (pool: Completion[]) => pool.reduce((a, b) => (PROFICIENCY_RANK[b.proficiencyAchieved] > PROFICIENCY_RANK[a.proficiencyAchieved] ? b : a));

  const complete = relevant.filter((c) => meetsRequirement(c, required));
  if (complete.length > 0) return { code: best(complete).proficiencyAchieved, status: "complete" };

  const partial = relevant.filter((c) => c.partial && !c.notCovered);
  if (partial.length > 0) return { code: best(partial).proficiencyAchieved, status: "partial" };

  const incomplete = relevant.filter((c) => !c.partial && !c.notCovered);
  if (incomplete.length > 0) return { code: best(incomplete).proficiencyAchieved, status: "incomplete" };

  return { code: best(relevant).proficiencyAchieved, status: "notCovered" };
}

export function computeCompletionByPlo(cadets: Cadet[], catalog: TrainingObjective[], completions: Completion[], pmtEvents: PmtEvent[]): PloCompletionRow[] {
  const byCadet = completionsByCadetId(completions);
  const ploMap = new Map<string, { ploOrder: number; requiredCount: number; completedCount: number }>();

  for (const cadet of cadets) {
    if (!cadet.devLevel) continue;
    for (const objective of catalog) {
      if (!objective.graded || objective.proficiencyByLevel[cadet.devLevel] === "") continue;
      const info = getObjectiveStatus(objective, cadet.devLevel, pmtEvents, byCadet.get(cadet.id) ?? []);
      if (info.status === "not-scheduled" || info.status === "upcoming") continue;
      const entry = ploMap.get(objective.plo) ?? { ploOrder: objective.ploOrder, requiredCount: 0, completedCount: 0 };
      entry.requiredCount++;
      if (info.status === "completed") entry.completedCount++;
      ploMap.set(objective.plo, entry);
    }
  }

  return Array.from(ploMap.entries())
    .map(([plo, v]) => ({
      plo,
      ploOrder: v.ploOrder,
      requiredCount: v.requiredCount,
      completedCount: v.completedCount,
      percent: v.requiredCount === 0 ? 0 : Math.round((v.completedCount / v.requiredCount) * 100),
    }))
    .sort((a, b) => a.ploOrder - b.ploOrder);
}

/**
 * Every objective with at least one active cadet currently overdue on it, ranked by overdue count
 * -- "Overdue objectives" (Section 6b), no longer capped to a top-N. Only counts a cadet/objective
 * pair when NOTHING has been logged for it at all -- `bestCompletion` undefined. A completion that
 * exists but didn't satisfy the requirement (Incomplete) or only vouches for one occurrence
 * (Partial complete) already has a real judgment on record, so it's excluded here even though
 * `getObjectiveStatus` still reads it as "missed" (that status only tracks whether a PASS was ever
 * logged, not whether ANY judgment was).
 */
export function computeOverdueObjectives(cadets: Cadet[], catalog: TrainingObjective[], completions: Completion[], pmtEvents: PmtEvent[]): MissedObjectiveRow[] {
  const byCadet = completionsByCadetId(completions);
  const counts = new Map<string, number>();

  for (const cadet of cadets) {
    if (!cadet.devLevel || cadet.status !== "Active") continue;
    for (const objective of catalog) {
      if (!objective.graded || objective.proficiencyByLevel[cadet.devLevel] === "") continue;
      const info = getObjectiveStatus(objective, cadet.devLevel, pmtEvents, byCadet.get(cadet.id) ?? []);
      if (isOverdue(info.status) && !info.bestCompletion) counts.set(objective.id, (counts.get(objective.id) ?? 0) + 1);
    }
  }

  const rows: MissedObjectiveRow[] = [];
  for (const objective of catalog) {
    const overdueCount = counts.get(objective.id) ?? 0;
    if (overdueCount === 0) continue;
    rows.push({ objectiveId: objective.id, number: objective.number, title: objective.title, plo: objective.plo, overdueCount });
  }

  return rows.sort((a, b) => b.overdueCount - a.overdueCount);
}
