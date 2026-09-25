import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Line, LineChart, Bar, BarChart, Pie, PieChart as RePieChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart2, TrendingUp, Scale, PieChart as PieChartIcon, Table2, Users, Gauge, TriangleAlert, CalendarDays, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { PMT_EVENT_TYPES, FLIGHTS, GROUPS, SEMESTER_PMT_TOTALS, deriveClass, bucketForEventType, type PmtEventType, type Flight, type Group } from "../../domain/constants";
import { computeCadetAttendanceSummary, computeCombinedPercent, absencesRemainingForGoodStanding, type BucketTally } from "../../domain/attendance";
import {
  computeSessionTrend,
  computeCadetSessionTrend,
  computeUnitComparison,
  computeStandingDistribution,
  getMissedCadetsForEvent,
  unitOfAxis,
  type UnitAxis,
  type SessionTrendPoint,
} from "../../domain/accountabilityAnalytics";
import { compareByLastName } from "../../domain/nameUtils";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { Stepper } from "../../components/analytics/Stepper";
import { exportAttendanceData } from "../../lib/exportAttendanceData";
import type { Attendance, PmtEvent, Cadet, AbsenceMemo } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  absenceMemos: AbsenceMemo[];
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

function CadetBucketStats({
  label,
  tally,
  hasThreshold = true,
  fixedTotal,
}: {
  label: string;
  tally: BucketTally;
  hasThreshold?: boolean;
  fixedTotal?: number;
}) {
  const presentCount = tally.statusCounts.P + tally.statusCounts.AE;
  const absencesLeft = hasThreshold && fixedTotal !== undefined ? absencesRemainingForGoodStanding(tally, fixedTotal) : undefined;
  return (
    <div className="rounded-md border border-input p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hasThreshold && (tally.standing ? <StandingBadge standing={tally.standing} /> : <span className="text-xs text-muted-foreground">No data yet</span>)}
      </div>
      <div className={cn("grid gap-2 text-center", hasThreshold ? "grid-cols-3" : "grid-cols-2")}>
        <div>
          <div className="text-lg font-semibold tabular-nums">{tally.countedEvents === 0 ? "—" : `${presentCount}/${tally.countedEvents}`}</div>
          <div className="text-[11px] text-muted-foreground">Present/Total</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums">{pct(tally.percent)}</div>
          <div className="text-[11px] text-muted-foreground">Attendance %</div>
        </div>
        {hasThreshold && (
          <div>
            <div className="text-lg font-semibold tabular-nums">{absencesLeft ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground">Absences left (Good)</div>
          </div>
        )}
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
  { value: "split", label: "Split (PT + LLAB/FM)" },
  { value: "pt", label: "PT only" },
  { value: "llab", label: "LLAB/FM only" },
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

export function AccountabilityAnalyticsView({ roster, events, attendance, absenceMemos }: Props) {
  // Master filters (Cadet/Flight/Group/Class) -- exclusive, "last one picked wins". PMT type is
  // NOT part of this group anymore (Section 6a) -- the trend chart has its own view toggle and the
  // master table has its own dedicated stepper, both independent of this roster-scoping group.
  const [masterCadetId, setMasterCadetId] = useState<string>(ALL_CADETS);
  const [masterFlight, setMasterFlight] = useState<Flight | "All">("All");
  const [masterGroup, setMasterGroup] = useState<Group | "All">("All");
  const [masterClass, setMasterClass] = useState<ClassFilter | "All">("All");
  const [trendView, setTrendView] = useState<TrendView>("combined");
  const [tablePmtType, setTablePmtType] = useState<PmtEventType>("PT");
  const [axis, setAxis] = useState<UnitAxis>("flight");
  const [exporting, setExporting] = useState(false);
  const [drillDownEventId, setDrillDownEventId] = useState<string | undefined>();

  const activeRoster = useMemo(() => roster.filter((p) => p.status === "Active"), [roster]);
  const sortedActiveRoster = useMemo(() => [...activeRoster].sort((a, b) => compareByLastName(a.name, b.name)), [activeRoster]);
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const hasCadetFilter = masterCadetId !== ALL_CADETS;
  const hasUnitFilter = masterFlight !== "All" || masterGroup !== "All";

  const setExclusiveFilter = (which: "cadet" | "flight" | "group" | "class", value: string) => {
    setMasterCadetId(which === "cadet" ? value : ALL_CADETS);
    setMasterFlight(which === "flight" ? (value as Flight | "All") : "All");
    setMasterGroup(which === "group" ? (value as Group | "All") : "All");
    setMasterClass(which === "class" ? (value as ClassFilter | "All") : "All");
  };

  const filteredRoster = useMemo(
    () =>
      sortedActiveRoster
        .filter((p) => masterFlight === "All" || p.flight === masterFlight)
        .filter((p) => masterGroup === "All" || p.group === masterGroup)
        .filter((p) => masterClass === "All" || deriveClass(p.asClass, p.isCadre) === masterClass),
    [sortedActiveRoster, masterFlight, masterGroup, masterClass]
  );

  const statsRoster = useMemo(() => filteredRoster.filter((p) => !hasCadetFilter || p.id === masterCadetId), [filteredRoster, hasCadetFilter, masterCadetId]);

  // --- Attendance trend --------------------------------------------------
  const trendBucketFor = (view: "combined" | "pt" | "llab") => (view === "combined" ? "ALL" : view === "pt" ? "PT" : "LLAB_FM");

  const singleTrend: SessionTrendPoint[] = useMemo(() => {
    if (trendView === "split") return [];
    const bucket = trendBucketFor(trendView as "combined" | "pt" | "llab");
    return hasCadetFilter
      ? computeCadetSessionTrend(bucket, masterCadetId, attendance, events)
      : computeSessionTrend(bucket, filteredRoster, attendance, events);
  }, [trendView, hasCadetFilter, masterCadetId, filteredRoster, attendance, events]);

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

  const splitTrendData = useMemo(() => {
    if (trendView !== "split") return [];
    const ptPoints = hasCadetFilter
      ? computeCadetSessionTrend("PT", masterCadetId, attendance, events)
      : computeSessionTrend("PT", filteredRoster, attendance, events);
    const llabPoints = hasCadetFilter
      ? computeCadetSessionTrend("LLAB_FM", masterCadetId, attendance, events)
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
  }, [trendView, hasCadetFilter, masterCadetId, filteredRoster, attendance, events]);

  const handleTrendClick = (eventId: string | undefined) => {
    if (eventId) setDrillDownEventId(eventId);
  };

  const drillDownEvent = drillDownEventId ? pmtEventsById.get(drillDownEventId) : undefined;
  const missedCadets = useMemo(
    () => (drillDownEvent ? getMissedCadetsForEvent(drillDownEvent, roster, attendance, absenceMemos) : []),
    [drillDownEvent, roster, attendance, absenceMemos]
  );
  const drillDownSessionPercent = useMemo(() => {
    if (!drillDownEvent) return undefined;
    const point = singleTrendData.find((p) => p.eventId === drillDownEvent.id) ?? splitTrendData.find((p) => p.ptEventId === drillDownEvent.id || p.llabEventId === drillDownEvent.id);
    return point && "percentPct" in point ? point.percentPct : undefined;
  }, [drillDownEvent, singleTrendData, splitTrendData]);

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
    () => distribution.map((row) => ({ name: row.standing, value: row.ptCount + row.llabFmCount })).filter((row) => row.value > 0),
    [distribution]
  );

  const selectedCadet = useMemo(() => (hasCadetFilter ? roster.find((p) => p.id === masterCadetId) : undefined), [hasCadetFilter, roster, masterCadetId]);
  const selectedCadetSummary = useMemo(
    () => (hasCadetFilter ? computeCadetAttendanceSummary(masterCadetId, attendance, pmtEventsById) : undefined),
    [hasCadetFilter, masterCadetId, attendance, pmtEventsById]
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

  // --- Master attendance table (always visible, own PMT-type stepper) ---
  const tableBucket = bucketForEventType(tablePmtType);
  const tableEvents = useMemo(
    () => events.filter((e) => e.eventType === tablePmtType).sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [events, tablePmtType]
  );
  const tableRoster = statsRoster;
  const cellByKey = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const record of attendance) map.set(`${record.cadetId}__${record.pmtEventId}`, record);
    return map;
  }, [attendance]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAttendanceData(roster, events, attendance);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <BarChart2 className="h-5 w-5 text-primary" />
          Accountability Analytics
        </h2>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4" />
          {exporting ? "Exporting..." : "Export to Excel"}
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3">
        <CadetFilterCombobox roster={sortedActiveRoster} value={masterCadetId} onChange={(v) => setExclusiveFilter("cadet", v)} allLabel="All cadets" className="w-56" />
        <Select value={masterFlight} onValueChange={(v) => setExclusiveFilter("flight", v)}>
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
        <Select value={masterGroup} onValueChange={(v) => setExclusiveFilter("group", v)}>
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
        <Select value={masterClass} onValueChange={(v) => setExclusiveFilter("class", v)}>
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
                  <LineChart
                    data={splitTrendData}
                    margin={chartMargin}
                    onClick={(state) => {
                      const idx = state?.activeTooltipIndex;
                      if (typeof idx !== "number") return;
                      const row = splitTrendData[idx];
                      handleTrendClick(row?.ptEventId ?? row?.llabEventId);
                    }}
                  >
                    <CartesianGrid stroke="var(--chart-grid)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="ptPct" name="PT" stroke="var(--chart-series-1)" strokeWidth={2} dot={{ r: 3, cursor: "pointer" }} connectNulls />
                    <Line type="monotone" dataKey="llabPct" name="LLAB/FM" stroke="var(--chart-series-3)" strokeWidth={2} dot={{ r: 3, cursor: "pointer" }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )
            ) : singleTrendData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions in this filter yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={singleTrendData}
                  margin={chartMargin}
                  onClick={(state) => {
                    const idx = state?.activeTooltipIndex;
                    if (typeof idx !== "number") return;
                    handleTrendClick(singleTrendData[idx]?.eventId);
                  }}
                >
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
                  <Line type="monotone" dataKey="percentPct" stroke="var(--chart-series-1)" strokeWidth={2} dot={{ r: 3, cursor: "pointer" }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Click a point on the chart for a breakdown of that session.</p>
          </CardContent>
        </Card>
      </motion.div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                <Scale className="h-4 w-4 text-primary" />
                {hasCadetFilter && selectedCadet ? `PT vs LLAB/FM for ${selectedCadet.name}` : "PT vs LLAB/FM by unit"}
              </CardTitle>
              {showComparison && <Stepper options={AXIS_OPTIONS} value={axis} onChange={(v) => setAxis(v as UnitAxis)} />}
            </CardHeader>
            <CardContent>
              {!showComparison ? (
                selectedCadetSummary ? (
                  <div className="space-y-3">
                    <CadetBucketStats label="PT" tally={selectedCadetSummary.pt} fixedTotal={SEMESTER_PMT_TOTALS.PT} />
                    <CadetBucketStats label="LLAB/FM" tally={selectedCadetSummary.llabFm} fixedTotal={SEMESTER_PMT_TOTALS.LLAB_FM} />
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
                    <Bar dataKey="llabFmPct" name="LLAB/FM" fill="var(--chart-series-3)" radius={[3, 3, 0, 0]} maxBarSize={28} />
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
                {hasCadetFilter && selectedCadet ? `Standing for ${selectedCadet.name}` : "Standing distribution (active cadets)"}
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
                    <CadetBucketStats label="D&C / Other" tally={selectedCadetSummary.other} hasThreshold={false} />
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
            <Stepper options={PMT_EVENT_TYPES.map((t) => ({ value: t, label: t }))} value={tablePmtType} onChange={(v) => setTablePmtType(v as PmtEventType)} />
          </CardHeader>
          <CardContent>
            {tableEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {tablePmtType} sessions yet.</p>
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
                      const standing = tableBucket === "PT" ? summary.pt.standing : tableBucket === "LLAB_FM" ? summary.llabFm.standing : undefined;
                      return (
                        <TableRow key={cadet.id}>
                          <TableCell className="sticky left-0 z-10 bg-card whitespace-nowrap">{cadet.name}</TableCell>
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

      <Dialog open={!!drillDownEvent} onOpenChange={(o) => !o && setDrillDownEventId(undefined)}>
        <DialogContent className="max-w-lg">
          {drillDownEvent && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {drillDownEvent.title} — {new Date(drillDownEvent.eventDate).toLocaleDateString()}
                </DialogTitle>
              </DialogHeader>
              {hasCadetFilter && selectedCadet ? (
                <div className="text-sm">
                  <p className="mb-2">
                    Overall attendance rate for this session: <strong>{drillDownSessionPercent ?? "—"}%</strong>
                  </p>
                  {missedCadets.length === 0 ? (
                    <p className="text-muted-foreground">{selectedCadet.name} was present.</p>
                  ) : (
                    <p>
                      Status: <Badge variant="destructive">{missedCadets[0]?.memoStatus}</Badge>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <p>
                    Overall attendance rate: <strong>{drillDownSessionPercent ?? "—"}%</strong>
                  </p>
                  {missedCadets.length === 0 ? (
                    <p className="text-muted-foreground">No absences or lates recorded for this session.</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto rounded-md border border-input">
                      <Table aria-label="Cadets who missed this session">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cadet</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Memo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {missedCadets.map((row) => (
                            <TableRow key={row.cadet.id}>
                              <TableCell>{row.cadet.name}</TableCell>
                              <TableCell>{row.cadet.flight ?? row.cadet.group ?? "—"}</TableCell>
                              <TableCell>
                                <StatusDot status={row.status} />
                              </TableCell>
                              <TableCell>
                                <Badge variant={row.memoStatus === "Accepted" ? "success" : row.memoStatus.includes("overdue") || row.memoStatus === "Rejected" ? "destructive" : "secondary"}>
                                  {row.memoStatus}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusDot({ status }: { status: Attendance["status"] }) {
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

function StandingBadge({ standing }: { standing: "Good" | "Warning" | "Hard Limit" }) {
  const variant = standing === "Good" ? "success" : standing === "Warning" ? "warning" : "destructive";
  return <Badge variant={variant}>{standing}</Badge>;
}
