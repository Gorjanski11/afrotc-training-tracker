import { shortDate } from "../domain/memoAnalytics";
import type { ExportSheet } from "./exportWorkbook";
import type { AbsenceMemo, DeviationMemo } from "../domain/types";

/** One sheet per memo type -- exported separately so Data Management (Section 6) can combine it with other categories into one workbook. */
export function buildMemoSheets(absenceMemos: AbsenceMemo[], deviationMemos: DeviationMemo[]): ExportSheet[] {
  const absenceSheet: ExportSheet = {
    name: "Absence Memos",
    columns: [
      { header: "Submitted", key: "submitted", width: 14 },
      { header: "Cadet", key: "cadet", width: 32 },
      { header: "Covers", key: "covers", width: 20 },
      { header: "Reason", key: "reason", width: 16 },
      { header: "Status", key: "status", width: 16 },
      { header: "Late", key: "late", width: 10 },
      { header: "Reviewed By", key: "reviewedBy", width: 20 },
      { header: "Notes", key: "notes", width: 32 },
    ],
    rows: absenceMemos.map((m) => ({
      submitted: shortDate(m.submittedAt),
      cadet: m.cadetName,
      covers: m.pmtEventIds.length > 0 ? `${m.pmtEventIds.length} PMT(s)` : m.asClass ? `${m.asClass} class` : "",
      reason: m.reason,
      status: m.status,
      late: m.lateSubmission === "dns" ? "DNS" : m.lateSubmission === "late" ? "Late" : "",
      reviewedBy: m.reviewedBy ?? "",
      notes: m.status === "Returned" ? (m.returnReason ?? "") : m.reviewNotes,
    })),
  };

  const deviationSheet: ExportSheet = {
    name: "Deviation Memos",
    columns: [
      { header: "Assigned", key: "assigned", width: 14 },
      { header: "Cadet", key: "cadet", width: 32 },
      { header: "Reason", key: "reason", width: 24 },
      { header: "Given By", key: "givenBy", width: 20 },
      { header: "Status", key: "status", width: 16 },
      { header: "Reviewed By", key: "reviewedBy", width: 20 },
      { header: "Notes", key: "notes", width: 32 },
    ],
    rows: deviationMemos.map((m) => ({
      assigned: shortDate(m.dateAssigned),
      cadet: m.cadetName,
      reason: m.reason,
      givenBy: m.assignedBy,
      status: m.status,
      reviewedBy: m.reviewedBy ?? "",
      notes: m.reviewNotes,
    })),
  };

  return [absenceSheet, deviationSheet];
}
