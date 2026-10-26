import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpDown, Pencil } from "lucide-react";
import { MobileFiltersButton } from "@/components/mobile/MobileFiltersButton";
import { EdgeSidebar } from "@/components/mobile/EdgeSidebar";
import { LiquidToggle } from "../../components/analytics/LiquidToggle";
import { PdfLinkButton } from "../../components/PdfLinkButton";
import { FLIGHTS, GROUPS, SEMESTER_PMT_TOTALS, type Flight, type Group } from "../../domain/constants";
import { computeCadetAttendanceSummary } from "../../domain/attendance";
import {
  combineMemos,
  coversLabel,
  dateMissedFor,
  filterByRosterScope,
  memoStatusVariant,
  shortDate,
  shortDateTimeBracketed,
  trainingWeekFor,
  type CombinedMemoRow,
} from "../../domain/memoAnalytics";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { CadetBucketStats } from "./AccountabilityAnalyticsView";
import {
  isTrueCadre,
  visibleAbsenceMemos as filterVisibleAbsenceMemos,
  visibleDeviationMemos as filterVisibleDeviationMemos,
  isDeviationMemoViaCc,
} from "../../domain/access";
import type { AbsenceMemoInput } from "../../hooks/useAbsenceMemos";
import type { DeviationMemoInput } from "../../hooks/useDeviationMemos";
import type { AbsenceMemoStatus, DeviationMemoStatus } from "../../domain/constants";
import type { UnitScope } from "../../domain/access";
import type { AbsenceMemo, Attendance, DeviationMemo, Cadet, PermissionsConfig, PmtEvent } from "../../domain/types";

interface Props {
  /** Unit-scoped, Cadre-excluded -- who the table rows can be ABOUT. */
  roster: Cadet[];
  /** Full, unscoped roster (Cadre included) -- used only to look up the signed-in VIEWER's own identity for the owner-based scoping (Section 2). A unit-scoped/Cadre-excluded roster would never find true Cadre's own record, silently defeating that scoping. */
  fullRoster: Cadet[];
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
  userEmail: string | null | undefined;
  permissionsConfig: PermissionsConfig;
  /** Lifted up to AnalyticsApp so the Flight/Group/Cadet selection survives switching between the Accountability/Training Objectives/Memorandums sub-tabs. */
  flightFilter: Flight | "All";
  onFlightFilterChange: (v: Flight | "All") => void;
  groupFilter: Group | "All";
  onGroupFilterChange: (v: Group | "All") => void;
  cadetFilter: string;
  onCadetFilterChange: (v: string) => void;
}

type ViewMode = "all" | "absence" | "deviation";

const ABSENCE_STATUS_OPTIONS: AbsenceMemoStatus[] = ["Assigned", "Pending", "Accepted", "Rejected", "Returned"];
const DEVIATION_STATUS_OPTIONS: DeviationMemoStatus[] = ["Assigned", "Submitted", "Late", "Accepted", "Returned", "Not Submitted"];

function LateBadge({ lateSubmission }: { lateSubmission: "late" | "dns" | "returnedDns" | undefined }) {
  if (!lateSubmission) return null;
  return (
    <Badge variant="destructive" className="text-[10px]">
      {lateSubmission === "dns" ? "DNS" : lateSubmission === "returnedDns" ? "Returned DNS" : "Late"}
    </Badge>
  );
}

/** Icon-only button (Section: Memorandums Analytics table redesign) -- no filename/link text shown, to keep these dense tables narrow. */
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

