import { useEffect, useMemo, useRef, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Save, TriangleAlert, ClipboardCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ATTENDANCE_STATUSES, ABSENCE_REASONS, FLIGHTS, GROUPS, type AttendanceStatus, type AbsenceReason, type Flight, type Group } from "../../domain/constants";
import { isPostAccountabilityWindowClosed } from "../../domain/attendance";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import type { UnitScope } from "../../domain/access";
import type { AttendanceInput } from "../../hooks/useAttendance";
import type { Attendance, PmtEvent, Cadet, TrainingObjective } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  createAttendance: (input: AttendanceInput) => Promise<Attendance>;
  updateAttendance: (id: string, input: AttendanceInput) => Promise<void>;
  deleteAttendance: (id: string) => Promise<void>;
  catalog: TrainingObjective[];
  applyAbsenceNotPass: (cadet: Cadet, pmtEvent: PmtEvent, catalogById: Map<string, TrainingObjective>) => Promise<void>;
  assignAbsenceMemo: (cadet: Cadet, pmtEvent: PmtEvent, reason: AbsenceReason | undefined, reasonOther: string | undefined, attendanceId: string) => Promise<void>;
  retractAbsenceMemoAssignment: (cadetId: string, pmtEventId: string) => Promise<void>;
  linkPreSubmittedAttendance: (cadetId: string, pmtEventId: string, attendanceId: string) => Promise<boolean>;
  discardOrphanedPreSubmission: (cadetId: string, pmtEventId: string) => Promise<void>;
  /** Set by the Dashboard's "Missed Accountability" card -- jumps straight to this PMT (and its Training Week) when it changes. */
  initialPmtEventId?: string;
  /** A Group/Flight Commander already only has their own unit's roster here (Section 8) -- hide whichever filter would only ever show one meaningful value. */
  unitScope: UnitScope;
}

const NONE = "__none__";

function nowIso(): string {
  return new Date().toISOString();
}

