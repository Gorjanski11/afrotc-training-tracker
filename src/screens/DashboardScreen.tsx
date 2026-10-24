import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, LayoutDashboard, Search, Users, TrendingUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileFiltersButton } from "@/components/mobile/MobileFiltersButton";
import { PLO_SHORT_CODE, FLIGHTS, GROUPS, type DevLevel, type Flight, type Group, type PloSection } from "../domain/constants";
import { computeCadetProgress, shouldFlagCadet } from "../domain/progress";
import { computeCohortSummary, computeMissingObjectivesByCadet } from "../domain/analytics";
import { compareByLastName, formatCadetName, formatCadetNameCompact } from "../domain/nameUtils";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../domain/types";

interface HeroStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "critical";
  index: number;
  onClick?: () => void;
}

function HeroStat({ icon, label, value, tone, index, onClick }: HeroStatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }}
    >
      <Card
        className={cn(onClick && "cursor-pointer transition-shadow hover:shadow-md")}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      >
        {/* Phone: just the number over its label, no icon circle, 4 fit side by side (see the grid below). Desktop is unchanged. */}
        <CardContent className="hidden flex-col items-center gap-0 py-3 text-center phone:flex">
          <div className={cn("text-xl font-semibold tabular-nums", tone === "critical" && "text-destructive")}>{value}</div>
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
          <div>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className={cn("text-2xl font-semibold tabular-nums", tone === "critical" && "text-destructive")}>{value}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

type SortKey = "name" | "devLevel" | "percent";

interface Props {
  cohort: "poc" | "gmc";
  levels: readonly DevLevel[];
  cadets: Cadet[];
  catalog: TrainingObjective[];
  completions: Completion[];
  pmtEvents: PmtEvent[];
  onSelectCadet: (cadetId: string) => void;
}

