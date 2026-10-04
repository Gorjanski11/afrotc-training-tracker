import { meetsRequirement } from "./progress";
import { deriveClass, GROUPS, FLIGHTS, PROFICIENCY_CODES, type ProficiencyCode, type Group, type Flight } from "./constants";
import { GROUP_COMMANDER_EMAIL, FLIGHT_COMMANDER_EMAIL } from "./access";
import type { Attendance, Cadet, Completion, PmtEvent, TrainingObjective } from "./types";

/** "late" = past its deadline but still within the 2-hour grace window (SOP: 2000 deadline, late until 2200). "missing" = past that window, still incomplete. */
export type DeadlineStatus = "late" | "missing";

const LATE_WINDOW_MS = 2 * 3_600_000;

function statusForDeadline(deadlineMs: number, now: number): DeadlineStatus | undefined {
  if (now < deadlineMs) return undefined;
  return now < deadlineMs + LATE_WINDOW_MS ? "late" : "missing";
}

function activeNonCadre(roster: Cadet[]): Cadet[] {
  return roster.filter((c) => !c.isCadre && c.status === "Active");
}

// ---------------------------------------------------------------------------
// Accountability (SOP Section 3) -- POC Group Commanders and GMC Flight
// Commanders are each responsible for their own unit's cadets being recorded
// for every PMT, by 2000 the same day.
// ---------------------------------------------------------------------------

export interface AccountabilityFlag {
  event: PmtEvent;
  unitKind: "group" | "flight";
  unitValue: Group | Flight;
  responsibleEmail: string;
  status: DeadlineStatus;
  missing: number;
  total: number;
}

function accountabilityDeadlineMs(event: PmtEvent): number {
  const d = new Date(event.eventDate);
  d.setHours(20, 0, 0, 0);
  return d.getTime();
}

