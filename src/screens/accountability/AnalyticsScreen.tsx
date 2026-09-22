import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Line, LineChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart2, TrendingUp, Scale, PieChart, Table2, Users, Gauge, TriangleAlert, CalendarDays, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { PMT_EVENT_TYPES, FLIGHTS, GROUPS, deriveClass, bucketForEventType, type PmtEventType, type Flight, type Group } from "../../domain/constants";
import { computeCadetAttendanceSummary, computeCombinedPercent, absencesRemainingForGoodStanding, type BucketTally } from "../../domain/attendance";
import {
  computeSessionTrend,
  computeCadetSessionTrend,
  computeUnitComparison,
  computeStandingDistribution,
  unitOfAxis,
  type TrendBucket,
  type UnitAxis,
} from "../../domain/accountabilityAnalytics";
import { compareByLastName } from "../../domain/nameUtils";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { exportAttendanceData } from "../../lib/exportAttendanceData";
import type { Attendance, PmtEvent, Cadet } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
}

const chartMargin = { top: 8, right: 16, bottom: 8, left: 8 };

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

/**
 * One bucket's numbers for a single selected cadet -- present/total (AE counts as present),
 * attendance %, and (for PT/LLAB-FM, which carry a Good-standing threshold) standing and how many
 * more unexcused absences they could take before dropping out of Good. `hasThreshold: false` (the
 * D&C/"Other" bucket) drops the standing badge and the absences-left tile, since neither applies.
 */
