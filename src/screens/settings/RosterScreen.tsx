import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { deriveClass, FLIGHTS, GROUPS, type Flight, type Group, type Standing } from "../../domain/constants";
import { computeCadetAttendanceSummary } from "../../domain/attendance";
import { computeCadetProgress } from "../../domain/progress";
import { compareByLastName } from "../../domain/nameUtils";
import { CadetFormDialog } from "../../components/CadetFormDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { Attendance, Cadet, Completion, PmtEvent, TrainingObjective } from "../../domain/types";
import type { CadetInput } from "../../hooks/useCadets";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  catalog: TrainingObjective[];
  completions: Completion[];
  createCadet: (input: CadetInput) => Promise<Cadet>;
  updateCadet: (id: string, input: CadetInput) => Promise<Cadet>;
  deleteCadet: (cadetId: string) => Promise<void>;
}

function StandingBadge({ standing }: { standing: Standing | undefined }) {
  if (!standing) return <span className="text-muted-foreground">—</span>;
  const variant = standing === "Good" ? "success" : standing === "Warning" ? "warning" : "destructive";
  return <Badge variant={variant}>{standing}</Badge>;
}

/**
 * Unified roster (Section 6.2) -- merges what used to be the TO's Roster (create/delete cadet,
 * completion %) and Accountability's Roster (PT/LLAB-FM-D&C standing) into one screen, one table,
 * one edit dialog. Deliberately shows everyone including Cadre -- this is the "account database"
 * view (Section 4's one exception to Cadre being non-trackable everywhere else).
 */
export function RosterScreen({ roster, events, attendance, catalog, completions, createCadet, updateCadet, deleteCadet }: Props) {
  const [search, setSearch] = useState("");
  const [flightFilter, setFlightFilter] = useState<Flight | "All">("All");
  const [groupFilter, setGroupFilter] = useState<Group | "All">("All");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCadet, setEditingCadet] = useState<Cadet | undefined>();
  const [deletingCadet, setDeletingCadet] = useState<Cadet | undefined>();

  const handleFlightChange = (v: string) => {
    setFlightFilter(v as Flight | "All");
    if (v !== "All") setGroupFilter("All");
  };
  const handleGroupChange = (v: string) => {
    setGroupFilter(v as Group | "All");
    if (v !== "All") setFlightFilter("All");
  };

  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const completionsByCadet = useMemo(() => {
    const map = new Map<string, Completion[]>();
    for (const c of completions) {
      const list = map.get(c.cadetId) ?? [];
      list.push(c);
      map.set(c.cadetId, list);
    }
    return map;
  }, [completions]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return roster
      .filter((p) => query === "" || p.name.toLowerCase().includes(query))
      .filter((p) => flightFilter === "All" || p.flight === flightFilter)
      .filter((p) => groupFilter === "All" || p.group === groupFilter)
      .map((person) => ({
        person,
        cls: deriveClass(person.asClass, person.isCadre),
        progress: computeCadetProgress(person.devLevel, catalog, completionsByCadet.get(person.id) ?? [], events),
        summary: computeCadetAttendanceSummary(person.id, attendance, pmtEventsById),
      }))
      .sort((a, b) => compareByLastName(a.person.name, b.person.name));
  }, [roster, search, flightFilter, groupFilter, catalog, completionsByCadet, events, attendance, pmtEventsById]);

  const deletingCompletionCount = deletingCadet ? (completionsByCadet.get(deletingCadet.id) ?? []).length : 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="h-5 w-5 text-primary" />
          Roster
        </h2>
        <Button
          onClick={() => {
            setEditingCadet(undefined);
            setFormOpen(true);
          }}
        >
          <Plus />
          Add Cadet
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Look up a cadet by name..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={flightFilter} onValueChange={handleFlightChange}>
          <SelectTrigger className="w-36">
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
        <Select value={groupFilter} onValueChange={handleGroupChange}>
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
      </div>

      <div className="overflow-x-auto">
        <Table aria-label="Roster">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>AS Class</TableHead>
              <TableHead>Dev Level</TableHead>
              <TableHead>Flight</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Completion %</TableHead>
              <TableHead>PT %</TableHead>
              <TableHead>PT Standing</TableHead>
              <TableHead>LLAB/FM/D&C %</TableHead>
              <TableHead>LLAB/FM/D&C Standing</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ person, cls, progress, summary }) => (
              <TableRow key={person.id} className={person.status === "Inactive" ? "text-muted-foreground" : undefined}>
                <TableCell className="whitespace-nowrap">{person.name}</TableCell>
                <TableCell>{person.asClass ?? "—"}</TableCell>
                <TableCell>{person.devLevel ?? "—"}</TableCell>
                <TableCell>{person.flight ?? "—"}</TableCell>
                <TableCell>{person.group ?? "—"}</TableCell>
                <TableCell>{person.position ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={person.status === "Active" ? "success" : "secondary"}>{person.status ?? "—"}</Badge>
                </TableCell>
                <TableCell>{cls === "Cadre" ? "—" : `${progress.percent}%`}</TableCell>
                <TableCell>{cls === "Cadre" ? "—" : summary.pt.percent === undefined ? "—" : `${Math.round(summary.pt.percent * 100)}%`}</TableCell>
                <TableCell>{cls === "Cadre" ? "—" : <StandingBadge standing={summary.pt.standing} />}</TableCell>
                <TableCell>{cls === "Cadre" ? "—" : summary.llabFm.percent === undefined ? "—" : `${Math.round(summary.llabFm.percent * 100)}%`}</TableCell>
                <TableCell>{cls === "Cadre" ? "—" : <StandingBadge standing={summary.llabFm.standing} />}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingCadet(person);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletingCadet(person)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground">
                  No one matches this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {formOpen && (
        <CadetFormDialog
          open
          onClose={() => setFormOpen(false)}
          existingCadet={editingCadet}
          onSave={async (input) => {
            if (editingCadet) await updateCadet(editingCadet.id, input);
            else await createCadet(input);
          }}
        />
      )}

      {deletingCadet && (
        <ConfirmDialog
          open
          onClose={() => setDeletingCadet(undefined)}
          title={`Delete ${deletingCadet.name}?`}
          description={`This permanently removes them from the roster${
            deletingCompletionCount > 0 ? ` along with their ${deletingCompletionCount} logged Training Objective completion(s)` : ""
          }. This cannot be undone.`}
          onConfirm={() => deleteCadet(deletingCadet.id)}
        />
      )}
    </div>
  );
}
