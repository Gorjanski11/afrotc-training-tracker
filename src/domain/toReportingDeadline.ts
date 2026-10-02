import { meetsRequirement } from "./progress";
import { PROFICIENCY_CODES, type ProficiencyCode } from "./constants";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "./types";

/**
 * SOP (1 Oct 2026) Section 4: Flight/Group Commanders must have every objective a training week's
 * PMTs covered actually GRADED (not just scheduled) by cool-down hours (2000) on the Friday of that
 * same Monday-Sunday calendar week. Works from any event date in that week, not just a Friday one,
 * since PT can land on other days than LLAB/FM/D&C.
 */
export function trainingWeekFridayDeadline(anyEventDateInWeek: string): Date {
  const d = new Date(anyEventDateInWeek);
  const daysSinceMonday = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  const friday = new Date(d);
  friday.setDate(d.getDate() - daysSinceMonday + 4);
  friday.setHours(20, 0, 0, 0);
  return friday;
}

/** Required-proficiency cells are usually a single code, occasionally a composite ("P1/P2") -- the minimum that satisfies the requirement. Mirrors QuickLogScreen's own private helper (deliberately duplicated, not shared). */
function firstRequiredCode(cell: string): ProficiencyCode | undefined {
  const first = cell.split("/")[0]?.trim();
  return (PROFICIENCY_CODES as readonly string[]).includes(first) ? (first as ProficiencyCode) : undefined;
}

/**
 * True once every cadet who needs grading on this objective at this specific PMT occurrence has
 * SOME judgment logged for it -- mirrors Quick Log's own "allLogged" column-hiding rule (any of
 * Complete/Partial complete/Incompleted counts as handled), just evaluated for one event instead of
 * driving the whole grid. For a multi-occurrence objective, a cadet already satisfied at an earlier
 * occurrence doesn't need this one logged too.
 */
export function isObjectiveGradedAtEvent(
  objective: TrainingObjective,
  event: PmtEvent,
  allOccurrencesForObjective: PmtEvent[],
  roster: Cadet[],
  completions: Completion[]
): boolean {
  const isMulti = allOccurrencesForObjective.length > 1;
  const relevantCadets = roster.filter((c) => c.devLevel && objective.proficiencyByLevel[c.devLevel] !== "");
  return relevantCadets.every((cadet) => {
    const required = firstRequiredCode(objective.proficiencyByLevel[cadet.devLevel!]);
    if (!required) return true;
    const cadetCompletions = completions.filter((c) => c.cadetId === cadet.id && c.objectiveId === objective.id);
    if (isMulti) {
      const satisfiedAnywhere = cadetCompletions.some((c) => meetsRequirement(c, required));
      if (satisfiedAnywhere) return true;
      return cadetCompletions.some((c) => c.pmtEventId === event.id);
    }
    return cadetCompletions.length > 0;
  });
}

export interface UngradedWeek {
  trainingWeek: number;
  deadline: Date;
  /** One entry per (event, objective) pair still missing grading for someone who needs it. */
  outstanding: { event: PmtEvent; objective: TrainingObjective }[];
}

/**
 * Every Training Week whose own Friday-2000 deadline has already passed and still has at least one
 * covered objective not fully graded -- the SAE Review list for SOP Section 4. Only past PMTs are
 * checked (nothing to grade yet for a future one), and only weeks whose deadline has actually
 * arrived -- an in-progress week isn't "overdue" yet even if grading isn't finished.
 */
export function ungradedTrainingWeeks(events: PmtEvent[], catalog: TrainingObjective[], roster: Cadet[], completions: Completion[]): UngradedWeek[] {
  const now = Date.now();
  const catalogById = new Map(catalog.map((o) => [o.id, o]));
  const occurrencesByObjective = new Map<string, PmtEvent[]>();
  for (const objective of catalog) {
    occurrencesByObjective.set(
      objective.id,
      events.filter((e) => e.objectiveIds.includes(objective.id))
    );
  }

  const weekNumbers = [...new Set(events.map((e) => e.trainingWeek).filter((tw): tw is number => tw !== undefined))];
  const result: UngradedWeek[] = [];

  for (const tw of weekNumbers) {
    const weekEvents = events.filter((e) => e.trainingWeek === tw);
    const deadline = trainingWeekFridayDeadline(weekEvents[0]!.eventDate);
    if (now <= deadline.getTime()) continue;

    const outstanding: UngradedWeek["outstanding"] = [];
    for (const event of weekEvents) {
      if (new Date(event.eventDate).getTime() > now) continue;
      for (const objectiveId of event.objectiveIds) {
        const objective = catalogById.get(objectiveId);
        if (!objective || !objective.graded) continue;
        const occurrences = occurrencesByObjective.get(objectiveId) ?? [];
        if (!isObjectiveGradedAtEvent(objective, event, occurrences, roster, completions)) {
          outstanding.push({ event, objective });
        }
      }
    }
    if (outstanding.length > 0) result.push({ trainingWeek: tw, deadline, outstanding });
  }

  return result.sort((a, b) => b.trainingWeek - a.trainingWeek);
}
