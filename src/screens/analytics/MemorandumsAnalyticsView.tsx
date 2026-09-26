import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, ExternalLink } from "lucide-react";
import { FLIGHTS, GROUPS, SEMESTER_PMT_TOTALS, type Flight, type Group } from "../../domain/constants";
import { computeCadetAttendanceSummary } from "../../domain/attendance";
import { combineMemos, filterByRosterScope, shortDate, type CombinedMemoRow } from "../../domain/memoAnalytics";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { CadetBucketStats } from "./AccountabilityAnalyticsView";
import type { AbsenceMemoInput } from "../../hooks/useAbsenceMemos";
import type { DeviationMemoInput } from "../../hooks/useDeviationMemos";
import type { AbsenceMemoStatus, DeviationMemoStatus } from "../../domain/constants";
import type { AbsenceMemo, Attendance, DeviationMemo, Cadet, PmtEvent } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  absenceMemos: AbsenceMemo[];
  deviationMemos: DeviationMemo[];
  /** Absence Memos are only ever included when the signed-in person has full access (Section 6). */
  showAbsence: boolean;
  updateAbsenceMemo: (id: string, input: Partial<AbsenceMemoInput>) => Promise<void>;
  updateDeviationMemo: (id: string, input: Partial<DeviationMemoInput>) => Promise<void>;
}

type ViewMode = "all" | "absence" | "deviation";

const ABSENCE_STATUS_OPTIONS: AbsenceMemoStatus[] = ["Assigned", "Pending", "Accepted", "Rejected", "Returned"];
const DEVIATION_STATUS_OPTIONS: DeviationMemoStatus[] = ["Assigned", "Submitted", "Late", "Accepted", "Returned", "Not Submitted"];

function statusVariant(status: string): "success" | "destructive" | "warning" | "secondary" | "outline" {
  if (status === "Accepted") return "success";
  if (status === "Rejected" || status === "Not Submitted") return "destructive";
  if (status === "Returned" || status === "Late") return "warning";
  if (status === "Pending" || status === "Submitted") return "secondary";
  return "outline";
}

function LateBadge({ lateSubmission }: { lateSubmission: "late" | "dns" | undefined }) {
  if (!lateSubmission) return null;
  return (
    <Badge variant="destructive" className="text-[10px]">
      {lateSubmission === "dns" ? "DNS" : "Late"}
    </Badge>
  );
}

function PdfLink({ url, name }: { url: string | undefined; name: string | undefined }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
      <ExternalLink className="h-3 w-3" />
      {name ?? "PDF"}
    </a>
  );
}