export function MemorandumsAnalyticsView({
  roster,
  fullRoster,
  events,
  attendance,
  absenceMemos,
  deviationMemos,
  showAbsence,
  updateAbsenceMemo,
  updateDeviationMemo,
  applyMemoDecision,
  unitScope,
  userEmail,
  permissionsConfig,
  flightFilter,
  onFlightFilterChange,
  groupFilter,
  onGroupFilterChange,
  cadetFilter,
  onCadetFilterChange,
}: Props) {
  // "gmc"/"group-and-gmc" scopes (Montalvo, Santiago) span multiple flights -- Flight stays
  // meaningful for them, same fix as Accountability/TO Analytics. "group-and-gmc" ALSO needs a way
  // back to just their own group, so Group stays visible for them too, restricted to their one
  // group as a two-option All/TRG switch.
  const hideGroupFilter = unitScope !== undefined && unitScope.kind !== "all" && unitScope.kind !== "group-and-gmc";
  const hideFlightFilter = unitScope !== undefined && (unitScope.kind === "flight" || unitScope.kind === "group");
  const scopedGroupOptions = unitScope?.kind === "group-and-gmc" ? [unitScope.group] : GROUPS;
  const [mode, setMode] = useState<ViewMode>("all");
  const [sortBy, setSortBy] = useState<"date" | "cadet">("date");
  // Kept across mode switches on purpose (same as Flight/Group/Cadet, which are lifted a level up for
  // the same reason) -- a status that doesn't exist in the other mode's universe (e.g. Absence's
  // "Pending" while on Deviation) just filters that table to empty instead of carrying over, which is
  // an acceptable tradeoff for not silently dropping the filter the moment you switch tabs.
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const statusOptionsForMode: string[] =
    mode === "absence" ? ABSENCE_STATUS_OPTIONS : mode === "deviation" ? DEVIATION_STATUS_OPTIONS : [...new Set([...ABSENCE_STATUS_OPTIONS, ...DEVIATION_STATUS_OPTIONS])];

  const setExclusiveFilter = (which: "cadet" | "flight" | "group", value: string) => {
    onCadetFilterChange(which === "cadet" ? value : ALL_CADETS);
    onFlightFilterChange(which === "flight" ? (value as Flight | "All") : "All");
    onGroupFilterChange(which === "group" ? (value as Group | "All") : "All");
  };

  // Section 2 -- only memorandums concerning this viewer by default: Capt Deaton (general reviewer)
  // or their own AS-Class for absence memos, assigned-by-them-or-CC'd for deviation memos. Only true
  // Cadre get a toggle to see everything; POC/GMC commanders and CWL stay scoped (same rule their
  // own Memo Review screens already use -- unit-scoping alone isn't the same thing, since a cadet in
  // my unit can still have a memo someone else assigned that doesn't concern me at all).
  const isTrueCadreViewer = isTrueCadre(userEmail, fullRoster);
  const [showAllMemos, setShowAllMemos] = useState(false);
  const effectivelyShowAll = isTrueCadreViewer && showAllMemos;

  const absenceMemosIfAllowed = useMemo(() => (showAbsence ? absenceMemos : []), [showAbsence, absenceMemos]);
  const ownerScopedAbsence = useMemo(
    () => (effectivelyShowAll ? absenceMemosIfAllowed : filterVisibleAbsenceMemos(userEmail, fullRoster, absenceMemosIfAllowed, permissionsConfig)),
    [effectivelyShowAll, absenceMemosIfAllowed, userEmail, fullRoster, permissionsConfig]
  );
  const ownerScopedDeviation = useMemo(
    () => (effectivelyShowAll ? deviationMemos : filterVisibleDeviationMemos(userEmail, fullRoster, deviationMemos)),
    [effectivelyShowAll, deviationMemos, userEmail, fullRoster]
  );

  // Section 16: an individual cadet's own PT/LLAB-FM-D&C standing, shown right below the filters --
  // hidden entirely (not just a message) whenever a Group/Flight filter is active instead.
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const combined = useMemo(() => {
    let rows = filterByRosterScope(
      combineMemos(ownerScopedAbsence, ownerScopedDeviation, pmtEventsById),
      roster,
      cadetFilter === ALL_CADETS ? "All" : cadetFilter,
      flightFilter,
      groupFilter
    );
    if (statusFilter !== "All") rows = rows.filter((r) => r.status === statusFilter);
    return sortBy === "cadet" ? rows.sort((a, b) => compareByLastName(a.cadetName, b.cadetName)) : rows.sort((a, b) => b.primaryDate.localeCompare(a.primaryDate));
  }, [ownerScopedAbsence, ownerScopedDeviation, pmtEventsById, roster, cadetFilter, flightFilter, groupFilter, statusFilter, sortBy]);
  const filteredAbsence = useMemo(() => {
    let rows = filterByRosterScope(ownerScopedAbsence, roster, cadetFilter === ALL_CADETS ? "All" : cadetFilter, flightFilter, groupFilter);
    if (statusFilter !== "All") rows = rows.filter((m) => m.status === statusFilter);
    return sortBy === "cadet"
      ? rows.sort((a, b) => compareByLastName(a.cadetName, b.cadetName))
      : rows.sort((a, b) => dateMissedFor(b, pmtEventsById).localeCompare(dateMissedFor(a, pmtEventsById)));
  }, [ownerScopedAbsence, roster, cadetFilter, flightFilter, groupFilter, statusFilter, sortBy, pmtEventsById]);
  const filteredDeviation = useMemo(() => {
    let rows = filterByRosterScope(ownerScopedDeviation, roster, cadetFilter === ALL_CADETS ? "All" : cadetFilter, flightFilter, groupFilter);
    if (statusFilter !== "All") rows = rows.filter((m) => m.status === statusFilter);
    return sortBy === "cadet" ? rows.sort((a, b) => compareByLastName(a.cadetName, b.cadetName)) : rows.sort((a, b) => b.dateAssigned.localeCompare(a.dateAssigned));
  }, [ownerScopedDeviation, roster, cadetFilter, flightFilter, groupFilter, statusFilter, sortBy]);
  const selectedCadetSummary = useMemo(
    () => (cadetFilter === ALL_CADETS ? undefined : computeCadetAttendanceSummary(cadetFilter, attendance, pmtEventsById)),
    [cadetFilter, attendance, pmtEventsById]
  );

  const absenceById = useMemo(() => new Map(ownerScopedAbsence.map((m) => [m.id, m])), [ownerScopedAbsence]);
  const deviationById = useMemo(() => new Map(ownerScopedDeviation.map((m) => [m.id, m])), [ownerScopedDeviation]);

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold desktop:text-2xl">Memorandum Analytics</h2>
        {/* Filters live behind this small button on every screen size now instead of a separate inline row on desktop. The All/Absence/Deviation mode switch is a Liquid Glass toggle next to it on desktop; phone switches mode via the right-edge EdgeSidebar below instead (no room for an inline toggle there). */}
        <div className="flex shrink-0 items-center gap-2">
          <MobileFiltersButton>
            <CadetFilterCombobox roster={roster} value={cadetFilter} onChange={(v) => setExclusiveFilter("cadet", v)} allLabel="All cadets" className="h-8 w-full text-xs" />
            {isTrueCadreViewer && (
              <Button
                variant={showAllMemos ? "default" : "outline"}
                size="sm"
                className="h-8 justify-start text-xs"
                title={showAllMemos ? "Showing every memorandum, including ones not connected to you" : "Only showing memorandums concerning you (assigned by you, CC'd, or your AS-Class)"}
                onClick={() => setShowAllMemos((v) => !v)}
              >
                {showAllMemos ? "Showing all" : "Concerning me only"}
              </Button>
            )}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "cadet")}>
              <SelectTrigger className="h-8 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Sort by date</SelectItem>
                <SelectItem value="cadet">Sort by cadet</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All statuses</SelectItem>
                {statusOptionsForMode.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hideFlightFilter && (
              <Select value={flightFilter} onValueChange={(v) => setExclusiveFilter("flight", v)}>
                <SelectTrigger className="h-8 text-xs">
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
              <Select value={groupFilter} onValueChange={(v) => setExclusiveFilter("group", v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All groups</SelectItem>
                  {scopedGroupOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </MobileFiltersButton>
          <LiquidToggle
            layoutId="memo-analytics-mode-toggle"
            className="hidden desktop:inline-flex"
            options={[
              { value: "all" as const, label: "ALL" },
              ...(showAbsence ? [{ value: "absence" as const, label: "ABS" }] : []),
              { value: "deviation" as const, label: "DEV" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as ViewMode)}
          />
        </div>
      </div>

      <EdgeSidebar
        title="Memorandum mode"
        side="right"
        active={mode}
        onChange={(v) => setMode(v)}
        items={[
          { value: "all" as const, label: "ALL" },
          ...(showAbsence ? [{ value: "absence" as const, label: "ABS" }] : []),
          { value: "deviation" as const, label: "DEV" },
        ]}
      />

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
            <DeviationTable memos={filteredDeviation} roster={roster} onEdit={openEditDeviation} userEmail={userEmail} />
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
            <TableCell>{shortDateTimeBracketed(row.primaryDate)}</TableCell>
            <TableCell className="max-w-xs truncate" title={row.subject || undefined}>{row.subject}</TableCell>
            <TableCell>{cadetDisplayName(row.cadetId, row.cadetName, roster)}</TableCell>
            <TableCell>
              <Badge variant="outline">{row.kind}</Badge>
            </TableCell>
            <TableCell>{shortDateTimeBracketed(row.submittedAt)}</TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <Badge variant={memoStatusVariant(row.status)}>{row.status}</Badge>
                <LateBadge lateSubmission={row.lateSubmission} />
              </span>
            </TableCell>
            <TableCell>
              <PdfLinkButton url={row.pdfUrl} name={row.pdfFileName} />
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
            <TableCell>{shortDateTimeBracketed(m.submittedAt)}</TableCell>
            <TableCell>{cadetDisplayName(m.cadetId, m.cadetName, roster)}</TableCell>
            <TableCell className="max-w-xs truncate" title={m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason}>
              {m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason}
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <Badge variant={memoStatusVariant(m.status)}>{m.status}</Badge>
                <LateBadge lateSubmission={m.lateSubmission} />
              </span>
            </TableCell>
            <TableCell>
              <PdfLinkButton url={m.pdfUrl} name={m.pdfFileName} />
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

function DeviationTable({
  memos,
  roster,
  onEdit,
  userEmail,
}: {
  memos: DeviationMemo[];
  roster: Cadet[];
  onEdit: (m: DeviationMemo) => void;
  userEmail: string | null | undefined;
}) {
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
            <TableCell>{shortDateTimeBracketed(m.dateAssigned)}</TableCell>
            <TableCell>{m.assignedBy}</TableCell>
            <TableCell>{shortDate(m.dueDate)}</TableCell>
            <TableCell className="max-w-xs truncate" title={m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason}>
              {m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason}
            </TableCell>
            <TableCell className="max-w-xs truncate" title={m.purpose || undefined}>{m.purpose}</TableCell>
            <TableCell>
              {cadetDisplayName(m.cadetId, m.cadetName, roster)}
              {isDeviationMemoViaCc(userEmail, m) && (
                <Badge variant="outline" className="ml-1.5 text-[10px]">
                  CC'd
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={memoStatusVariant(m.status)}>{m.status}</Badge>
            </TableCell>
            <TableCell>
              <PdfLinkButton url={m.pdfUrl} name={m.pdfFileName} />
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