export function DashboardScreen({ cohort, levels, cadets, catalog, completions, pmtEvents, onSelectCadet }: Props) {
  const [devLevelFilter, setDevLevelFilter] = useState<DevLevel | "All">("All");
  const [groupFilter, setGroupFilter] = useState<Group | "All">("All");
  const [flightFilter, setFlightFilter] = useState<Flight | "All">("All");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Inactive cadets are dropped from the Dashboard entirely -- they're not being actively tracked.
  const visibleCadets = useMemo(() => cadets.filter((c) => c.status !== "Inactive"), [cadets]);

  // Filtered by every control above -- both the table rows and the hero stat panels read from this,
  // so the summary numbers always match whatever the filters currently show.
  const filteredCadets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visibleCadets
      .filter((c) => devLevelFilter === "All" || c.devLevel === devLevelFilter)
      .filter((c) => cohort !== "poc" || groupFilter === "All" || c.group === groupFilter)
      .filter((c) => cohort !== "gmc" || flightFilter === "All" || c.flight === flightFilter)
      .filter((c) => query === "" || c.name.toLowerCase().includes(query));
  }, [visibleCadets, devLevelFilter, groupFilter, flightFilter, cohort, search]);

  const rows = useMemo(() => {
    const completionsByCadet = new Map<string, Completion[]>();
    for (const c of completions) {
      const list = completionsByCadet.get(c.cadetId) ?? [];
      list.push(c);
      completionsByCadet.set(c.cadetId, list);
    }

    return filteredCadets
      .map((cadet) => {
        const progress = computeCadetProgress(cadet.devLevel, catalog, completionsByCadet.get(cadet.id) ?? [], pmtEvents);
        return { cadet, progress };
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === "name") cmp = compareByLastName(a.cadet.name, b.cadet.name);
        else if (sortKey === "devLevel") cmp = (a.cadet.devLevel ?? "").localeCompare(b.cadet.devLevel ?? "");
        else cmp = a.progress.percent - b.progress.percent;
        return sortAsc ? cmp : -cmp;
      });
  }, [filteredCadets, catalog, completions, pmtEvents, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const summary = useMemo(
    () => computeCohortSummary(filteredCadets, catalog, completions, pmtEvents),
    [filteredCadets, catalog, completions, pmtEvents]
  );

  const [showMissingDrillDown, setShowMissingDrillDown] = useState(false);
  const missingRows = useMemo(
    () => (showMissingDrillDown ? computeMissingObjectivesByCadet(filteredCadets, catalog, completions, pmtEvents) : []),
    [showMissingDrillDown, filteredCadets, catalog, completions, pmtEvents]
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          Roster Dashboard
        </h2>
        {/* Phone: same filters as the desktop row below, compact and stacked behind this small button instead of shown inline. */}
        <div className="phone:block desktop:hidden">
          <MobileFiltersButton>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search..." className="h-8 pl-7 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={devLevelFilter} onValueChange={(v) => setDevLevelFilter(v as DevLevel | "All")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All levels</SelectItem>
                {levels.map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>
                    {lvl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cohort === "poc" && (
              <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v as Group | "All")}>
                <SelectTrigger className="h-8 text-xs">
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
            {cohort === "gmc" && (
              <Select value={flightFilter} onValueChange={(v) => setFlightFilter(v as Flight | "All")}>
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
          </MobileFiltersButton>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-2 phone:gap-1.5 desktop:gap-4">
        <HeroStat icon={<Users className="h-4.5 w-4.5" />} label="Cadets" value={String(filteredCadets.length)} index={0} />
        <HeroStat icon={<TrendingUp className="h-4.5 w-4.5" />} label="Overall" value={`${summary.overallPercent}%`} index={1} />
        <HeroStat
          icon={<AlertTriangle className="h-4.5 w-4.5" />}
          label="Flagged"
          value={String(summary.flaggedCount)}
          tone={summary.flaggedCount > 0 ? "critical" : undefined}
          index={2}
        />
        <HeroStat
          icon={<Clock className="h-4.5 w-4.5" />}
          label="Overdue"
          value={String(summary.overdueInstances)}
          tone={summary.overdueInstances > 0 ? "critical" : undefined}
          index={3}
          onClick={summary.overdueInstances > 0 ? () => setShowMissingDrillDown(true) : undefined}
        />
      </div>

      <Dialog open={showMissingDrillDown} onOpenChange={setShowMissingDrillDown}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Every overdue objective-instance</DialogTitle>
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

      <div className="mb-4 hidden flex-wrap items-center gap-4 desktop:flex">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Look up a cadet by name..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={devLevelFilter} onValueChange={(v) => setDevLevelFilter(v as DevLevel | "All")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by dev level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All levels</SelectItem>
            {levels.map((lvl) => (
              <SelectItem key={lvl} value={lvl}>
                {lvl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cohort === "poc" && (
          <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v as Group | "All")}>
            <SelectTrigger className="w-36">
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
        {cohort === "gmc" && (
          <Select value={flightFilter} onValueChange={(v) => setFlightFilter(v as Flight | "All")}>
            <SelectTrigger className="w-32">
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
        <span className="text-sm text-muted-foreground">
          Flagging cadets with at least one Training Objective that's run out of PMTs (all its sessions have passed with nothing logged).
        </span>
      </div>

      <div className="overflow-x-auto">
      <Table aria-label="Cadet roster">
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
              Cadet {sortKey === "name" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("devLevel")}>
              Dev Level {sortKey === "devLevel" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead>{cohort === "poc" ? "Group" : "Flight"}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("percent")}>
              Completion {sortKey === "percent" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead>Missed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ cadet, progress }) => {
            const flagged = cadet.status === "Active" && shouldFlagCadet(progress);
            return (
              <TableRow
                key={cadet.id}
                className={cn("cursor-pointer", flagged && "bg-destructive/10")}
                onClick={() => onSelectCadet(cadet.id)}
              >
                <TableCell>
                  <span className="flex items-center gap-2">
                    {flagged && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    {formatCadetName(cadet)}
                  </span>
                </TableCell>
                <TableCell>{cadet.devLevel ?? "—"}</TableCell>
                <TableCell>{(cohort === "poc" ? cadet.group : cadet.flight) ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={cadet.status === "Active" ? "success" : "secondary"}>{cadet.status ?? "—"}</Badge>
                </TableCell>
                <TableCell>
                  {progress.completedCount}/{progress.requiredCount} ({progress.percent}%)
                </TableCell>
                <TableCell>{progress.missedCount > 0 ? <span className="text-destructive">{progress.missedCount}</span> : "—"}</TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>No cadets match this filter.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
