import type { DevLevel } from "./constants";
import { computeCadetProgress, getObjectiveStatus, isOverdue, shouldFlagCadet } from "./progress";
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

export function computeMostOverdueObjectives(
  cadets: Cadet[],
  catalog: TrainingObjective[],
  completions: Completion[],
  pmtEvents: PmtEvent[],
  limit = 8
): MissedObjectiveRow[] {
  const byCadet = completionsByCadetId(completions);
  const counts = new Map<string, number>();

  for (const cadet of cadets) {
    if (!cadet.devLevel || cadet.status !== "Active") continue;
    for (const objective of catalog) {
      if (!objective.graded || objective.proficiencyByLevel[cadet.devLevel] === "") continue;
      const info = getObjectiveStatus(objective, cadet.devLevel, pmtEvents, byCadet.get(cadet.id) ?? []);
      if (isOverdue(info.status)) counts.set(objective.id, (counts.get(objective.id) ?? 0) + 1);
    }
  }

  const rows: MissedObjectiveRow[] = [];
  for (const objective of catalog) {
    const overdueCount = counts.get(objective.id) ?? 0;
    if (overdueCount === 0) continue;
    rows.push({ objectiveId: objective.id, number: objective.number, title: objective.title, plo: objective.plo, overdueCount });
  }

  return rows.sort((a, b) => b.overdueCount - a.overdueCount).slice(0, limit);
}
