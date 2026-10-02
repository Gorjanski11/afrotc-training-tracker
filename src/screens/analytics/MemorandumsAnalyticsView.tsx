import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, FileDown, ArrowUpDown, Pencil } from "lucide-react";
import { FLIGHTS, GROUPS, SEMESTER_PMT_TOTALS, type Flight, type Group } from "../../domain/constants";
import { computeCadetAttendanceSummary } from "../../domain/attendance";
import { combineMemos, coversLabel, dateMissedFor, filterByRosterScope, shortDate, trainingWeekFor, type CombinedMemoRow } from "../../domain/memoAnalytics";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { CadetBucketStats } from "./AccountabilityAnalyticsView";
import type { AbsenceMemoInput } from "../../hooks/useAbsenceMemos";
import type { DeviationMemoInput } from "../../hooks/useDeviationMemos";
import type { AbsenceMemoStatus, DeviationMemoStatus } from "../../domain/constants";
import type { UnitScope } from "../../domain/access";
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
  /** Flips PE attendance to AE/A when an edited Absence memo's status lands on Accepted/Rejected -- same side effect Memo Review's own edit already applies. */
  applyMemoDecision: (cadetId: string, pmtEventIds: string[], newStatus: "AE" | "A") => Promise<number>;
  /** A Flight/Group Commander only gets the Cadet filter -- Flight/Group selects hide entirely (Section A3). Defaults to unscoped for callers that don't pass it. */
  unitScope?: UnitScope;
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

/** Icon-only button (Section: Memorandums Analytics table redesign) -- no filename/link text shown, to keep these dense tables narrow. */
function PdfButton({ url, name }: { url: string | undefined; name: string | undefined }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={name ?? "PDF"}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input text-primary hover:bg-accent"
    >
      <FileDown className="h-3.5 w-3.5" />
    </a>
  );
}

/** "C/Rank Last, First" via the roster lookup (Section: Memorandums Analytics table redesign) -- falls back to the memo's own stored cadetName if the cadet's roster record is gone. */
function cadetDisplayName(cadetId: string, cadetName: string, roster: Cadet[]): string {
  const person = roster.find((p) => p.id === cadetId);
  return person ? formatCadetName(person) : cadetName;
}

/** What the shared Edit dialog needs, normalized across Absence/Deviation's different field shapes -- `pmtEventIds`/`returnReason` only ever populated for an Absence target. */
interface EditTarget {
  kind: "Absence" | "Deviation";
  id: string;
  cadetId: string;
  cadetName: string;
  status: AbsenceMemoStatus | DeviationMemoStatus;
  reviewNotes: string;
  pmtEventIds: string[];
  returnReason: string | undefined;
}

