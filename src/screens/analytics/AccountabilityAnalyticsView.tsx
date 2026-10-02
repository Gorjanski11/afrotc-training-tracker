import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Line, LineChart, Bar, BarChart, Pie, PieChart as RePieChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart2, TrendingUp, Scale, PieChart as PieChartIcon, Table2, Users, Gauge, TriangleAlert, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLIGHTS, GROUPS, SEMESTER_PMT_TOTALS, deriveClass, bucketForEventType, type Flight, type Group, type Standing } from "../../domain/constants";
import { computeCadetAttendanceSummary, computeCombinedPercent, absencesRemainingForGoodStanding, type BucketTally } from "../../domain/attendance";
import {
  computeSessionTrend,
  computeCadetSessionTrend,
  computeCombinedDayTrend,
  computeCadetCombinedDayTrend,
  computeUnitComparison,
  computeStandingDistribution,
  getMissedCadetsForEvent,
  unitOfAxis,
  type UnitAxis,
  type SessionTrendPoint,
  type MissedCadetRow,
} from "../../domain/accountabilityAnalytics";
import { compareByLastName, formatCadetName, formatCadetNameCompact } from "../../domain/nameUtils";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { Stepper } from "../../components/analytics/Stepper";
import type { UnitScope } from "../../domain/access";
import type { Attendance, PmtEvent, Cadet, AbsenceMemo } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  absenceMemos: AbsenceMemo[];
  /** A Group/Flight Commander already only has their own unit's roster here (Section 8) -- hide whichever filter would only ever show one meaningful value. */
  unitScope: UnitScope;
}

const chartMargin = { top: 8, right: 16, bottom: 8, left: 8 };
const PIE_COLORS: Record<string, string> = { Good: "var(--chart-series-1)", Warning: "var(--chart-series-3)", "Hard Limit": "var(--chart-critical)" };

function StatTile({ icon, label, value, tone, index }: { icon: React.ReactNode; label: string; value: string; tone?: "critical"; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }}>
      <Card className="hover:shadow-md">
        <CardContent className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              tone === "critical" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            )}
          >
            {icon}
          </span>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className={cn("text-2xl font-semibold tabular-nums", tone === "critical" && "text-destructive")}>{value}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Exported for reuse -- the GMC self-service Dashboard (Section 13) and Memorandums Analytics' per-cadet view (Section 16) show the same PT/LLAB-FM-D&C pair. */
export function CadetBucketStats({ label, tally, fixedTotal }: { label: string; tally: BucketTally; fixedTotal: number }) {
  // Present/Total is against the fixed semester total (Section 2), not "however many sessions have happened so far".
  const presentCount = tally.statusCounts.P + tally.statusCounts.AE;
  const absencesLeft = absencesRemainingForGoodStanding(tally);
  return (
    <div className="rounded-md border border-input p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {tally.standing ? <StandingBadge standing={tally.standing} /> : <span className="text-xs text-muted-foreground">No data yet</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold tabular-nums">{`${presentCount}/${fixedTotal}`}</div>
          <div className="text-[11px] text-muted-foreground">Present/Total</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums">{pct(tally.percent)}</div>
          <div className="text-[11px] text-muted-foreground">Attendance %</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums">{absencesLeft}</div>
          <div className="text-[11px] text-muted-foreground">Absences left</div>
        </div>
      </div>
      <div className="mt-2 text-center text-[11px] text-muted-foreground">
        Late: {tally.statusCounts.L} · Excused: {tally.statusCounts.AE} · Unexcused: {tally.statusCounts.A}
        {tally.statusCounts.PE > 0 && ` · Pending review: ${tally.statusCounts.PE}`}
      </div>
    </div>
  );
}

const AXIS_OPTIONS: { value: UnitAxis; label: string }[] = [
  { value: "flight", label: "Flight" },
  { value: "group", label: "Group" },
];

const CLASS_OPTIONS = ["POC", "GMC"] as const;
type ClassFilter = (typeof CLASS_OPTIONS)[number];

type TrendView = "combined" | "split" | "pt" | "llab";
const TREND_VIEW_OPTIONS: { value: TrendView; label: string }[] = [
  { value: "combined", label: "All Combined" },
  { value: "split", label: "Split (PT + LLAB/FM/D&C)" },
  { value: "pt", label: "PT only" },
  { value: "llab", label: "LLAB/FM/D&C only" },
];

function pct(n: number | undefined): string {
  return n === undefined ? "—" : `${Math.round(n * 100)}%`;
}