/** Every Group/Flight still missing at least one cadet's attendance for a PMT already past its 2000 deadline. */
export function accountabilityFlags(events: PmtEvent[], roster: Cadet[], attendance: Attendance[], now = Date.now()): AccountabilityFlag[] {
  const flags: AccountabilityFlag[] = [];
  const active = activeNonCadre(roster);

  for (const event of events) {
    const status = statusForDeadline(accountabilityDeadlineMs(event), now);
    if (!status) continue;
    const recorded = new Set(attendance.filter((a) => a.pmtEventId === event.id).map((a) => a.cadetId));

    for (const group of GROUPS) {
      if (group === "CWL") continue; // not an accountability-reporting unit
      const unitCadets = active.filter((c) => c.group === group && deriveClass(c.asClass, c.isCadre) === "POC");
      if (unitCadets.length === 0) continue;
      const missing = unitCadets.filter((c) => !recorded.has(c.id)).length;
      if (missing > 0) flags.push({ event, unitKind: "group", unitValue: group, responsibleEmail: GROUP_COMMANDER_EMAIL[group], status, missing, total: unitCadets.length });
    }
    for (const flight of FLIGHTS) {
      const unitCadets = active.filter((c) => c.flight === flight && deriveClass(c.asClass, c.isCadre) === "GMC");
      if (unitCadets.length === 0) continue;
      const missing = unitCadets.filter((c) => !recorded.has(c.id)).length;
      if (missing > 0) flags.push({ event, unitKind: "flight", unitValue: flight, responsibleEmail: FLIGHT_COMMANDER_EMAIL[flight], status, missing, total: unitCadets.length });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Training Objectives (SOP Section 4) -- GMC Flight Commanders are each
// responsible for grading their own flight's cadets; Cortes Garay (SAE) is
// responsible for POC, which has no per-unit split. Deadline is Friday 2000
// of that Training Week.
// ---------------------------------------------------------------------------

const SAE_EMAIL = "jorge.cortes4@upr.edu";

/** Friday 2000 of the Monday-Sunday calendar week containing this date -- works from any event date in that week, since PT can land on other days than LLAB/FM/D&C. */
export function trainingWeekFridayDeadline(anyEventDateInWeek: string): Date {
  const d = new Date(anyEventDateInWeek);
  const daysSinceMonday = (d.getDay() + 6) % 7;
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

/** Same "any of Complete/Partial complete/Incompleted counts as handled" rule Quick Log's column-hiding uses, evaluated for one event against a given roster slice instead of the whole grid. */
function isObjectiveGradedFor(objective: TrainingObjective, event: PmtEvent, occurrences: PmtEvent[], roster: Cadet[], completions: Completion[]): boolean {
  const isMulti = occurrences.length > 1;
  const relevant = roster.filter((c) => c.devLevel && objective.proficiencyByLevel[c.devLevel] !== "");
  if (relevant.length === 0) return true;
  return relevant.every((cadet) => {
    const required = firstRequiredCode(objective.proficiencyByLevel[cadet.devLevel!]);
    if (!required) return true;
    const cadetCompletions = completions.filter((c) => c.cadetId === cadet.id && c.objectiveId === objective.id);
    if (isMulti) {
      if (cadetCompletions.some((c) => meetsRequirement(c, required))) return true;
      return cadetCompletions.some((c) => c.pmtEventId === event.id);
    }
    return cadetCompletions.length > 0;
  });
}

export interface ToFlag {
  trainingWeek: number;
  deadline: Date;
  event: PmtEvent;
  objective: TrainingObjective;
  cohort: "POC" | "GMC";
  unitValue?: Flight;
  responsibleEmail: string;
  status: DeadlineStatus;
}

/** Every (Training Week, PMT, objective, unit) still not fully graded, for every week whose own Friday-2000 deadline has passed. */
export function toFlags(events: PmtEvent[], catalog: TrainingObjective[], roster: Cadet[], completions: Completion[], now = Date.now()): ToFlag[] {
  const active = activeNonCadre(roster);
  const catalogById = new Map(catalog.map((o) => [o.id, o]));
  const occurrencesByObjective = new Map<string, PmtEvent[]>();
  for (const objective of catalog) occurrencesByObjective.set(objective.id, events.filter((e) => e.objectiveIds.includes(objective.id)));

  const pocRoster = active.filter((c) => deriveClass(c.asClass, c.isCadre) === "POC");
  const gmcByFlight = new Map(FLIGHTS.map((f) => [f, active.filter((c) => c.flight === f && deriveClass(c.asClass, c.isCadre) === "GMC")]));

  const weekNumbers = [...new Set(events.map((e) => e.trainingWeek).filter((tw): tw is number => tw !== undefined))];
  const flags: ToFlag[] = [];

  for (const tw of weekNumbers) {
    const weekEvents = events.filter((e) => e.trainingWeek === tw);
    const deadline = trainingWeekFridayDeadline(weekEvents[0]!.eventDate);
    const status = statusForDeadline(deadline.getTime(), now);
    if (!status) continue;

    for (const event of weekEvents) {
      if (new Date(event.eventDate).getTime() > now) continue;
      for (const objectiveId of event.objectiveIds) {
        const objective = catalogById.get(objectiveId);
        if (!objective || !objective.graded) continue;
        const occurrences = occurrencesByObjective.get(objectiveId) ?? [];

        if (pocRoster.some((c) => c.devLevel && objective.proficiencyByLevel[c.devLevel] !== "")) {
          if (!isObjectiveGradedFor(objective, event, occurrences, pocRoster, completions)) {
            flags.push({ trainingWeek: tw, deadline, event, objective, cohort: "POC", responsibleEmail: SAE_EMAIL, status });
          }
        }
        for (const flight of FLIGHTS) {
          const flightRoster = gmcByFlight.get(flight) ?? [];
          if (flightRoster.length === 0 || !flightRoster.some((c) => c.devLevel && objective.proficiencyByLevel[c.devLevel] !== "")) continue;
          if (!isObjectiveGradedFor(objective, event, occurrences, flightRoster, completions)) {
            flags.push({ trainingWeek: tw, deadline, event, objective, cohort: "GMC", unitValue: flight, responsibleEmail: FLIGHT_COMMANDER_EMAIL[flight], status });
          }
        }
      }
    }
  }
  return flags;
}
