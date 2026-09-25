import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertTriangle, Table2, BarChart3, TrendingUp, CheckCircle2, Clock, ListOrdered, GraduationCap, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLO_SECTIONS, FLIGHTS, GROUPS, DEV_LEVELS, type DevLevel, type Flight, type Group } from "../../domain/constants";
import { computeCohortSummary, computeCompletionByCadet, computeCompletionByPlo, computeOverdueObjectives, type CadetCompletionRow, type PloCompletionRow } from "../../domain/analytics";
import { CadetFilterCombobox, ALL_CADETS } from "../../components/accountability/CadetFilterCombobox";
import { exportTrainingData } from "../../lib/exportTrainingData";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../../domain/types";

interface Props {
  cadets: Cadet[];
  catalog: TrainingObjective[];
  completions: Completion[];
  pmtEvents: PmtEvent[];
  /** Restricts the Class filter's options too -- a POC- or GMC-only commander shouldn't see the other cohort's dev levels as choices, since they can't see those cadets anyway. Defaults to every dev level (full access). */
  availableDevLevels?: readonly DevLevel[];
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

/** Section 6b -- same Cadet/Flight/Group exclusive-filter bar as Accountability Analytics, plus this screen's own Class (Dev Level) and PLO filters, all of which now feed every chart below. */
export function TrainingObjectivesAnalyticsView({ cadets, catalog, completions, pmtEvents, availableDevLevels = DEV_LEVELS }: Props) {
  const [masterCadetId, setMasterCadetId] = useState<string>(ALL_CADETS);
  const [masterFlight, setMasterFlight] = useState<Flight | "All">("All");
  const [masterGroup, setMasterGroup] = useState<Group | "All">("All");
  const [devLevelFilter, setDevLevelFilter] = useState<DevLevel | "All">("All");
  const [ploFilter, setPloFilter] = useState<string>("All");
  const [cadetTableView, setCadetTableView] = useState(false);
  const [exporting, setExporting] = useState(false);

  const setExclusiveFilter = (which: "cadet" | "flight" | "group", value: string) => {
    setMasterCadetId(which === "cadet" ? value : ALL_CADETS);
    setMasterFlight(which === "flight" ? (value as Flight | "All") : "All");
    setMasterGroup(which === "group" ? (value as Group | "All") : "All");
  };

  const filteredCadets = useMemo(
    () =>
      cadets
        .filter((c) => devLevelFilter === "All" || c.devLevel === devLevelFilter)
        .filter((c) => masterFlight === "All" || c.flight === masterFlight)
        .filter((c) => masterGroup === "All" || c.group === masterGroup)
        .filter((c) => masterCadetId === ALL_CADETS || c.id === masterCadetId),
    [cadets, devLevelFilter, masterFlight, masterGroup, masterCadetId]
  );
  const filteredCatalog = useMemo(() => (ploFilter === "All" ? catalog : catalog.filter((o) => o.plo === ploFilter)), [catalog, ploFilter]);

  const summary = useMemo(() => computeCohortSummary(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);
  const byCadet = useMemo(() => computeCompletionByCadet(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);
  const byPlo = useMemo(() => computeCompletionByPlo(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);
  const overdue = useMemo(() => computeOverdueObjectives(filteredCadets, filteredCatalog, completions, pmtEvents), [filteredCadets, filteredCatalog, completions, pmtEvents]);

  const cadetChartHeight = Math.max(200, byCadet.length * 28);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportTrainingData(cadets, catalog, completions, pmtEvents);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <GraduationCap className="h-5 w-5 text-primary" />
          Training Objectives Analytics
        </h2>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4" />
          {exporting ? "Exporting..." : "Export to Excel"}
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3">
        <CadetFilterCombobox roster={cadets} value={masterCadetId} onChange={(v) => setExclusiveFilter("cadet", v)} allLabel="All cadets" className="w-56" />
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
        <Select value={devLevelFilter} onValueChange={(v) => setDevLevelFilter(v as DevLevel | "All")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All classes</SelectItem>
            {availableDevLevels.map((lvl) => (
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

      <Card className="mb-6">
        <CardHeader className="mb-1 flex-row items-center justify-between space-y-0">
          <CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
            Completion % by cadet
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setCadetTableView((v) => !v)}>
            {cadetTableView ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
            {cadetTableView ? "Chart view" : "Table view"}
          </Button>
        </CardHeader>
        <CardContent className="pt-1">
          {byCadet.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cadets match this filter.</p>
          ) : cadetTableView ? (
            <Table aria-label="Completion by cadet">
              <TableHeader>
                <TableRow>
                  <TableHead>Cadet</TableHead>
                  <TableHead>Dev Level</TableHead>
                  <TableHead>Completion</TableHead>
                  <TableHead>Missed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCadet.map((row) => (
                  <TableRow key={row.cadetId}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {row.flagged && <AlertTriangle className="h-4 w-4 text-destructive" />}
                        {row.name}
                      </span>
                    </TableCell>
                    <TableCell>{row.devLevel ?? "—"}</TableCell>
                    <TableCell>{row.percent}%</TableCell>
                    <TableCell>{row.missedCount > 0 ? <span className="text-destructive">{row.missedCount}</span> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <ResponsiveContainer width="100%" height={cadetChartHeight}>
              <BarChart data={byCadet} layout="vertical" margin={chartMargin}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} unit="%" />
                <YAxis type="category" dataKey="name" width={160} tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  formatter={(value, _name, item) => [`${value}% (${(item.payload as CadetCompletionRow).missedCount} missed)`, "Completion"]}
                />
                <Bar dataKey="percent" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {byCadet.map((row) => (
                    <Cell key={row.cadetId} fill={row.flagged ? "var(--chart-critical)" : "var(--chart-series-1)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-series-1)" }} /> On track
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-critical)" }} /> Flagged (has a missed objective)
            </span>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