export function MemorandumsAnalyticsView({ roster, events, attendance, absenceMemos, deviationMemos, showAbsence, updateAbsenceMemo, updateDeviationMemo }: Props) {
  const [mode, setMode] = useState<ViewMode>("all");
  const [cadetId, setCadetId] = useState<string>(ALL_CADETS);
  const [flight, setFlight] = useState<Flight | "All">("All");
  const [group, setGroup] = useState<Group | "All">("All");

  const setExclusiveFilter = (which: "cadet" | "flight" | "group", value: string) => {
    setCadetId(which === "cadet" ? value : ALL_CADETS);
    setFlight(which === "flight" ? (value as Flight | "All") : "All");
    setGroup(which === "group" ? (value as Group | "All") : "All");
  };

  const visibleAbsenceMemos = useMemo(() => (showAbsence ? absenceMemos : []), [showAbsence, absenceMemos]);

  const combined = useMemo(
    () =>
      filterByRosterScope(combineMemos(visibleAbsenceMemos, deviationMemos), roster, cadetId === ALL_CADETS ? "All" : cadetId, flight, group),
    [visibleAbsenceMemos, deviationMemos, roster, cadetId, flight, group]
  );
  const filteredAbsence = useMemo(
    () => filterByRosterScope(visibleAbsenceMemos, roster, cadetId === ALL_CADETS ? "All" : cadetId, flight, group).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [visibleAbsenceMemos, roster, cadetId, flight, group]
  );
  const filteredDeviation = useMemo(
    () =>
      filterByRosterScope(deviationMemos, roster, cadetId === ALL_CADETS ? "All" : cadetId, flight, group).sort((a, b) =>
        (b.submittedAt ?? b.dateAssigned).localeCompare(a.submittedAt ?? a.dateAssigned)
      ),
    [deviationMemos, roster, cadetId, flight, group]
  );

  // Section 16: an individual cadet's own PT/LLAB-FM-D&C standing, shown right below the filters --
  // hidden entirely (not just a message) whenever a Group/Flight filter is active instead.
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const selectedCadetSummary = useMemo(
    () => (cadetId === ALL_CADETS ? undefined : computeCadetAttendanceSummary(cadetId, attendance, pmtEventsById)),
    [cadetId, attendance, pmtEventsById]
  );

  const handleStatusChange = async (row: CombinedMemoRow, status: string) => {
    if (row.kind === "Absence") await updateAbsenceMemo(row.id, { status: status as AbsenceMemoStatus, reviewedAt: new Date().toISOString() });
    else await updateDeviationMemo(row.id, { status: status as DeviationMemoStatus, reviewedAt: new Date().toISOString() });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <FileText className="h-5 w-5 text-primary" />
          Memorandums Analytics
        </h2>
        <Tabs value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {showAbsence && <TabsTrigger value="absence">Absence</TabsTrigger>}
            <TabsTrigger value="deviation">Deviation</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3">
        <CadetFilterCombobox roster={roster} value={cadetId} onChange={(v) => setExclusiveFilter("cadet", v)} allLabel="All cadets" className="w-56" />
        <Select value={flight} onValueChange={(v) => setExclusiveFilter("flight", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Flight" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All flights</SelectItem>
            {FLIGHTS.map((f) => (
              <SelectItem key={f} value={f}>
                {f} Flight
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={group} onValueChange={(v) => setExclusiveFilter("group", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All groups</SelectItem>
            {GROUPS.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedCadetSummary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <CadetBucketStats label="PT" tally={selectedCadetSummary.pt} fixedTotal={SEMESTER_PMT_TOTALS.PT} />
          <CadetBucketStats label="LLAB/FM/D&C" tally={selectedCadetSummary.llabFm} fixedTotal={SEMESTER_PMT_TOTALS.LLAB_FM} />
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {mode === "all" ? (
            <CombinedTable rows={combined} onStatusChange={handleStatusChange} />
          ) : mode === "absence" ? (
            <AbsenceTable memos={filteredAbsence} />
          ) : (
            <DeviationTable memos={filteredDeviation} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CombinedTable({ rows, onStatusChange }: { rows: CombinedMemoRow[]; onStatusChange: (row: CombinedMemoRow, status: string) => void }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No memorandums match this filter.</p>;
  return (
    <Table aria-label="All memorandums">
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Cadet</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PDF</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.kind}-${row.id}`}>
            <TableCell>{shortDate(row.date)}</TableCell>
            <TableCell>{row.cadetName}</TableCell>
            <TableCell>
              <Badge variant="outline">{row.kind}</Badge>
            </TableCell>
            <TableCell className="max-w-xs truncate">{row.reason}</TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <Select value={row.status} onValueChange={(v) => onStatusChange(row, v)}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(row.kind === "Absence" ? ABSENCE_STATUS_OPTIONS : DEVIATION_STATUS_OPTIONS).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <LateBadge lateSubmission={row.lateSubmission} />
              </span>
            </TableCell>
            <TableCell>
              <PdfLink url={row.pdfUrl} name={row.pdfFileName} />
            </TableCell>
            <TableCell className="max-w-xs truncate">{row.notes}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AbsenceTable({ memos }: { memos: AbsenceMemo[] }) {
  if (memos.length === 0) return <p className="text-sm text-muted-foreground">No absence memorandums match this filter.</p>;
  return (
    <Table aria-label="Absence memorandums">
      <TableHeader>
        <TableRow>
          <TableHead>Submitted</TableHead>
          <TableHead>Cadet</TableHead>
          <TableHead>Covers</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PDF</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {memos.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{shortDate(m.submittedAt)}</TableCell>
            <TableCell>{m.cadetName}</TableCell>
            <TableCell className="max-w-xs truncate">{m.pmtEventIds.length > 0 ? `${m.pmtEventIds.length} PMT(s)` : m.asClass ? `${m.asClass} class` : "—"}</TableCell>
            <TableCell className="max-w-xs truncate">{m.reason}</TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                <LateBadge lateSubmission={m.lateSubmission} />
              </span>
            </TableCell>
            <TableCell>
              <PdfLink url={m.pdfUrl} name={m.pdfFileName} />
            </TableCell>
            <TableCell className="max-w-xs truncate">{m.status === "Returned" ? m.returnReason : m.reviewNotes}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DeviationTable({ memos }: { memos: DeviationMemo[] }) {
  if (memos.length === 0) return <p className="text-sm text-muted-foreground">No deviation memorandums match this filter.</p>;
  return (
    <Table aria-label="Deviation memorandums">
      <TableHeader>
        <TableRow>
          <TableHead>Assigned</TableHead>
          <TableHead>Cadet</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Given by</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PDF</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {memos.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{shortDate(m.dateAssigned)}</TableCell>
            <TableCell>{m.cadetName}</TableCell>
            <TableCell className="max-w-xs truncate">{m.reason}</TableCell>
            <TableCell>{m.assignedBy}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
            </TableCell>
            <TableCell>
              <PdfLink url={m.pdfUrl} name={m.pdfFileName} />
            </TableCell>
            <TableCell className="max-w-xs truncate">{m.reviewNotes}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
