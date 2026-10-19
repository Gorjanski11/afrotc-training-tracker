import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, Pie, PieChart as RePieChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ShieldAlert, CalendarClock, Shirt, Handshake, MoreHorizontal, BarChart2, PieChart as PieChartIcon, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEVIATION_REASONS, FLIGHTS, GROUPS, type Flight, type Group } from "../../domain/constants";
import { filterByRosterScope } from "../../domain/memoAnalytics";
import {
  countByCategory,
  countByRow,
  countByUnit,
  cadetDeviationSummaryRows,
  type DeviationCategory,
  type DeviationRowLabel,
} from "../../domain/deviationAnalytics";
import { compareByLastName, formatCadetNameCompact } from "../../domain/nameUtils";
import { Stepper } from "../../components/analytics/Stepper";
import type { UnitScope } from "../../domain/access";
import type { Cadet, DeviationMemo } from "../../domain/types";

interface Props {
  roster: Cadet[];
  deviationMemos: DeviationMemo[];
  unitScope: UnitScope;
  flightFilter: Flight | "All";
  onFlightFilterChange: (v: Flight | "All") => void;
  groupFilter: Group | "All";
  onGroupFilterChange: (v: Group | "All") => void;
}

const chartMargin = { top: 8, right: 16, bottom: 8, left: 8 };

const CATEGORY_ICON: Record<DeviationCategory, React.ReactNode> = {
  "Missed Deadline": <CalendarClock className="h-5 w-5" />,
  "Grooming & Appearance": <Shirt className="h-5 w-5" />,
  "Customs & Courtesies": <Handshake className="h-5 w-5" />,
  Other: <MoreHorizontal className="h-5 w-5" />,
};

const ROW_COLOR: Record<DeviationRowLabel, string> = {
  "Absence memos deviation": "var(--chart-series-1)",
  "Accountability or TO submission deviation": "var(--chart-series-2)",
  "Other missed deadline": "var(--chart-series-4)",
  "Grooming & Appearance": "var(--chart-series-3)",
  "Customs & Courtesies": "var(--chart-series-5)",
  Other: "var(--chart-ink-muted)",
};

const PIE_PALETTE = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
  "var(--chart-series-6)",
  "var(--chart-series-7)",
  "var(--chart-series-8)",
];

function CategoryBox({ category, count, index }: { category: DeviationCategory; count: number; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }}>
      <Card className="hover:shadow-md">
        <CardContent className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{CATEGORY_ICON[category]}</span>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{category}</div>
            <div className="text-2xl font-semibold tabular-nums">{count}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const UNIT_AXIS_OPTIONS = [
  { value: "flight", label: "Flight" },
  { value: "group", label: "Group" },
];

