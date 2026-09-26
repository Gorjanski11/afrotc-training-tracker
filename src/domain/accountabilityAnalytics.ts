import { ATTENDANCE_WEIGHT, SEMESTER_PMT_TOTALS, absenceMemoDeadline, bucketForEventType, deriveClass, type Standing } from "./constants";
import { computeCadetAttendanceSummary } from "./attendance";
import { compareByLastName } from "./nameUtils";
import type { Attendance, AbsenceMemo, PmtEvent, Cadet } from "./types";

export type TrendBucket = "PT" | "LLAB_FM" | "OTHER" | "ALL";

/** Fixed semester total for a trend bucket (Section 1) -- undefined for "OTHER", which stays a dynamic average since it carries no standing threshold. "ALL" combines PT+LLAB_FM's totals (there are no events left in "OTHER" now that D&C folds into LLAB_FM). */
function fixedTotalForBucket(bucket: TrendBucket): number | undefined {
  if (bucket === "PT") return SEMESTER_PMT_TOTALS.PT;
  if (bucket === "LLAB_FM") return SEMESTER_PMT_TOTALS.LLAB_FM;
  if (bucket === "ALL") return SEMESTER_PMT_TOTALS.PT + SEMESTER_PMT_TOTALS.LLAB_FM;
  return undefined;
}

export interface SessionTrendPoint {
  eventId: string;
  date: string;
  label: string;
  percent: number | undefined;
  countedCadets: number;
}

/**
 * One point per session (not per cadet) -- the cohort-wide attendance rate for that single PMT,
 * across whichever bucket is selected. "ALL" mixes every event type into one fresh weighted
 * average per session, matching Section 6's "combined average" philosophy rather than averaging
 * three already-computed bucket percentages. Deliberately NOT run through the Section 1 fixed-total
 * shortfall formula -- that formula models a cadet's running standing against a semester total, which
 * has no meaning for a single isolated session's cohort-wide snapshot. Only `computeCadetSessionTrend`
 * below (a genuinely cumulative, per-cadet running trend) uses the fixed-total math.
 */
export function computeSessionTrend(
  bucket: TrendBucket,
  activeRoster: Cadet[],
  attendance: Attendance[],
  events: PmtEvent[]
): SessionTrendPoint[] {
  const activeIds = new Set(activeRoster.map((p) => p.id));
  const relevantEvents = events
    .filter((e) => bucket === "ALL" || bucketForEventType(e.eventType) === bucket)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const byEvent = new Map<string, Attendance[]>();
  for (const record of attendance) {
    if (!activeIds.has(record.cadetId)) continue;
    const list = byEvent.get(record.pmtEventId) ?? [];
    list.push(record);
    byEvent.set(record.pmtEventId, list);
  }

  return relevantEvents.map((e) => {
    const records = byEvent.get(e.id) ?? [];
    let weightedSum = 0;
    let countedEvents = 0;
    for (const r of records) {
      const weight = ATTENDANCE_WEIGHT[r.status];
      if (weight === undefined) continue;
      weightedSum += weight;
      countedEvents += 1;
    }
    return {
      eventId: e.id,
      date: e.eventDate,
      label: e.title,
      percent: countedEvents === 0 ? undefined : weightedSum / countedEvents,
      countedCadets: countedEvents,
    };
  });
}

/**
 * One point per session for a single cadet -- their *cumulative* running percent through and
 * including that session, computed the same fixed-total-shortfall way as `finalize()` in
 * attendance.ts (Section 1), so this trend line stays numerically consistent with the dashboard and
 * roster standing. "OTHER" has no fixed total and keeps the old dynamic running average.
 */