export function AttendanceScreen({
  roster,
  events,
  attendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  catalog,
  applyAbsenceNotPass,
  assignAbsenceMemo,
  retractAbsenceMemoAssignment,
  linkPreSubmittedAttendance,
  discardOrphanedPreSubmission,
  initialPmtEventId,
  unitScope,
}: Props) {
  // A scoped commander's roster only ever has one Group or one Flight value in it -- hide BOTH
  // selects, not just the one matching their own scope kind, since the other one would only ever
  // show meaningless empty-or-single-value options for their already-narrowed roster (Section A2).
  const hideGroupFilter = unitScope.kind !== "all";
  const hideFlightFilter = unitScope.kind !== "all";
  const catalogById = useMemo(() => new Map(catalog.map((o) => [o.id, o])), [catalog]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => b.eventDate.localeCompare(a.eventDate)), [events]);

  // Pick the Training Week first, then only that week's PMTs show in the PMT dropdown --
  // otherwise every commander has to hunt through the whole semester's list.
  const availableTWs = useMemo(
    () => [...new Set(events.map((e) => e.trainingWeek).filter((tw): tw is number => tw !== undefined))].sort((a, b) => b - a),
    [events]
  );

  // Default PMT (Section I): the EARLIEST past-or-current PMT that still has zero attendance
  // records -- e.g. if Tuesday's PMT already has accountability entered, default to Thursday's
  // next, not back to some later gap. Falls back to the single most recent PMT overall once every
  // past PMT already has attendance recorded.
  const defaultEvent = useMemo(() => {
    const now = Date.now();
    const recordedIds = new Set(attendance.map((a) => a.pmtEventId));
    const ascendingPast = [...events].filter((e) => new Date(e.eventDate).getTime() <= now).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const earliestUnrecorded = ascendingPast.find((e) => !recordedIds.has(e.id));
    return earliestUnrecorded ?? sortedEvents[0];
  }, [events, sortedEvents, attendance]);

  const [twFilter, setTwFilter] = useState<number | undefined>(defaultEvent?.trainingWeek);

  const weekEvents = useMemo(
    () => (twFilter === undefined ? sortedEvents : sortedEvents.filter((e) => e.trainingWeek === twFilter)),
    [sortedEvents, twFilter]
  );

  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(defaultEvent?.id);

  // After a save completes, the `attendance` prop updates once the parent hook refetches -- jump
  // to whatever's now the default (the next PMT still missing attendance) at that point, rather than
  // leaving the commander stuck on the PMT they just finished.
  const awaitingPostSaveDefaultRef = useRef(false);
  useEffect(() => {
    if (!awaitingPostSaveDefaultRef.current) return;
    awaitingPostSaveDefaultRef.current = false;
    setTwFilter(defaultEvent?.trainingWeek);
    setSelectedEventId(defaultEvent?.id);
  }, [attendance, defaultEvent]);
  const [pending, setPending] = useState<
    Record<string, { status: AttendanceStatus | typeof NONE; absenceReason: AbsenceReason | undefined; absenceReasonOther: string | undefined }>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [groupFilter, setGroupFilter] = useState<Group | "All">(unitScope.kind === "group" ? unitScope.group : "All");
  const [flightFilter, setFlightFilter] = useState<Flight | "All">(unitScope.kind === "flight" ? unitScope.flight : "All");

  // Dashboard's "Accountability" card jumping here with a specific PMT -- select its Training Week
  // (so it actually appears in the filtered dropdown) and the PMT itself.
  useEffect(() => {
    if (!initialPmtEventId) return;
    const target = events.find((e) => e.id === initialPmtEventId);
    if (!target) return;
    setTwFilter(target.trainingWeek);
    setSelectedEventId(target.id);
  }, [initialPmtEventId, events]);

  const handleTwChange = (v: string) => {
    const tw = v === "All" ? undefined : Number(v);
    setTwFilter(tw);
    const nextEvents = tw === undefined ? sortedEvents : sortedEvents.filter((e) => e.trainingWeek === tw);
    setSelectedEventId(nextEvents[0]?.id);
  };

  // Group and Flight are mutually exclusive -- picking one clears the other, so only one of the
  // two can ever be scoping the roster at a time.
  const handleGroupChange = (v: string) => {
    setGroupFilter(v as Group | "All");
    if (v !== "All") setFlightFilter("All");
  };
  const handleFlightChange = (v: string) => {
    setFlightFilter(v as Flight | "All");
    if (v !== "All") setGroupFilter("All");
  };

  const selectedEvent = sortedEvents.find((e) => e.id === selectedEventId);
  // Scoped to whichever Group/Flight is selected -- only that commander's own people, so a Flight
  // or Group commander can't accidentally edit accountability outside their own unit.
  const activeCadets = useMemo(
    () =>
      [...roster]
        .filter((p) => p.status === "Active")
        .filter((p) => groupFilter === "All" || p.group === groupFilter)
        .filter((p) => flightFilter === "All" || p.flight === flightFilter)
        .sort((a, b) => compareByLastName(a.name, b.name)),
    [roster, groupFilter, flightFilter]
  );

  const existingByCadet = useMemo(() => {
    const map = new Map<string, Attendance>();
    if (!selectedEventId) return map;
    for (const record of attendance) {
      if (record.pmtEventId === selectedEventId) map.set(record.cadetId, record);
    }
    return map;
  }, [attendance, selectedEventId]);

  const getValue = (
    cadetId: string
  ): { status: AttendanceStatus | typeof NONE; absenceReason: AbsenceReason | undefined; absenceReasonOther: string | undefined } => {
    if (cadetId in pending) return pending[cadetId];
    const existing = existingByCadet.get(cadetId);
    return existing
      ? { status: existing.status, absenceReason: existing.absenceReason, absenceReasonOther: existing.absenceReasonOther }
      : { status: NONE, absenceReason: undefined, absenceReasonOther: undefined };
  };

  const setValue = (cadetId: string, status: AttendanceStatus, absenceReason: AbsenceReason | undefined, absenceReasonOther?: string) => {
    setPending((prev) => ({
      ...prev,
      [cadetId]: { status, absenceReason, absenceReasonOther: absenceReason === "Other" ? (absenceReasonOther ?? prev[cadetId]?.absenceReasonOther) : undefined },
    }));
  };

  /**
   * Clicking a status that's already active (whether from a pending edit or an already-saved
   * record) unselects it -- drops any pending override for this cadet, reverting the cell back to
   * whatever's actually saved (or blank if nothing is). Clicking a different status still just sets it.
   */
  const handleStatusClick = (cadetId: string, status: AttendanceStatus) => {
    const current = getValue(cadetId);
    if (current.status === status) {
      setPending((prev) => {
        const next = { ...prev };
        delete next[cadetId];
        return next;
      });
    } else {
      setValue(cadetId, status, status === "A" ? (current.absenceReason ?? ABSENCE_REASONS[0]) : undefined, current.absenceReasonOther);
    }
  };

  /**
   * Explicitly clears the cell back to no input, whether or not anything's been saved yet -- e.g. a
   * cadet mistakenly marked Present for a future PMT. Unlike re-clicking an active status (which only
   * drops an unsaved pending edit), this forces the saved Attendance record itself to be deleted on Save.
   */
  const handleClear = (cadetId: string) => {
    setPending((prev) => ({ ...prev, [cadetId]: { status: NONE, absenceReason: undefined, absenceReasonOther: undefined } }));
  };

  const dirtyCount = Object.keys(pending).length;
  const windowClosed = selectedEvent ? isPostAccountabilityWindowClosed(selectedEvent) : false;

  const handleSave = async () => {
    if (!selectedEventId || !selectedEvent) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      for (const [cadetId, value] of Object.entries(pending)) {
        const existing = existingByCadet.get(cadetId);

        if (value.status === NONE) {
          // Clearing back to no input -- delete the saved record (if any) and unwind any downstream
          // side effects tied to it, same as correcting a mistaken Absent away to something else.
          if (existing) await deleteAttendance(existing.id);
          await retractAbsenceMemoAssignment(cadetId, selectedEventId);
          await discardOrphanedPreSubmission(cadetId, selectedEventId);
          continue;
        }

        const input: AttendanceInput = {
          cadetId,
          pmtEventId: selectedEventId,
          status: value.status,
          absenceReason: value.status === "A" ? value.absenceReason : undefined,
          absenceReasonOther: value.status === "A" ? value.absenceReasonOther : undefined,
          recordedAt: nowIso(),
          notes: existing?.notes ?? "",
        };
        let attendanceId: string;
        if (existing) {
          await updateAttendance(existing.id, input);
          attendanceId = existing.id;
        } else {
          const created = await createAttendance(input);
          attendanceId = created.id;
        }

        if (value.status === "A") {
          const cadet = roster.find((p) => p.id === cadetId);
          if (cadet) {
            // Absence auto-fail (explicit project rule): every Training Objective tied to this PMT
            // becomes Not Pass for this cadet, overwriting whatever was there. Never runs for any
            // other status, and nothing here ever auto-reverts it later.
            await applyAbsenceNotPass(cadet, selectedEvent, catalogById);
            // If the cadet already pre-submitted a memo for this PMT (they knew in advance they'd
            // miss it), link this real Attendance doc into it and promote straight to PE -- an
            // excuse is already in progress, so there's nothing new to assign.
            const linked = await linkPreSubmittedAttendance(cadetId, selectedEventId, attendanceId);
            if (linked) {
              await updateAttendance(attendanceId, { ...input, status: "PE" });
            } else {
              // An Absence Memo is assigned to the cadet the instant they're marked Absent -- the
              // cadet then picks it up from the Memo Submissions site.
              await assignAbsenceMemo(cadet, selectedEvent, value.absenceReason, value.absenceReasonOther, attendanceId);
            }
          }
        } else {
          // A mistaken Absent entry corrected to something else before the cadet ever submitted a
          // memo for it -- retract the auto-assignment so it doesn't sit there needing action.
          await retractAbsenceMemoAssignment(cadetId, selectedEventId);
          // The cadet actually showed up (Present/Late/etc.) despite having pre-submitted a future
          // memo for this PMT -- the excuse is no longer needed (Section F).
          await discardOrphanedPreSubmission(cadetId, selectedEventId);
        }
      }
      setPending({});
      awaitingPostSaveDefaultRef.current = true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save one or more entries.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Accountability
        </h2>
        <div className="flex items-center gap-2">
          {saveError && <span className="text-sm text-destructive">{saveError}</span>}
          <Button onClick={handleSave} disabled={dirtyCount === 0 || saving}>
            <Save />
            {saving ? "Saving..." : dirtyCount > 0 ? `Save Changes (${dirtyCount})` : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Select value={twFilter === undefined ? "All" : String(twFilter)} onValueChange={handleTwChange}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Training Week" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All weeks</SelectItem>
            {availableTWs.map((tw) => (
              <SelectItem key={tw} value={String(tw)}>
                TW {tw}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedEventId ?? ""} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-96">
            <SelectValue placeholder="Select a PMT" />
          </SelectTrigger>
          <SelectContent>
            {weekEvents.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title} — {new Date(e.eventDate).toLocaleString()} ({e.eventType})
              </SelectItem>
            ))}
            {weekEvents.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">No PMTs in this Training Week.</div>
            )}
          </SelectContent>
        </Select>
        {!hideGroupFilter && (
          <Select value={groupFilter} onValueChange={handleGroupChange}>
            <SelectTrigger className="w-36">
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
        {!hideFlightFilter && (
          <Select value={flightFilter} onValueChange={handleFlightChange}>
            <SelectTrigger className="w-32">
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
        {selectedEvent && windowClosed && (
          <span className="flex items-center gap-1.5 text-sm text-warning-foreground">
            <TriangleAlert className="h-4 w-4 text-warning" />
            Outside the normal window (closed 2000 the day of the event) -- entries here are still recorded, just flagged.
          </span>
        )}
      </div>

      {!selectedEvent ? (
        <p className="text-sm text-muted-foreground">No PMT selected -- add one from Settings &gt; Events first.</p>
      ) : groupFilter === "All" && flightFilter === "All" ? (
        <p className="text-sm text-muted-foreground">Pick a Group or a Flight above to load the roster.</p>
      ) : (
        <div className="overflow-x-auto">
        <Table aria-label="Post-Accountability entry">
          <TableHeader>
            <TableRow>
              <TableHead>Cadet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Absence reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeCadets.map((cadet) => {
              const value = getValue(cadet.id);
              const isDirty = cadet.id in pending;
              return (
                <TableRow key={cadet.id}>
                  <TableCell>{formatCadetName(cadet)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {ATTENDANCE_STATUSES.map((status) => {
                        // AE/PE are never manually picked -- they're automatic side-effects of the
                        // memo review lifecycle (Accepted -> AE, Pending -> PE). Always visible (so
                        // cadre can see at a glance that a memo already resolved this cell), but
                        // read-only here -- no click, no Clear -- since they work automatically.
                        const automatic = status === "AE" || status === "PE";
                        return (
                          <Button
                            key={status}
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={automatic}
                            className={cn(
                              "h-7 w-11 text-[11px]",
                              automatic && "cursor-default disabled:opacity-70",
                              value.status === status && statusActiveClass(status),
                              isDirty && "ring-2 ring-primary"
                            )}
                            onClick={automatic ? undefined : () => handleStatusClick(cadet.id, status)}
                          >
                            {status}
                          </Button>
                        );
                      })}
                      {value.status !== NONE && value.status !== "AE" && value.status !== "PE" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          title="Clear (no input)"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleClear(cadet.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {value.status === "A" && (
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={value.absenceReason ?? ABSENCE_REASONS[0]}
                          onValueChange={(v) => setValue(cadet.id, "A", v as AbsenceReason, value.absenceReasonOther)}
                        >
                          <SelectTrigger className="h-7 w-40 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ABSENCE_REASONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {value.absenceReason === "Other" && (
                          <Input
                            value={value.absenceReasonOther ?? ""}
                            onChange={(e) => setValue(cadet.id, "A", "Other", e.target.value)}
                            placeholder="Describe the reason"
                            className="h-7 w-48 text-[11px]"
                          />
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {activeCadets.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No active cadets match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}

function statusActiveClass(status: AttendanceStatus): string {
  switch (status) {
    case "P":
      return "border-success bg-success text-success-foreground hover:bg-success/90";
    case "L":
      return "border-warning bg-warning text-warning-foreground hover:bg-warning/90";
    case "A":
      return "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90";
    case "AE":
    case "PE":
      return "border-primary bg-primary text-primary-foreground hover:bg-primary/90";
  }
}