/** Cuts a trend series at the last session that's actually happened as of today. */
function cutoffAtNow<T extends { date: string }>(points: T[]): T[] {
  const now = Date.now();
  const cutoffIndex = points.reduce((last, point, i) => (new Date(point.date).getTime() <= now ? i : last), -1);
  return points.slice(0, cutoffIndex + 1);
}

/**
 * Section 14 fix, revised: a raw click on the point itself proved too easy to miss (and recharts'
 * own click-tracking is unreliable, see the original note below), so hovering the point now reveals
 * a "Details" chip in its place -- clicking that chip is what actually opens the drill-down. The
 * dot's own onClick is dropped entirely in favor of this two-step, more forgiving interaction.
 *
 * (Original Section 14 note, still true: recharts 3.x's `<LineChart onClick>` only reads the
 * *hover*-populated `activeTooltipIndex`, not a fresh click's own position, unless the tooltip's
 * `trigger` is explicitly "click" -- which would break the existing hover-preview UX.)
 */
function DetailsChip({ cx, cy, onClick }: { cx: number; cy: number; onClick: () => void }) {
  const width = 54;
  const height = 18;
  return (
    <g style={{ cursor: "pointer" }} onClick={onClick}>
      <rect x={cx - width / 2} y={cy - height / 2} width={width} height={height} rx={4} fill="var(--primary)" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="var(--primary-foreground)">
        Details
      </text>
    </g>
  );
}

function ClickableDot({
  cx,
  cy,
  payload,
  dotFill,
  eventKey,
  onDotClick,
}: {
  cx?: number;
  cy?: number;
  payload?: Record<string, unknown>;
  dotFill: string;
  eventKey: string;
  onDotClick: (eventId: string | undefined) => void;
}) {
  const [hovered, setHovered] = useState(false);
  if (cx === undefined || cy === undefined) return null;
  const eventId = payload?.[eventKey] as string | undefined;
  if (!eventId) return <circle cx={cx} cy={cy} r={3} fill={dotFill} stroke="none" />;
  return (
    <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* Generously-sized invisible hover target -- much bigger than the visible dot, which is too
          small to reliably land a mouse on. */}
      <circle cx={cx} cy={cy} r={14} fill="transparent" style={{ pointerEvents: "all" }} />
      {hovered ? <DetailsChip cx={cx} cy={cy} onClick={() => onDotClick(eventId)} /> : <circle cx={cx} cy={cy} r={3} fill={dotFill} stroke="none" style={{ pointerEvents: "none" }} />}
    </g>
  );
}

/** Same hover-reveals-a-Details-chip treatment as `ClickableDot`, for the Combined view's single line -- a day's point can carry both a PT and a LLAB/FM/D&C event id at once, so both open together. */
function CombinedClickableDot({
  cx,
  cy,
  payload,
  onDotClick,
}: {
  cx?: number;
  cy?: number;
  payload?: { ptEventId?: string; llabEventId?: string };
  onDotClick: (ptEventId: string | undefined, llabEventId: string | undefined) => void;
}) {
  const [hovered, setHovered] = useState(false);
  if (cx === undefined || cy === undefined) return null;
  const ptEventId = payload?.ptEventId;
  const llabEventId = payload?.llabEventId;
  if (!ptEventId && !llabEventId) return <circle cx={cx} cy={cy} r={3} fill="var(--chart-series-1)" stroke="none" />;
  return (
    <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <circle cx={cx} cy={cy} r={14} fill="transparent" style={{ pointerEvents: "all" }} />
      {hovered ? (
        <DetailsChip cx={cx} cy={cy} onClick={() => onDotClick(ptEventId, llabEventId)} />
      ) : (
        <circle cx={cx} cy={cy} r={3} fill="var(--chart-series-1)" stroke="none" style={{ pointerEvents: "none" }} />
      )}
    </g>
  );
}