export function computeCadetSessionTrend(bucket: TrendBucket, cadetId: string, attendance: Attendance[], events: PmtEvent[]): SessionTrendPoint[] {
  const relevantEvents = events
    .filter((e) => bucket === "ALL" || bucketForEventType(e.eventType) === bucket)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const byEvent = new Map<string, Attendance>();
  for (const record of attendance) {
    if (record.cadetId === cadetId) byEvent.set(record.pmtEventId, record);
  }

  const fixedTotal = fixedTotalForBucket(bucket);

  let weightedSum = 0;
  let countedEvents = 0;
  return relevantEvents.map((e) => {
    const record = byEvent.get(e.id);
    if (record) {
      const weight = ATTENDANCE_WEIGHT[record.status];
      if (weight !== undefined) {
        weightedSum += weight;
        countedEvents += 1;
      }
    }
    const percent =
      fixedTotal === undefined
        ? countedEvents === 0
          ? undefined
          : weightedSum / countedEvents
        : Math.max(0, (fixedTotal - (countedEvents - weightedSum)) / fixedTotal);
    return {
      eventId: e.id,
      date: e.eventDate,
      label: e.title,
      percent,
      countedCadets: countedEvents > 0 ? 1 : 0,
    };
  });
}

/** One entry per calendar day that has a PT and/or a LLAB/FM/D&C session -- used only by the "Combined" trend view so a day with both doesn't render as two overlapping points on one line. */
interface DayEvents {
  date: string;
  ptEvent: PmtEvent | undefined;
  llabEvent: PmtEvent | undefined;
}