/** SAE's/Cadre's detachment-wide deviation-memo overview (Section: Deviation's Log) -- same Flight/Group filter as the other 3 Analytics sub-tabs, no owner/assigner restriction (unlike Memorandums Analytics' default "concerning me only" scope), since this is a statistical overview rather than a personal review queue. */
export function DeviationsLogView({ roster, deviationMemos, unitScope, flightFilter, onFlightFilterChange, groupFilter, onGroupFilterChange }: Props) {
  const hideGroupFilter = unitScope.kind !== "all" && unitScope.kind !== "group-and-gmc";
  const hideFlightFilter = unitScope.kind === "flight" || unitScope.kind === "group";
  const scopedGroupOptions = unitScope.kind === "group-and-gmc" ? [unitScope.group] : GROUPS;

  const handleFlightChange = (v: string) => {
    onFlightFilterChange(v as Flight | "All");
    if (v !== "All") onGroupFilterChange("All");
  };
  const handleGroupChange = (v: string) => {
    onGroupFilterChange(v as Group | "All");
    if (v !== "All") onFlightFilterChange("All");
  };

  const [unitAxis, setUnitAxis] = useState<"flight" | "group">("flight");
  const [showAllCadets, setShowAllCadets] = useState(false);

  const scopedMemos = useMemo(
    () => filterByRosterScope(deviationMemos, roster, "All", flightFilter, groupFilter),
    [deviationMemos, roster, flightFilter, groupFilter]
  );

  const categoryCounts = useMemo(() => countByCategory(scopedMemos), [scopedMemos]);
  const rowCounts = useMemo(() => countByRow(scopedMemos), [scopedMemos]);
  const barData = useMemo(() => rowCounts.map((r) => ({ label: r.label, count: r.count })), [rowCounts]);

  const unitCounts = useMemo(() => countByUnit(scopedMemos, roster, unitAxis), [scopedMemos, roster, unitAxis]);
  const pieData = useMemo(() => unitCounts.map((u) => ({ name: u.unit, value: u.count })), [unitCounts]);

  const cadetRows = useMemo(() => {
    const withDeviations = cadetDeviationSummaryRows(scopedMemos, roster);
    if (!showAllCadets) return withDeviations;
    const seen = new Set(withDeviations.map((r) => r.cadet.id));
    const zeroCounts = Object.fromEntries(DEVIATION_REASONS.map((c) => [c, 0])) as Record<DeviationCategory, number>;
    const rest = roster.filter((c) => !seen.has(c.id)).map((cadet) => ({ cadet, categoryCounts: zeroCounts, total: 0, accepted: 0, dns: 0 }));
    return [...withDeviations, ...rest];
  }, [scopedMemos, roster, showAllCadets]);

  const sortedCadetRows = useMemo(
    () => [...cadetRows].sort((a, b) => b.total - a.total || compareByLastName(a.cadet.name, b.cadet.name)),
    [cadetRows]
  );

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <ShieldAlert className="h-5 w-5 text-primary" />
        Deviation's Log
      </h2>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-input bg-card p-3">
        {!hideFlightFilter && (
          <Select value={flightFilter} onValueChange={handleFlightChange}>
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
          <Select value={groupFilter} onValueChange={handleGroupChange}>
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
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categoryCounts.map((c, i) => (
          <CategoryBox key={c.category} category={c.category} count={c.count} index={i} />
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle>
                <BarChart2 className="h-4 w-4 text-primary" />
                Deviations by subcategory
              </CardTitle>
            </CardHeader>
            <CardContent>
              {scopedMemos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deviation memos match this filter.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData} layout="vertical" margin={chartMargin}>
                    <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--chart-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={160}
                      tick={{ fill: "var(--chart-ink-muted)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--chart-axis)" }}
                    />
                    <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={22}>
                      {barData.map((entry) => (
                        <Cell key={entry.label} fill={ROW_COLOR[entry.label]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                <PieChartIcon className="h-4 w-4 text-primary" />
                Deviations by {unitAxis === "flight" ? "Flight" : "Group"}
              </CardTitle>
              <Stepper options={UNIT_AXIS_OPTIONS} value={unitAxis} onChange={(v) => setUnitAxis(v as "flight" | "group")} />
            </CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deviation memos match this filter.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <RePieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
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

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.2 }}>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>
              <Table2 className="h-4 w-4 text-primary" />
              Deviations by cadet
            </CardTitle>
            <Button variant={showAllCadets ? "default" : "outline"} size="sm" onClick={() => setShowAllCadets((v) => !v)}>
              {showAllCadets ? "Showing all cadets" : "Only cadets with deviations"}
            </Button>
          </CardHeader>
          <CardContent>
            {sortedCadetRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cadets match this filter.</p>
            ) : (
              <div className="max-h-[32rem] overflow-auto rounded-md border border-input">
                <Table aria-label="Deviation memos by cadet">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 top-0 z-20 bg-background px-2 py-1 text-xs">Cadet</TableHead>
                      {DEVIATION_REASONS.map((category) => (
                        <TableHead key={category} className="sticky top-0 z-10 min-w-20 bg-background px-1 py-1 text-center text-[10px] leading-tight">
                          {category}
                        </TableHead>
                      ))}
                      <TableHead className="sticky top-0 z-10 bg-background px-2 py-1 text-center text-xs font-semibold">Total</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background px-2 py-1 text-center text-xs font-semibold text-success">Accepted</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background px-2 py-1 text-center text-xs font-semibold text-destructive">DNS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCadetRows.map((row) => (
                      <TableRow key={row.cadet.id}>
                        <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background px-2 py-1 text-xs">{formatCadetNameCompact(row.cadet)}</TableCell>
                        {DEVIATION_REASONS.map((category) => (
                          <TableCell key={category} className={cn("px-1 py-1 text-center text-xs", row.categoryCounts[category] > 0 && "font-semibold text-foreground")}>
                            {row.categoryCounts[category] > 0 ? row.categoryCounts[category] : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="px-2 py-1 text-center text-xs font-semibold">{row.total}</TableCell>
                        <TableCell className={cn("px-2 py-1 text-center text-xs", row.accepted > 0 && "bg-success/15 font-semibold text-success")}>
                          {row.accepted > 0 ? row.accepted : "—"}
                        </TableCell>
                        <TableCell className={cn("px-2 py-1 text-center text-xs", row.dns > 0 && "bg-destructive/15 font-semibold text-destructive")}>
                          {row.dns > 0 ? row.dns : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
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
