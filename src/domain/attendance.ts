import { ATTENDANCE_WEIGHT, STANDING_THRESHOLDS, bucketForEventType, standingForPercent, type AttendanceStatus, type Standing } from "./constants";
import type { Attendance, ExtraEvent, PmtEvent } from "./types";

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

function finalize(t: BucketTally, hasThreshold: boolean): BucketTally {
  const percent = t.countedEvents === 0 ? undefined : t.weightedSum / t.countedEvents;
  return { ...t, percent, standing: hasThreshold ? standingForPercent(percent) : undefined };
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

  return { pt: finalize(pt, true), llabFm: finalize(llabFm, true), other: finalize(other, false) };
}

/**
 * How many more unexcused Absences (weight 0) this bucket could take on top of what's already
 * recorded before the percent would drop below the "Good" standing threshold. Undefined once
 * there's no data yet to base it on; 0 means the cadet is already at or below the line, so even one
 * more unexcused absence keeps/pushes them out of Good.
 */
export function absencesRemainingForGoodStanding(tally: BucketTally): number | undefined {
  if (tally.countedEvents === 0) return undefined;
  const maxAdditionalAbsences = tally.weightedSum / STANDING_THRESHOLDS.good - tally.countedEvents;
  return Math.max(0, Math.floor(maxAdditionalAbsences));
}

/**
 * "Combined average across every event type" (Section 6) -- computed fresh from the underlying
 * weights across every bucket at once, not a simple average of the three already-computed
 * per-bucket percentages (which would misweight cadets with very different event counts per bucket).
 */
export function computeCombinedPercent(cadetId: string, attendance: Attendance[], pmtEventsById: Map<string, PmtEvent>): number | undefined {
  let weightedSum = 0;
  let countedEvents = 0;
  for (const record of attendance) {
    if (record.cadetId !== cadetId) continue;
    if (!pmtEventsById.has(record.pmtEventId)) continue;
    const weight = ATTENDANCE_WEIGHT[record.status];
    if (weight === undefined) continue;
    weightedSum += weight;
    countedEvents += 1;
  }
  return countedEvents === 0 ? undefined : weightedSum / countedEvents;
}

/** Post-Accountability window: opens at the event's own time, closes 2000 the same calendar day. */
export function isPostAccountabilityWindowClosed(event: PmtEvent, now: Date = new Date()): boolean {
  const close = new Date(event.eventDate);
  close.setHours(20, 0, 0, 0);
  return now.getTime() > close.getTime();
}

/** True once a Post-Accountability entry lands after its window has already closed -- a visible flag, never a block. */
export function isEntryOutsideWindow(event: PmtEvent, recordedAt: string): boolean {
  return new Date(recordedAt).getTime() > isPostAccountabilityCloseTime(event).getTime();
}

function isPostAccountabilityCloseTime(event: PmtEvent): Date {
  const close = new Date(event.eventDate);
  close.setHours(20, 0, 0, 0);
  return close;
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

/** Section 7: an Extra Event marked as a reposition whose original PMT no longer exists. */
export function findStaleRepositions(extraEvents: ExtraEvent[], pmtEventsById: Map<string, PmtEvent>): ExtraEvent[] {
  return extraEvents.filter((e) => e.repositionsPmtEventId !== undefined && !pmtEventsById.has(e.repositionsPmtEventId));
}