export function MemorandumsAnalyticsView({ roster, events, attendance, absenceMemos, deviationMemos, showAbsence, updateAbsenceMemo, updateDeviationMemo, applyMemoDecision, unitScope }: Props) {
  // "gmc"/"group-and-gmc" scopes (Montalvo, Santiago) span multiple flights -- Flight stays
  // meaningful for them, same fix as Accountability/TO Analytics. Group always hides once scoped.
  const hideGroupFilter = unitScope !== undefined && unitScope.kind !== "all";
  const hideFlightFilter = unitScope !== undefined && (unitScope.kind === "flight" || unitScope.kind === "group");
  const [mode, setMode] = useState<ViewMode>("all");
  const [cadetId, setCadetId] = useState<string>(ALL_CADETS);
  const [flight, setFlight] = useState<Flight | "All">("All");
  const [group, setGroup] = useState<Group | "All">("All");
  const [sortBy, setSortBy] = useState<"date" | "cadet">("date");

  const setExclusiveFilter = (which: "cadet" | "flight" | "group", value: string) => {
    setCadetId(which === "cadet" ? value : ALL_CADETS);
    setFlight(which === "flight" ? (value as Flight | "All") : "All");
    setGroup(which === "group" ? (value as Group | "All") : "All");
  };

  const visibleAbsenceMemos = useMemo(() => (showAbsence ? absenceMemos : []), [showAbsence, absenceMemos]);

  // Section 16: an individual cadet's own PT/LLAB-FM-D&C standing, shown right below the filters --
  // hidden entirely (not just a message) whenever a Group/Flight filter is active instead.
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const combined = useMemo(() => {
    const rows = filterByRosterScope(
      combineMemos(visibleAbsenceMemos, deviationMemos, pmtEventsById),
      roster,
      cadetId === ALL_CADETS ? "All" : cadetId,
      flight,
      group
    );
    return sortBy === "cadet" ? rows.sort((a, b) => compareByLastName(a.cadetName, b.cadetName)) : rows.sort((a, b) => b.primaryDate.localeCompare(a.primaryDate));
  }, [visibleAbsenceMemos, deviationMemos, pmtEventsById, roster, cadetId, flight, group, sortBy]);
  const filteredAbsence = useMemo(() => {
    const rows = filterByRosterScope(visibleAbsenceMemos, roster, cadetId === ALL_CADETS ? "All" : cadetId, flight, group);
    return sortBy === "cadet"
      ? rows.sort((a, b) => compareByLastName(a.cadetName, b.cadetName))
      : rows.sort((a, b) => dateMissedFor(b, pmtEventsById).localeCompare(dateMissedFor(a, pmtEventsById)));
  }, [visibleAbsenceMemos, roster, cadetId, flight, group, sortBy, pmtEventsById]);
  const filteredDeviation = useMemo(() => {
    const rows = filterByRosterScope(deviationMemos, roster, cadetId === ALL_CADETS ? "All" : cadetId, flight, group);
    return sortBy === "cadet" ? rows.sort((a, b) => compareByLastName(a.cadetName, b.cadetName)) : rows.sort((a, b) => b.dateAssigned.localeCompare(a.dateAssigned));
  }, [deviationMemos, roster, cadetId, flight, group, sortBy]);
  const selectedCadetSummary = useMemo(
    () => (cadetId === ALL_CADETS ? undefined : computeCadetAttendanceSummary(cadetId, attendance, pmtEventsById)),
    [cadetId, attendance, pmtEventsById]
  );

  const absenceById = useMemo(() => new Map(visibleAbsenceMemos.map((m) => [m.id, m])), [visibleAbsenceMemos]);
  const deviationById = useMemo(() => new Map(deviationMemos.map((m) => [m.id, m])), [deviationMemos]);

  const [editing, setEditing] = useState<EditTarget | undefined>();
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editReturnReason, setEditReturnReason] = useState("");
  const [saving, setSaving] = useState(false);

  const openEdit = (target: EditTarget) => {
    setEditing(target);
    setEditStatus(target.status);
    setEditNotes(target.reviewNotes);
    setEditReturnReason(target.returnReason ?? "");
  };
  const openEditAbsence = (m: AbsenceMemo) =>
    openEdit({ kind: "Absence", id: m.id, cadetId: m.cadetId, cadetName: m.cadetName, status: m.status, reviewNotes: m.reviewNotes, pmtEventIds: m.pmtEventIds, returnReason: m.returnReason });
  const openEditDeviation = (m: DeviationMemo) =>
    openEdit({ kind: "Deviation", id: m.id, cadetId: m.cadetId, cadetName: m.cadetName, status: m.status, reviewNotes: m.reviewNotes, pmtEventIds: [], returnReason: undefined });
  const openEditRow = (row: CombinedMemoRow) => {
    if (row.kind === "Absence") {
      const m = absenceById.get(row.id);
      if (m) openEditAbsence(m);
    } else {
      const m = deviationById.get(row.id);
      if (m) openEditDeviation(m);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editing.kind === "Absence") {
        if ((editStatus === "Accepted" || editStatus === "Rejected") && editing.pmtEventIds.length > 0) {
          await applyMemoDecision(editing.cadetId, editing.pmtEventIds, editStatus === "Accepted" ? "AE" : "A");
        }
        await updateAbsenceMemo(editing.id, {
          status: editStatus as AbsenceMemoStatus,
          reviewedAt: now,
          reviewNotes: editNotes,
          // The cadet's portal and the automatic "returned" email both read `returnReason`
          // specifically (Section: onAbsenceMemoReturned) -- Notes alone never reaches the cadet.
          returnReason: editStatus === "Returned" ? editReturnReason : undefined,
        });
      } else {
        await updateDeviationMemo(editing.id, { status: editStatus as DeviationMemoStatus, reviewedAt: now, reviewNotes: editNotes });
      }
      setEditing(undefined);
    } finally {
      setSaving(false);
    }
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
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "cadet")}>
          <SelectTrigger className="w-40">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Sort by date</SelectItem>
            <SelectItem value="cadet">Sort by cadet</SelectItem>
          </SelectContent>
        </Select>
        {!hideFlightFilter && (
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
        )}
        {!hideGroupFilter && (
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
        )}
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
            <CombinedTable rows={combined} roster={roster} onEdit={openEditRow} />
          ) : mode === "absence" ? (
            <AbsenceTable memos={filteredAbsence} roster={roster} pmtEventsById={pmtEventsById} onEdit={openEditAbsence} />
          ) : (
            <DeviationTable memos={filteredDeviation} roster={roster} onEdit={openEditDeviation} />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(undefined)}>
        <DialogContent className="max-w-md">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Edit memorandum — {editing.cadetName}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(editing.kind === "Absence" ? ABSENCE_STATUS_OPTIONS : DEVIATION_STATUS_OPTIONS).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Notes</Label>
                  <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional -- why this was changed" />
                </div>
                {editing.kind === "Absence" && editStatus === "Returned" && (
                  <div className="grid gap-1.5">
                    <Label>Return reason</Label>
                    <Textarea value={editReturnReason} onChange={(e) => setEditReturnReason(e.target.value)} placeholder="What the cadet needs to fix -- sent in the return email and shown on their portal" />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setEditing(undefined)} disabled={saving}>
                  Cancel
                </Button>
                <Button disabled={saving} onClick={saveEdit}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" title="Edit" onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" />
    </Button>
  );
}