function groupEventsByDay(events: PmtEvent[]): DayEvents[] {
  const byDate = new Map<string, DayEvents>();
  for (const e of events) {
    const bucket = bucketForEventType(e.eventType);
    if (bucket === "OTHER") continue;
    const row = byDate.get(e.eventDate) ?? { date: e.eventDate, ptEvent: undefined, llabEvent: undefined };
    if (bucket === "PT" && !row.ptEvent) row.ptEvent = e;
    if (bucket === "LLAB_FM" && !row.llabEvent) row.llabEvent = e;
    byDate.set(e.eventDate, row);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function tallyWeighted(records: Attendance[]): { percent: number | undefined; counted: number } {
  let weightedSum = 0;
  let counted = 0;
  for (const r of records) {
    const weight = ATTENDANCE_WEIGHT[r.status];
    if (weight === undefined) continue;
    weightedSum += weight;
    counted += 1;
  }
  return { percent: counted === 0 ? undefined : weightedSum / counted, counted };
}

export interface CombinedDayTrendPoint {
  date: string;
  label: string;
  percent: number | undefined;
  countedCadets: number;
  ptEventId: string | undefined;
  ptPercent: number | undefined;
  ptCountedCadets: number;
  llabEventId: string | undefined;
  llabPercent: number | undefined;
  llabCountedCadets: number;
}

/**
 * Cohort-wide "Combined" trend, one point per calendar DAY (not per event) -- a day with both a PT
 * and a LLAB/FM/D&C session merges into a single point (percent = weighted across both sessions'
 * attendance together), while still exposing each session's own percent/eventId separately so the
 * hover tooltip and click-to-drill-down can show/open both PMTs for that day instead of just
 * whichever one the point happened to represent.
 */
export function computeCombinedDayTrend(activeRoster: Cadet[], attendance: Attendance[], events: PmtEvent[]): CombinedDayTrendPoint[] {
  const activeIds = new Set(activeRoster.map((p) => p.id));
  const byEvent = new Map<string, Attendance[]>();
  for (const record of attendance) {
    if (!activeIds.has(record.cadetId)) continue;
    const list = byEvent.get(record.pmtEventId) ?? [];
    list.push(record);
    byEvent.set(record.pmtEventId, list);
  }

  return groupEventsByDay(events).map((day) => {
    const ptRecords = day.ptEvent ? (byEvent.get(day.ptEvent.id) ?? []) : [];
    const llabRecords = day.llabEvent ? (byEvent.get(day.llabEvent.id) ?? []) : [];
    const ptTally = tallyWeighted(ptRecords);
    const llabTally = tallyWeighted(llabRecords);
    const combinedTally = tallyWeighted([...ptRecords, ...llabRecords]);
    return {
      date: day.date,
      label: [day.ptEvent?.title, day.llabEvent?.title].filter(Boolean).join(" + ") || "Session",
      percent: combinedTally.percent,
      countedCadets: combinedTally.counted,
      ptEventId: day.ptEvent?.id,
      ptPercent: ptTally.percent,
      ptCountedCadets: ptTally.counted,
      llabEventId: day.llabEvent?.id,
      llabPercent: llabTally.percent,
      llabCountedCadets: llabTally.counted,
    };
  });
}

/**
 * Same day-merge as `computeCombinedDayTrend`, but for a single cadet's *cumulative* running percent
 * (matching `computeCadetSessionTrend`'s fixed-total-shortfall math) -- tracks PT and LLAB/FM running
 * totals in parallel so a day with both sessions can show/open both, same reasoning as above.
 */
export function computeCadetCombinedDayTrend(cadetId: string, attendance: Attendance[], events: PmtEvent[]): CombinedDayTrendPoint[] {
  const byEvent = new Map<string, Attendance>();
  for (const record of attendance) {
    if (record.cadetId === cadetId) byEvent.set(record.pmtEventId, record);
  }

  const ptFixed = SEMESTER_PMT_TOTALS.PT;
  const llabFixed = SEMESTER_PMT_TOTALS.LLAB_FM;
  const combinedFixed = ptFixed + llabFixed;

  const shortfallPercent = (fixedTotal: number, counted: number, weighted: number) => Math.max(0, (fixedTotal - (counted - weighted)) / fixedTotal);

  let ptWeighted = 0;
  let ptCounted = 0;
  let llabWeighted = 0;
  let llabCounted = 0;

  return groupEventsByDay(events).map((day) => {
    if (day.ptEvent) {
      const record = byEvent.get(day.ptEvent.id);
      const weight = record ? ATTENDANCE_WEIGHT[record.status] : undefined;
      if (weight !== undefined) {
        ptWeighted += weight;
        ptCounted += 1;
      }
    }
    if (day.llabEvent) {
      const record = byEvent.get(day.llabEvent.id);
      const weight = record ? ATTENDANCE_WEIGHT[record.status] : undefined;
      if (weight !== undefined) {
        llabWeighted += weight;
        llabCounted += 1;
      }
    }
    return {
      date: day.date,
      label: [day.ptEvent?.title, day.llabEvent?.title].filter(Boolean).join(" + ") || "Session",
      percent: shortfallPercent(combinedFixed, ptCounted + llabCounted, ptWeighted + llabWeighted),
      countedCadets: ptCounted + llabCounted > 0 ? 1 : 0,
      ptEventId: day.ptEvent?.id,
      ptPercent: ptCounted > 0 ? shortfallPercent(ptFixed, ptCounted, ptWeighted) : undefined,
      ptCountedCadets: ptCounted > 0 ? 1 : 0,
      llabEventId: day.llabEvent?.id,
      llabPercent: llabCounted > 0 ? shortfallPercent(llabFixed, llabCounted, llabWeighted) : undefined,
      llabCountedCadets: llabCounted > 0 ? 1 : 0,
    };
  });
}

export interface UnitComparisonRow {
  unit: string;
  ptPercent: number | undefined;
  llabFmPercent: number | undefined;
  cadetCount: number;
}

/** Average PT % vs average LLAB/FM % per unit (Flight for GMC, Group for POC/Cadre) -- an average of each cadet's own already-computed percent, so units with different cadet counts aren't skewed by raw event totals. */
export function computeUnitComparison(
  activeRoster: Cadet[],
  attendance: Attendance[],
  pmtEventsById: Map<string, PmtEvent>,
  unitOf: (p: Cadet) => string | undefined
): UnitComparisonRow[] {
  const byUnit = new Map<string, Cadet[]>();
  for (const p of activeRoster) {
    const unit = unitOf(p);
    if (!unit) continue;
    const list = byUnit.get(unit) ?? [];
    list.push(p);
    byUnit.set(unit, list);
  }

  const rows: UnitComparisonRow[] = [];
  for (const [unit, people] of byUnit) {
    let ptSum = 0;
    let ptCount = 0;
    let llabSum = 0;
    let llabCount = 0;
    for (const p of people) {
      const summary = computeCadetAttendanceSummary(p.id, attendance, pmtEventsById);
      if (summary.pt.percent !== undefined) {
        ptSum += summary.pt.percent;
        ptCount += 1;
      }
      if (summary.llabFm.percent !== undefined) {
        llabSum += summary.llabFm.percent;
        llabCount += 1;
      }
    }
    rows.push({
      unit,
      ptPercent: ptCount === 0 ? undefined : ptSum / ptCount,
      llabFmPercent: llabCount === 0 ? undefined : llabSum / llabCount,
      cadetCount: people.length,
    });
  }
  return rows.sort((a, b) => a.unit.localeCompare(b.unit));
}

export const STANDINGS: readonly Standing[] = ["Good", "Warning", "Hard Limit"];

export interface StandingDistributionRow {
  standing: Standing;
  ptCount: number;
  llabFmCount: number;
}

/** How many active cadets currently sit in each Standing bucket, per threshold-bearing bucket (PT, LLAB/FM). */
export function computeStandingDistribution(
  activeRoster: Cadet[],
  attendance: Attendance[],
  pmtEventsById: Map<string, PmtEvent>
): StandingDistributionRow[] {
  const counts: Record<Standing, { pt: number; llabFm: number }> = {
    Good: { pt: 0, llabFm: 0 },
    Warning: { pt: 0, llabFm: 0 },
    "Hard Limit": { pt: 0, llabFm: 0 },
  };
  for (const p of activeRoster) {
    const summary = computeCadetAttendanceSummary(p.id, attendance, pmtEventsById);
    if (summary.pt.standing) counts[summary.pt.standing].pt += 1;
    if (summary.llabFm.standing) counts[summary.llabFm.standing].llabFm += 1;
  }
  return STANDINGS.map((s) => ({ standing: s, ptCount: counts[s].pt, llabFmCount: counts[s].llabFm }));
}

// ---------------------------------------------------------------------------
// Section 4 -- attendance trend drill-down (click a session on the trend chart)
// ---------------------------------------------------------------------------

export type MissedMemoStatus = "Not submitted" | "Not submitted (overdue)" | "Pending" | "Accepted" | "Rejected" | "Returned";

export interface MissedCadetRow {
  cadet: Cadet;
  status: Attendance["status"];
  memoStatus: MissedMemoStatus;
}

/** Every cadet who missed (A) or was Late (L) for a single PMT, with their flight/group (via `cadet`) and their Absence Memo status for that PMT, if any -- powers the trend chart's click-to-drill-down. */
export function getMissedCadetsForEvent(event: PmtEvent, roster: Cadet[], attendance: Attendance[], absenceMemos: AbsenceMemo[]): MissedCadetRow[] {
  const rosterById = new Map(roster.map((p) => [p.id, p]));
  const deadline = absenceMemoDeadline(event.eventDate, event.eventType);
  const now = new Date();

  const rows: MissedCadetRow[] = [];
  for (const record of attendance) {
    if (record.pmtEventId !== event.id || (record.status !== "A" && record.status !== "L")) continue;
    const cadet = rosterById.get(record.cadetId);
    if (!cadet) continue;

    const memo = absenceMemos.find((m) => m.cadetId === record.cadetId && m.pmtEventIds.includes(event.id));
    let memoStatus: MissedMemoStatus;
    if (!memo || memo.status === "Assigned") memoStatus = now > deadline ? "Not submitted (overdue)" : "Not submitted";
    else if (memo.status === "Pending") memoStatus = "Pending";
    else if (memo.status === "Accepted") memoStatus = "Accepted";
    else if (memo.status === "Rejected") memoStatus = "Rejected";
    else memoStatus = "Returned";

    rows.push({ cadet, status: record.status, memoStatus });
  }
  return rows.sort((a, b) => compareByLastName(a.cadet.name, b.cadet.name));
}

export type UnitAxis = "flight" | "group" | "class";

/** The three grouping axes the roster actually carries -- Flight (GMC only), Group (mostly POC), and Class (Cadre/POC/GMC, always defined). */
export function unitOfAxis(axis: UnitAxis, p: Cadet): string | undefined {
  if (axis === "flight") return p.flight;
  if (axis === "group") return p.group;
  return deriveClass(p.asClass, p.isCadre);
}
