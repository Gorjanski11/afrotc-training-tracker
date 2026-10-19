import { ATTENDANCE_WEIGHT, PERMITTED_ABSENCES_PER_SEMESTER, SEMESTER_PMT_TOTALS, bucketForEventType, standingForAbsencesLeft, type AbsenceAsClass, type AttendanceStatus, type Standing } from "./constants";
import { shortDate } from "./memoAnalytics";
import type { Attendance, PmtEvent } from "./types";

export interface BucketTally {
  weightedSum: number;
  /** Excludes PE (still pending review) -- AE counts here just like P, per ATTENDANCE_WEIGHT. */
  countedEvents: number;
  percent: number | undefined;
  standing: Standing | undefined;
  /** Raw count per status, regardless of whether that status counts toward the weighted percent -- e.g. a still-pending PE shows up here even though it isn't in countedEvents yet. */
  statusCounts: Record<AttendanceStatus, number>;
}

export interface CadetAttendanceSummary {
  pt: BucketTally;
  llabFm: BucketTally;
  /** D&C and anything else outside PT/LLAB/FM -- informational only, no threshold (Section 5). */
  other: BucketTally;
}

function emptyTally(): BucketTally {
  return { weightedSum: 0, countedEvents: 0, percent: undefined, standing: undefined, statusCounts: { P: 0, L: 0, A: 0, AE: 0, PE: 0 } };
}

/**
 * Percent (0-1 scale, informational only now) against a fixed semester total (Section 1):
 * unrecorded/future PMTs are assumed fine until proven otherwise, so only recorded *shortfalls* --
 * sum of (1 - weight) over every recorded event -- count against the fixed total.
 * `shortfall = countedEvents - weightedSum` since every weight is at most 1. Standing itself is
 * derived from the flat absence budget (absencesRemainingForGoodStanding/standingForAbsencesLeft),
 * not from this percent. Undefined `fixedTotal` (the "other" bucket, permanently unused now that
 * D&C folds into LLAB_FM) keeps the old dynamic average with no standing threshold.
 */
function finalize(t: BucketTally, fixedTotal: number | undefined): BucketTally {
  if (fixedTotal === undefined) {
    const percent = t.countedEvents === 0 ? undefined : t.weightedSum / t.countedEvents;
    return { ...t, percent, standing: undefined };
  }
  const shortfall = t.countedEvents - t.weightedSum;
  const percent = Math.max(0, (fixedTotal - shortfall) / fixedTotal);
  return { ...t, percent, standing: standingForAbsencesLeft(absencesRemainingForGoodStanding(t)) };
}

/** One cadet's attendance summary across every bucket. Pass the full attendance/pmtEvents lists -- filters to `cadetId` internally. */
export function computeCadetAttendanceSummary(
  cadetId: string,
  attendance: Attendance[],
  pmtEventsById: Map<string, PmtEvent>
): CadetAttendanceSummary {
  const pt = emptyTally();
  const llabFm = emptyTally();
  const other = emptyTally();

  for (const record of attendance) {
    if (record.cadetId !== cadetId) continue;
    const event = pmtEventsById.get(record.pmtEventId);
    if (!event) continue;

    const bucket = bucketForEventType(event.eventType);
    const tally = bucket === "PT" ? pt : bucket === "LLAB_FM" ? llabFm : other;
    tally.statusCounts[record.status] += 1;

    const weight = ATTENDANCE_WEIGHT[record.status];
    if (weight === undefined) continue;
    tally.weightedSum += weight;
    tally.countedEvents += 1;
  }

  return { pt: finalize(pt, SEMESTER_PMT_TOTALS.PT), llabFm: finalize(llabFm, SEMESTER_PMT_TOTALS.LLAB_FM), other: finalize(other, undefined) };
}

/**
 * How many more unexcused Absences (weight 0, i.e. +1 shortfall each) this bucket could take before
 * using up the flat PERMITTED_ABSENCES_PER_SEMESTER budget (5) -- drives both the "Absences left"
 * stat tile and, via standingForAbsencesLeft, the Good/Warning/Hard Limit standing itself. An AE
 * (Approved Excuse) costs nothing here, same as a plain Present (both weight 1 in ATTENDANCE_WEIGHT),
 * and a Late costs half an absence. Deliberately unclamped -- can go negative once a cadet is over
 * budget, since Hard Limit itself only fires at -1 (standingForAbsencesLeft), one full absence past 0.
 */
export function absencesRemainingForGoodStanding(tally: BucketTally): number {
  const currentShortfall = tally.countedEvents - tally.weightedSum;
  return Math.floor(PERMITTED_ABSENCES_PER_SEMESTER - currentShortfall);
}

/**
 * "Combined average across every event type" (Section 6) -- computed fresh against the combined
 * fixed total of the PT and LLAB_FM buckets (Section 1), same shortfall-based math as `finalize`,
 * not a simple average of the two already-computed per-bucket percentages (which would misweight
 * cadets with very different shortfalls per bucket).
 */
export function computeCombinedPercent(cadetId: string, attendance: Attendance[], pmtEventsById: Map<string, PmtEvent>): number {
  let weightedSum = 0;
  let countedEvents = 0;
  for (const record of attendance) {
    if (record.cadetId !== cadetId) continue;
    const event = pmtEventsById.get(record.pmtEventId);
    if (!event) continue;
    if (bucketForEventType(event.eventType) === "OTHER") continue;
    const weight = ATTENDANCE_WEIGHT[record.status];
    if (weight === undefined) continue;
    weightedSum += weight;
    countedEvents += 1;
  }
  const fixedTotal = SEMESTER_PMT_TOTALS.PT + SEMESTER_PMT_TOTALS.LLAB_FM;
  const shortfall = countedEvents - weightedSum;
  return Math.max(0, (fixedTotal - shortfall) / fixedTotal);
}

