import type { AbsenceMemo, DeviationMemo, Cadet } from "./types";

/** Unified row for the "All" merged view (Section 6c) -- Absence and Deviation memos have different column shapes, so this is deliberately a reduced, generic shape just for the combined/sorted-by-recency table. */
export interface CombinedMemoRow {
  kind: "Absence" | "Deviation";
  id: string;
  cadetId: string;
  cadetName: string;
  date: string;
  reason: string;
  status: string;
  lateSubmission: "late" | "dns" | undefined;
  pdfUrl: string | undefined;
  pdfFileName: string | undefined;
  notes: string;
}

export function combineMemos(absenceMemos: AbsenceMemo[], deviationMemos: DeviationMemo[]): CombinedMemoRow[] {
  const rows: CombinedMemoRow[] = [
    ...absenceMemos.map((m) => ({
      kind: "Absence" as const,
      id: m.id,
      cadetId: m.cadetId,
      cadetName: m.cadetName,
      date: m.submittedAt,
      reason: m.reason,
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
      date: m.submittedAt ?? m.dateAssigned,
      reason: m.reason,
      status: m.status,
      lateSubmission: undefined,
      pdfUrl: m.pdfUrl,
      pdfFileName: m.pdfFileName,
      notes: m.reviewNotes,
    })),
  ];
  return rows.sort((a, b) => b.date.localeCompare(a.date));
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