function CombinedTable({ rows, roster, onEdit }: { rows: CombinedMemoRow[]; roster: Cadet[]; onEdit: (row: CombinedMemoRow) => void }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No memorandums match this filter.</p>;
  return (
    <div className="overflow-x-auto">
    <Table aria-label="All memorandums">
      <TableHeader>
        <TableRow>
          <TableHead>{"Date Assigned / Missed"}</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Cadet</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Date Submitted</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PDF</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.kind}-${row.id}`}>
            <TableCell>{shortDate(row.primaryDate)}</TableCell>
            <TableCell className="max-w-xs truncate" title={row.subject || undefined}>{row.subject}</TableCell>
            <TableCell>{cadetDisplayName(row.cadetId, row.cadetName, roster)}</TableCell>
            <TableCell>
              <Badge variant="outline">{row.kind}</Badge>
            </TableCell>
            <TableCell>{shortDate(row.submittedAt)}</TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                <LateBadge lateSubmission={row.lateSubmission} />
              </span>
            </TableCell>
            <TableCell>
              <PdfButton url={row.pdfUrl} name={row.pdfFileName} />
            </TableCell>
            <TableCell className="max-w-xs truncate" title={row.notes || undefined}>{row.notes}</TableCell>
            <TableCell>
              <EditButton onClick={() => onEdit(row)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function AbsenceTable({
  memos,
  roster,
  pmtEventsById,
  onEdit,
}: {
  memos: AbsenceMemo[];
  roster: Cadet[];
  pmtEventsById: Map<string, PmtEvent>;
  onEdit: (m: AbsenceMemo) => void;
}) {
  if (memos.length === 0) return <p className="text-sm text-muted-foreground">No absence memorandums match this filter.</p>;
  return (
    <div className="overflow-x-auto">
    <Table aria-label="Absence memorandums">
      <TableHeader>
        <TableRow>
          <TableHead>TW</TableHead>
          <TableHead>Date missed</TableHead>
          <TableHead>Covers</TableHead>
          <TableHead>Date Submitted</TableHead>
          <TableHead>Cadet</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PDF</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {memos.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{trainingWeekFor(m, pmtEventsById) ?? "—"}</TableCell>
            <TableCell>{shortDate(dateMissedFor(m, pmtEventsById))}</TableCell>
            <TableCell className="max-w-xs truncate" title={coversLabel(m, pmtEventsById)}>{coversLabel(m, pmtEventsById)}</TableCell>
            <TableCell>{shortDate(m.submittedAt)}</TableCell>
            <TableCell>{cadetDisplayName(m.cadetId, m.cadetName, roster)}</TableCell>
            <TableCell className="max-w-xs truncate" title={m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason}>
              {m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason}
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                <LateBadge lateSubmission={m.lateSubmission} />
              </span>
            </TableCell>
            <TableCell>
              <PdfButton url={m.pdfUrl} name={m.pdfFileName} />
            </TableCell>
            <TableCell className="max-w-xs truncate" title={(m.status === "Returned" ? m.returnReason : m.reviewNotes) || undefined}>
              {m.status === "Returned" ? m.returnReason : m.reviewNotes}
            </TableCell>
            <TableCell>
              <EditButton onClick={() => onEdit(m)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function DeviationTable({ memos, roster, onEdit }: { memos: DeviationMemo[]; roster: Cadet[]; onEdit: (m: DeviationMemo) => void }) {
  if (memos.length === 0) return <p className="text-sm text-muted-foreground">No deviation memorandums match this filter.</p>;
  return (
    <div className="overflow-x-auto">
    <Table aria-label="Deviation memorandums">
      <TableHeader>
        <TableRow>
          <TableHead>Date assigned</TableHead>
          <TableHead>Given by</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Purpose</TableHead>
          <TableHead>Cadet</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PDF</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {memos.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{shortDate(m.dateAssigned)}</TableCell>
            <TableCell>{m.assignedBy}</TableCell>
            <TableCell>{shortDate(m.dueDate)}</TableCell>
            <TableCell className="max-w-xs truncate" title={m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason}>
              {m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason}
            </TableCell>
            <TableCell className="max-w-xs truncate" title={m.purpose || undefined}>{m.purpose}</TableCell>
            <TableCell>{cadetDisplayName(m.cadetId, m.cadetName, roster)}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
            </TableCell>
            <TableCell>
              <PdfButton url={m.pdfUrl} name={m.pdfFileName} />
            </TableCell>
            <TableCell className="max-w-xs truncate" title={m.reviewNotes || undefined}>{m.reviewNotes}</TableCell>
            <TableCell>
              <EditButton onClick={() => onEdit(m)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}