/** Post-Accountability window: opens at the event's own time, closes 2000 the same calendar day. */
export function isPostAccountabilityWindowClosed(event: PmtEvent, now: Date = new Date()): boolean {
  const close = new Date(event.eventDate);
  close.setHours(20, 0, 0, 0);
  return now.getTime() > close.getTime();
}

/** True once every cadet expected to be accounted for at this PMT (the viewer's currently scoped+filtered
 * roster) already has an Attendance row for it. An empty expected-roster never counts as fully recorded --
 * there's nothing to confirm yet. Drives the Accountability screen's Current/Past toggle. */
export function isEventFullyRecorded(event: PmtEvent, expectedCadetIds: string[], attendance: Attendance[]): boolean {
  if (expectedCadetIds.length === 0) return false;
  const recordedIds = new Set(attendance.filter((a) => a.pmtEventId === event.id).map((a) => a.cadetId));
  return expectedCadetIds.every((id) => recordedIds.has(id));
}

/** True once a PMT's own calendar date (device-local, not its exact scheduled time) is strictly after today --
 * used to gate unit-scoped commanders (every Accountability viewer except SAE/CWL) out of a future PMT's
 * accountability entirely. A same-day PMT counts as "today," not future, even hours before its own start time. */
export function isFutureCalendarDay(eventDate: string, now: Date = new Date()): boolean {
  const eventDay = new Date(eventDate);
  eventDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return eventDay.getTime() > today.getTime();
}

/** True once a Post-Accountability entry lands after its window has already closed -- a visible flag, never a block. */
export function isEntryOutsideWindow(event: PmtEvent, recordedAt: string): boolean {
  return new Date(recordedAt).getTime() > isPostAccountabilityCloseTime(event).getTime();
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Each AS-Class's fixed weekday(s) within its own Training Week, confirmed with cadre. */
const AS_CLASS_WEEKDAYS: Record<AbsenceAsClass, number[]> = {
  AS100: [2], // Tuesday
  AS200: [4], // Thursday
  AS300: [2, 4], // Tuesday + Thursday
  AS400: [1, 3], // Monday + Wednesday
};

/** The Monday (00:00 local) of the calendar week containing this date -- device-local, matching every other date display in this app (shortDate included). */
function mondayOfWeek(dateIso: string): Date {
  const d = new Date(dateIso);
  const day = d.getDay(); // Sun=0 .. Sat=6
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return monday;
}

/**
 * The AS-Class absence date option(s) for a Training Week -- there's no stored "TW date range," so
 * this anchors on any one PMT event already known to be in that week (any of `eventsForTw` works,
 * they all share a calendar week) and derives that week's Monday, then the fixed weekday(s) this
 * AS-Class meets on. AS100->Tue only, AS200->Thu only, AS300->Tue+Thu, AS400->Mon+Wed.
 */
export function asClassDateOptions(eventsForTw: PmtEvent[], asClass: AbsenceAsClass): { iso: string; label: string }[] {
  if (eventsForTw.length === 0) return [];
  const monday = mondayOfWeek(eventsForTw[0].eventDate);
  return AS_CLASS_WEEKDAYS[asClass].map((weekday) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (weekday - 1));
    const iso = date.toISOString();
    return { iso, label: `${WEEKDAY_SHORT[weekday]}, ${shortDate(iso)}` };
  });
}

function isPostAccountabilityCloseTime(event: PmtEvent): Date {
  const close = new Date(event.eventDate);
  close.setHours(20, 0, 0, 0);
  return close;
}

/** How many whole hours past its 2000 deadline this PMT's accountability report is -- 0 if not yet closed (Section 7). */
export function hoursOverdue(event: PmtEvent, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - isPostAccountabilityCloseTime(event).getTime()) / 3_600_000));
}

function isoWeekMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const dayIndex = (d.getDay() + 6) % 7; // Mon=0..Sun=6, local time
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayIndex);
  return monday.toISOString().slice(0, 10);
}

export interface TrainingWeekConflict {
  calendarWeekOf: string;
  trainingWeeks: number[];
  eventIds: string[];
}

/** Section 3.1: two events can't be assigned Training Weeks that land in the same actual calendar week -- flagged, not silently allowed. */
export function findTrainingWeekConflicts(events: PmtEvent[]): TrainingWeekConflict[] {
  const byCalendarWeek = new Map<string, PmtEvent[]>();
  for (const event of events) {
    if (event.trainingWeek === undefined) continue;
    const key = isoWeekMonday(event.eventDate);
    const list = byCalendarWeek.get(key) ?? [];
    list.push(event);
    byCalendarWeek.set(key, list);
  }

  const conflicts: TrainingWeekConflict[] = [];
  for (const [calendarWeekOf, list] of byCalendarWeek) {
    const distinctWeeks = [...new Set(list.map((e) => e.trainingWeek as number))];
    if (distinctWeeks.length > 1) {
      conflicts.push({ calendarWeekOf, trainingWeeks: distinctWeeks, eventIds: list.map((e) => e.id) });
    }
  }
  return conflicts.sort((a, b) => a.calendarWeekOf.localeCompare(b.calendarWeekOf));
}
