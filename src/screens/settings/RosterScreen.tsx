import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Search, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { deriveClass, isCwlMember, FLIGHTS, GROUPS, type Flight, type Group, type Standing } from "../../domain/constants";
import { computeCadetAttendanceSummary } from "../../domain/attendance";
import { computeCadetProgress } from "../../domain/progress";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import { applyUnitScope, type UnitScope } from "../../domain/access";
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
  updateCadetFields: (id: string, input: Partial<CadetInput>) => Promise<void>;
  deleteCadet: (cadetId: string) => Promise<void>;
  /** A Flight/Group Commander only sees and looks up cadets in their own unit here (Section A4) -- no Add/Edit/Delete. */
  unitScope: UnitScope;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
export function RosterScreen({ roster, events, attendance, catalog, completions, createCadet, updateCadet, updateCadetFields, deleteCadet, unitScope }: Props) {
  const scoped = unitScope.kind !== "all";
  // Flight Commanders, Group Commanders, and Santiago (TRG Group Commander + all-GMC visibility) can
  // set Active/Inactive for cadets in their own unit -- everything else about the roster (name,
  // level, flight/group, position, Add/Delete) stays Cadre/Cortes-Garay/CWL-only. The bare "gmc"
  // scope (Montalvo, CTO -- not a Group Commander) is deliberately excluded.
  const canInactivate = unitScope.kind === "flight" || unitScope.kind === "group" || unitScope.kind === "group-and-gmc";
  const scopedRoster = useMemo(() => applyUnitScope(unitScope, roster), [unitScope, roster]);
  const [search, setSearch] = useState("");
  const [flightFilter, setFlightFilter] = useState<Flight | "All">("All");
  const [groupFilter, setGroupFilter] = useState<Group | "All">("All");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCadet, setEditingCadet] = useState<Cadet | undefined>();
  const [deletingCadet, setDeletingCadet] = useState<Cadet | undefined>();
  const [deactivatingCadet, setDeactivatingCadet] = useState<Cadet | undefined>();

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
    return scopedRoster
      .filter((p) => query === "" || p.name.toLowerCase().includes(query))
      .filter((p) => scoped || flightFilter === "All" || p.flight === flightFilter)
      .filter((p) => scoped || groupFilter === "All" || p.group === groupFilter)
      .map((person) => ({
        person,
        cls: deriveClass(person.asClass, person.isCadre),
        progress: computeCadetProgress(person.devLevel, catalog, completionsByCadet.get(person.id) ?? [], events),
        summary: computeCadetAttendanceSummary(person.id, attendance, pmtEventsById),
      }))
      .sort((a, b) => compareByLastName(a.person.name, b.person.name));
  }, [scopedRoster, scoped, search, flightFilter, groupFilter, catalog, completionsByCadet, events, attendance, pmtEventsById]);

  const deletingCompletionCount = deletingCadet ? (completionsByCadet.get(deletingCadet.id) ?? []).length : 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="h-5 w-5 text-primary" />
          Roster
        </h2>
        {!scoped && (
          <Button
            onClick={() => {
              setEditingCadet(undefined);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add Cadet
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Look up a cadet by name..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!scoped && (
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
        )}
        {!scoped && (
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
        )}
      </div>

      <div className="overflow-x-auto">
        <Table aria-label="Roster">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
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
                <TableCell className="whitespace-nowrap">
                  {formatCadetName(person)}
                  {isCwlMember(person.asClass, person.isCwl) && (
                    <Badge variant="outline" className="ml-1.5">
                      CWL
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{cls}</Badge>
                </TableCell>
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
                  {!scoped && (
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
                  )}
                  {scoped && canInactivate && !person.isCadre && (
                    person.status === "Inactive" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Reactivate"
                        onClick={() => updateCadetFields(person.id, { status: "Active", statusChangedDate: todayIso() })}
                      >
                        <UserCheck className="h-3.5 w-3.5 text-success" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" title="Set Inactive" onClick={() => setDeactivatingCadet(person)}>
                        <UserX className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground">
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
          title={`Delete ${formatCadetName(deletingCadet)}?`}
          description={`This permanently removes them from the roster${
            deletingCompletionCount > 0 ? ` along with their ${deletingCompletionCount} logged Training Objective completion(s)` : ""
          }. This cannot be undone.`}
          onConfirm={() => deleteCadet(deletingCadet.id)}
        />
      )}

      {deactivatingCadet && (
        <ConfirmDialog
          open
          onClose={() => setDeactivatingCadet(undefined)}
          title={`Set ${formatCadetName(deactivatingCadet)} Inactive?`}
          description="They'll stop appearing in Accountability and Training Objectives tracking until reactivated. This can be undone at any time."
          onConfirm={() => updateCadetFields(deactivatingCadet.id, { status: "Inactive", statusChangedDate: todayIso() })}
        />
      )}
    </div>
  );
}
