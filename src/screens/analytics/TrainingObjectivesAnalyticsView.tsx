import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, BarChart3, TrendingUp, CheckCircle2, Clock, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileFiltersButton } from "@/components/mobile/MobileFiltersButton";
import { PLO_SECTIONS, PLO_SHORT_CODE, FLIGHTS, GROUPS, DEV_LEVELS, GMC_DEV_LEVELS, POC_DEV_LEVELS, deriveClass, type DevLevel, type Flight, type Group, type PloSection } from "../../domain/constants";
import { computeCohortSummary, computeCompletionByPlo, computeOverdueObjectives, computeMissingObjectivesByCadet, crosstabCellFor, type PloCompletionRow } from "../../domain/analytics";
import { groupByPlo } from "../../domain/objectiveGrouping";
import { SIX_ONE_PARENT_ID, computeSixOneRollup } from "../../domain/sixOneRollup";
import { compareByLastName, formatCadetNameCompact } from "../../domain/nameUtils";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { CadetObjectiveTimelineTable } from "../../components/CadetObjectiveTimelineTable";
import { LiquidToggle } from "../../components/analytics/LiquidToggle";
import type { UnitScope } from "../../domain/access";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../../domain/types";

interface Props {
  cadets: Cadet[];
  catalog: TrainingObjective[];
  completions: Completion[];
  pmtEvents: PmtEvent[];
  /** Restricts the Class filter's options too -- a POC- or GMC-only commander shouldn't see the other cohort's dev levels as choices, since they can't see those cadets anyway. Defaults to every dev level (full access). */
  availableDevLevels?: readonly DevLevel[];
  /** A Flight/Group Commander only gets the Cadet filter -- Flight/Group selects hide entirely (Section A3). Defaults to unscoped for callers that don't pass it. */
  unitScope?: UnitScope;
  /** Lifted up to AnalyticsApp so the Flight/Group/Cadet selection survives switching between the Accountability/Training Objectives/Memorandums sub-tabs. */
  flightFilter: Flight | "All";
  onFlightFilterChange: (v: Flight | "All") => void;
  groupFilter: Group | "All";
  onGroupFilterChange: (v: Group | "All") => void;
  cadetFilter: string;
  onCadetFilterChange: (v: string) => void;
}

function StatTile({
  icon,
  label,
  value,
  valueClassName,
  tone,
  index,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Overrides the value's default text-xl (phone) / text-2xl (desktop) size -- e.g. the Ratio tile's fraction needs to shrink a step to fit the box. */
  valueClassName?: string;
  tone?: "critical";
  index: number;
  onClick?: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }}>
      <Card
        className={cn(onClick && "cursor-pointer transition-shadow hover:shadow-md")}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      >
        {/* Phone: just the number over its label, no icon circle, 4 fit side by side (see the grid below). Desktop is unchanged. */}
        <CardContent className="hidden flex-col items-center gap-0 py-3 text-center phone:flex">
          <div className={cn("truncate text-xl font-semibold tabular-nums", tone === "critical" && "text-destructive", valueClassName)}>{value}</div>
          <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
        </CardContent>
        <CardContent className="flex items-center gap-3 phone:hidden">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              tone === "critical" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className={cn("truncate text-2xl font-semibold tabular-nums", tone === "critical" && "text-destructive", valueClassName)}>{value}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const chartMargin = { top: 8, right: 16, bottom: 8, left: 8 };

const COHORT_OPTIONS = ["POC", "GMC"] as const;
type CohortFilter = (typeof COHORT_OPTIONS)[number];

