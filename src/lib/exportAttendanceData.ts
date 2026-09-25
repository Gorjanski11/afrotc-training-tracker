import { computeCadetAttendanceSummary, computeCombinedPercent, absencesRemainingForGoodStanding } from "../domain/attendance";
import { ATTENDANCE_STATUS_LABELS, SEMESTER_PMT_TOTALS } from "../domain/constants";
import { downloadWorkbook, todayForFilename, type ExportSheet } from "./exportWorkbook";
import type { Attendance, PmtEvent, Cadet } from "../domain/types";

function pctText(n: number | undefined): string {
  return n === undefined ? "" : `${Math.round(n * 100)}%`;
}

/** Everything Dashboard/Attendance/Analytics read from -- one workbook, one sheet per collection plus a computed per-cadet summary (standing, present/total, absences left). */
export async function exportAttendanceData(roster: Cadet[], events: PmtEvent[], attendance: Attendance[]): Promise<void> {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const rosterById = new Map(roster.map((p) => [p.id, p]));
  const activeRoster = roster.filter((p) => p.status === "Active");

  const rosterSheet: ExportSheet = {
    name: "Roster",
    columns: [
      { header: "Name", key: "name", width: 32 },
      { header: "AS Class", key: "asClass", width: 12 },
      { header: "Dev Level", key: "devLevel", width: 12 },
      { header: "Status", key: "status", width: 14 },
      { header: "Flight", key: "flight", width: 10 },
      { header: "Group", key: "group", width: 10 },
      { header: "Position", key: "position", width: 24 },
      { header: "Cadre", key: "cadre", width: 10 },
    ],
    rows: roster.map((p) => ({
      name: p.name,
      asClass: p.asClass ?? "",
      devLevel: p.devLevel ?? "",
      status: p.status ?? "",
      flight: p.flight ?? "",
      group: p.group ?? "",
      position: p.position ?? "",
      cadre: p.isCadre ? "Yes" : "No",
    })),
  };

  const attendanceSheet: ExportSheet = {
    name: "Attendance",
    columns: [
      { header: "Cadet", key: "cadet", width: 32 },
      { header: "PMT", key: "pmt", width: 28 },
      { header: "Date", key: "date", width: 14 },
      { header: "Type", key: "type", width: 10 },
      { header: "Status", key: "status", width: 20 },
      { header: "Absence Reason", key: "reason", width: 16 },
      { header: "Recorded At", key: "recordedAt", width: 20 },
      { header: "Notes", key: "notes", width: 30 },
    ],
    rows: attendance.map((a) => {
      const event = eventsById.get(a.pmtEventId);
      return {
        cadet: rosterById.get(a.cadetId)?.name ?? "",
        pmt: event?.title ?? "",
        date: event ? new Date(event.eventDate).toLocaleDateString() : "",
        type: event?.eventType ?? "",
        status: ATTENDANCE_STATUS_LABELS[a.status] ?? a.status,
        reason: a.absenceReason ?? "",
        recordedAt: a.recordedAt ? new Date(a.recordedAt).toLocaleString() : "",
        notes: a.notes,
      };
    }),
  };

  const eventsSheet: ExportSheet = {
    name: "PMT Events",
    columns: [
      { header: "Title", key: "title", width: 28 },
      { header: "Date", key: "date", width: 14 },
      { header: "Type", key: "type", width: 10 },
      { header: "Training Week", key: "trainingWeek", width: 14 },
      { header: "Location", key: "location", width: 20 },
    ],
    rows: events.map((e) => ({
      title: e.title,
      date: new Date(e.eventDate).toLocaleDateString(),
      type: e.eventType,
      trainingWeek: e.trainingWeek ?? "",
      location: e.location,
    })),
  };

  const summarySheet: ExportSheet = {
    name: "Cadet Summary",
    columns: [
      { header: "Cadet", key: "cadet", width: 32 },
      { header: "PT Present/Total", key: "ptCount", width: 16 },
      { header: "PT %", key: "ptPct", width: 10 },
      { header: "PT Standing", key: "ptStanding", width: 12 },
      { header: "PT Absences Left", key: "ptAbsencesLeft", width: 16 },
      { header: "LLAB/FM Present/Total", key: "llabCount", width: 20 },
      { header: "LLAB/FM %", key: "llabPct", width: 12 },
      { header: "LLAB/FM Standing", key: "llabStanding", width: 16 },
      { header: "LLAB/FM Absences Left", key: "llabAbsencesLeft", width: 20 },
      { header: "Combined %", key: "combinedPct", width: 12 },
    ],
    rows: activeRoster.map((p) => {
      const summary = computeCadetAttendanceSummary(p.id, attendance, eventsById);
      const combined = computeCombinedPercent(p.id, attendance, eventsById);
      const ptPresent = summary.pt.statusCounts.P + summary.pt.statusCounts.AE;
      const llabPresent = summary.llabFm.statusCounts.P + summary.llabFm.statusCounts.AE;
      return {
        cadet: p.name,
        ptCount: summary.pt.countedEvents === 0 ? "" : `${ptPresent}/${summary.pt.countedEvents}`,
        ptPct: pctText(summary.pt.percent),
        ptStanding: summary.pt.standing ?? "",
        ptAbsencesLeft: absencesRemainingForGoodStanding(summary.pt, SEMESTER_PMT_TOTALS.PT),
        llabCount: summary.llabFm.countedEvents === 0 ? "" : `${llabPresent}/${summary.llabFm.countedEvents}`,
        llabPct: pctText(summary.llabFm.percent),
        llabStanding: summary.llabFm.standing ?? "",
        llabAbsencesLeft: absencesRemainingForGoodStanding(summary.llabFm, SEMESTER_PMT_TOTALS.LLAB_FM),
        combinedPct: pctText(combined),
      };
    }),
  };

  await downloadWorkbook(`afrotc-accountability-tracker-export-${todayForFilename()}.xlsx`, [summarySheet, rosterSheet, attendanceSheet, eventsSheet]);
}
