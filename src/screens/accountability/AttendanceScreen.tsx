import { useEffect, useMemo, useRef, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Save, TriangleAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ATTENDANCE_STATUSES, ABSENCE_REASONS, FLIGHTS, GROUPS, absenceMemoDeadline, type AttendanceStatus, type AbsenceReason, type Flight, type Group } from "../../domain/constants";
import { isEventFullyRecorded, isFutureCalendarDay, isPostAccountabilityWindowClosed } from "../../domain/attendance";
import { shortDateTime } from "../../domain/memoAnalytics";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import { isCortesGaray, type UnitScope } from "../../domain/access";
import type { AttendanceInput } from "../../hooks/useAttendance";
import type { Attendance, PermissionsConfig, PmtEvent, Cadet, TrainingObjective } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  createAttendance: (input: AttendanceInput, opts?: { refetch?: boolean }) => Promise<Attendance>;
  updateAttendance: (id: string, input: AttendanceInput, opts?: { refetch?: boolean }) => Promise<void>;
  deleteAttendance: (id: string, opts?: { refetch?: boolean }) => Promise<void>;
  catalog: TrainingObjective[];
  applyAbsenceNotPass: (cadet: Cadet, pmtEvent: PmtEvent, catalogById: Map<string, TrainingObjective>) => Promise<void>;
  assignAbsenceMemo: (
    cadet: Cadet,
    pmtEvent: PmtEvent,
    reason: AbsenceReason | undefined,
    reasonOther: string | undefined,
    attendanceId: string,
    opts?: { refetch?: boolean; lateCorrection?: { note: string } }
  ) => Promise<void>;
  retractAbsenceMemoAssignment: (cadetId: string, pmtEventId: string, opts?: { refetch?: boolean }) => Promise<void>;
  linkPreSubmittedAttendance: (cadetId: string, pmtEventId: string, attendanceId: string, opts?: { refetch?: boolean }) => Promise<boolean>;
  discardOrphanedPreSubmission: (cadetId: string, pmtEventId: string, opts?: { refetch?: boolean }) => Promise<void>;
  /** Exactly one full refetch of each collection after a multi-cadet Save, instead of one per cadet (Section: mobile crash fix). */
  refetchAttendance: (silent?: boolean) => Promise<void>;
  refetchAbsenceMemoAssignments: (silent?: boolean) => Promise<void>;
  /** Set by the Dashboard's "Missed Accountability" card -- jumps straight to this PMT (and its Training Week) when it changes. */
  initialPmtEventId?: string;
  /** A Group/Flight Commander already only has their own unit's roster here (Section 8) -- hide whichever filter would only ever show one meaningful value. */
  unitScope: UnitScope;
  /** Gates the Flight/Group Commander-mistake correction option (Cortes Garay only) below. */
  userEmail: string | null | undefined;
  permissionsConfig: PermissionsConfig;
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
  refetchAttendance,
  refetchAbsenceMemoAssignments,
  initialPmtEventId,
  unitScope,
  userEmail,
  permissionsConfig,
}: Props) {
  const canUseLateCorrection = isCortesGaray(userEmail, permissionsConfig);
  // A "group" or "flight" scoped commander's roster only ever has one Group or one Flight value in
  // it -- hide BOTH selects for them, since the other one would only ever show a meaningless
  // empty-or-single-value option (Section A2). But "gmc" (all 4 flights, e.g. Montalvo) and
  // "group-and-gmc" (one group PLUS all 4 flights, e.g. Santiago) genuinely span multiple flights,
  // so the Flight select stays meaningful for them. "group-and-gmc" ALSO needs a way back to just
  // their own group (otherwise there's no way to see TRG-only, only "everything" or one flight at a
  // time) -- so Group stays visible for them too, just restricted to their one group as a two-option
  // All/TRG switch rather than the full 4-group list.
  const hideGroupFilter = unitScope.kind !== "all" && unitScope.kind !== "group-and-gmc";
  const hideFlightFilter = unitScope.kind === "flight" || unitScope.kind === "group";
  const scopedGroupOptions = unitScope.kind === "group-and-gmc" ? [unitScope.group] : GROUPS;
  // SAE/CWL (unrestricted, "all") and Santiago-shaped group-and-gmc commanders get a GMC/Group lit-
  // button toggle instead of the plain dropdowns -- scope-shape-driven, same convention as the two
  // consts above (never an email check).
  const showCohortToggle = unitScope.kind === "all" || unitScope.kind === "group-and-gmc";
  // Every unit-scoped commander except SAE/CWL -- can't see a future PMT's accountability at all,
  // on either the Current/Past toggle or the TW selector (both below).
  const restrictFuturePmts = unitScope.kind !== "all";
  const catalogById = useMemo(() => new Map(catalog.map((o) => [o.id, o])), [catalog]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => b.eventDate.localeCompare(a.eventDate)), [events]);

  // Pick the Training Week first, then only that week's PMTs show in the PMT dropdown --
  // otherwise every commander has to hunt through the whole semester's list.
  const availableTWs = useMemo(
    () => [...new Set(events.map((e) => e.trainingWeek).filter((tw): tw is number => tw !== undefined))].sort((a, b) => b - a),
    [events]
  );

  // Every unit-scoped commander also loses any entirely-future Training Week from the TW dropdown
  // itself -- otherwise picking one would just land on "No PMTs match this view" once
  // visibleWeekEvents filters its events back out. Past weeks stay selectable (still useful via the
  // Past toggle); "All weeks" is dropped too since it would silently fold future weeks' now-hidden
  // PMTs back into the same list.
  const selectableTWs = useMemo(() => {
    if (!restrictFuturePmts) return availableTWs;
    const notFutureTWs = new Set(
      events.filter((e) => !isFutureCalendarDay(e.eventDate)).map((e) => e.trainingWeek).filter((tw): tw is number => tw !== undefined)
    );
    return availableTWs.filter((tw) => notFutureTWs.has(tw));
  }, [availableTWs, events, restrictFuturePmts]);

  // The default view is always the current Training Week -- the latest TW that's already started
  // (has at least one PMT on or before today), regardless of whether some older TW still has
  // missing accountability (that's what the "Missed Accountability" dashboard card is for). Falls
  // back to the earliest upcoming TW if the semester hasn't started yet.
  const currentTW = useMemo(() => {
    const now = Date.now();
    const twNumbers = events.map((e) => e.trainingWeek).filter((tw): tw is number => tw !== undefined);
    if (twNumbers.length === 0) return undefined;
    const pastTWs = events.filter((e) => new Date(e.eventDate).getTime() <= now).map((e) => e.trainingWeek).filter((tw): tw is number => tw !== undefined);
    return pastTWs.length > 0 ? Math.max(...pastTWs) : Math.min(...twNumbers);
  }, [events]);

  // Default PMT (Section I): within the current TW, the EARLIEST PMT that still has zero
  // attendance records -- e.g. if Tuesday's PMT already has accountability entered, default to
  // Thursday's next. Falls back to the current TW's own first PMT once everything in it is recorded.
  const defaultEvent = useMemo(() => {
    const now = Date.now();
    const recordedIds = new Set(attendance.map((a) => a.pmtEventId));
    const currentTWEvents = currentTW === undefined ? [] : events.filter((e) => e.trainingWeek === currentTW);
    const ascendingThisWeek = [...currentTWEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const earliestUnrecorded = ascendingThisWeek.find((e) => new Date(e.eventDate).getTime() <= now && !recordedIds.has(e.id));
    return earliestUnrecorded ?? ascendingThisWeek[0] ?? sortedEvents[0];
  }, [events, currentTW, sortedEvents, attendance]);

  const [twFilter, setTwFilter] = useState<number | undefined>(currentTW);

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
  // Cortes Garay only -- correcting a cadet's own saved "Present" to "Absent" because a Flight/Group
  // Commander marked them Present by mistake. When enabled (with a note), the cadet gets a flat 48h
  // window instead of a deviation memo for the original 72h deadline they never had a fair shot at --
  // but still gets the normal deviation memo if they also miss THIS window (Section: escalation).
  const [lateCorrections, setLateCorrections] = useState<Record<string, { enabled: boolean; note: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [groupFilter, setGroupFilter] = useState<Group | "All">(
    unitScope.kind === "group" ? unitScope.group : showCohortToggle ? scopedGroupOptions[0] : "All"
  );
  const [flightFilter, setFlightFilter] = useState<Flight | "All">(unitScope.kind === "flight" ? unitScope.flight : "All");
  // Which side of the GMC/Group toggle is showing, for showCohortToggle viewers only (Section 3) --
  // defaults to the group side (closest to today's implicit all-groups starting point).
  const [cohortView, setCohortView] = useState<"group" | "gmc">("group");
  // Already-happened PMTs split into "Current" (not every expected cadet has a status yet) and
  // "Past" (fully recorded) -- default Current, since that's the work still owed.
  const [recordedFilter, setRecordedFilter] = useState<"current" | "past">("current");

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

  // Switching sides of the GMC/Group toggle also re-picks a concrete default on that side (M-FLT, or
  // the group side's first option -- CWL for SAE/CWL, the lone TRG for Santiago) -- writes straight
  // into the existing group/flight filter state via the handlers above, so every downstream consumer
  // (activeCadets, expectedCadetIds, etc.) needs no changes at all.
  const handleCohortViewChange = (view: "group" | "gmc") => {
    setCohortView(view);
    if (view === "gmc") handleFlightChange(FLIGHTS[0]);
    else handleGroupChange(scopedGroupOptions[0]);
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

  // Current/Past split (Section 3): "Past" is every already-happened PMT where every one of the
  // viewer's currently-scoped cadets already has a status; "Current" is everything else, including
  // not-yet-happened PMTs (zero attendance rows -> never "fully recorded"), preserving today's
  // ability to pre-browse an upcoming PMT -- but only for SAE/CWL ("all"). Every unit-scoped
  // commander (Flight/Group/GMC-wide/group-and-gmc) can't see a future PMT's accountability at all
  // until its own calendar day arrives, regardless of which side of the toggle they're on.
  const expectedCadetIds = useMemo(() => activeCadets.map((c) => c.id), [activeCadets]);
  const visibleWeekEvents = useMemo(() => {
    const now = Date.now();
    return weekEvents.filter((e) => {
      if (restrictFuturePmts && isFutureCalendarDay(e.eventDate)) return false;
      const passed = new Date(e.eventDate).getTime() <= now;
      const fullyRecorded = isEventFullyRecorded(e, expectedCadetIds, attendance);
      return recordedFilter === "past" ? passed && fullyRecorded : !passed || !fullyRecorded;
    });
  }, [weekEvents, recordedFilter, expectedCadetIds, attendance, restrictFuturePmts]);

  // The selected PMT can fall outside the visible list the moment the Current/Past toggle, the TW,
  // or the unit filters change -- fall back to the first still-visible event rather than leaving the
  // dropdown pointed at something that's no longer an option.
  useEffect(() => {
    if (selectedEventId && visibleWeekEvents.some((e) => e.id === selectedEventId)) return;
    setSelectedEventId(visibleWeekEvents[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedEventId intentionally excluded, same pattern as the initialPmtEventId effect above
  }, [visibleWeekEvents]);

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
      setValue(cadetId, status, status === "A" ? current.absenceReason : undefined, current.absenceReasonOther);
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

  const getLateCorrection = (cadetId: string) => lateCorrections[cadetId] ?? { enabled: false, note: "" };
  const toggleLateCorrection = (cadetId: string) => {
    setLateCorrections((prev) => ({ ...prev, [cadetId]: { ...getLateCorrection(cadetId), enabled: !getLateCorrection(cadetId).enabled } }));
  };
  const setLateCorrectionNote = (cadetId: string, note: string) => {
    setLateCorrections((prev) => ({ ...prev, [cadetId]: { ...getLateCorrection(cadetId), note } }));
  };
  // True once this PMT's own normal 72h-from-end Absence Memo deadline has already passed -- not
  // tied to any particular previous status, just whether the SAE is entering/editing this PMT's
  // accountability late.
  const normalDeadlinePassed = selectedEvent ? Date.now() > absenceMemoDeadline(selectedEvent.eventDate, selectedEvent.eventType).getTime() : false;
  /** SAE marking/editing a cadet Absent after the PMT's normal 72h deadline already passed -- the only case this option is ever offered. */
  const canExtendDeadline = (cadetId: string): boolean => canUseLateCorrection && normalDeadlinePassed && getValue(cadetId).status === "A";

  const dirtyCount = Object.keys(pending).length;
  const hasInvalidLateCorrection = Object.keys(pending).some((cadetId) => {
    if (!canExtendDeadline(cadetId)) return false;
    const lc = getLateCorrection(cadetId);
    return lc.enabled && lc.note.trim().length === 0;
  });
  const windowClosed = selectedEvent ? isPostAccountabilityWindowClosed(selectedEvent) : false;
  const [missingReasonCadetIds, setMissingReasonCadetIds] = useState<string[]>([]);

  const handleSave = async () => {
    if (!selectedEventId || !selectedEvent) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      for (const [cadetId, value] of Object.entries(pending)) {
        const existing = existingByCadet.get(cadetId);
        // Every write below skips its own per-item refetch (`{ refetch: false }`) -- with a whole
        // flight/group's worth of cadets pending at once, refetching + re-rendering the full
        // attendance/absence-memo collections after EVERY single cadet (rather than once at the end
        // of the loop) was slow enough on mobile to look like the app crashing. One explicit refetch
        // of each collection happens after the loop instead.
        if (value.status === NONE) {
          // Clearing back to no input -- delete the saved record (if any) and unwind any downstream
          // side effects tied to it, same as correcting a mistaken Absent away to something else.
          if (existing) await deleteAttendance(existing.id, { refetch: false });
          await retractAbsenceMemoAssignment(cadetId, selectedEventId, { refetch: false });
          await discardOrphanedPreSubmission(cadetId, selectedEventId, { refetch: false });
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
          await updateAttendance(existing.id, input, { refetch: false });
          attendanceId = existing.id;
        } else {
          const created = await createAttendance(input, { refetch: false });
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
            const linked = await linkPreSubmittedAttendance(cadetId, selectedEventId, attendanceId, { refetch: false });
            if (linked) {
              await updateAttendance(attendanceId, { ...input, status: "PE" }, { refetch: false });
            } else {
              // An Absence Memo is assigned to the cadet the instant they're marked Absent -- the
              // cadet then picks it up from the Memo Submissions site. A Flight/Group Commander's
              // mistake, corrected late (existing saved status was "P"), gets the 48h override instead
              // of the normal 72h-from-PMT-end deadline.
              const lc = getLateCorrection(cadetId);
              const lateCorrection = canExtendDeadline(cadetId) && lc.enabled && lc.note.trim().length > 0 ? { note: lc.note.trim() } : undefined;
              await assignAbsenceMemo(cadet, selectedEvent, value.absenceReason, value.absenceReasonOther, attendanceId, {
                refetch: false,
                lateCorrection,
              });
            }
          }
        } else {
          // A mistaken Absent entry corrected to something else before the cadet ever submitted a
          // memo for it -- retract the auto-assignment so it doesn't sit there needing action.
          await retractAbsenceMemoAssignment(cadetId, selectedEventId, { refetch: false });
          // The cadet actually showed up (Present/Late/etc.) despite having pre-submitted a future
          // memo for this PMT -- the excuse is no longer needed (Section F).
          await discardOrphanedPreSubmission(cadetId, selectedEventId, { refetch: false });
        }
      }
      // One explicit refetch of each collection, now that every cadet's writes are in -- not one
      // per cadet (see the per-write `{ refetch: false }` calls above).
      await Promise.all([refetchAttendance(true), refetchAbsenceMemoAssignments(true)]);
      setPending({});
      setLateCorrections({});
      awaitingPostSaveDefaultRef.current = true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save one or more entries.");
    } finally {
      setSaving(false);
    }
  };

  // Marking someone Absent with no reason picked is a dead end for cadre later -- catch it before
  // the save actually runs rather than letting a reason-less Absence Memo go out, and name exactly
  // who's missing one instead of a generic error.
  const handleSaveClick = () => {
    const missing = Object.entries(pending)
      .filter(([, v]) => v.status === "A" && !v.absenceReason)
      .map(([cadetId]) => cadetId);
    if (missing.length > 0) {
      setMissingReasonCadetIds(missing);
      return;
    }
    void handleSave();
  };

  const cadetsMissingReason = missingReasonCadetIds.map((id) => roster.find((c) => c.id === id)).filter((c): c is Cadet => !!c);
  const allMissingReasonsFilled = missingReasonCadetIds.every((id) => !!getValue(id).absenceReason);

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <div className="flex items-center gap-2">
          {saveError && <span className="text-sm text-destructive">{saveError}</span>}
          {!saveError && hasInvalidLateCorrection && (
            <span className="text-sm text-destructive">Add a note explaining the correction before saving.</span>
          )}
          <Button onClick={handleSaveClick} disabled={dirtyCount === 0 || saving || hasInvalidLateCorrection}>
            <Save />
            {saving ? "Saving..." : dirtyCount > 0 ? `Save Changes (${dirtyCount})` : "Save Changes"}
          </Button>
        </div>
      </div>

      <Dialog open={missingReasonCadetIds.length > 0} onOpenChange={(open) => !open && setMissingReasonCadetIds([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pick an absence reason</DialogTitle>
            <DialogDescription>
              {cadetsMissingReason.length === 1
                ? "This cadet is marked Absent with no reason selected yet."
                : "These cadets are marked Absent with no reason selected yet."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {cadetsMissingReason.map((cadet) => (
              <div key={cadet.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">{formatCadetName(cadet)}</span>
                <Select value={getValue(cadet.id).absenceReason ?? ""} onValueChange={(v) => setValue(cadet.id, "A", v as AbsenceReason)}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              disabled={!allMissingReasonsFilled}
              onClick={() => {
                setMissingReasonCadetIds([]);
                void handleSave();
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {(["current", "past"] as const).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant="outline"
              className={cn(recordedFilter === v && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
              onClick={() => setRecordedFilter(v)}
            >
              {v === "current" ? "Current" : "Past"}
            </Button>
          ))}
        </div>
        <Select value={twFilter === undefined ? "All" : String(twFilter)} onValueChange={handleTwChange}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Training Week" />
          </SelectTrigger>
          <SelectContent>
            {!restrictFuturePmts && <SelectItem value="All">All weeks</SelectItem>}
            {selectableTWs.map((tw) => (
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
            {visibleWeekEvents.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title} — {shortDateTime(e.eventDate)} ({e.eventType})
              </SelectItem>
            ))}
            {visibleWeekEvents.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">No PMTs match this view.</div>
            )}
          </SelectContent>
        </Select>
        {showCohortToggle ? (
          <>
            <div className="flex gap-1">
              {(["group", "gmc"] as const).map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(cohortView === v && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
                  onClick={() => handleCohortViewChange(v)}
                >
                  {v === "gmc" ? "GMC" : unitScope.kind === "group-and-gmc" ? unitScope.group : "POC"}
                </Button>
              ))}
            </div>
            {cohortView === "group" && scopedGroupOptions.length > 1 && (
              <div className="flex gap-1">
                {scopedGroupOptions.map((g) => (
                  <Button
                    key={g}
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn(groupFilter === g && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
                    onClick={() => handleGroupChange(g)}
                  >
                    {g}
                  </Button>
                ))}
              </div>
            )}
            {cohortView === "gmc" && (
              <div className="flex gap-1">
                {FLIGHTS.map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn(flightFilter === f && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
                    onClick={() => handleFlightChange(f)}
                  >
                    {f}-FLT
                  </Button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {!hideGroupFilter && (
              <Select value={groupFilter} onValueChange={handleGroupChange}>
                <SelectTrigger className="w-36">
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
          </>
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
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={value.absenceReason ?? ""}
                            onValueChange={(v) => setValue(cadet.id, "A", v as AbsenceReason, value.absenceReasonOther)}
                          >
                            <SelectTrigger className="h-7 w-40 text-[11px]">
                              <SelectValue placeholder="Select a reason" />
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
                        {canExtendDeadline(cadet.id) && (
                          <div className="flex flex-col gap-1 border-t border-input pt-1.5">
                            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <input type="checkbox" checked={getLateCorrection(cadet.id).enabled} onChange={() => toggleLateCorrection(cadet.id)} />
                              Entered after the normal 72h deadline -- reopen a 48h window instead of a deviation memo
                            </label>
                            {getLateCorrection(cadet.id).enabled && (
                              <Input
                                value={getLateCorrection(cadet.id).note}
                                onChange={(e) => setLateCorrectionNote(cadet.id, e.target.value)}
                                placeholder="Reason for the extension (required)"
                                className="h-7 w-64 text-[11px]"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {(value.status === "AE" || value.status === "PE") && (
                      <span className="text-[11px] text-muted-foreground">
                        {value.absenceReason === "Other" && value.absenceReasonOther ? value.absenceReasonOther : value.absenceReason ?? "—"}
                      </span>
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