function CadetBucketStats({ label, tally, hasThreshold = true }: { label: string; tally: BucketTally; hasThreshold?: boolean }) {
  const presentCount = tally.statusCounts.P + tally.statusCounts.AE;
  const absencesLeft = hasThreshold ? absencesRemainingForGoodStanding(tally) : undefined;
  return (
    <div className="rounded-md border border-input p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hasThreshold && (tally.standing ? <StandingBadge standing={tally.standing} /> : <span className="text-xs text-muted-foreground">No data yet</span>)}
      </div>
      <div className={cn("grid gap-2 text-center", hasThreshold ? "grid-cols-3" : "grid-cols-2")}>
        <div>
          <div className="text-lg font-semibold tabular-nums">
            {tally.countedEvents === 0 ? "—" : `${presentCount}/${tally.countedEvents}`}
          </div>
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
  { value: "class", label: "Class" },
];

const CLASS_OPTIONS = ["POC", "GMC"] as const;
type ClassFilter = (typeof CLASS_OPTIONS)[number];

function pct(n: number | undefined): string {
  return n === undefined ? "—" : `${Math.round(n * 100)}%`;
}

export function AnalyticsScreen({ roster, events, attendance }: Props) {
  // Master filters -- these apply to every chart/table below. Where a filter makes a particular
  // view meaningless (e.g. a PT-vs-LLAB/FM comparison while a single PMT type is selected), that
  // view is hidden with an explanatory note rather than rendered broken or misleading.
  const [masterCadetId, setMasterCadetId] = useState<string>(ALL_CADETS);
  const [masterFlight, setMasterFlight] = useState<Flight | "All">("All");
  const [masterGroup, setMasterGroup] = useState<Group | "All">("All");
  const [masterClass, setMasterClass] = useState<ClassFilter | "All">("All");
  const [masterPmtType, setMasterPmtType] = useState<PmtEventType | "All">("All");
  const [axis, setAxis] = useState<UnitAxis>("flight");
  const [exporting, setExporting] = useState(false);

  const activeRoster = useMemo(() => roster.filter((p) => p.status === "Active"), [roster]);
  const sortedActiveRoster = useMemo(() => [...activeRoster].sort((a, b) => compareByLastName(a.name, b.name)), [activeRoster]);
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const hasCadetFilter = masterCadetId !== ALL_CADETS;

  // Only one of the five master filters can be active at a time -- picking any one clears all the
  // others, and the last one picked is what takes effect.
  const setExclusiveFilter = (which: "cadet" | "flight" | "group" | "class" | "pmtType", value: string) => {
    setMasterCadetId(which === "cadet" ? value : ALL_CADETS);
    setMasterFlight(which === "flight" ? (value as Flight | "All") : "All");
    setMasterGroup(which === "group" ? (value as Group | "All") : "All");
    setMasterClass(which === "class" ? (value as ClassFilter | "All") : "All");
    setMasterPmtType(which === "pmtType" ? (value as PmtEventType | "All") : "All");
  };

  // Roster narrowed by Flight/Group/Class -- feeds every roster-based chart. The individual-cadet
  // filter is handled separately per-chart since it changes *which* computation runs, not just
  // which rows are included.
  const filteredRoster = useMemo(
    () =>
      sortedActiveRoster
        .filter((p) => masterFlight === "All" || p.flight === masterFlight)
        .filter((p) => masterGroup === "All" || p.group === masterGroup)
        .filter((p) => masterClass === "All" || deriveClass(p.asClass, p.isCadre) === masterClass),
    [sortedActiveRoster, masterFlight, masterGroup, masterClass]
  );

  const statsRoster = useMemo(
    () => filteredRoster.filter((p) => !hasCadetFilter || p.id === masterCadetId),
    [filteredRoster, hasCadetFilter, masterCadetId]
  );
  const statsEvents = useMemo(
    () => (masterPmtType === "All" ? events : events.filter((e) => e.eventType === masterPmtType)),
    [events, masterPmtType]
  );

  const trendBucket: TrendBucket = masterPmtType === "All" ? "ALL" : bucketForEventType(masterPmtType);

  const trend = useMemo(
    () =>
      hasCadetFilter
        ? computeCadetSessionTrend(trendBucket, masterCadetId, attendance, events)
        : computeSessionTrend(trendBucket, filteredRoster, attendance, events),
    [trendBucket, hasCadetFilter, masterCadetId, filteredRoster, attendance, events]
  );
  const trendData = useMemo(() => {
    const mapped = trend.map((t) => ({
      ...t,
      dateLabel: new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      percentPct: t.percent === undefined ? null : Math.round(t.percent * 100),
    }));
    // Cut the line at the last PMT that has actually passed as of today -- don't stretch the
    // chart out through future/unscheduled sessions that haven't happened yet.
    const now = Date.now();
    const cutoffIndex = mapped.reduce((last, point, i) => (new Date(point.date).getTime() <= now ? i : last), -1);
    return mapped.slice(0, cutoffIndex + 1);
  }, [trend]);

  // The PT-vs-LLAB/FM comparison and standing-distribution charts both inherently split their data
  // into a PT series and an LLAB/FM series across multiple units/cadets -- neither means anything
  // once the PMT-type filter has already narrowed the data to one type, or once the cadet filter
  // has narrowed the view to one person (nothing left to compare "by unit"). The cadet-filter case
  // isn't actually hidden, though -- each card swaps in that one cadet's own numbers instead (see
  // the `hasCadetFilter` branches below).
  const showComparison = !hasCadetFilter && masterPmtType === "All";
  const showDistribution = !hasCadetFilter && masterPmtType === "All";

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

  // The one selected cadet's own numbers -- shown in place of the by-unit comparison/distribution
  // charts, which have nothing left to compare/split once the view is narrowed to one person.
  const selectedCadet = useMemo(() => (hasCadetFilter ? roster.find((p) => p.id === masterCadetId) : undefined), [hasCadetFilter, roster, masterCadetId]);
  const selectedCadetSummary = useMemo(
    () => (hasCadetFilter ? computeCadetAttendanceSummary(masterCadetId, attendance, pmtEventsById) : undefined),
    [hasCadetFilter, masterCadetId, attendance, pmtEventsById]
  );

  const cohortCombinedPercent = useMemo(() => {
    const percents = statsRoster.map((p) => computeCombinedPercent(p.id, attendance, pmtEventsById)).filter((n): n is number => n !== undefined);
    return percents.length === 0 ? undefined : percents.reduce((a, b) => a + b, 0) / percents.length;
  }, [statsRoster, attendance, pmtEventsById]);
  // Unique cadets flagged (below Good in at least one bucket) -- deliberately mirrors the
  // Dashboard's own flaggedCount exactly (same per-cadet OR check), not a sum of the distribution
  // chart's per-bucket counts, which would double-count anyone below Good in both PT and LLAB/FM.
  const belowGoodCount = useMemo(
    () =>
      statsRoster.filter((p) => {
        const summary = computeCadetAttendanceSummary(p.id, attendance, pmtEventsById);
        return summary.pt.standing !== "Good" || summary.llabFm.standing !== "Good";
      }).length,
    [statsRoster, attendance, pmtEventsById]
  );

  // The master table renders one column per PMT occurrence of a single event type -- there's no
  // sensible way to lay out "every type at once" as columns, so it only renders once a specific
  // type is chosen via the master filter.
  const showTable = masterPmtType !== "All";
  const tableBucket = showTable ? bucketForEventType(masterPmtType) : undefined;
  const tableEvents = useMemo(
    () => (showTable ? events.filter((e) => e.eventType === masterPmtType).sort((a, b) => a.eventDate.localeCompare(b.eventDate)) : []),
    [events, masterPmtType, showTable]
  );
  const tableRoster = useMemo(() => filteredRoster.filter((c) => !hasCadetFilter || c.id === masterCadetId), [filteredRoster, hasCadetFilter, masterCadetId]);
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
          Analytics
        </h2>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4" />
          {exporting ? "Exporting..." : "Export to Excel"}
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3">
        <span className="text-xs font-medium text-muted-foreground">Filter (only one at a time -- the last one picked wins):</span>
        <CadetFilterCombobox
          roster={sortedActiveRoster}
          value={masterCadetId}
          onChange={(v) => setExclusiveFilter("cadet", v)}
          allLabel="All cadets"
        />
        <Select value={masterFlight} onValueChange={(v) => setExclusiveFilter("flight", v)}>
          <SelectTrigger className="w-28">
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
          <SelectTrigger className="w-28">
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
          <SelectTrigger className="w-28">
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
        <Select value={masterPmtType} onValueChange={(v) => setExclusiveFilter("pmtType", v)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="PMT type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All PMT types</SelectItem>
            {PMT_EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
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
          value={String(belowGoodCount)}
          tone={belowGoodCount > 0 ? "critical" : undefined}
          index={2}
        />
        <StatTile icon={<CalendarDays className="h-4.5 w-4.5" />} label="PMT sessions tracked" value={String(statsEvents.length)} index={3} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Card>
            <CardHeader>
              <CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
                Attendance trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions in this filter yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trendData} margin={chartMargin}>
                    <CartesianGrid stroke="var(--chart-grid)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--chart-axis)" }}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                      formatter={(value, _name, item) => [
                        value === null
                          ? "no data"
                          : hasCadetFilter
                            ? `${value}% cumulative`
                            : `${value}% (${item.payload.countedCadets} cadets)`,
                        item.payload.label,
                      ]}
                    />
                    <Line type="monotone" dataKey="percentPct" stroke="var(--chart-series-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                <Scale className="h-4 w-4 text-primary" />
                {hasCadetFilter && selectedCadet ? `PT vs LLAB/FM for ${selectedCadet.name}` : "PT vs LLAB/FM by unit"}
              </CardTitle>
              {showComparison && (
                <Select value={axis} onValueChange={(v) => setAxis(v as UnitAxis)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AXIS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardHeader>
            <CardContent>
              {!showComparison ? (
                hasCadetFilter && selectedCadetSummary ? (
                  <div className="space-y-3">
                    <CadetBucketStats label="PT" tally={selectedCadetSummary.pt} />
                    <CadetBucketStats label="LLAB/FM" tally={selectedCadetSummary.llabFm} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Hidden -- this compares PT against LLAB/FM, which doesn't apply once a specific PMT type is filtered.
                  </p>
                )
              ) : comparisonData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No units to compare.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={comparisonData} margin={chartMargin}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="unit" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ptPct" name="PT" fill="var(--chart-series-1)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="llabFmPct" name="LLAB/FM" fill="var(--chart-series-3)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <PieChart className="h-4 w-4 text-primary" />
              {hasCadetFilter && selectedCadet ? `Standing for ${selectedCadet.name}` : "Standing distribution (active cadets)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showDistribution ? (
              hasCadetFilter && selectedCadetSummary ? (
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  Hidden -- this splits standing counts between PT and LLAB/FM, which doesn't apply once a specific PMT type is filtered.
                </p>
              )
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={distribution} margin={chartMargin}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="standing" tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                  <YAxis tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ptCount" name="PT" fill="var(--chart-series-1)" radius={[3, 3, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="llabFmCount" name="LLAB/FM" fill="var(--chart-series-3)" radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
        <Card>
          <CardHeader>
            <CardTitle>
              <Table2 className="h-4 w-4 text-primary" />
              Master attendance table
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showTable ? (
              <p className="text-sm text-muted-foreground">Pick a specific PMT type above to view the master attendance table.</p>
            ) : tableEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {masterPmtType} sessions yet.</p>
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
                          <TableCell className="text-center">
                            {standing ? <StandingBadge standing={standing} /> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
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
