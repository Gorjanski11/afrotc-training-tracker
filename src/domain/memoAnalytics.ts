import type { AbsenceMemo, DeviationMemo, Cadet, PmtEvent } from "./types";

/**
 * Same 48-hour resubmit window the Returned-memo notification emails already describe (both
 * Absence and Deviation Memos) -- a pure display/escalation threshold, not stored anywhere. Shared
 * so the Memo Review Dashboard's "Overdue Returned" column and the backend's
 * `escalateStaleReturnedMemos` auto-escalation (afrotc-functions) agree on the exact same cutoff.
 */
export const RETURNED_RESUBMIT_WINDOW_MS = 48 * 3_600_000;

/** True once a Returned memo's 48-hour resubmit window has passed with nothing resubmitted. */
export function isReturnedOverdue(reviewedAt: string | undefined, now: number = Date.now()): boolean {
  if (!reviewedAt) return false;
  return now - new Date(reviewedAt).getTime() >= RETURNED_RESUBMIT_WINDOW_MS;
}

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
  lateSubmission: "late" | "dns" | "returnedDns" | undefined;
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

/**
 * Group/Flight/individual-cadet sub-filter, shared by every table in the Memorandums Analytics and
 * Deviation's Log views. A row whose cadet isn't in `roster` at all -- e.g. an Inactive cadet,
 * already stripped out of `roster` upstream -- is always dropped, regardless of the Flight/Group
 * filter state, so an Inactive cadet's old memos never resurface just because "All" is selected.
 */
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
    if (!person) return false;
    if (cadetId !== "All" && row.cadetId !== cadetId) return false;
    if (flight !== "All" && person.flight !== flight) return false;
    if (group !== "All" && person.group !== group) return false;
    return true;
  });
}

/** "9 Sep 26" -- the one date format used everywhere in this app, no zero-padded day. */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(iso: string | undefined): string {
  if (!iso) return "—";
  // A bare "YYYY-MM-DD" (no time/offset) parses via `new Date()` as UTC midnight, which renders as
  // the PREVIOUS day for anyone west of UTC (confirmed: shifted a Puerto Rico user's Oct 22 PMT back
  // to "Oct 21" on the SAE dashboard). Parse the three parts directly as LOCAL midnight instead.
  // A full ISO datetime (has a "T") is unaffected -- that path is already timezone-correct.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(iso);
  const d = dateOnly ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : new Date(iso);
  const month = MONTHS_SHORT[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${d.getDate()} ${month} ${year}`;
}

/** "9 Sep 26, 3:45 PM" -- `shortDate` plus a local time, for the handful of displays that show both. */
export function shortDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${shortDate(iso)}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** "9 Sep 26 (3:45 PM)" -- same local time as `shortDateTime`, bracketed instead of comma-separated, so it fits inside a single dense table column. Used by Memorandums Analytics' Date Assigned/Submitted columns specifically; every other screen keeps shortDateTime's comma format. */
export function shortDateTimeBracketed(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${shortDate(iso)} (${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})`;
}

/** Badge color convention for every status literal across both Absence and Deviation memos. */
export function memoStatusVariant(status: string): "success" | "destructive" | "warning" | "secondary" | "outline" {
  if (status === "Accepted") return "success";
  if (status === "Rejected" || status === "Not Submitted") return "destructive";
  if (status === "Returned" || status === "Late") return "warning";
  if (status === "Pending" || status === "Submitted" || status === "Assigned") return "secondary";
  return "outline";
}