export function AccountabilityAnalyticsView({ roster, events, attendance, absenceMemos, unitScope }: Props) {
  // A single-unit scoped commander (Flight/Group) only ever gets the Cadet filter -- Flight, Group,
  // and Class all hide for them (Section A3). But "gmc" (all 4 flights, e.g. Montalvo) and
  // "group-and-gmc" (one group PLUS all 4 flights, e.g. Santiago) genuinely span multiple flights, so
  // Flight stays meaningful there; "group-and-gmc" also spans both POC and GMC, so Class stays
  // meaningful there too -- only Group is always hidden once scoped at all (even "group-and-gmc"
  // only ever has one meaningful group value).
  const hideGroupFilter = unitScope.kind !== "all";
  const hideFlightFilter = unitScope.kind === "flight" || unitScope.kind === "group";
  const hideClassFilter = unitScope.kind !== "all" && unitScope.kind !== "group-and-gmc";

  // Single filter set (Cadet/Flight/Group/Class/Standing) -- exclusive on Cadet vs Flight/Group/Class,
  // "last one picked wins". Originally split between a top "master" row driving the charts/tiles and
  // a separate row on the master attendance table; now unified into one row that drives the whole
  // page, including the table (Section: master table filters -> whole page). PMT type is NOT part of
  // this group -- the trend chart has its own view toggle and the table has its own dedicated stepper.
  const [filterCadetId, setFilterCadetId] = useState<string>(ALL_CADETS);
  const [filterFlight, setFilterFlight] = useState<Flight | "All">(unitScope.kind === "flight" ? unitScope.flight : "All");
  const [filterGroup, setFilterGroup] = useState<Group | "All">(unitScope.kind === "group" ? unitScope.group : "All");
  const [filterClass, setFilterClass] = useState<ClassFilter | "All">("All");
  const [filterStanding, setFilterStanding] = useState<Standing | "All">("All");
  const [trendView, setTrendView] = useState<TrendView>("combined");
  const [axis, setAxis] = useState<UnitAxis>("flight");
  // A day can have both a PT and a LLAB/FM/D&C session -- the Combined trend view merges them into
  // one point (Section: combined-day drill-down), so the drill-down needs to be able to reference
  // both at once instead of a single eventId.
  const [drillDownDay, setDrillDownDay] = useState<{ ptEventId?: string; llabEventId?: string } | undefined>();

  // Master attendance table's own PT/LLAB-FM-D&C stepper -- independent of the filter row above, and
  // also which bucket the Standing filter checks (a cadet can be Good on PT but Hard Limit on LLAB/FM).
  const [tableBucketChoice, setTableBucketChoice] = useState<"PT" | "LLAB_FM">("PT");

  const activeRoster = useMemo(() => roster.filter((p) => p.status === "Active"), [roster]);
  const sortedActiveRoster = useMemo(() => [...activeRoster].sort((a, b) => compareByLastName(a.name, b.name)), [activeRoster]);
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const hasCadetFilter = filterCadetId !== ALL_CADETS;
  const hasUnitFilter = filterFlight !== "All" || filterGroup !== "All";

  const setExclusiveFilter = (which: "cadet" | "flight" | "group" | "class", value: string) => {
    setFilterCadetId(which === "cadet" ? value : ALL_CADETS);
    setFilterFlight(which === "flight" ? (value as Flight | "All") : "All");
    setFilterGroup(which === "group" ? (value as Group | "All") : "All");
    setFilterClass(which === "class" ? (value as ClassFilter | "All") : "All");
  };

  const filteredRoster = useMemo(
    () =>
      sortedActiveRoster
        .filter((p) => filterFlight === "All" || p.flight === filterFlight)
        .filter((p) => filterGroup === "All" || p.group === filterGroup)
        .filter((p) => filterClass === "All" || deriveClass(p.asClass, p.isCadre) === filterClass)
        .filter((p) => {
          if (filterStanding === "All") return true;
          const summary = computeCadetAttendanceSummary(p.id, attendance, pmtEventsById);
          const standing = tableBucketChoice === "PT" ? summary.pt.standing : summary.llabFm.standing;
          return standing === filterStanding;
        }),
    [sortedActiveRoster, filterFlight, filterGroup, filterClass, filterStanding, tableBucketChoice, attendance, pmtEventsById]
  );

  const statsRoster = useMemo(() => filteredRoster.filter((p) => !hasCadetFilter || p.id === filterCadetId), [filteredRoster, hasCadetFilter, filterCadetId]);

  // --- Attendance trend --------------------------------------------------
  // "combined" is handled separately below (computeCombinedDayTrend) since it merges same-day PT +
  // LLAB/FM/D&C sessions into one point instead of per-event.
  const singleTrend: SessionTrendPoint[] = useMemo(() => {
    if (trendView !== "pt" && trendView !== "llab") return [];
    const bucket = trendView === "pt" ? "PT" : "LLAB_FM";
    return hasCadetFilter
      ? computeCadetSessionTrend(bucket, filterCadetId, attendance, events)
      : computeSessionTrend(bucket, filteredRoster, attendance, events);
  }, [trendView, hasCadetFilter, filterCadetId, filteredRoster, attendance, events]);

  const singleTrendData = useMemo(
    () =>
      cutoffAtNow(singleTrend).map((t) => ({
        eventId: t.eventId,
        date: t.date,
        dateLabel: new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        label: t.label,
        percentPct: t.percent === undefined ? null : Math.round(t.percent * 100),
        countedCadets: t.countedCadets,
      })),
    [singleTrend]
  );

  const combinedTrendData = useMemo(() => {
    if (trendView !== "combined") return [];
    const points = hasCadetFilter
      ? computeCadetCombinedDayTrend(filterCadetId, attendance, events)
      : computeCombinedDayTrend(filteredRoster, attendance, events);
    return cutoffAtNow(points).map((t) => ({
      date: t.date,
      dateLabel: new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      label: t.label,
      percentPct: t.percent === undefined ? null : Math.round(t.percent * 100),
      countedCadets: t.countedCadets,
      ptEventId: t.ptEventId,
      ptPct: t.ptPercent === undefined ? null : Math.round(t.ptPercent * 100),
      ptCountedCadets: t.ptCountedCadets,
      llabEventId: t.llabEventId,
      llabPct: t.llabPercent === undefined ? null : Math.round(t.llabPercent * 100),
      llabCountedCadets: t.llabCountedCadets,
    }));
  }, [trendView, hasCadetFilter, filterCadetId, filteredRoster, attendance, events]);

  const splitTrendData = useMemo(() => {
    if (trendView !== "split") return [];
    const ptPoints = hasCadetFilter
      ? computeCadetSessionTrend("PT", filterCadetId, attendance, events)
      : computeSessionTrend("PT", filteredRoster, attendance, events);
    const llabPoints = hasCadetFilter
      ? computeCadetSessionTrend("LLAB_FM", filterCadetId, attendance, events)
      : computeSessionTrend("LLAB_FM", filteredRoster, attendance, events);

    type Row = { date: string; dateLabel: string; ptEventId?: string; llabEventId?: string; ptPct: number | null; llabPct: number | null };
    const byDate = new Map<string, Row>();
    for (const p of ptPoints) {
      byDate.set(p.date, {
        date: p.date,
        dateLabel: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        ptEventId: p.eventId,
        ptPct: p.percent === undefined ? null : Math.round(p.percent * 100),
        llabPct: null,
      });
    }
    for (const p of llabPoints) {
      const existing = byDate.get(p.date);
      if (existing) {
        existing.llabEventId = p.eventId;
        existing.llabPct = p.percent === undefined ? null : Math.round(p.percent * 100);
      } else {
        byDate.set(p.date, {
          date: p.date,
          dateLabel: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          llabEventId: p.eventId,
          ptPct: null,
          llabPct: p.percent === undefined ? null : Math.round(p.percent * 100),
        });
      }
    }
    const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    return cutoffAtNow(rows);
  }, [trendView, hasCadetFilter, filterCadetId, filteredRoster, attendance, events]);

  // Single-event dots (PT-only/LLAB-only views, and each line in Split view) resolve their own
  // bucket from the event itself. The Combined view's dots already know both ids for that day.
  const handleTrendClick = (eventId: string | undefined) => {
    if (!eventId) return;
    const event = pmtEventsById.get(eventId);
    if (!event) return;
    setDrillDownDay(bucketForEventType(event.eventType) === "PT" ? { ptEventId: eventId } : { llabEventId: eventId });
  };
  const handleCombinedDayClick = (ptEventId: string | undefined, llabEventId: string | undefined) => {
    if (ptEventId || llabEventId) setDrillDownDay({ ptEventId, llabEventId });
  };

  const ptDrillDownEvent = drillDownDay?.ptEventId ? pmtEventsById.get(drillDownDay.ptEventId) : undefined;
  const llabDrillDownEvent = drillDownDay?.llabEventId ? pmtEventsById.get(drillDownDay.llabEventId) : undefined;
  const hasDrillDown = !!ptDrillDownEvent || !!llabDrillDownEvent;

  const ptMissedCadets = useMemo(
    () => (ptDrillDownEvent ? getMissedCadetsForEvent(ptDrillDownEvent, roster, attendance, absenceMemos) : []),
    [ptDrillDownEvent, roster, attendance, absenceMemos]
  );
  const llabMissedCadets = useMemo(
    () => (llabDrillDownEvent ? getMissedCadetsForEvent(llabDrillDownEvent, roster, attendance, absenceMemos) : []),
    [llabDrillDownEvent, roster, attendance, absenceMemos]
  );

  // Reuses whichever trend series already computed this event's percent (single-session for the
  // PT/LLAB-only and Split views, cumulative-through-this-day when a cadet filter is active) rather
  // than recomputing it a third way.
  const percentForEvent = (eventId: string): number | undefined => {
    const single = singleTrendData.find((p) => p.eventId === eventId);
    if (single) return single.percentPct ?? undefined;
    const split = splitTrendData.find((p) => p.ptEventId === eventId || p.llabEventId === eventId);
    if (split) return (split.ptEventId === eventId ? split.ptPct : split.llabPct) ?? undefined;
    const combined = combinedTrendData.find((p) => p.ptEventId === eventId || p.llabEventId === eventId);
    if (combined) return (combined.ptEventId === eventId ? combined.ptPct : combined.llabPct) ?? undefined;
    return undefined;
  };
  const ptDrillDownPercent = ptDrillDownEvent ? percentForEvent(ptDrillDownEvent.id) : undefined;
  const llabDrillDownPercent = llabDrillDownEvent ? percentForEvent(llabDrillDownEvent.id) : undefined;

  const closeDrillDownAndFilterCadet = (cadetId: string) => {
    setDrillDownDay(undefined);
    setExclusiveFilter("cadet", cadetId);
  };

  // --- PT vs LLAB/FM comparison ------------------------------------------
  const showComparison = !hasCadetFilter;
  const comparison = useMemo(
    () => computeUnitComparison(filteredRoster, attendance, pmtEventsById, (p) => unitOfAxis(axis, p)),
    [filteredRoster, attendance, pmtEventsById, axis]
  );
  const comparisonData = useMemo(
    () =>
      comparison.map((row) => ({
        ...row,
        ptPct: row.ptPercent === undefined ? null : Math.round(row.ptPercent * 100),
        llabFmPct: row.llabFmPercent === undefined ? null : Math.round(row.llabFmPercent * 100),
      })),
    [comparison]
  );

  const distribution = useMemo(() => computeStandingDistribution(filteredRoster, attendance, pmtEventsById), [filteredRoster, attendance, pmtEventsById]);
  const pieData = useMemo(
    () => distribution.map((row) => ({ name: row.standing, value: row.count })).filter((row) => row.value > 0),
    [distribution]
  );

  const selectedCadet = useMemo(() => (hasCadetFilter ? roster.find((p) => p.id === filterCadetId) : undefined), [hasCadetFilter, roster, filterCadetId]);
  const selectedCadetSummary = useMemo(
    () => (hasCadetFilter ? computeCadetAttendanceSummary(filterCadetId, attendance, pmtEventsById) : undefined),
    [hasCadetFilter, filterCadetId, attendance, pmtEventsById]
  );

  const cohortCombinedPercent = useMemo(() => {
    const percents = statsRoster.map((p) => computeCombinedPercent(p.id, attendance, pmtEventsById));
    return percents.length === 0 ? undefined : percents.reduce((a, b) => a + b, 0) / percents.length;
  }, [statsRoster, attendance, pmtEventsById]);

  const belowGoodCount = useMemo(
    () =>
      statsRoster.filter((p) => {
        const summary = computeCadetAttendanceSummary(p.id, attendance, pmtEventsById);
        return summary.pt.standing !== "Good" || summary.llabFm.standing !== "Good";
      }).length,
    [statsRoster, attendance, pmtEventsById]
  );

  // How many of the fixed semester total's sessions this group actually has attendance recorded
  // for (at least one member), out of the fixed PT+LLAB_FM total (Section 1).
  const fixedTotalCombined = SEMESTER_PMT_TOTALS.PT + SEMESTER_PMT_TOTALS.LLAB_FM;
  const trackedSessionsCount = useMemo(() => {
    const statsIds = new Set(statsRoster.map((p) => p.id));
    const tracked = new Set<string>();
    for (const record of attendance) {
      if (!statsIds.has(record.cadetId)) continue;
      const event = pmtEventsById.get(record.pmtEventId);
      if (!event || bucketForEventType(event.eventType) === "OTHER") continue;
      tracked.add(record.pmtEventId);
    }
    return tracked.size;
  }, [statsRoster, attendance, pmtEventsById]);

  // --- Master attendance table (always visible, own dedicated filters + PT/LLAB-FM-D&C stepper) ---
  const tableEvents = useMemo(
    () => events.filter((e) => bucketForEventType(e.eventType) === tableBucketChoice).sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [events, tableBucketChoice]
  );
  // The table now shares the single page-wide filter set -- same roster as the stat tiles (Section:
  // master table filters -> whole page).
  const tableRoster = statsRoster;
  const cellByKey = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const record of attendance) map.set(`${record.cadetId}__${record.pmtEventId}`, record);
    return map;
  }, [attendance]);

  // One PMT's drill-down content -- rendered once per event when a Combined-view day has both a PT
  // and a LLAB/FM/D&C session, so both show in the same dialog. Clicking a cadet's name here closes
  // the dialog and switches the whole page to that cadet's individual analytics (Section: cadet
  // click-through) instead of showing a second, separate view.
  const renderDrillDownSection = (event: PmtEvent, percent: number | undefined, missed: MissedCadetRow[]) => (
    <div key={event.id} className="space-y-2">
      <p className="text-sm font-semibold text-muted-foreground">
        {event.eventType} — {event.title}
      </p>
      {hasCadetFilter && selectedCadet ? (
        <div className="text-sm">
          <p className="mb-1">
            Overall attendance rate: <strong>{percent ?? "—"}%</strong>
          </p>
          {missed.length === 0 ? (
            <p className="text-muted-foreground">{formatCadetName(selectedCadet)} was present.</p>
          ) : (
            <p className="flex items-center gap-2">
              Status: <StatusDot status={missed[0]!.status} />
              {missed[0]!.memoStatus && (
                <Badge variant={missed[0]!.memoStatus === "Accepted" ? "success" : missed[0]!.memoStatus.includes("overdue") || missed[0]!.memoStatus === "Rejected" ? "destructive" : "secondary"}>
                  {missed[0]!.memoStatus}
                </Badge>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p>
            Overall attendance rate: <strong>{percent ?? "—"}%</strong>
          </p>
          {missed.length === 0 ? (
            <p className="text-muted-foreground">No absences or lates recorded for this session.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border border-input">
              <div className="overflow-x-auto">
              <Table aria-label={`Cadets who missed ${event.title}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cadet</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Memo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missed.map((row) => (
                    <TableRow key={row.cadet.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={() => closeDrillDownAndFilterCadet(row.cadet.id)}
                        >
                          {formatCadetName(row.cadet)}
                        </button>
                      </TableCell>
                      <TableCell>{row.cadet.flight ?? row.cadet.group ?? "—"}</TableCell>
                      <TableCell>
                        <StatusDot status={row.status} />
                      </TableCell>
                      <TableCell>
                        {row.memoStatus && (
                          <Badge variant={row.memoStatus === "Accepted" ? "success" : row.memoStatus.includes("overdue") || row.memoStatus === "Rejected" ? "destructive" : "secondary"}>
                            {row.memoStatus}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <BarChart2 className="h-5 w-5 text-primary" />
          Accountability Analytics
        </h2>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3">
        <CadetFilterCombobox roster={sortedActiveRoster} value={filterCadetId} onChange={(v) => setExclusiveFilter("cadet", v)} allLabel="All cadets" className="w-56" />
        {!hideFlightFilter && (
          <Select value={filterFlight} onValueChange={(v) => setExclusiveFilter("flight", v)}>
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
          <Select value={filterGroup} onValueChange={(v) => setExclusiveFilter("group", v)}>
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
        {!hideClassFilter && (
          <Select value={filterClass} onValueChange={(v) => setExclusiveFilter("class", v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">POC + GMC</SelectItem>
              {CLASS_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterStanding} onValueChange={(v) => setFilterStanding(v as Standing | "All")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Standing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All standings</SelectItem>
            <SelectItem value="Good">Good</SelectItem>
            <SelectItem value="Warning">Warning</SelectItem>
            <SelectItem value="Hard Limit">Hard Limit</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon={<Users className="h-4.5 w-4.5" />} label="Active roster" value={String(statsRoster.length)} index={0} />
        <StatTile icon={<Gauge className="h-4.5 w-4.5" />} label="Cohort combined %" value={pct(cohortCombinedPercent)} index={1} />
        <StatTile
          icon={<TriangleAlert className="h-4.5 w-4.5" />}
          label="Below-Good standing flags"
          value={hasUnitFilter ? `${belowGoodCount}/${statsRoster.length}` : String(belowGoodCount)}
          tone={belowGoodCount > 0 ? "critical" : undefined}
          index={2}
        />
        <StatTile
          icon={<CalendarDays className="h-4.5 w-4.5" />}
          label="PMT sessions tracked"
          value={hasUnitFilter ? `${trackedSessionsCount}/${fixedTotalCombined}` : String(trackedSessionsCount)}
          index={3}
        />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mb-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
              Attendance trend
            </CardTitle>
            <Select value={trendView} onValueChange={(v) => setTrendView(v as TrendView)}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TREND_VIEW_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {trendView === "split" ? (
              splitTrendData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions in this filter yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={splitTrendData} margin={chartMargin}>
                    <CartesianGrid stroke="var(--chart-grid)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const row = payload[0].payload as (typeof splitTrendData)[number];
                        return (
                          <div style={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, padding: 8 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{row.dateLabel}</div>
                            <div style={{ color: "var(--chart-series-1)" }}>PT: {row.ptPct === null ? "no session" : `${row.ptPct}%`}</div>
                            <div style={{ color: "var(--chart-series-3)" }}>LLAB/FM/D&amp;C: {row.llabPct === null ? "no session" : `${row.llabPct}%`}</div>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="ptPct"
                      name="PT"
                      stroke="var(--chart-series-1)"
                      strokeWidth={2}
                      dot={<ClickableDot dotFill="var(--chart-series-1)" eventKey="ptEventId" onDotClick={handleTrendClick} />}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="llabPct"
                      name="LLAB/FM/D&C"
                      stroke="var(--chart-series-3)"
                      strokeWidth={2}
                      dot={<ClickableDot dotFill="var(--chart-series-3)" eventKey="llabEventId" onDotClick={handleTrendClick} />}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )
            ) : trendView === "combined" ? (
              combinedTrendData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions in this filter yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={combinedTrendData} margin={chartMargin}>
                    <CartesianGrid stroke="var(--chart-grid)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const row = payload[0].payload as (typeof combinedTrendData)[number];
                        const describe = (pct: number | null, counted: number) =>
                          pct === null ? "no session" : hasCadetFilter ? `${pct}% cumulative` : `${pct}% (${counted} cadets)`;
                        return (
                          <div style={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, padding: 8 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{row.label}</div>
                            <div>PT: {describe(row.ptPct, row.ptCountedCadets)}</div>
                            <div>LLAB/FM/D&amp;C: {describe(row.llabPct, row.llabCountedCadets)}</div>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="percentPct"
                      stroke="var(--chart-series-1)"
                      strokeWidth={2}
                      dot={<CombinedClickableDot onDotClick={handleCombinedDayClick} />}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )
            ) : singleTrendData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions in this filter yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={singleTrendData} margin={chartMargin}>
                  <CartesianGrid stroke="var(--chart-grid)" />
                  <XAxis dataKey="dateLabel" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                    formatter={(value, _name, item) => [
                      value === null ? "no data" : hasCadetFilter ? `${value}% cumulative` : `${value}% (${item.payload.countedCadets} cadets)`,
                      item.payload.label,
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="percentPct"
                    stroke="var(--chart-series-1)"
                    strokeWidth={2}
                    dot={<ClickableDot dotFill="var(--chart-series-1)" eventKey="eventId" onDotClick={handleTrendClick} />}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Hover a point and click Details for a breakdown of that session.</p>
          </CardContent>
        </Card>
      </motion.div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                <Scale className="h-4 w-4 text-primary" />
                {hasCadetFilter && selectedCadet ? `PT vs LLAB/FM/D&C for ${formatCadetName(selectedCadet)}` : "PT vs LLAB/FM/D&C by unit"}
              </CardTitle>
              {showComparison && <Stepper options={AXIS_OPTIONS} value={axis} onChange={(v) => setAxis(v as UnitAxis)} />}
            </CardHeader>
            <CardContent>
              {!showComparison ? (
                selectedCadetSummary ? (
                  <div className="space-y-3">
                    <CadetBucketStats label="PT" tally={selectedCadetSummary.pt} fixedTotal={SEMESTER_PMT_TOTALS.PT} />
                    <CadetBucketStats label="LLAB/FM/D&C" tally={selectedCadetSummary.llabFm} fixedTotal={SEMESTER_PMT_TOTALS.LLAB_FM} />
                  </div>
                ) : null
              ) : comparisonData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No units to compare.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={comparisonData} margin={chartMargin}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="unit" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ptPct" name="PT" fill="var(--chart-series-1)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="llabFmPct" name="LLAB/FM/D&C" fill="var(--chart-series-3)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle>
                <PieChartIcon className="h-4 w-4 text-primary" />
                {hasCadetFilter && selectedCadet ? `Standing for ${formatCadetName(selectedCadet)}` : "Standing distribution (active cadets)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasCadetFilter ? (
                selectedCadetSummary && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <div className="text-lg font-semibold tabular-nums">{pct(cohortCombinedPercent)}</div>
                        <div className="text-[11px] text-muted-foreground">Combined attendance % (all PMT types)</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold tabular-nums">
                          {(selectedCadetSummary.pt.standing === "Good" ? 0 : 1) + (selectedCadetSummary.llabFm.standing === "Good" ? 0 : 1)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">Buckets below Good</div>
                      </div>
                    </div>
                  </div>
                )
              ) : pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <RePieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? "var(--chart-series-1)"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </RePieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>
              <Table2 className="h-4 w-4 text-primary" />
              Master attendance table
            </CardTitle>
            <Stepper
              options={[
                { value: "PT", label: "PT" },
                { value: "LLAB_FM", label: "LLAB/FM/D&C" },
              ]}
              value={tableBucketChoice}
              onChange={(v) => setTableBucketChoice(v as "PT" | "LLAB_FM")}
            />
          </CardHeader>
          <CardContent>
            {tableEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {tableBucketChoice === "PT" ? "PT" : "LLAB/FM/D&C"} sessions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table aria-label="Master attendance table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-card">Cadet</TableHead>
                      {tableEvents.map((e) => (
                        <TableHead key={e.id} className="whitespace-nowrap text-center" title={e.title}>
                          {new Date(e.eventDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </TableHead>
                      ))}
                      <TableHead className="whitespace-nowrap text-center">Standing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableRoster.map((cadet) => {
                      const summary = computeCadetAttendanceSummary(cadet.id, attendance, pmtEventsById);
                      const standing = tableBucketChoice === "PT" ? summary.pt.standing : summary.llabFm.standing;
                      return (
                        <TableRow key={cadet.id}>
                          <TableCell className="sticky left-0 z-10 bg-card whitespace-nowrap">
                            <span className="sm:hidden">{formatCadetNameCompact(cadet)}</span>
                            <span className="hidden sm:inline">{formatCadetName(cadet)}</span>
                          </TableCell>
                          {tableEvents.map((e) => {
                            const record = cellByKey.get(`${cadet.id}__${e.id}`);
                            return (
                              <TableCell key={e.id} className="text-center">
                                {record ? <StatusDot status={record.status} /> : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center">{standing ? <StandingBadge standing={standing} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                    {tableRoster.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={tableEvents.length + 2} className="text-center text-muted-foreground">
                          No active cadets match this filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={hasDrillDown} onOpenChange={(o) => !o && setDrillDownDay(undefined)}>
        <DialogContent className="max-w-2xl">
          {hasDrillDown && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {[ptDrillDownEvent, llabDrillDownEvent]
                    .filter((e): e is PmtEvent => !!e)
                    .map((e) => e.title)
                    .join(" + ")}{" "}
                  — {new Date((ptDrillDownEvent ?? llabDrillDownEvent)!.eventDate).toLocaleDateString()}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                {ptDrillDownEvent && renderDrillDownSection(ptDrillDownEvent, ptDrillDownPercent, ptMissedCadets)}
                {llabDrillDownEvent && renderDrillDownSection(llabDrillDownEvent, llabDrillDownPercent, llabMissedCadets)}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StatusDot({ status }: { status: Attendance["status"] }) {
  const cls =
    status === "P"
      ? "bg-success text-success-foreground"
      : status === "L"
        ? "bg-warning text-warning-foreground"
        : status === "A"
          ? "bg-destructive text-destructive-foreground"
          : "bg-primary text-primary-foreground";
  return <span className={cn("inline-flex h-5 w-7 items-center justify-center rounded text-[10px] font-medium", cls)}>{status}</span>;
}

export function StandingBadge({ standing }: { standing: "Good" | "Warning" | "Hard Limit" }) {
  const variant = standing === "Good" ? "success" : standing === "Warning" ? "warning" : "destructive";
  return <Badge variant={variant}>{standing}</Badge>;
}
