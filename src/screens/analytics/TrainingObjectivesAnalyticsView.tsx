import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertTriangle, BarChart3, TrendingUp, CheckCircle2, Clock, ListOrdered, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLO_SECTIONS, PLO_SHORT_CODE, FLIGHTS, GROUPS, DEV_LEVELS, GMC_DEV_LEVELS, POC_DEV_LEVELS, deriveClass, type DevLevel, type Flight, type Group, type PloSection } from "../../domain/constants";
import { computeCohortSummary, computeCompletionByPlo, computeOverdueObjectives, crosstabCellFor, type PloCompletionRow } from "../../domain/analytics";
import { groupByPlo } from "../../domain/objectiveGrouping";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { CadetObjectiveTimelineTable } from "../../components/CadetObjectiveTimelineTable";
import { Stepper } from "../../components/analytics/Stepper";
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
}

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

const chartMargin = { top: 8, right: 16, bottom: 8, left: 8 };

const COHORT_OPTIONS = ["POC", "GMC"] as const;
type CohortFilter = (typeof COHORT_OPTIONS)[number];

/** Section 6b -- same Cadet/Flight/Group exclusive-filter bar as Accountability Analytics, plus this screen's own Class (Dev Level) and PLO filters, all of which now feed every chart below. */
export function TrainingObjectivesAnalyticsView({ cadets, catalog, completions, pmtEvents, availableDevLevels = DEV_LEVELS, unitScope }: Props) {
  const hideUnitFilters = unitScope !== undefined && unitScope.kind !== "all";
  const [masterCadetId, setMasterCadetId] = useState<string>(ALL_CADETS);
  const [masterFlight, setMasterFlight] = useState<Flight | "All">("All");
  const [masterGroup, setMasterGroup] = useState<Group | "All">("All");
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
    setMasterCadetId(which === "cadet" ? value : ALL_CADETS);
    setMasterFlight(which === "flight" ? (value as Flight | "All") : "All");
    setMasterGroup(which === "group" ? (value as Group | "All") : "All");
  };

  const filteredCadets = useMemo(
    () =>
      cadets
        .filter((c) => cohortFilter === "All" || deriveClass(c.asClass, c.isCadre) === cohortFilter)
        .filter((c) => devLevelFilter === "All" || c.devLevel === devLevelFilter)
        .filter((c) => masterFlight === "All" || c.flight === masterFlight)
        .filter((c) => masterGroup === "All" || c.group === masterGroup)
        .filter((c) => masterCadetId === ALL_CADETS || c.id === masterCadetId),
    [cadets, cohortFilter, devLevelFilter, masterFlight, masterGroup, masterCadetId]
  );
  const filteredCatalog = useMemo(() => (ploFilter === "All" ? catalog : catalog.filter((o) => o.plo === ploFilter)), [catalog, ploFilter]);

  const summary = useMemo(() => computeCohortSummary(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);
  const byPlo = useMemo(() => computeCompletionByPlo(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);
  const overdue = useMemo(() => computeOverdueObjectives(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);

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
  const timelineCadet = useMemo(() => (masterCadetId === ALL_CADETS ? undefined : cadets.find((c) => c.id === masterCadetId)), [masterCadetId, cadets]);
  const timelineCompletions = useMemo(
    () => (timelineCadet ? crosstabCompletionsByCadet.get(timelineCadet.id) ?? [] : []),
    [timelineCadet, crosstabCompletionsByCadet]
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <GraduationCap className="h-5 w-5 text-primary" />
          Training Objectives Analytics
        </h2>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3">
        <CadetFilterCombobox roster={cadets} value={masterCadetId} onChange={(v) => setExclusiveFilter("cadet", v)} allLabel="All cadets" className="w-56" />
        {!hideUnitFilters && (
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
        )}
        {!hideUnitFilters && (
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

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon={<TrendingUp className="h-4.5 w-4.5" />} label="Overall completion" value={`${summary.overallPercent}%`} index={0} />
        <StatTile icon={<CheckCircle2 className="h-4.5 w-4.5" />} label="Required / completed" value={`${summary.totalCompleted}/${summary.totalRequired}`} index={1} />
        <StatTile
          icon={<AlertTriangle className="h-4.5 w-4.5" />}
          label="Cadets flagged"
          value={String(summary.flaggedCount)}
          tone={summary.flaggedCount > 0 ? "critical" : undefined}
          index={2}
        />
        <StatTile
          icon={<Clock className="h-4.5 w-4.5" />}
          label="Overdue objective-instances"
          value={String(summary.overdueInstances)}
          tone={summary.overdueInstances > 0 ? "critical" : undefined}
          index={3}
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
                  <div key={row.objectiveId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate" title={row.title}>
                      <Badge variant="outline" className="mr-1.5">
                        {row.number}
                      </Badge>
                      {row.title}
                    </span>
                    <span className="shrink-0 font-medium text-destructive">
                      {row.overdueCount} cadet{row.overdueCount === 1 ? "" : "s"}
                    </span>
                  </div>
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
          <Stepper
            options={[
              { value: "crosstab", label: "Completed TO's" },
              { value: "timeline", label: "PMT Timeline" },
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
                              "sticky top-5 z-10 h-5 min-w-9 bg-background px-1 py-0.5 text-center text-[10px] font-medium leading-tight",
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
                        <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background px-2 py-0.5 text-xs">{formatCadetName(cadet)}</TableCell>
                        {crosstabPloGroups.flatMap((group) =>
                          group.objectives.map((objective, i) => {
                            const cell = cadet.devLevel
                              ? crosstabCellFor(objective, cadet.devLevel, crosstabCompletionsByCadet.get(cadet.id) ?? [])
                              : undefined;
                            return (
                              <TableCell
                                key={objective.id}
                                title={objective.title}
                                className={cn(
                                  "px-1 py-0.5 text-center text-[11px]",
                                  i === 0 && "border-l border-input",
                                  cell?.status === "complete" && "bg-success text-success-foreground font-medium",
                                  cell?.status === "partial" && "bg-warning text-warning-foreground font-medium",
                                  cell?.status === "incomplete" && "bg-destructive text-destructive-foreground font-medium",
                                  cell?.status === "notCovered" && "text-muted-foreground italic"
                                )}
                              >
                                {cell
                                  ? cell.status === "notCovered"
                                    ? "Not Covered"
                                    : cell.status === "incomplete"
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
    </div>
  );
}
