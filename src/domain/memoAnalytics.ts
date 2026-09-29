import type { AbsenceMemo, DeviationMemo, Cadet, PmtEvent } from "./types";

/** "PT, LLAB" from an absence memo's covered PMTs, or "AS100 class" for an AS-class-only memo -- used by both the dedicated Absence table's "Covers" column and the combined "All" table's "Subject" column. */
export function coversLabel(memo: AbsenceMemo, pmtEventsById: Map<string, PmtEvent>): string {
  const types = memo.pmtEventIds.map((id) => pmtEventsById.get(id)?.eventType).filter((t): t is NonNullable<typeof t> => !!t);
  if (types.length > 0) return [...new Set(types)].join(", ");
  if (memo.asClass) return `${memo.asClass} class`;
  return "—";
}

/** The date of the (first) PMT an absence memo covers, or its AS-class date -- the "Date missed" column, distinct from when it was submitted. */
export function dateMissedFor(memo: AbsenceMemo, pmtEventsById: Map<string, PmtEvent>): string {
  const firstEvent = memo.pmtEventIds.map((id) => pmtEventsById.get(id)).find((e): e is PmtEvent => !!e);
  return firstEvent?.eventDate ?? memo.classDate ?? "";
}

/** The Training Week of the (first) PMT an absence memo covers -- undefined for an AS-class-only memo. */
export function trainingWeekFor(memo: AbsenceMemo, pmtEventsById: Map<string, PmtEvent>): number | undefined {
  const firstEvent = memo.pmtEventIds.map((id) => pmtEventsById.get(id)).find((e): e is PmtEvent => !!e);
  return firstEvent?.trainingWeek;
}

/** Unified row for the "All" merged view (Section 6c) -- Absence and Deviation memos have different column shapes, so this is deliberately a reduced, generic shape just for the combined/sorted-by-recency table. */
export interface CombinedMemoRow {
  kind: "Absence" | "Deviation";
  id: string;
  cadetId: string;
  cadetName: string;
  /** "Date Missed" for an Absence row, "Date Assigned" for a Deviation row -- the primary date column, distinct from submittedAt. */
  primaryDate: string;
  submittedAt: string | undefined;
  /** "Covers" for an Absence row, "Reason" for a Deviation row -- the combined table's "Subject" column. */
  subject: string;
  status: string;
  lateSubmission: "late" | "dns" | undefined;
  pdfUrl: string | undefined;
  pdfFileName: string | undefined;
  notes: string;
}

export function combineMemos(absenceMemos: AbsenceMemo[], deviationMemos: DeviationMemo[], pmtEventsById: Map<string, PmtEvent>): CombinedMemoRow[] {
  const rows: CombinedMemoRow[] = [
    ...absenceMemos.map((m) => ({
      kind: "Absence" as const,
      id: m.id,
      cadetId: m.cadetId,
      cadetName: m.cadetName,
      primaryDate: dateMissedFor(m, pmtEventsById),
      submittedAt: m.submittedAt,
      subject: coversLabel(m, pmtEventsById),
      status: m.status,
      lateSubmission: m.lateSubmission,
      pdfUrl: m.pdfUrl,
      pdfFileName: m.pdfFileName,
      notes: m.status === "Returned" ? m.returnReason ?? "" : m.reviewNotes,
    })),
    ...deviationMemos.map((m) => ({
      kind: "Deviation" as const,
      id: m.id,
      cadetId: m.cadetId,
      cadetName: m.cadetName,
      primaryDate: m.dateAssigned,
      submittedAt: m.submittedAt,
      subject: m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason,
      status: m.status,
      lateSubmission: undefined,
      pdfUrl: m.pdfUrl,
      pdfFileName: m.pdfFileName,
      notes: m.reviewNotes,
    })),
  ];
  return rows.sort((a, b) => b.primaryDate.localeCompare(a.primaryDate));
}

/** Group/Flight/individual-cadet sub-filter, shared by every table in the Memorandums Analytics view. */
export function filterByRosterScope<T extends { cadetId: string }>(
  rows: T[],
  roster: Cadet[],
  cadetId: string,
  flight: string,
  group: string
): T[] {
  const rosterById = new Map(roster.map((p) => [p.id, p]));
  return rows.filter((row) => {
    const person = rosterById.get(row.cadetId);
    if (cadetId !== "All" && row.cadetId !== cadetId) return false;
    if (flight !== "All" && person?.flight !== flight) return false;
    if (group !== "All" && person?.group !== group) return false;
    return true;
  });
}

/** "22 Sep 26" */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS_SHORT[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}
