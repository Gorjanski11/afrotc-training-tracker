import { computeCadetProgress } from "../domain/progress";
import { DEV_LEVELS } from "../domain/constants";
import { downloadWorkbook, todayForFilename, type ExportSheet } from "./exportWorkbook";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../domain/types";

/** One sheet per collection plus a computed progress summary -- exported separately from `exportTrainingData` so Data Management (Section 6) can combine it with other categories into one workbook. */
export function buildTrainingSheets(cadets: Cadet[], catalog: TrainingObjective[], completions: Completion[], pmtEvents: PmtEvent[]): ExportSheet[] {
  const objectivesById = new Map(catalog.map((o) => [o.id, o]));
  const eventsById = new Map(pmtEvents.map((e) => [e.id, e]));

  const cadetsSheet: ExportSheet = {
    name: "Cadets",
    columns: [
      { header: "Name", key: "name", width: 32 },
      { header: "AS Class", key: "asClass", width: 12 },
      { header: "Dev Level", key: "devLevel", width: 12 },
      { header: "Status", key: "status", width: 14 },
      { header: "Flight", key: "flight", width: 10 },
      { header: "Group", key: "group", width: 10 },
      { header: "Email", key: "email", width: 28 },
    ],
    rows: cadets.map((c) => ({
      name: c.name,
      asClass: c.asClass ?? "",
      devLevel: c.devLevel ?? "",
      status: c.status ?? "",
      flight: c.flight ?? "",
      group: c.group ?? "",
      email: c.email ?? "",
    })),
  };

  const objectivesSheet: ExportSheet = {
    name: "Training Objectives",
    columns: [
      { header: "Number", key: "number", width: 10 },
      { header: "Title", key: "title", width: 40 },
      { header: "PLO", key: "plo", width: 24 },
      { header: "Sub-area", key: "subArea", width: 28 },
      { header: "Graded", key: "graded", width: 10 },
      ...DEV_LEVELS.map((l) => ({ header: `${l} Required`, key: l, width: 14 })),
    ],
    rows: catalog.map((o) => ({
      number: o.number,
      title: o.title,
      plo: o.plo,
      subArea: o.subArea,
      graded: o.graded ? "Yes" : "No (reference only)",
      ...Object.fromEntries(DEV_LEVELS.map((l) => [l, o.proficiencyByLevel[l] || "N/A"])),
    })),
  };

  const completionsSheet: ExportSheet = {
    name: "Completions",
    columns: [
      { header: "Cadet", key: "cadet", width: 32 },
      { header: "Objective #", key: "objectiveNumber", width: 12 },
      { header: "Objective Title", key: "objectiveTitle", width: 36 },
      { header: "Proficiency Achieved", key: "proficiency", width: 16 },
      { header: "Partial", key: "partial", width: 10 },
      { header: "Date Completed", key: "dateCompleted", width: 16 },
      { header: "Evaluator", key: "evaluator", width: 24 },
      { header: "PMT Occurrence", key: "pmt", width: 30 },
      { header: "Notes", key: "notes", width: 30 },
    ],
    rows: completions.map((c) => {
      const objective = objectivesById.get(c.objectiveId);
      const event = c.pmtEventId ? eventsById.get(c.pmtEventId) : undefined;
      return {
        cadet: c.cadetName,
        objectiveNumber: c.objectiveNumber,
        objectiveTitle: objective?.title ?? "",
        proficiency: c.proficiencyAchieved,
        partial: c.partial ? "Yes" : "No",
        dateCompleted: c.dateCompleted ?? "",
        evaluator: c.evaluator,
        pmt: event ? `${event.eventType} — ${event.title} (${new Date(event.eventDate).toLocaleDateString()})` : "",
        notes: c.notes,
      };
    }),
  };

  const pmtEventsSheet: ExportSheet = {
    name: "PMT Events",
    columns: [
      { header: "Title", key: "title", width: 28 },
      { header: "Date", key: "date", width: 14 },
      { header: "Type", key: "type", width: 10 },
      { header: "Training Week", key: "trainingWeek", width: 14 },
      { header: "Objectives Covered", key: "objectives", width: 40 },
    ],
    rows: pmtEvents.map((e) => ({
      title: e.title,
      date: new Date(e.eventDate).toLocaleDateString(),
      type: e.eventType,
      trainingWeek: e.trainingWeek ?? "",
      objectives: e.objectiveIds.map((id) => objectivesById.get(id)?.number).filter(Boolean).join(", "),
    })),
  };

  const completionsByCadet = new Map<string, Completion[]>();
  for (const c of completions) {
    const list = completionsByCadet.get(c.cadetId) ?? [];
    list.push(c);
    completionsByCadet.set(c.cadetId, list);
  }

  const progressSheet: ExportSheet = {
    name: "Progress Summary",
    columns: [
      { header: "Cadet", key: "cadet", width: 32 },
      { header: "Dev Level", key: "devLevel", width: 12 },
      { header: "Required", key: "required", width: 10 },
      { header: "Completed", key: "completed", width: 10 },
      { header: "Missed", key: "missed", width: 10 },
      { header: "Percent", key: "percent", width: 10 },
    ],
    rows: cadets.map((c) => {
      const progress = computeCadetProgress(c.devLevel, catalog, completionsByCadet.get(c.id) ?? [], pmtEvents);
      return {
        cadet: c.name,
        devLevel: c.devLevel ?? "",
        required: progress.requiredCount,
        completed: progress.completedCount,
        missed: progress.missedCount,
        percent: `${progress.percent}%`,
      };
    }),
  };

  return [progressSheet, cadetsSheet, objectivesSheet, completionsSheet, pmtEventsSheet];
}

/** Everything on screen for the current cohort (Dashboard/Analytics/Roster/Quick Log all read from these same four lists) -- one workbook, one sheet per collection plus a computed progress summary. */
export async function exportTrainingData(cadets: Cadet[], catalog: TrainingObjective[], completions: Completion[], pmtEvents: PmtEvent[]): Promise<void> {
  await downloadWorkbook(`afrotc-training-tracker-export-${todayForFilename()}.xlsx`, buildTrainingSheets(cadets, catalog, completions, pmtEvents));
}
