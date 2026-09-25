import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, ExternalLink } from "lucide-react";
import { FLIGHTS, GROUPS, type Flight, type Group } from "../../domain/constants";
import { combineMemos, filterByRosterScope, shortDate, type CombinedMemoRow } from "../../domain/memoAnalytics";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import type { AbsenceMemo, DeviationMemo, Cadet } from "../../domain/types";

interface Props {
  roster: Cadet[];
  absenceMemos: AbsenceMemo[];
  deviationMemos: DeviationMemo[];
  /** Absence Memos are only ever included when the signed-in person has full access (Section 6). */
  showAbsence: boolean;
}

type ViewMode = "all" | "absence" | "deviation";

function statusVariant(status: string): "success" | "destructive" | "warning" | "secondary" | "outline" {
  if (status === "Accepted") return "success";
  if (status === "Rejected" || status === "Not Submitted") return "destructive";
  if (status === "Returned" || status === "Late") return "warning";
  if (status === "Pending" || status === "Submitted") return "secondary";
  return "outline";
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

export function MemorandumsAnalyticsView({ roster, absenceMemos, deviationMemos, showAbsence }: Props) {
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

      <Card>
        <CardContent className="pt-6">
          {mode === "all" ? (
            <CombinedTable rows={combined} />
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

function CombinedTable({ rows }: { rows: CombinedMemoRow[] }) {
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
                <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                {row.lateSubmission && (
                  <Badge variant="destructive" className="text-[10px]">
                    Late
                  </Badge>
                )}
              </span>
            </TableCell>
            <TableCell>
              <PdfLink url={row.pdfUrl} name={row.pdfFileName} />
            </TableCell>
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
                {m.lateSubmission && (
                  <Badge variant="destructive" className="text-[10px]">
                    Late
                  </Badge>
                )}
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
