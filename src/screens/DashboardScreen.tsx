import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEV_LEVELS, type DevLevel } from "../domain/constants";
import { computeCadetProgress, shouldFlagCadet } from "../domain/progress";
import { compareByLastName } from "../domain/nameUtils";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../domain/types";

type SortKey = "name" | "devLevel" | "percent";

interface Props {
  cadets: Cadet[];
  catalog: TrainingObjective[];
  completions: Completion[];
  pmtEvents: PmtEvent[];
  onSelectCadet: (cadetId: string) => void;
}

export function DashboardScreen({ cadets, catalog, completions, pmtEvents, onSelectCadet }: Props) {
  const [devLevelFilter, setDevLevelFilter] = useState<DevLevel | "All">("All");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => {
    const completionsByCadet = new Map<string, Completion[]>();
    for (const c of completions) {
      const list = completionsByCadet.get(c.cadetId) ?? [];
      list.push(c);
      completionsByCadet.set(c.cadetId, list);
    }

    const query = search.trim().toLowerCase();

    return cadets
      .filter((c) => devLevelFilter === "All" || c.devLevel === devLevelFilter)
      .filter((c) => query === "" || c.name.toLowerCase().includes(query))
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
  }, [cadets, catalog, completions, pmtEvents, devLevelFilter, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-2xl font-semibold">Roster Dashboard</h2>
      <div className="mb-4 flex items-center gap-4">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Look up a cadet by name..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={devLevelFilter} onValueChange={(v) => setDevLevelFilter(v as DevLevel | "All")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by dev level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All levels</SelectItem>
            {DEV_LEVELS.map((lvl) => (
              <SelectItem key={lvl} value={lvl}>
                {lvl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Flagging cadets with at least one Training Objective that's run out of PMTs (all its sessions have passed with nothing logged).
        </span>
      </div>

      <Table aria-label="Cadet roster">
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
              Cadet {sortKey === "name" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("devLevel")}>
              Dev Level {sortKey === "devLevel" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead>AS Class</TableHead>
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
                    {cadet.name}
                  </span>
                </TableCell>
                <TableCell>{cadet.devLevel ?? "—"}</TableCell>
                <TableCell>{cadet.asClass ?? "—"}</TableCell>
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
  );
}