/** Section 6b -- same Cadet/Flight/Group exclusive-filter bar as Accountability Analytics, plus this screen's own Class (Dev Level) and PLO filters, all of which now feed every chart below. */
export function TrainingObjectivesAnalyticsView({
  cadets,
  catalog,
  completions,
  pmtEvents,
  availableDevLevels = DEV_LEVELS,
  unitScope,
  flightFilter,
  onFlightFilterChange,
  groupFilter,
  onGroupFilterChange,
  cadetFilter,
  onCadetFilterChange,
}: Props) {
  // "gmc" (all 4 flights, e.g. Montalvo) and "group-and-gmc" (one group PLUS all 4 flights, e.g.
  // Santiago) genuinely span multiple flights, so the Flight select stays meaningful for them --
  // only "flight"/"group" scopes (a single fixed value either way) hide it. "group-and-gmc" ALSO
  // needs a way back to just their own group (otherwise there's no way to see TRG-only, only
  // "everything" or one flight at a time) -- so Group stays visible for them too, restricted to
  // their one group as a two-option All/TRG switch.
  const hideGroupFilter = unitScope !== undefined && unitScope.kind !== "all" && unitScope.kind !== "group-and-gmc";
  const hideFlightFilter = unitScope !== undefined && (unitScope.kind === "flight" || unitScope.kind === "group");
  const scopedGroupOptions = unitScope?.kind === "group-and-gmc" ? [unitScope.group] : GROUPS;
  const [cohortFilter, setCohortFilter] = useState<CohortFilter | "All">("All");
  const [devLevelFilter, setDevLevelFilter] = useState<DevLevel | "All">("All");
  const [ploFilter, setPloFilter] = useState<string>("All");

  /** Switching Cohort resets Dev Level if it no longer applies (e.g. GMC selected while Dev Level was still SCL) instead of silently showing zero cadets. */
  const handleCohortChange = (v: string) => {
    const next = v as CohortFilter | "All";
    setCohortFilter(next);
    const validLevels = next === "All" ? DEV_LEVELS : next === "POC" ? POC_DEV_LEVELS : GMC_DEV_LEVELS;
    if (devLevelFilter !== "All" && !(validLevels as readonly DevLevel[]).includes(devLevelFilter)) setDevLevelFilter("All");
  };

  const devLevelOptions = useMemo(() => {
    const validLevels = cohortFilter === "All" ? DEV_LEVELS : cohortFilter === "POC" ? POC_DEV_LEVELS : GMC_DEV_LEVELS;
    return availableDevLevels.filter((lvl) => (validLevels as readonly DevLevel[]).includes(lvl));
  }, [availableDevLevels, cohortFilter]);

  // A viewer already scoped to just one cohort (e.g. a POC Group Commander) never has the other
  // cohort's cadets to begin with -- no point offering a Cohort choice that always shows nothing.
  const availableCohorts = useMemo(
    () =>
      COHORT_OPTIONS.filter((c) => {
        const validLevels = c === "POC" ? POC_DEV_LEVELS : GMC_DEV_LEVELS;
        return availableDevLevels.some((lvl) => (validLevels as readonly DevLevel[]).includes(lvl));
      }),
    [availableDevLevels]
  );
  const [cadetView, setCadetView] = useState<"crosstab" | "timeline">("crosstab");

  const setExclusiveFilter = (which: "cadet" | "flight" | "group", value: string) => {
    onCadetFilterChange(which === "cadet" ? value : ALL_CADETS);
    onFlightFilterChange(which === "flight" ? (value as Flight | "All") : "All");
    onGroupFilterChange(which === "group" ? (value as Group | "All") : "All");
  };

  const filteredCadets = useMemo(
    () =>
      cadets
        .filter((c) => cohortFilter === "All" || deriveClass(c.asClass, c.isCadre) === cohortFilter)
        .filter((c) => devLevelFilter === "All" || c.devLevel === devLevelFilter)
        .filter((c) => flightFilter === "All" || c.flight === flightFilter)
        .filter((c) => groupFilter === "All" || c.group === groupFilter)
        .filter((c) => cadetFilter === ALL_CADETS || c.id === cadetFilter),
    [cadets, cohortFilter, devLevelFilter, flightFilter, groupFilter, cadetFilter]
  );
  const filteredCatalog = useMemo(() => (ploFilter === "All" ? catalog : catalog.filter((o) => o.plo === ploFilter)), [catalog, ploFilter]);

  const summary = useMemo(() => computeCohortSummary(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);
  const byPlo = useMemo(() => computeCompletionByPlo(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);
  const overdue = useMemo(() => computeOverdueObjectives(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);

  // Overdue Objectives drill-down (Section 5) -- "all" from the stat tile (every overdue instance),
  // an objective id from clicking one row of the per-objective card below (just that objective's).
  const [missingDrillDown, setMissingDrillDown] = useState<string | "all" | undefined>();
  const missingRows = useMemo(() => {
    if (!missingDrillDown) return [];
    return computeMissingObjectivesByCadet(filteredCadets, filteredCatalog, completions, pmtEvents, missingDrillDown === "all" ? undefined : missingDrillDown);
  }, [missingDrillDown, filteredCadets, filteredCatalog, completions, pmtEvents]);

  // Section D: "Completed TO's by Cadet" crosstab -- PLO-grouped columns (spanning header), one row
  // per cadet, sorted the same way as the other cadet views.
  const crosstabPloGroups = useMemo(
    () =>
      groupByPlo(filteredCatalog)
        .map((section) => ({
          plo: section.plo,
          shortCode: PLO_SHORT_CODE[section.plo as PloSection] ?? "",
          objectives: section.subAreas.flatMap((sa) => sa.objectives),
        }))
        .filter((g) => g.objectives.length > 0),
    [filteredCatalog]
  );
  const crosstabCadets = useMemo(() => [...filteredCadets].sort((a, b) => compareByLastName(a.name, b.name)), [filteredCadets]);
  const crosstabCompletionsByCadet = useMemo(() => {
    const map = new Map<string, Completion[]>();
    for (const c of completions) {
      const list = map.get(c.cadetId) ?? [];
      list.push(c);
      map.set(c.cadetId, list);
    }
    return map;
  }, [completions]);

  // PMT Timeline view (Section: moved in from Cadet Detail) -- inherently single-cadet, so it only
  // renders once the Cadet filter above narrows to exactly one person.
  const timelineCadet = useMemo(() => (cadetFilter === ALL_CADETS ? undefined : cadets.find((c) => c.id === cadetFilter)), [cadetFilter, cadets]);
  const timelineCompletions = useMemo(
    () => (timelineCadet ? crosstabCompletionsByCadet.get(timelineCadet.id) ?? [] : []),
    [timelineCadet, crosstabCompletionsByCadet]
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold desktop:text-2xl">TO Analytics</h2>
        {/* Phone: the same filters as the row below, compact and stacked behind this small button instead of shown inline. */}
        <div className="shrink-0 desktop:hidden">
          <MobileFiltersButton>
            <CadetFilterCombobox roster={cadets} value={cadetFilter} onChange={(v) => setExclusiveFilter("cadet", v)} allLabel="All cadets" className="h-8 w-full text-xs" />
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
            {availableCohorts.length > 1 && (
              <Select value={cohortFilter} onValueChange={handleCohortChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Cohort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">POC + GMC</SelectItem>
                  {availableCohorts.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={devLevelFilter} onValueChange={(v) => setDevLevelFilter(v as DevLevel | "All")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Dev Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All dev levels</SelectItem>
                {devLevelOptions.map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>
                    {lvl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ploFilter} onValueChange={setPloFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="PLO section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All PLO sections</SelectItem>
                {PLO_SECTIONS.map((plo) => (
                  <SelectItem key={plo} value={plo}>
                    {plo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MobileFiltersButton>
        </div>
      </div>

      <div className="mb-6 hidden flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3 desktop:flex">
        <CadetFilterCombobox roster={cadets} value={cadetFilter} onChange={(v) => setExclusiveFilter("cadet", v)} allLabel="All cadets" className="w-56" />
        {!hideFlightFilter && (
          <Select value={flightFilter} onValueChange={(v) => setExclusiveFilter("flight", v)}>
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
          <Select value={groupFilter} onValueChange={(v) => setExclusiveFilter("group", v)}>
            <SelectTrigger className="w-40">
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
        {availableCohorts.length > 1 && (
          <Select value={cohortFilter} onValueChange={handleCohortChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Cohort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">POC + GMC</SelectItem>
              {availableCohorts.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={devLevelFilter} onValueChange={(v) => setDevLevelFilter(v as DevLevel | "All")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Dev Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All dev levels</SelectItem>
            {devLevelOptions.map((lvl) => (
              <SelectItem key={lvl} value={lvl}>
                {lvl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ploFilter} onValueChange={setPloFilter}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Filter by PLO section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All PLO sections</SelectItem>
            {PLO_SECTIONS.map((plo) => (
              <SelectItem key={plo} value={plo}>
                {plo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-2 phone:gap-1.5 desktop:gap-4">
        <StatTile icon={<TrendingUp className="h-4.5 w-4.5" />} label="Overall" value={`${summary.overallPercent}%`} index={0} />
        <StatTile
          icon={<CheckCircle2 className="h-4.5 w-4.5" />}
          label="Ratio"
          value={`${summary.totalCompleted}/${summary.totalRequired}`}
          valueClassName="text-sm desktop:text-base"
          index={1}
        />
        <StatTile
          icon={<AlertTriangle className="h-4.5 w-4.5" />}
          label="Flags"
          value={String(summary.flaggedCount)}
          tone={summary.flaggedCount > 0 ? "critical" : undefined}
          index={2}
        />
        <StatTile
          icon={<Clock className="h-4.5 w-4.5" />}
          label="Overdue"
          value={String(summary.overdueInstances)}
          tone={summary.overdueInstances > 0 ? "critical" : undefined}
          index={3}
          onClick={summary.overdueInstances > 0 ? () => setMissingDrillDown("all") : undefined}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <ListOrdered className="h-4 w-4 text-primary" />
              Completion % by PLO section
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byPlo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, byPlo.length * 34)}>
                <BarChart data={byPlo} layout="vertical" margin={chartMargin}>
                  <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} unit="%" />
                  <YAxis type="category" dataKey="plo" width={140} tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                    formatter={(value, _name, item) => {
                      const row = item.payload as PloCompletionRow;
                      return [`${value}% (${row.completedCount}/${row.requiredCount})`, "Completion"];
                    }}
                  />
                  <Bar dataKey="percent" radius={[0, 4, 4, 0]} maxBarSize={22} fill="var(--chart-series-3)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Overdue objectives
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing overdue right now.</p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {overdue.map((row) => (
                  <button
                    key={row.objectiveId}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-muted/50"
                    onClick={() => setMissingDrillDown(row.objectiveId)}
                  >
                    <span className="truncate" title={row.title}>
                      <Badge variant="outline" className="mr-1.5">
                        {row.number}
                      </Badge>
                      {row.title}
                    </span>
                    <span className="shrink-0 font-medium text-destructive">
                      {row.overdueCount} cadet{row.overdueCount === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="mb-1 flex-row items-center justify-between space-y-0">
          <CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
            {cadetView === "crosstab" ? "Completed TO's by Cadet" : "PMT Timeline"}
          </CardTitle>
          <LiquidToggle
            layoutId="cadet-view-toggle"
            options={[
              { value: "crosstab", label: "C-TO's" },
              { value: "timeline", label: "PMT-T" },
            ]}
            value={cadetView}
            onChange={(v) => setCadetView(v as typeof cadetView)}
          />
        </CardHeader>
        <CardContent className="pt-1">
          {cadetView === "crosstab" ? (
            crosstabCadets.length === 0 || crosstabPloGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cadets or objectives match this filter.</p>
            ) : (
              <div className="max-h-[32rem] overflow-auto rounded-md border border-input">
                <Table aria-label="Completed Training Objectives by cadet">
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2} className="sticky left-0 top-0 z-20 h-auto min-w-28 bg-background px-2 py-1 align-bottom text-xs">
                        Cadet
                      </TableHead>
                      {crosstabPloGroups.map((group) => (
                        <TableHead
                          key={group.plo}
                          colSpan={group.objectives.length}
                          className="sticky top-0 z-10 h-5 border-l border-input bg-muted px-1 py-0.5 text-center text-[10px] leading-tight"
                        >
                          {group.plo}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow>
                      {crosstabPloGroups.flatMap((group) =>
                        group.objectives.map((objective, i) => (
                          <TableHead
                            key={objective.id}
                            title={objective.title}
                            className={cn(
                              "sticky top-5 z-10 h-5 min-w-11 whitespace-nowrap bg-background px-1 py-0.5 text-center text-[10px] font-medium leading-tight",
                              i === 0 && "border-l border-input"
                            )}
                          >
                            {group.shortCode} {objective.number}
                          </TableHead>
                        ))
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crosstabCadets.map((cadet) => (
                      <TableRow key={cadet.id}>
                        <TableCell className="sticky left-0 z-10 h-5 whitespace-nowrap bg-background px-2 py-0.5 text-xs">{formatCadetNameCompact(cadet)}</TableCell>
                        {crosstabPloGroups.flatMap((group) =>
                          group.objectives.map((objective, i) => {
                            const cell = !cadet.devLevel
                              ? undefined
                              : objective.id === SIX_ONE_PARENT_ID
                                ? computeSixOneRollup(filteredCatalog, cadet.devLevel, crosstabCompletionsByCadet.get(cadet.id) ?? [])
                                : crosstabCellFor(objective, cadet.devLevel, crosstabCompletionsByCadet.get(cadet.id) ?? []);
                            return (
                              <TableCell
                                key={objective.id}
                                title={objective.title}
                                className={cn(
                                  "h-5 whitespace-nowrap px-1 py-0.5 text-center text-[11px]",
                                  i === 0 && "border-l border-input",
                                  cell?.status === "complete" && "bg-success text-success-foreground font-medium",
                                  cell?.status === "partial" && "bg-warning text-warning-foreground font-medium",
                                  (cell?.status === "incomplete" || cell?.status === "notCovered") && "bg-destructive text-destructive-foreground font-medium",
                                  cell?.status === "not-applicable" && "bg-foreground text-background font-medium"
                                )}
                              >
                                {/* Not Covered is folded into INC here too -- same red marker, no proficiency level, whether it's a genuine not-yet-met grade or an absence on a presence-based objective. Not-applicable (never evaluated at this cadet's level) is a solid black box with no text, distinct from a blank "applicable but nothing logged yet" cell only by its fill color. */}
                                {cell
                                  ? cell.status === "not-applicable"
                                    ? ""
                                    : cell.status === "incomplete" || cell.status === "notCovered"
                                      ? "INC"
                                      : cell.status === "partial"
                                        ? `PC-${cell.code}`
                                        : `C-${cell.code}`
                                  : ""}
                              </TableCell>
                            );
                          })
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : !timelineCadet ? (
            <p className="text-sm text-muted-foreground">Select a single cadet above (Cadet filter) to view their PMT Timeline.</p>
          ) : (
            <CadetObjectiveTimelineTable
              cadet={timelineCadet}
              objectives={filteredCatalog}
              pmtEvents={pmtEvents}
              cadetCompletions={timelineCompletions}
              overdueOnly={false}
              onOpenObjective={() => {}}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!missingDrillDown} onOpenChange={(open) => !open && setMissingDrillDown(undefined)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {missingDrillDown && missingDrillDown !== "all"
                ? `Missing: ${overdue.find((r) => r.objectiveId === missingDrillDown)?.number ?? ""} ${overdue.find((r) => r.objectiveId === missingDrillDown)?.title ?? ""}`
                : "Every overdue objective-instance"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[28rem] overflow-y-auto">
            <Table aria-label="Cadets missing a Training Objective">
              <TableHeader>
                <TableRow>
                  <TableHead>Cadet</TableHead>
                  <TableHead>Dev Level</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Missing TO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingRows.map(({ cadet, objective }) => (
                  <TableRow key={`${cadet.id}-${objective.id}`}>
                    <TableCell>{formatCadetNameCompact(cadet)}</TableCell>
                    <TableCell>{cadet.devLevel ?? "—"}</TableCell>
                    <TableCell>{cadet.group ?? cadet.flight ?? "—"}</TableCell>
                    <TableCell>
                      {PLO_SHORT_CODE[objective.plo as PloSection] ?? ""} - {objective.number}
                    </TableCell>
                  </TableRow>
                ))}
                {missingRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nothing missing.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
