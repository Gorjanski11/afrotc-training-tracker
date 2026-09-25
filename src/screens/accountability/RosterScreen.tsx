import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Search, Users } from "lucide-react";
import { deriveClass, FLIGHTS, GROUPS, ROSTER_CLASSES, type Flight, type Group, type RosterClass, type Standing } from "../../domain/constants";
import { computeCadetAttendanceSummary } from "../../domain/attendance";
import { compareByLastName } from "../../domain/nameUtils";
import { RosterEditDialog } from "../../components/accountability/RosterEditDialog";
import type { Attendance, Cadet, PmtEvent } from "../../domain/types";
import type { CadetInput } from "../../hooks/useCadets";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  updatePerson: (id: string, input: Partial<CadetInput>) => Promise<void>;
}

const STANDING_OPTIONS: Standing[] = ["Good", "Warning", "Hard Limit"];

function StandingBadge({ standing }: { standing: Standing | undefined }) {
  if (!standing) return <span className="text-muted-foreground">—</span>;
  const variant = standing === "Good" ? "success" : standing === "Warning" ? "warning" : "destructive";
  return <Badge variant={variant}>{standing}</Badge>;
}

export function RosterScreen({ roster, events, attendance, updatePerson }: Props) {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<RosterClass | "All">("All");
  const [flightFilter, setFlightFilter] = useState<Flight | "All">("All");
  const [groupFilter, setGroupFilter] = useState<Group | "All">("All");
  const [standingFilter, setStandingFilter] = useState<Standing | "All">("All");
  const [editing, setEditing] = useState<Cadet | undefined>();

  // Group and Flight are mutually exclusive -- picking one clears the other.
  const handleFlightChange = (v: string) => {
    setFlightFilter(v as Flight | "All");
    if (v !== "All") setGroupFilter("All");
  };
  const handleGroupChange = (v: string) => {
    setGroupFilter(v as Group | "All");
    if (v !== "All") setFlightFilter("All");
  };

  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return roster
      .map((person) => ({ person, cls: deriveClass(person.asClass, person.isCadre), summary: computeCadetAttendanceSummary(person.id, attendance, pmtEventsById) }))
      .filter(({ person }) => query === "" || person.name.toLowerCase().includes(query))
      .filter(({ cls }) => classFilter === "All" || cls === classFilter)
      .filter(({ person }) => flightFilter === "All" || person.flight === flightFilter)
      .filter(({ person }) => groupFilter === "All" || person.group === groupFilter)
      .filter(({ summary }) => standingFilter === "All" || summary.pt.standing === standingFilter || summary.llabFm.standing === standingFilter)
      .sort((a, b) => compareByLastName(a.person.name, b.person.name));
  }, [roster, search, classFilter, flightFilter, groupFilter, standingFilter, attendance, pmtEventsById]);

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <Users className="h-5 w-5 text-primary" />
        Roster
      </h2>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter by name..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={classFilter} onValueChange={(v) => setClassFilter(v as RosterClass | "All")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All classes</SelectItem>
            {ROSTER_CLASSES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={flightFilter} onValueChange={handleFlightChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Flight" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All flights</SelectItem>
            {FLIGHTS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groupFilter} onValueChange={handleGroupChange}>
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
        <Select value={standingFilter} onValueChange={(v) => setStandingFilter(v as Standing | "All")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Standing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All standings</SelectItem>
            {STANDING_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table aria-label="Roster">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>AS Level</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Flight</TableHead>
            <TableHead>Group</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>PT %</TableHead>
            <TableHead>PT Standing</TableHead>
            <TableHead>LLAB/FM %</TableHead>
            <TableHead>LLAB/FM Standing</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ person, cls, summary }) => (
            <TableRow key={person.id} className={person.status === "Inactive" ? "text-muted-foreground" : undefined}>
              <TableCell>{person.name}</TableCell>
              <TableCell>{person.asClass ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline">{cls}</Badge>
              </TableCell>
              <TableCell>{person.flight ?? "—"}</TableCell>
              <TableCell>{person.group ?? "—"}</TableCell>
              <TableCell>{person.position ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={person.status === "Active" ? "success" : "secondary"}>{person.status ?? "—"}</Badge>
              </TableCell>
              <TableCell>{summary.pt.percent === undefined ? "—" : `${Math.round(summary.pt.percent * 100)}%`}</TableCell>
              <TableCell>
                <StandingBadge standing={summary.pt.standing} />
              </TableCell>
              <TableCell>{summary.llabFm.percent === undefined ? "—" : `${Math.round(summary.llabFm.percent * 100)}%`}</TableCell>
              <TableCell>
                <StandingBadge standing={summary.llabFm.standing} />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => setEditing(person)} aria-label={`Edit ${person.name}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground">
                No one matches this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {editing && (
        <RosterEditDialog
          open
          onClose={() => setEditing(undefined)}
          person={editing}
          onSave={(input) => updatePerson(editing.id, input)}
        />
      )}
    </div>
  );
}
